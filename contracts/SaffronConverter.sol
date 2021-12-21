// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
 
import "./interfaces/IUniswapRouterV2.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract SaffronConverter {
  using SafeERC20 for IERC20;
  
  // Governance
  address public governance;        // Governance address for operations
  address public new_governance;    // Proposed new governance address
  
  // Conversion steps for swapping tokens with any Uniswap V2 style router
  struct Conversion {
    address router;      // Router to do the conversion: QuickSwap, SushiSwap, etc.
    address token_from;  // Token to convert from
    address token_to;    // Token to convert to
    uint256 percentage;  // Percentage of tokenFrom to convert: 50 == half, 100 == all
    uint256 operation;        // 0- add, 1 - remove, 2- swap
  }
  Conversion[] public conversions;
  
  // Conversion flags, can be combined; order is remove, swap, then add
  uint256 private constant REMOVE_LIQUIDITY_FLAG = 1;  // Uniswap router removeLiquidity
  uint256 private constant SWAP_LIQUIDITY_FLAG   = 2;  // Uniswap router swapExactTokensForTokens
  uint256 private constant ADD_LIQUIDITY_FLAG    = 4;  // Uniswap router addLiquidity
  uint256 private constant SUPPORT_FEE_FLAG      = 8;  // Uniswap router use swapExactTokensForTokensSupportingFeeOnTransferTokens (combine with SWAP_LIQUIDITY_FLAG to support fee on transfer)

  // Additional Reentrancy Guard
  uint256 private _convert_status = 1;
  modifier non_reentrant_convert() {
    require(_convert_status != 2, "ReentrancyGuard: reentrant call");
    _convert_status = 2;
    _;
    _convert_status = 1;
  }

  // System Events
  event FundsConverted(address token_from, address token_to, uint256 amount_from, uint256 amount_to);
  event ErcSwept(address who, address to, address token, uint256 amount);
  
  // Preapprove/reset approvals to uint128.max
  function preapprove_conversions() public {
    // Loop through conversions
    for (uint256 i = 0; i < conversions.length; ++i) {
      Conversion memory cv = get_conversion(i);
      
      if (cv.operation & REMOVE_LIQUIDITY_FLAG != 0) {
        address factory = IUniswapRouterV2(cv.router).factory();
        address pairAddress = IUniswapV2Factory(factory).getPair( cv.token_from, cv.token_to );
        IERC20(pairAddress).safeApprove(cv.router, 0);
        IERC20(pairAddress).safeApprove(cv.router, type(uint128).max);
      }
      
      // Approve both tokens for swapping
      IERC20(cv.token_from).safeApprove(cv.router, 0);
      IERC20(  cv.token_to).safeApprove(cv.router, 0);
      IERC20(cv.token_from).safeApprove(cv.router, type(uint128).max);
      IERC20(  cv.token_to).safeApprove(cv.router, type(uint128).max);
    }
  }  
  
  // Set the conversions array and reset approvals
  function init_conversions(address[] memory routers, address[] memory tokens_from, address[] memory tokens_to, uint256[] memory percentages, uint256[] memory operations) external {
    require(msg.sender == governance, "must be governance");

    // Verify that the lengths of all arrays are equal and non-zero and the final conversion has an lp token address
    require(routers.length > 0 && (routers.length + tokens_from.length + tokens_to.length + percentages.length + operations.length) / 5 == routers.length, "invalid conversions");

    // Clear the conversions array if it was already initialized
    delete conversions;
    
    // Build the conversions array
    for (uint256 i = 0; i < routers.length; ++i) {
      require(percentages[i] <= 100, "bad percentage");
      require(operations[i] <= 15, "bad operations");
      Conversion memory cv = Conversion({
        router:      routers[i],
        token_from:  tokens_from[i],
        token_to:    tokens_to[i],
        percentage:  percentages[i],
        operation: operations[i]
      });
      conversions.push(cv);
    }
    
    // Pre-approve the conversions
    preapprove_conversions();
  }
 
  // Convert funds to other funds (only remove liquidity on conversions[0])
  function convert() internal non_reentrant_convert {
    for (uint256 i = 0; i < conversions.length; ++i) {
      Conversion memory cv = get_conversion(i);
      
      // Operation: Remove liquidity 
      if (cv.operation & REMOVE_LIQUIDITY_FLAG != 0) {
        address factory = IUniswapRouterV2(cv.router).factory();
        address pairAddress = IUniswapV2Factory(factory).getPair(cv.token_from, cv.token_to);
        
        // Check reserves
        uint256 balance_to_burn = IERC20(pairAddress).balanceOf(address(this));
        if (balance_to_burn > 0 && !remove_liquidity_would_return_zero(balance_to_burn, pairAddress)) {
          IUniswapRouterV2(cv.router).removeLiquidity(cv.token_from, cv.token_to, balance_to_burn, 0, 0, address(this), block.timestamp + 60);
        }
      } 
      
      // Operation: Swap
      // Swap is either supporting a fee-on-transfer token or with a regular token
      if (cv.operation & SWAP_LIQUIDITY_FLAG != 0) {
        // Measure the amount to swap from percentage in conversions[] and swap if possible
        uint256 amount_from = IERC20(cv.token_from).balanceOf(address(this)) * cv.percentage / 100;
        if (amount_from > 0) {
          address[] memory path;
          path = new address[](2);
          path[0] = cv.token_from;
          path[1] = cv.token_to;

          // Swap fee-on-transfer-token
          if (cv.operation & SUPPORT_FEE_FLAG != 0) {
            // Check to see if swap has a fee supported
            // https://docs.uniswap.org/protocol/V2/reference/smart-contracts/common-errors#inclusive-fee-on-transfer-tokens
            address factory = IUniswapRouterV2(cv.router).factory();

            uint256 amount_out;
            { // scope to avoid stack too deep errors

            // Get reserves
            (address token0,) = sort_tokens(cv.token_from, cv.token_to);
            IUniswapV2Pair pair = IUniswapV2Pair(pair_for(factory, cv.token_from, cv.token_to));
            (uint reserve0, uint reserve1,) = pair.getReserves();

            // swapFeeNumerator: Mojito-specific parameter needed for getting amount_out after Mojito protocol fees are applied
            uint swapFeeNumerator = pair.swapFeeNumerator();
            (uint reserveInput, uint reserveOutput) = cv.token_from == token0 ? (reserve0, reserve1) : (reserve1, reserve0);

            // amount_out depends on amount_from (in Uniswap core code, amount_from is the balance of the contract minus reserves, which internally requires a transfer() first
            amount_out = get_amount_out(amount_from, reserveInput, reserveOutput, swapFeeNumerator);

            }

            if (amount_out > 0) {
              IUniswapRouterV2(cv.router).swapExactTokensForTokensSupportingFeeOnTransferTokens(amount_from, 0, path, address(this), block.timestamp + 10);
              emit FundsConverted(path[0], path[1], amount_from, amount_out);
            } else { 
              // If we can't swap anything then we can't continue
              return;
            }
          } 
          
          // Default swap (not a fee-on-transfer token)
          else {
            // Calculate tokens to be returned from conversion and swap if the amount out will be greater than 0
            uint256[] memory amounts_out = IUniswapRouterV2(cv.router).getAmountsOut(amount_from, path);
            if(amounts_out[1] > 0) {
              amounts_out = IUniswapRouterV2(cv.router).swapExactTokensForTokens(amount_from, 0, path, address(this), block.timestamp + 10);
              emit FundsConverted(path[0], path[1], amount_from, amounts_out[1]);
            } else {
              // If we can't swap anything then we can't continue
              return;
            }
          }
        } else {
          // If we can't swap anything then we can't continue
          return;
        }
      }
      
      // Operation: Add Liquidity
      if (cv.operation & ADD_LIQUIDITY_FLAG != 0) {
        uint256 token_from_balance = IERC20(cv.token_from).balanceOf(address(this));
        uint256 token_to_balance   = IERC20(cv.token_to).balanceOf(address(this));

        // Add liquidity only if we have some amount of both tokens to be added
        if (token_from_balance > 0 && token_to_balance > 0) {
          IUniswapRouterV2(cv.router).addLiquidity(cv.token_from, cv.token_to, token_from_balance, token_to_balance, 0, 0, address(this), block.timestamp + 60);
        }
      }
    }
  }
  
  /// INTERNAL
  // Returns boolean depending on whether or not removeLiquidity would return zero
  function remove_liquidity_would_return_zero(uint256 balance_to_burn, address _pair_address) internal view returns (bool) {
    (uint256 balance0, uint256 balance1, uint256 blocktime) = IUniswapV2Pair(_pair_address).getReserves();
    uint256 totalSupply = IUniswapV2Pair(_pair_address).totalSupply();
    uint256 amount0 = balance_to_burn * balance0 / totalSupply;
    uint256 amount1 = balance_to_burn * balance1 / totalSupply;
    return (amount0 == 0 || amount1 == 0);
  }  

  // Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function get_amount_out(uint amountIn, uint reserveIn, uint reserveOut, uint swapFeeNumerator) internal pure returns (uint amountOut) {
    require(amountIn > 0, 'MojitoLibrary: INSUFFICIENT_INPUT_AMOUNT');
    require(reserveIn > 0 && reserveOut > 0, 'MojitoLibrary: INSUFFICIENT_LIQUIDITY');
    uint amountInWithFee = amountIn * (10000 - swapFeeNumerator);
    uint numerator = amountInWithFee * (reserveOut);
    uint denominator = reserveIn * (10000) + (amountInWithFee);
    amountOut = numerator / denominator;
  }

  // Returns sorted token addresses, used to handle return values from pairs sorted in this order
  function sort_tokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    require(tokenA != tokenB, 'MojitoLibrary: IDENTICAL_ADDRESSES');
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0), 'MojitoLibrary: ZERO_ADDRESS');
  }

  // Calculates the CREATE2 address for a pair without making any external calls
  function pair_for(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
    (address token0, address token1) = sort_tokens(tokenA, tokenB);
    // Note: solidity 0.8 requires explicit conversion from bytes32 to uint160 before casting to address
    pair = address(uint160(uint256(keccak256(abi.encodePacked(
      hex'ff',
      factory,
      keccak256(abi.encodePacked(token0, token1)),
      hex'3b58864b0ea7cc084fc3a5dc3ca7ea2fb5cedd9aac7f9fff0c3dd9a15713f1c7' // init code hash
    )))));
  }

  // Read a Conversion item into memory for efficient lookup
  function get_conversion(uint256 i) internal view returns (Conversion memory cv) {
    return Conversion({
      router:      conversions[i].router,
      token_from:  conversions[i].token_from,
      token_to:    conversions[i].token_to,
      percentage:  conversions[i].percentage,
      operation:        conversions[i].operation
    });
  }

  /// GOVERNANCE
  // Propose governance transfer
  function propose_governance(address to) external {
    require(msg.sender == governance, "must be governance");
    require(to != address(0), "can't set to 0");
    new_governance = to;
  }

  // Accept governance transfer
  function accept_governance() external {
    require(msg.sender == new_governance, "must be new governance");
    governance = msg.sender;
    new_governance = address(0);
  }

  // Sweep funds in case of emergency
  function sweep_erc(address _token, address _to) external {
    require(msg.sender == governance, "must be governance");
    IERC20 token = IERC20(_token);
    uint256 token_balance = token.balanceOf(address(this));
    emit ErcSwept(msg.sender, _to, _token, token_balance);
    token.transfer(_to, token_balance);
  }

}

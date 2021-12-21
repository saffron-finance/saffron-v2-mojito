// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./SaffronPoolV2.sol";
import "./SaffronPositionNFT.sol";
import "./SaffronConverter.sol";
import "./interfaces/IUniswapRouterV2.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SaffronInsuranceFund is SaffronConverter, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Governance
  address public treasury;          // Saffron treasury to collect fees

  // System
  address public insurance_asset;   // Asset to insure the pool's senior tranche with
  address public pool_base_asset;   // Base asset to accumulate from pool
  SaffronPoolV2 public pool;        // SaffronPoolV2 this contract insures
  SaffronPositionNFT public NFT;    // Saffron Position NFT
  uint256 public immutable TRANCHE; // Tranche indicated in NFT storage value

  // User balance vars
  uint256 public total_supply_lp;   // Total balance of all user LP tokens

  // Additional Reentrancy Guard
  // Needed for update(), which can be called twice in some cases
  uint256 private _update_status = 1;
  modifier non_reentrant_update() {
    require(_update_status != 2, "ReentrancyGuard: reentrant call");
    _update_status = 2;
    _;
    _update_status = 1;
  }

  // System Events
  event FundsDeposited(uint256 tranche, uint256 lp, uint256 principal, uint256 token_id, address owner);
  event FundsWithdrawn(uint256 tranche, uint256 principal, uint256 earnings, uint256 token_id, address owner, address caller);
 
  constructor(address _insurance_asset, address _pool_base_asset) {
    require(_insurance_asset != address(0) && _pool_base_asset != address(0), "can't construct with 0 address");
    governance = msg.sender;
    treasury = msg.sender;
    pool_base_asset = _pool_base_asset;
    insurance_asset = _insurance_asset;
    TRANCHE = 2;
  }
  
  // Deposit insurance_assets into the insurance fund
  function deposit(uint256 principal) external nonReentrant {
    // Checks
    require(!pool.shut_down(), "pool shut down");
    require(!pool.deposits_disabled(), "deposits disabled");
    require(principal > 0, "can't deposit 0");

    // Effects
    update();
    uint256 total_holdings = IERC20(insurance_asset).balanceOf(address(this));

    // If holdings or total supply are zero then lp tokens are equivalent to the underlying
    uint256 lp = total_holdings == 0 || total_supply_lp == 0 ? principal : principal * total_supply_lp / total_holdings;
    total_supply_lp += lp;

    // Interactions
    IERC20(insurance_asset).safeTransferFrom(msg.sender, address(this), principal);
    uint256 token_id = NFT.mint(msg.sender, lp, principal, TRANCHE);
    emit FundsDeposited(TRANCHE, lp, principal, token_id, msg.sender);
  }

  // Withdraw principal + earnings from the insurance fund
  function withdraw(uint256 token_id) external nonReentrant {
    // Checks
    require(!pool.shut_down(), "pool shut down");
    require(NFT.tranche(token_id) == 2, "must be insurance NFT");
    
    // Effects
    update();
    uint256 total_holdings = IERC20(insurance_asset).balanceOf(address(this));
    uint256 lp = NFT.balance(token_id);
    uint256 principal = NFT.principal(token_id);
    address owner = NFT.ownerOf(token_id);
    uint256 principal_new = lp * total_holdings / total_supply_lp;
    
    total_supply_lp -= lp;

    // Interactions
    IERC20(insurance_asset).safeTransfer(owner, principal_new );
    NFT.burn(token_id);
    emit FundsWithdrawn(TRANCHE, principal, (principal_new > principal ? principal_new-principal : 0), token_id, owner, msg.sender);
  }

  // Emergency withdraw with as few interactions / state changes as possible / BUT still have to wait for expiration
  function emergency_withdraw(uint256 token_id) external {
    // Extra checks
    require(!pool.shut_down(), "removal paused");
    require(NFT.tranche(token_id) == 2, "must be insurance NFT");
    require(NFT.ownerOf(token_id) == msg.sender, "must be owner");
    uint256 principal = NFT.principal(token_id);
    
    // Minimum effects
    total_supply_lp -= NFT.balance(token_id);

    // Minimum interactions
    emit FundsWithdrawn(TRANCHE, principal, 0, token_id, msg.sender, msg.sender);
    IERC20(insurance_asset).safeTransfer(msg.sender, principal); 
    NFT.burn(token_id);
  }
  
   // Update state and accumulated assets_per_share
  function update() public non_reentrant_update {
    uint256 total_holdings = IERC20(insurance_asset).balanceOf(address(this));

    // Withdraw fees and measure earnings in pool_base_assets
    uint256 p_before = IERC20(pool_base_asset).balanceOf(address(this));
    pool.withdraw_fees(address(this));
    uint256 p_earnings = IERC20(pool_base_asset).balanceOf(address(this)) - p_before;

    // Nothing to do if we don't have enough pool_base_assets to split up
    if (p_earnings > 0) {
      if (total_holdings == 0) {
        // If no one has deposited to the insurance fund then all pool_base_asset earnings go to the treasury and assets_per_share can be safely reset to 0
        IERC20(pool_base_asset).transfer(treasury, p_earnings);
      } else {
        // Transfer half of p_earnings to treasury, convert the rest to insurance_asset, update state
        IERC20(pool_base_asset).transfer(treasury, p_earnings / 2);
        convert();
      }
    }
  }

  // Get total amount of insurance asset held by pool
  function total_principal() external view returns(uint256) {
      return IERC20(insurance_asset).balanceOf(address(this));
  }
  
  // Set the pool and NFT
  function set_pool(address _pool) external {
    require(msg.sender == governance, "must be governance");
    pool = SaffronPoolV2(_pool);
    NFT = pool.NFT();
  }

  // Set the treasury address
  function set_treasury(address _treasury) external {
    require(msg.sender == governance, "must be governance");
    require(_treasury != address(0), "can't set to 0");
    treasury = _treasury;
  }

  // Get pending earnings
  function pending_earnings(uint256 token_id) external view returns(uint256) {
    return total_supply_lp == 0 ? 0 : NFT.balance(token_id) * IERC20(insurance_asset).balanceOf(address(this)) / total_supply_lp;
  }

}

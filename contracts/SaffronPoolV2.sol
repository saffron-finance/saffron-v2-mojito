// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./interfaces/ISaffron_Mojito_AdapterV2.sol";
import "./SaffronPositionToken.sol";
import "./SaffronPositionNFT.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract SaffronPoolV2 is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Governance
  address public governance;            // Governance
  address public new_governance;        // Proposed new governance address
  bool public deposits_disabled = true; // Deposit enabled switch
  bool public shut_down = true;         // Pool shut down switch

  // System
  uint256 public constant version = 1;  // Version number (2.1)
  IERC20 public base_asset;             // Base asset token address
  address public adapter;               // Compound adapter
  address public fee_manager;           // Fee manager contract
  string public pool_name;              // Pool name (front-end only)

  // Yield participant storage
  uint256 public senior_token_supply;   // Senior tranche token totalSupply
  uint256 public senior_exchange_rate;  // Exchange rate from senior tranche tokens to base assets

  // Yield generators
  // ** Mojito pool has no generator-only participants

  // Yield receivers
  uint256 public fees_holdings; // Fees yield receiver balance

  // Tranche tokens, constants, and storage
  SaffronPositionToken public position_token;            // User holdings (ERC20 position token)
  SaffronPositionNFT public NFT;                         // User holdings (insurance fund NFT)
  uint256 public constant S_frac = 600000000000000000;   // Fraction of earnings that goes to SENIOR tranche, base is 1e18
  uint256 public constant F_frac = 400000000000000000;   // Fraction of earnings that goes to fee_manager, base is 1e18

  // Additional Reentrancy Guard
  // Needed for update_exchange_rate(), which can be called twice in some cases
  uint256 private _update_exchange_rate_status = 1;
  modifier non_reentrant_update() {
    require(_update_exchange_rate_status != 2, "ReentrancyGuard: reentrant call");
    _update_exchange_rate_status = 2;
    _;
    _update_exchange_rate_status = 1;
  }

  // System Events
  event FundsDeposited(uint256 amount, uint256 lp_amount_minted, address owner);
  event FundsWithdrawn(uint256 lp_amount, uint256 amount_base, uint256 exchange_rate, address owner);
  event ExchangeRateUpdated(uint256 senior_rate, uint256 fee_rate, uint256 senior_token_supply, uint256 latest_pool_holdings, uint256 yield_receiver_supply);
  event NFTUnfreezeBegun(uint256 token_id, address owner);
  event InconsistencyReported(uint256 latest_pool_holdings, uint256 yield_receiver_supply, uint256 current_pool_holdings, uint256 current_yield_receiver_supply, bool after_update);

  constructor(address _adapter, address _base_asset, string memory name, string memory symbol, string memory _pool_name) {
    require(_adapter != address(0) && _base_asset != address(0), "can't construct with 0 address");

    // Initialize contract state variables 
    governance = msg.sender;
    adapter = _adapter;
    pool_name = _pool_name;
    base_asset = IERC20(_base_asset);

    senior_exchange_rate = 1e18;

    // Create ERC20 and NFT token contracts to track users' deposit positions (senior / junior)
    position_token = new SaffronPositionToken(name, symbol);
    NFT = new SaffronPositionNFT(name, symbol);
  }
  
  // User deposits base assets into the pool
  function deposit(uint256 amount) external nonReentrant {
    // Checks
    require(!deposits_disabled, "deposits disabled");
    require(amount != 0, "can't add 0");
    // Only 0 and 1 for SENIOR and JUNIOR tranches
    require(!shut_down, "pool shut down");
    require(base_asset.balanceOf(msg.sender) >= amount, "insufficient balance");

    // Update exchange rate before issuing LP tokens to ensure:
    // * previous depositors get full value from their deposits
    // * new depositors receive the correct amount of LP tokens
    update_exchange_rate();

    // Calculate lp tokens to be minted based on latest exchange rate
    uint256 lp_amount_minted = amount * 1e18 / senior_exchange_rate;

    // Final check: lp tokens to mint must be greater than zero
    require(lp_amount_minted > 0, "deposit too small");

    // Effects
    senior_token_supply  += lp_amount_minted;

    // Interactions
    // Transfer base assets to adapter and deploy capital to underlying protocol
    base_asset.safeTransferFrom(msg.sender, address(adapter), amount);
    ISaffron_Mojito_AdapterV2(adapter).deploy_capital(amount);

    // Mint senior SAFF-LP tokens for user
    position_token.mint(msg.sender, lp_amount_minted);
    emit FundsDeposited(amount, lp_amount_minted, msg.sender);
  }

  // User burns SAFF-LP tokens to remove capital from the pool
  function withdraw(uint256 lp_amount) external nonReentrant {
    // Checks
    require(!shut_down, "removal paused");
    require(position_token.balanceOf(msg.sender) >= lp_amount, "insufficient balance");

    update_exchange_rate();

    // Get balance based on latest exchange rate
    uint256 amount_base = lp_amount * senior_exchange_rate / 1e18;

    // Effects
    senior_token_supply -= lp_amount;
      
    // Interactions
    // Return capital from adapter and return to the user
    ISaffron_Mojito_AdapterV2(adapter).return_capital(amount_base, msg.sender);

    // Burn SAFF-LP tokens
    position_token.burn(msg.sender, lp_amount);
    emit FundsWithdrawn(lp_amount, amount_base, senior_exchange_rate, msg.sender);
  }

  // User begins unfreezing an NFT to be able to withdraw it
  function begin_unfreeze_NFT(uint256 token_id) external {
    require(!shut_down, "pool shut down");
    require(NFT.tranche(token_id) == 2, "must be insurance token");
    NFT.begin_unfreeze(msg.sender, token_id);
    emit NFTUnfreezeBegun(token_id, msg.sender);
  }

  // Updates senior exchange rate based on current autocompounded earnings, if any. Also update the total supply for each tranche
  function update_exchange_rate() public non_reentrant_update {
    // Load local variables into memory for reduced gas access
    UpdateExchangeRateVars memory uv = get_update_exchange_rate_vars(); 

    // Checks
    if (uv.senior_token_supply == 0) senior_exchange_rate = 1e18;
    if (uv.latest_pool_holdings < uv.yield_receiver_supply) {
      emit InconsistencyReported(uv.latest_pool_holdings, uv.yield_receiver_supply, 0, 0, false);
      console.log("   \x1b[0m\x1b[45m FATAL ERROR: latest_pool_holdings < yield_receiver_supply \x1b[0m", uv.latest_pool_holdings, uv.yield_receiver_supply);
      return;
    }

    // Calculate interest earned (yield) in base_asset since last yield_receiver_supply
    uv.earnings = uv.latest_pool_holdings - uv.yield_receiver_supply;
    if (uv.earnings < 100) return;  // Can't split less than 100 wei of earnings up without losing precision

    // Divide yield up between yield receivers. Any remainder after subtraction goes to the fee yield receiver
    uint256 s_earnings = uv.senior_token_supply == 0 ? 0 : uv.earnings * S_frac / 1e18;
    uint256 f_earnings = uv.earnings - s_earnings;

    // Effects
    senior_exchange_rate = uv.senior_token_supply == 0 ? 1e18 : uv.senior_exchange_rate + (s_earnings * 1e18 / uv.senior_token_supply);
    fees_holdings += f_earnings;

    // Log in case of inconsistency
    uint256 _latest_pool_holdings = get_latest_pool_holdings();
    uint256 _yield_receiver_supply = get_yield_receiver_supply();
    if (_latest_pool_holdings < _yield_receiver_supply) {
        emit InconsistencyReported(uv.latest_pool_holdings, uv.yield_receiver_supply, _latest_pool_holdings, _yield_receiver_supply, true);
    }

    emit ExchangeRateUpdated(senior_exchange_rate, fees_holdings, uv.senior_token_supply, uv.latest_pool_holdings, uv.yield_receiver_supply);
  }

  /// INTERNAL
  // Get the latest pool holdings after autocompounding adapter funds
  function get_latest_pool_holdings() internal returns (uint256) {
    uint256 holdings = ISaffron_Mojito_AdapterV2(adapter).get_holdings();
    return holdings;
  }

  // Structure used for update_exchange_rate memory variables (see below)
  // Future use as a public function: relay pool state to other pool functions, web3 front-ends, and external contracts
  struct UpdateExchangeRateVars { uint256 yield_receiver_supply; uint256 senior_token_supply; uint256 senior_exchange_rate; uint256 fees_holdings; uint256 latest_pool_holdings; uint256 earnings; }
  function get_update_exchange_rate_vars() internal returns (UpdateExchangeRateVars memory uv) {
    return UpdateExchangeRateVars({
      // Contract state variables pulled in for gas efficiency
      senior_token_supply: senior_token_supply,
      senior_exchange_rate: senior_exchange_rate,
      fees_holdings: fees_holdings,
      yield_receiver_supply: get_yield_receiver_supply(),

      // Intermediary variables used for calculations in update_exchange_rate()
      latest_pool_holdings: get_latest_pool_holdings(), // Current pool holdings
      earnings: 0                                       // New earnings in base_asset
    });
  }

  /// GETTERS
  // Get the calculated base asset holdings of all yield receivers by multiplying their token supplies by their exchange rates
  function get_yield_receiver_supply() public view returns (uint256) {
    return (senior_exchange_rate * senior_token_supply / 1e18) + fees_holdings;
  }
  
  /*** GOVERNANCE ***/
  event ExchangeRateSet(uint256 yield_receiver, uint256 value, address governance);
  event PoolShutDownToggled(bool pause);
  event DepositDisabled(bool disable);
  event GovernanceProposed(address from, address to);
  event GovernanceAccepted(address who);
  event AdapterSet(address to);
  event DepositCapSet(uint256 cap, address governance); 
  event ErcSwept(address who, address to, address token, uint256 amount);
  event FeesWithdrawn(uint256 fee_amount, address governance, address to);

  // Set values for yield receivers for waterfall mode (only valid while pool is in a shut down state)
  function set_exchange_rate(uint256 yield_receiver, uint256 value) external {
    require(msg.sender == governance, "must be governance");
    require(shut_down, "pool must be shut down");
    if (yield_receiver == 0) senior_exchange_rate = value;
    else fees_holdings = value;
    emit ExchangeRateSet(yield_receiver, value, msg.sender);
  }

  // Set fee manager (usually insurance fund)
  function set_fee_manager(address to) external {
    require(msg.sender == governance, "must be governance");
    require(to != address(0), "can't set to 0");
    fee_manager = to;
    NFT.set_insurance_fund(to);
  }

  // Transfer fees to fee manager
  function withdraw_fees(address to) external nonReentrant {
    // Checks
    require(msg.sender == governance || msg.sender == fee_manager, "withdraw unauthorized");
    require(to != address(0), "can't withdraw to 0 address");
    update_exchange_rate();
    
    uint256 fee_amount = fees_holdings;
    
    // Effects; Interactions
    ISaffron_Mojito_AdapterV2(adapter).return_capital(fee_amount, to);
    fees_holdings = 0;
    update_exchange_rate();
    emit FeesWithdrawn(fee_amount, msg.sender, to);
  }

  // Shut down the pool to initiate waterfall mode in case of an underlying platform failure
  function shut_down_pool(bool _shut_down) external {
    require(msg.sender == governance, "must be governance");
    shut_down = _shut_down;
    emit PoolShutDownToggled(_shut_down);
  }
  
  // Disable deposits (waterfall mode)
  function disable_deposits(bool _deposits_disabled) external {
    require(msg.sender == governance, "must be governance");
    deposits_disabled = _deposits_disabled;
    emit DepositDisabled(_deposits_disabled);
  }

  // Propose governance transfer
  function propose_governance(address to) external {
    require(msg.sender == governance, "must be governance");
    require(to != address(0), "can't set to 0");
    new_governance = to;
    emit GovernanceProposed(msg.sender, to);
  }

  // Accept governance transfer
  function accept_governance() external {
    require(msg.sender == new_governance, "must be new governance");
    governance = msg.sender;
    new_governance = address(0);
    emit GovernanceAccepted(msg.sender);
  }

  // Set a new adapter
  function set_adapter(address to) external {
    require(msg.sender == governance, "must be governance");
    require(to != address(0), "can't set to 0");
    adapter = to;
    emit AdapterSet(to);
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

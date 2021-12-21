// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/ISaffron_Mojito_AdapterV2.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../SaffronConverter.sol";
import "../interfaces/IMojitoChef.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IUniswapRouterV2.sol";

contract SaffronMojitoAutocompounder is SaffronConverter, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Existing farms and composable protocol connectors to be set in constructor
  IMojitoChef public mojito_chef;         // Mojito chef address

  // Mojito chef parameters
  address public lp;   // LP token to autocompound into
  uint256 public pid;  // Pool ID in farm's pool array

  // Governance
  bool public autocompound_enabled = true;

  // Saffron
  ISaffron_Mojito_AdapterV2 public adapter; 
  
  constructor(address _adapter_address, address _lp_address, uint256 _pid, address _router_address, address _farm_address) {
    require(_adapter_address != address(0) && _lp_address != address(0) && _router_address != address(0) && _farm_address != address(0), "can't construct with 0 address");
    governance = msg.sender;

    // Mojito protocol
    mojito_chef = IMojitoChef(_farm_address);

    // Saffron protocol
    adapter = ISaffron_Mojito_AdapterV2(_adapter_address);

    // Contract state variables
    lp  = _lp_address; 
    pid = _pid;        

    // Approve sending LP tokens to Mojtio
    IERC20(_lp_address).safeApprove(_farm_address, type(uint128).max);
  }
  
  // Reset approvals to uint128.max
  function reset_approvals() external {
    // Reset LP token
    IERC20(lp).safeApprove(address(mojito_chef), 0);
    IERC20(lp).safeApprove(address(mojito_chef), type(uint128).max);
    
    // Reset conversion approvals
    preapprove_conversions();
  }

  // Deposit into MojitoChef and autocompound
  function blend(uint256 amount_qlp) external {
    require(msg.sender == address(adapter), "must be adapter");
    mojito_chef.deposit(pid, amount_qlp);
  }

  // Withdraw from MojitoChef and return funds to router
  function spill(uint256 amount, address to) external {
    require(msg.sender == address(adapter), "must be adapter");
    mojito_chef.withdraw(pid, amount);
    IERC20(lp).safeTransfer(to, amount);
  }

  // Autocompound rewards into more lp tokens
  function autocompound() external nonReentrant {
    if (!autocompound_enabled) return;

    // Deposit 0 to MojitoChef to harvest tokens
    mojito_chef.deposit(pid, 0);
    
    // Convert rewards
    uint256 lp_before = IERC20(lp).balanceOf(address(this));
    convert();
    uint256 lp_rewards = IERC20(lp).balanceOf(address(this)) - lp_before;

    // Deposit rewards if any
    if (lp_rewards > 0) mojito_chef.deposit(pid, lp_rewards);
  }

  /// GETTERS 
  // Get autocompounder holdings after autocompounding 
  function get_autocompounder_holdings() external view returns (uint256) {
    return mojito_chef.userInfo(pid, address(this));
  }

  // Get holdings from MojitoChef contract
  function get_mojito_chef_holdings() external view returns (uint256) {
    return mojito_chef.userInfo(pid, address(this));
  }

  /// GOVERNANCE
  // Set new MojitoChef contract address
  function set_mojito_chef(address _mojito_chef) external {
    require(msg.sender == governance, "must be governance");
    mojito_chef = IMojitoChef(_mojito_chef);
  }

  // Toggle autocompounding
  function set_autocompound_enabled(bool _enabled) external {
    require(msg.sender == governance, "must be governance");
    autocompound_enabled = _enabled;
  }

  // Withdraw funds from MojitoChef in case of emergency
  function emergency_withdraw(uint256 _pid, uint256 _amount) external {
    require(msg.sender == governance, "must be governance");
    mojito_chef.withdraw(_pid, _amount);
  }

}


contract Saffron_Mojito_Adapter is ISaffron_Mojito_AdapterV2, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // Governance and pool 
  address public governance;                          // Governance address
  address public new_governance;                      // Newly proposed governance address
  address public saffron_pool;                        // SaffronPool that owns this adapter

  // Platform-specific vars
  IERC20 public MLP;                                  // MLP address (Uni-V2 LP token)
  SaffronMojitoAutocompounder public autocompounder;  // Auto-Compounder

  // Saffron identifiers
  string public constant platform = "MojitoChef";     // Platform name
  string public name;                                 // Adapter name

  constructor(address _lp_address, string memory _name) {
    require(_lp_address != address(0x0), "can't construct with 0 address");
    governance = msg.sender;
    name       = _name;
    MLP        = IERC20(_lp_address);
  }

  // System Events
  event CapitalDeployed(uint256 lp_amount);
  event CapitalReturned(uint256 lp_amount, address to);
  event Holdings(uint256 holdings);
  event ErcSwept(address who, address to, address token, uint256 amount);

  // Adds funds to underlying protocol. Called from pool's deposit function
  function deploy_capital(uint256 lp_amount) external override nonReentrant {
    require(msg.sender == saffron_pool, "must be pool");

    // Send lp to autocompounder and deposit into MojitoChef
    emit CapitalDeployed(lp_amount);
    MLP.safeTransfer(address(autocompounder), lp_amount);
    autocompounder.blend(lp_amount);
  }

  // Returns funds to user. Called from pool's withdraw function
  function return_capital(uint256 lp_amount, address to) external override nonReentrant {
    require(msg.sender == saffron_pool, "must be pool");
    emit CapitalReturned(lp_amount, to);
    autocompounder.spill(lp_amount, to);
  }

  // Return autocompounder holdings and log (for use in pool / adapter core functions)
  function get_holdings() external override nonReentrant returns(uint256 holdings) {
    holdings = autocompounder.get_autocompounder_holdings();
    emit Holdings(holdings);
  }

  // Backwards compatible holdings getter (can be removed in next upgrade for gas efficiency)
  function get_holdings_view() external override view returns(uint256 holdings) {
    return autocompounder.get_mojito_chef_holdings();
  }

  /// GOVERNANCE
  // Set a new Saffron autocompounder address
  function set_autocompounder(address _autocompounder) external {
    require(msg.sender == governance, "must be governance");
    autocompounder = SaffronMojitoAutocompounder(_autocompounder);
  }

  // Set a new pool address
  function set_pool(address pool) external override {
    require(msg.sender == governance, "must be governance");
    require(pool != address(0x0), "can't set pool to 0 address");
    saffron_pool = pool;
  }

  // Set a new LP token
  function set_lp(address addr) external override {
    require(msg.sender == governance, "must be governance");
    MLP=IERC20(addr);
  }

  // Governance transfer
  function propose_governance(address to) external override {
    require(msg.sender == governance, "must be governance");
    require(to != address(0), "can't set to 0");
    new_governance = to;
  }

  // Governance transfer
  function accept_governance() external override {
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

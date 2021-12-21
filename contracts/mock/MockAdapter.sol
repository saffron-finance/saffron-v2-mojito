// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/ISaffron_Mojito_AdapterV2.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockAdapter is ISaffron_Mojito_AdapterV2 {
  uint256 _underlying_exchange_rate = 0;
  uint256 _holdings = 0;
  uint256 _interest = 0;

  constructor() {
  }

  function set_pool(address) external override {
  }

  function deploy_capital(uint256) external override {
  }

  function return_capital(uint256 lp_amount, address to) external override {
  }

  function set_underlying_exchange_rate(uint256 rate) external {
    _underlying_exchange_rate = rate;
  }

  function get_holdings() external override view returns (uint256) {
    return _holdings;
  }

  function set_holdings(uint256 holdings) external {
    _holdings = holdings;
  }

  function set_interest(uint256 interest) external {
    _interest = interest;
  }

  function set_lp(address addr) external override {
  }

  function propose_governance(address to) external override {
  }

  function get_holdings_view() external override view returns(uint256 holdings) {
    return _holdings;
  }

  function accept_governance() external override {
  }

}

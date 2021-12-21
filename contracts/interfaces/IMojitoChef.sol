// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IMojitoChef {
  function userInfo(uint256 _pid, address _user) external view returns (uint256 amount);
  function pendingMojito(uint256 _pid, address _user) external view returns (uint256);
  function deposit(uint256 _pid, uint256 _amount) external;
  function withdraw(uint256 _pid, uint256 _amount) external;
  function poolInfo(uint256 _pid) external view returns (address lpToken,uint256 allocPoint,uint256 lastRewardBlock,uint256 accMojitoPerShare);
  function poolLength() external view returns (uint256);
  
}

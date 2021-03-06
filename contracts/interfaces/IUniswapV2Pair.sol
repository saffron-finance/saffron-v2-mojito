// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IUniswapV2Pair {
  function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
  function totalSupply() external view returns (uint);
  function swapFeeNumerator() external view returns (uint);
}

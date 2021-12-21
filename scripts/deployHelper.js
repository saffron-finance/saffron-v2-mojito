/**
 * @title SaffronPoolV2 test 
 * @author psykeeper, roadbuilder
 * @dev Test SaffronPoolV2 contract
 * 
 * DEPOSITS
 * into canal coffee wallet from whale address
 * so intitalize will have LP to create first 2 pool NFTs
 */

const hre = require("hardhat");


const { BigNumber: BN } = hre.ethers;
const { increaseTime, deployContract, increaseBlock, toWei, fromWei,
        unlockSigner, takeSnapshot, revertToSnapShot, randSeed, randInt } = require("../test/testHelper");

async function main() {

  let wkcs,mjt;
  let contractWhale,usdcWhaleAddress;
  
  // KCC network addresses
  const WALLET = "0x8D1A8B2b5369c38a2466916385Cd82fe1AB6d6ce";
 // const WALLET = "0xDa6936fb4183814bf343E762E4923f6e04b85E08";

  const WKCS = "0x4446fc4eb47f2f6586f9faab68b3498f86c07521";
  const MJT = "0x2ca48b4eea5a731c2b54e7c3944dbdb87c0cfb6f";
  const USDC = "0x980a5afef3d17ad98635f6c5aebcbaeded3c3430";
  const MJT_WKCS_LP = "0xa0d7c8aa789362cdf4faae24b9d1528ed5a3777f";     // Mojitoswap MJT/WKCS MLP

  const WKCS_WHALE = "0x1ee6b0f7302b3c48c5fa89cd0a066309d9ac3584";
  const MJT_WHALE  = "0x15fb5d1a203abb8947b70d7487aaad62def52268";
  const USDC_WHALE  = "0xa232918ca4064667f9230eb30cd593c7c03959d7";

  [deployer] = await hre.ethers.getSigners();

  let blocknow = (await hre.ethers.provider.getBlock("latest")).number;
  console.log(blocknow);

  //get token contracts
  wkcs = await hre.ethers.getContractAt("IERC20",WKCS);
  mjt = await hre.ethers.getContractAt("IERC20",MJT);
  usdc = await hre.ethers.getContractAt("IERC20",USDC);

  // send contract whale 1e28 wei and unlock it
  console.log(" ~~~~ sending contract whale 1e28 wei");
  await hre.network.provider.send("hardhat_setBalance", [WKCS_WHALE,"0x204fce5e3e25026110000000"]);
  console.log(" ~~~~ unlocking");
  contractWhale = await unlockSigner(WKCS_WHALE);
  console.log(` ~~~~ deployer wkcs balance (before): ${(await wkcs.balanceOf(WALLET))}`);
  console.log(" ~~~~ sending 1000 WKCS to deployer from contract whale");
  await wkcs.connect(contractWhale).transfer(WALLET, toWei(1000));
  console.log(` ~~~~ deployer WKCS balance (after) : ${(await wkcs.balanceOf(WALLET))}\n`);
  
  console.log(" ~~~~ sending contract whale 1e28 wei");
  await hre.network.provider.send("hardhat_setBalance", [MJT_WHALE,"0x204fce5e3e25026110000000"]);
  console.log(" ~~~~ unlocking");
  contractWhale = await unlockSigner(MJT_WHALE);
  console.log(` ~~~~ deployer mjt balance (before): ${(await mjt.balanceOf(WALLET))}`);
  console.log(" ~~~~ sending 2000 MJT to deployer from contract whale");
  await mjt.connect(contractWhale).transfer(WALLET, toWei(2000));
  console.log(` ~~~~ deployer MJT balance (after) : ${(await mjt.balanceOf(WALLET))}\n`);
  
  console.log(" ~~~~ sending contract whale 1e28 wei");
  await hre.network.provider.send("hardhat_setBalance", [USDC_WHALE,"0x204fce5e3e25026110000000"]);
  console.log(` ~~~~ deployer USDC_WHALE balance (before): ${(await usdc.balanceOf(USDC_WHALE))}`);
  
  console.log(" ~~~~ unlocking");
  contractWhale = await unlockSigner(USDC_WHALE);
  console.log(` ~~~~ deployer usdc balance (before): ${(await usdc.balanceOf(WALLET))}`);
  console.log(" ~~~~ sending 2000 USDC to deployer from contract whale");
  await usdc.connect(contractWhale).transfer(WALLET, toWei(2000));
  console.log(` ~~~~ deployer USDC balance (after) : ${(await usdc.balanceOf(WALLET))}\n`);

}

main();


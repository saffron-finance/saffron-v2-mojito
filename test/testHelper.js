/**
 * @title testHelper 
 * @author ethlocker, psykeeper, turpintinz
 * @dev Helper functions for tests
 * 
 */

const { BigNumber: BN } = require("ethers")
const seedrandom = require('seedrandom');

/**
 * @dev Fast-forward to test functions relying on block.timestamp.
 * @param sec Seconds in the future to be traveled.
 */
const increaseTime = async sec => {
  if (sec < 60) console.log(`\n  advancing ${sec} secs`);
  else if (sec < 3600) console.log(`\n  advancing ${Number(sec / 60).toFixed(0)} minutes`);
  else if (sec < 60 * 60 * 24) console.log(`\n  advancing ${Number(sec / 3600).toFixed(0)} hours`);
  else if (sec < 60 * 60 * 24 * 31) console.log(`\n  advancing ${Number(sec / 3600 / 24).toFixed(0)} days`);

  await hre.network.provider.send("evm_increaseTime", [sec]);
  await hre.network.provider.send("evm_mine");
};

/**
 * @dev Increase the block to test functions relying on block.number.
 * @param block Travel `block` blocks into the future.
 */
const increaseBlock = async (block, verbose=true) => {
  if (verbose) console.log(`\n  advancing ${block} blocks`);
  for (let i = 1; i <= block; i++) {
    await hre.network.provider.send("evm_mine");
  }
  if (verbose) console.log("  latest block: ",(await hre.ethers.provider.getBlock("latest")).number);
};

/**
 * @dev Deploy a contract with specified arguments, including optional arguments.
 * @param signer Contract deployer.
 * @param name Name of the contract.
 * @param arg List of arguments to be passed into the contract constructor.
 * @returns Instance of a contract.
 */
const deployContract = async (signer, name, ...arg) => {
  const contractFactory = await hre.ethers.getContractFactory(name);
  const contract = await contractFactory.connect(signer).deploy(...arg);
  await contract.deployed();
  return contract;
};

/**
 * @dev Get the contract instance from the address and contract name.
 * @param name Contract name.
 * @param address Contract address.
 * @returns Instance of the contract specified by `name` and `address`.
 */
const getContractAt = async (name, address) => {
  return await hre.ethers.getContractAt(name, address);
};

/**
 * @dev Get the signer to impersonate using the hardhat_impersonateAccount method.
 * @param address Address to impersonate.
 * @returns Signer.
 */
const unlockAccount = async address => {
  await hre.network.provider.send("hardhat_impersonateAccount", [address]);
  return hre.ethers.provider.getSigner(address);
};

/**
 * @dev Convert a number to a bignumber in 18-decimal wei. Optionally specify a different decimals amount to scale up.
 * @param amount Amount to be converted into a bignumber.
 * @param decimal Decimals representing wei of the bignumber value. Defaults to 18.
 * @returns Scaled bignumber.
 */
const toWei = (amount, decimal = 18) => {
  return BN.from(amount).mul(BN.from(10).pow(decimal));
};

/**
 * @dev Scale down a bignumber from wei to a human-readable representation of the input value.
 * @param amount Amount to be converted from wei to human-readable format.
 * @param decimal Amount of decimals `amount` is scaled up by.
 * @returns Human-readable version of the bignumber `amount`.
 */
const fromWei = (amount, decimal = 18) => {
  return hre.ethers.utils.formatUnits(amount, decimal);
};

/**
 * @dev Reset the network 
 */
const resetNetwork = async () => {
  console.log(`resetting network`);
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [],
  });
};

/**
 * @dev Unlock signer account
 * @param address Address of account to impersonate
 */
const unlockSigner = async (address) => {
  await hre.network.provider.send("hardhat_impersonateAccount", [address]);
  return hre.ethers.provider.getSigner(address);
};

/**
 * @dev Take a snapshot
 */
const takeSnapshot = async () => {
  console.log(`taking snapshot`);
  const snapshotId = await hre.network.provider.send("evm_snapshot");
  console.log(`snapshotId: `, snapshotId);
  return snapshotId;
};

/**
 * @dev Revert to snapshot
 * @param snapshotId Snapshot id to revert to, from takeSnapshot)
 */
const revertToSnapShot = async (snapshotId) => {
  console.log(`reverting to snapshot id:`,snapshotId);
  await hre.network.provider.send("evm_revert", [snapshotId]);
};

/**
 * @dev Seed the random number generator to predict numbers
 * @param seed random integer to start seed random number generator with
 */
const randSeed = (seed) => {
  //set built in generator to be seedable
  Math.random = seedrandom.xor4096(""+seed); // alea, xor128, tychei, xorwow, xor4096, xorshift7, quick : https://www.npmjs.com/package/seedrandom
};

/**
 * @dev Give random range between two integers
 * @param start random integer to start with, inclusive, optional, defaults to 0
 * @param stop random integer to stop with, inclusive, required
 */
const randInt = (start,stop=0) => {
  // check if only one value given
  if(arguments.length===1) [start, stop]=[0,start];
  // swap numbers so that start< stop
  if(start>stop) [start, stop] = [stop, start];
  // return random integer in given start/stop range
  return Math.floor(Math.random()*(stop-start+1))+start;
};

module.exports = {
  increaseBlock,
  increaseTime,
  deployContract,
  getContractAt,
  unlockAccount,
  toWei,
  fromWei,
  resetNetwork,
  unlockSigner,
  takeSnapshot,
  revertToSnapShot,
  randSeed,
  randInt
};

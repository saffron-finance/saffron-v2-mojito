/**
 * @title SaffronPoolV2 test 
 * @author psykeeper, roadbuilder
 * @dev Test SaffronPoolV2 contract
 * 
 */

const hre = require("hardhat");
const chai = require("chai");
const { solidity } = require("ethereum-waffle");
let initialSnapshotId;
chai.use(solidity);

const { expect } = chai;
const { BigNumber: BN } = hre.ethers;
const { increaseTime, deployContract, increaseBlock, toWei, fromWei,
        unlockSigner, takeSnapshot, revertToSnapShot, randSeed, randInt } = require("./testHelper");

describe("📜 SaffronStakingV2 function coverage", () => {
  let adapter, saffronPoolV2, saffronPositionToken, saffronPositionNFT, fund;
  let mockAdapter;
  let deployer;
  let users = ["alex","beth","carl","dave","erin","fred","gary","hans","igor","jake"];
  let mlp, fees, mjt, wkcs, whale, usdc;
  let contractFactory;
  let autocompounder;
  let mojitoswap;
  
  // Polygon network addresses
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const WKCS = "0x4446fc4eb47f2f6586f9faab68b3498f86c07521";

  const MJT = "0x2ca48b4eea5a731c2b54e7c3944dbdb87c0cfb6f";
  const MJT_WKCS_LP = "0xa0d7c8aa789362cdf4faae24b9d1528ed5a3777f";     // Mojitoswap MJT/WKCS MLP
  const USDC = "0x980a5afef3d17ad98635f6c5aebcbaeded3c3430";

  const MJT_WKCS_pid = 1; // MojitoSwap MJT/WKCS pid
  const MOJITO_ROUTER = "0x8c8067ed3bC19ACcE28C1953bfC18DC85A2127F7";     // Mojitoswap router
  const MOJITOCHEF    = "0x25c6d6a65c3ae5d41599ba2211629b24604fea4f";     // MojitoSwap mojito chefs

  const WKCS_WHALE = "0x1ee6b0f7302b3c48c5fa89cd0a066309d9ac3584";
  const MJT_WHALE  = "0x15fb5d1a203abb8947b70d7487aaad62def52268";
  const REMOVE_LIQUIDITY_FLAG = BN.from(1);
  const SWAP_LIQUIDITY_FLAG   = BN.from(2);
  const ADD_LIQUIDITY_FLAG    = BN.from(4);
  const SUPPORT_FEE_FLAG      = BN.from(8);
  
  const SENIOR_TRANCHE = 0;
  const INSURANCE_TRANCHE = 2;
  
  let TOKEN_NAMES = {
    "0x4446fc4eb47f2f6586f9faab68b3498f86c07521":{"name":"WKCS","decimals":18},
    "0x2ca48b4eea5a731c2b54e7c3944dbdb87c0cfb6f":{"name":"MJT","decimals":18},
    "0xa0d7c8aa789362cdf4faae24b9d1528ed5a3777f":{"name":"MJT/WKCS LP","decimals":18},
    "0x980a5afef3d17ad98635f6c5aebcbaeded3c3430":{"name":"USDC","decimals":18}
  }

  // Test helper constants
  const userMLPamount = toWei(2000);
  const userUSDCamount = toWei(100000,18);
  const DEPOSIT = 0;
  const WITHDRAW = 1;

  /// @dev Before any tests begin
  before("deploy contracts", async () => {
    //set chain back to start for easier block numbers from previous describe
    if(typeof initialSnapshotId !=="undefined")  {
      await revertToSnapShot(initialSnapshotId);
      // store initial state of chain
      initialSnapshotId = await takeSnapshot();
    }
    console.log("Latest Block: ",(await hre.ethers.provider.getBlock("latest")).number);

    // get test users
    [deployer,alex,beth,carl,dave,erin,fred,gary,hans,igor,jake,fees] = await hre.ethers.getSigners();

    let blocknow = (await hre.ethers.provider.getBlock("latest")).number;
    console.log(blocknow);

    //get token contracts
    mjt = await hre.ethers.getContractAt("IERC20",MJT);
    wkcs = await hre.ethers.getContractAt("IERC20",WKCS);
    usdc = await hre.ethers.getContractAt("IERC20",USDC);

    // get mlp contract
    mlp = await hre.ethers.getContractAt("IERC20",MJT_WKCS_LP);
    
    mojitoswap = await hre.ethers.getContractAt("IMojitoChef",MOJITOCHEF);

    // send contract whale 1e28 wei and unlock it
    console.log(" ~~~~ sending contract whale 1e28 wei");
    contractWhaleAddress = "0x25c6d6a65c3ae5d41599ba2211629b24604fea4f";
    await hre.network.provider.send("hardhat_setBalance", [
      contractWhaleAddress,
      "0x204fce5e3e25026110000000", // 1e28 wei
    ]);
    console.log(" ~~~~ unlocking");
    contractWhale = await unlockSigner(contractWhaleAddress);

    console.log(` ~~~~ deployer mlp balance (before): ${(await mlp.balanceOf(deployer.address))}`);
    console.log(" ~~~~ sending 30000 mlp to deployer from contract whale");
    await mlp.connect(contractWhale).transfer(deployer.address, toWei(30000));
    // verify
    console.log(` ~~~~ deployer mlp balance (after) : ${(await mlp.balanceOf(deployer.address))}`);
    // send contract whale 1e28 wei and unlock it
    console.log(" ~~~~ sending contract whale 1e28 wei");
    await hre.network.provider.send("hardhat_setBalance", [WKCS_WHALE,"0x204fce5e3e25026110000000"]);
    console.log(" ~~~~ unlocking");
    contractWhale = await unlockSigner(WKCS_WHALE);
    console.log(` ~~~~ deployer wkcs balance (before): ${(await wkcs.balanceOf(deployer.address))}`);
    console.log(" ~~~~ sending 250000 WKCS to deployer from contract whale");
    await wkcs.connect(contractWhale).transfer(deployer.address, toWei(10000));
    console.log(` ~~~~ deployer wkcs balance (after) : ${(await wkcs.balanceOf(deployer.address))}`);
    console.log(" ~~~~ sending contract whale 1e28 wei");
    await hre.network.provider.send("hardhat_setBalance", [MJT_WHALE,"0x204fce5e3e25026110000000"]);
    console.log(" ~~~~ unlocking");
    contractWhale = await unlockSigner(MJT_WHALE);
    console.log(` ~~~~ deployer mjt balance (before): ${(await mjt.balanceOf(deployer.address))}`);
    console.log(" ~~~~ sending 200000 MJT to deployer from contract whale");
    await mjt.connect(contractWhale).transfer(deployer.address, toWei(200000));
    console.log(` ~~~~ deployer mjt balance (after) : ${(await mjt.balanceOf(deployer.address))}`);
    
    // Get USDC whale with more than 1,000,000 USDC and send to deployer
    const USDCwhales  = ["0xd6216fc19db775df9774a6e33526131da7d19a2c", "0x57dd7e46db5487ebcd8a0aa48040f807d6071f22"];
    for (i = 0; i < USDCwhales.length; i++) { 
      if ((await usdc.balanceOf(USDCwhales[i])).gte(BN.from('1000000000000000000000000'))) {
        usdcWhaleAddress = USDCwhales[i]; 
        break;
      }
    }
    usdcWhale = await unlockSigner(usdcWhaleAddress);
    await hre.network.provider.send("hardhat_setBalance", [ usdcWhaleAddress, "0x204fce5e3e25026110000000", /* 1e28 wei */]);
    await usdc.connect(usdcWhale).transfer(deployer.address, BN.from('1000000000000000000000000'));

    console.log(`Deployer has ${(await mlp.balanceOf(deployer.address))} MLP tokens`);
    // send users each mlp
    for(let user of users) {
      await mlp.connect(deployer).transfer(global[user].address, userMLPamount);
    }

    // verify some balances
    console.log("user's balance of mlp: ",fromWei(await mlp.balanceOf(alex.address)));
  });
  
  it("should deploy adapter contract and autocompounder contract correctly", async ()=> {

    // verify that a zero CErc20_contract_address won't deploy on adapter contract
    contractFactory = await hre.ethers.getContractFactory("Saffron_Mojito_Adapter");
    await expect(contractFactory.connect(deployer).deploy(zeroAddress, "test")).to.be.revertedWith("can't construct with 0 address");

    // verify that a correct addresses will deploy on Saffron_Mojito_Adapter contract
    await expect(contractFactory.connect(deployer).deploy(mlp.address, "test")).to.not.be.reverted;

    // deploy contract for use in next test
    adapter = await contractFactory.connect(deployer).deploy(mlp.address, "MojitoSwap MJT/WKCS MLP Adapter");
    await adapter.deployed();

    // verify Saffron_Mojito_Adapter contract address is a proper address
    expect(adapter.address).to.be.properAddress;
    
    // verify that governance address was set to deployer address
    let governanceAddress = await adapter.governance();
    expect(deployer.address).to.be.eql(governanceAddress, "governance address doesn't match deployer address");

    // verify that mlp address was set to mlp address
    let mlpAddress = await adapter.MLP();
    expect(mlp.address.toLowerCase()).to.be.eql(mlpAddress.toLowerCase(), "mlp address doesn't match mlp address that was set");
    //expect(mlp.address).to.be.eql(mlpAddress.toLowerCase(), "mlp address doesn't match mlp address that was set");
    
    // deploy MJT/WKCS autocompounder
    contractFactory = await hre.ethers.getContractFactory("SaffronMojitoAutocompounder");

    // expect reverts with 0 address
    await expect(contractFactory.connect(deployer).deploy(zeroAddress, MJT_WKCS_LP, MJT_WKCS_pid, MOJITO_ROUTER, MOJITOCHEF)).to.be.revertedWith("can't construct with 0 address");
    await expect(contractFactory.connect(deployer).deploy(adapter.address, zeroAddress, MJT_WKCS_pid, MOJITO_ROUTER, MOJITOCHEF)).to.be.revertedWith("can't construct with 0 address");
    await expect(contractFactory.connect(deployer).deploy(adapter.address, MJT_WKCS_LP, MJT_WKCS_pid, zeroAddress, MOJITOCHEF)).to.be.revertedWith("can't construct with 0 address");
    await expect(contractFactory.connect(deployer).deploy(adapter.address, MJT_WKCS_LP, MJT_WKCS_pid, MOJITO_ROUTER, zeroAddress)).to.be.revertedWith("can't construct with 0 address");
    
    // deploy with adapter address
    autocompounder = await contractFactory.connect(deployer).deploy(adapter.address, MJT_WKCS_LP, MJT_WKCS_pid, MOJITO_ROUTER, MOJITOCHEF);

    await autocompounder.deployed();
    expect(autocompounder.address).to.be.properAddress;

    // set adapter's autocompounder address must be governance
    await expect(adapter.connect(alex).set_autocompounder(autocompounder.address)).to.be.revertedWith("must be governance");

    // set adapter's autocompounder address
    await adapter.connect(deployer).set_autocompounder(autocompounder.address);

    console.log("initialize");
    // Initialize autocompounder
    //await autocompounder.connect(deployer).init_conversions([MOJITO_ROUTER], [MJT], [WKCS], [BN.from('50')]);
    await autocompounder.connect(deployer).init_conversions([MOJITO_ROUTER], [MJT], [WKCS], [BN.from('50')], [SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG|ADD_LIQUIDITY_FLAG]);
  }); 
   
  it("should deploy SaffronPoolV2 contract correctly", async ()=> {

    // verify that a zero _adapter address won't deploy on SaffronPoolV2 contract
    contractFactory = await hre.ethers.getContractFactory("SaffronPoolV2");
    await expect(contractFactory.connect(deployer).deploy(zeroAddress,mlp.address,"test","test","test pool")).to.be.revertedWith("can't construct with 0 address");

    // verify that a zero address won't deploy on SaffronPoolV2 contract
     await expect(contractFactory.connect(deployer).deploy(adapter.address,zeroAddress,"test","test","test pool")).to.be.revertedWith("can't construct with 0 address");

    // verify that a correct addresses will deploy on SaffronPoolV2 contract
    await expect(contractFactory.connect(deployer).deploy(adapter.address,mlp.address,"test","test","test pool")).to.not.be.reverted;

    // deploy contract for use in next test
    saffronPoolV2 = await contractFactory.connect(deployer).deploy(adapter.address,mlp.address,"Saffron Autocompounder Position Token MOJITOSWAP[MJT/WKCS MLP]","SAFF-LP-MOJITOSWAP[MJT/WKCS MLP]","Saffron V2 MojitoChef MJT/WKCS Autocompounding Pool");
    await saffronPoolV2.deployed();

    // verify SaffronPoolV2 contract address is a proper address
    expect(saffronPoolV2.address).to.be.properAddress;
    
    // verify that governance address was set to deployer address
    let governanceAddress = await saffronPoolV2.governance();
    expect(deployer.address).to.be.eql(governanceAddress, "governance address doesn't match deployer address");
    
    // verify that mlp address was set to mlp address
    let adapterAddress = await saffronPoolV2.adapter();
    expect(adapter.address).to.be.eql(adapterAddress, "Adapter address doesn't match adapter address that was set");

    // verify that mlp address was set to mlp address
    let mlpAddress = await saffronPoolV2.base_asset();
    expect(mlp.address.toLowerCase()).to.be.eql(mlpAddress.toLowerCase(), "mlp address doesn't match mlp address that was set");
    
    // verify that shutdown was set correctly
    let shutdown = await saffronPoolV2.shut_down();
    expect(true).to.be.eql(shutdown, "pool should be shut down");
    
    // verify that a saffronPositionToken was created
    let address = await saffronPoolV2.position_token();
    let NFTaddress = await saffronPoolV2.NFT();
    saffronPositionToken = await hre.ethers.getContractAt("SaffronPositionToken",address);
    saffronPositionNFT = await hre.ethers.getContractAt("SaffronPositionToken",NFTaddress);

    // verify saffronPositionToken contract address is a proper address
    expect(saffronPositionToken.address).to.be.properAddress;

    // verify that senior_exchange_rate was set to non-zero
    let senior_exchange_rate = await saffronPoolV2.senior_exchange_rate();
    expect(senior_exchange_rate).to.be.gt(BN.from("0"), "senior_exchange_rate should be set to adapter underlying_exchange_rate which should be zero at start");

  });  

  it("SaffronPoolV2 should deploy SaffronPositionToken contract correctly", async ()=> {
    // verify that saffronPositionToken contract name was set correctly
    let name = await saffronPositionToken.name();
    expect(name).to.be.eql("Saffron Autocompounder Position Token MOJITOSWAP[MJT/WKCS MLP]", "saffronPositionToken contract name does not match set name");
    
    // verify that saffronPositionToken contract symbol was set correctly
    let symbol = await saffronPositionToken.symbol();
    expect(symbol).to.be.eql("SAFF-LP-MOJITOSWAP[MJT/WKCS MLP]", "saffronPositionToken contract symbol does not match set symbol");

    let governanceAddress = await saffronPositionToken.pool();
    expect(saffronPoolV2.address).to.be.eql(governanceAddress, "saffronPositionToken pool owner is not the saffronPoolV2 address");
    
  });

  it("should have Saffron_Mojito_Adapter set_pool work correctly", async ()=> {
    
    // verify that only the governance of contract can set pool
    await expect(adapter.connect(alex).set_pool(saffronPoolV2.address)).to.be.revertedWith("must be governance");

    // verify that pool address can't be set to zero'
    await expect(adapter.connect(deployer).set_pool(zeroAddress)).to.be.revertedWith("can't set pool to 0 address");

    // set Saffron_Mojito_Adapter adapter's' pool
    await expect(adapter.connect(deployer).set_pool(saffronPoolV2.address)).to.not.be.reverted;
    
    // verify correct pool was set
    let saffron_pool = await adapter.saffron_pool();
    expect(saffronPoolV2.address.toLowerCase()).to.be.eql(saffron_pool.toLowerCase(), "adapter contract saffronPoolV2.address does not match set saffron_pool");

  });
  
  it("should have Saffron_Mojito_Adapter deploy_capital work correctly", async ()=> {
    let depositAmount = toWei(1);

    // verify that only the saffron_pool of contract can call return_capital
    await expect(adapter.connect(deployer).deploy_capital(depositAmount)).to.be.revertedWith("must be pool");
    
    // set_pool to deployer in order to run rest of tests
    await expect(adapter.connect(deployer).set_pool(deployer.address)).to.not.be.reverted;
    
    // verify that deploy capital will revert with amount that is more than balance of mlp in contract
    await expect(adapter.deploy_capital(depositAmount)).to.be.revertedWith("ds-math-sub-underflow");
    
    // have deployer send adapter .999999999999999999 mlp and try again
    await mlp.connect(deployer).transfer(adapter.address, depositAmount.sub(BN.from(1)));
    
    // verify that deploy capital will revert with amount that is more than balance of mlp in contract
    await expect(adapter.deploy_capital(depositAmount)).to.be.revertedWith("ds-math-sub-underflow");
    
    // have deployer send adapter 1 mlp and try again
    await mlp.connect(deployer).transfer(adapter.address, depositAmount);
    
    // verify that deploy capital will revert with amount that is more than balance of mlp in contract\
    console.log("user's balance of mlp: ",fromWei(await mlp.balanceOf(alex.address)));

    await adapter.connect(deployer).deploy_capital(depositAmount);
    //await expect(adapter.deploy_capital(depositAmount)).to.not.be.reverted;
    
    // set_pool to back to saffronPoolV2 in order to run rest of tests
    await expect(adapter.connect(deployer).set_pool(saffronPoolV2.address)).to.not.be.reverted;
  });
  
  it("should have Saffron_Mojito_Adapter return_capital work correctly", async ()=> {
    // add some blocks to earn mlp on mlp holdings
    await increaseBlock(BN.from(100));
    
    // verify that only the saffron_pool of contract can call return_capital
    await expect(adapter.connect(deployer).return_capital(toWei(1), deployer.address)).to.be.revertedWith("must be pool");
    
    // set_pool to deployer in order to run rest of tests
    await expect(adapter.connect(deployer).set_pool(deployer.address)).to.not.be.reverted;
    
    // TODO: test rest of return capital
    let deployer_pre_bal = await mlp.balanceOf(deployer.address);
    console.log("deployer_pre_bal: ",fromWei(deployer_pre_bal));
     
    // return capital
    await expect(adapter.connect(deployer).return_capital(toWei(1), deployer.address)).to.not.be.reverted;
    
    let deployer_post_bal = await mlp.balanceOf(deployer.address);
    console.log("deployer_post_bal: ",fromWei(deployer_post_bal));
    console.log("deployer_delta: ", fromWei(deployer_post_bal.sub(deployer_pre_bal)));
   
    // verify that user gets 1 MLP back
    expect(deployer_post_bal.sub(deployer_pre_bal)).to.be.eq(BN.from(toWei(1)), "deployer should get 1 mlp back");

    // set_pool to back to saffronPoolV2 in order to run rest of tests
    await expect(adapter.connect(deployer).set_pool(saffronPoolV2.address)).to.not.be.reverted;
    
  });

  it("should have adapter set_lp work correctly", async ()=> {
    // verify that only the governance of contract can set base asset
    await expect(adapter.connect(alex).set_lp(mlp.address)).to.be.revertedWith("must be governance");

    // set adapter adapter's' mojito_weth_qlp address to MJT temporarily
    await expect(adapter.connect(deployer).set_lp(MJT)).to.not.be.reverted;
 
    // verify mojito_weth_qlp address was set correctly
    let address = await adapter.MLP();
    expect(MJT.toLowerCase()).to.be.eql(address.toLowerCase(), "adapter contract mlp address does not match address that was set");
    
    // set adapter adapter's mojito_weth_qlpt address back to mlp
    await expect(adapter.connect(deployer).set_lp(mlp.address)).to.not.be.reverted;
    
    // verify mojito_weth_qlp address was set correctly
    address = await adapter.MLP();
    expect(mlp.address.toLowerCase()).to.be.eql(address.toLowerCase(), "adapter contract base asset address does not match address that was set");
  });
  
  it("should have autocompounder set_mojito_chef work correctly", async ()=> {
    // verify that only the governance of contract can set base asset
    await expect(autocompounder.connect(alex).set_mojito_chef(mlp.address)).to.be.revertedWith("must be governance");

    // set autocompounder mojito chef address to MJT temporarily
    await expect(autocompounder.connect(deployer).set_mojito_chef(MJT)).to.not.be.reverted;
 
    // verify mojito chef address was set correctly
    let address = await autocompounder.mojito_chef();
    expect(address.toLowerCase()).to.be.eql(MJT.toLowerCase(), "adapter contract mojito chef address does not match address that was set");
    
    // set autocompounder mojito chef address back to mojito chef
    await expect(autocompounder.connect(deployer).set_mojito_chef(MOJITOCHEF)).to.not.be.reverted;
    
    // verify mojito chef address was set correctly
    address = await autocompounder.mojito_chef();
    expect(address.toLowerCase()).to.be.eql(MOJITOCHEF.toLowerCase(), "adapter contract mojito chef address does not match address that was set");
  });  
  
  it("should have adapter propose_governance work correctly", async ()=> {
    // propose governance incorrectly
    await expect(adapter.connect(alex).propose_governance(deployer.address)).to.be.revertedWith("must be governance");

    // propose governance correctly
    await expect(adapter.connect(deployer).propose_governance(deployer.address)).to.not.be.reverted;

    // verify new_governance was set correctly
    let new_governance = await adapter.new_governance();
    expect(deployer.address).to.be.eql(new_governance, "adapter contract new_governance does not match address that was set");
  });
  
  it("should have adapter accept_governance work correctly", async ()=> {
    // accept governance incorrectly
    await expect(adapter.connect(alex).accept_governance()).to.be.revertedWith("must be new governance");

    // accept governance correctly
    await expect(adapter.connect(deployer).accept_governance()).to.not.be.reverted;

    // verify values were set correctly
    let governance = await adapter.governance();
    let new_governance = await adapter.new_governance();
    expect(deployer.address).to.be.eql(governance, "adapter contract governance does not match address that was set");
    expect(zeroAddress).to.be.eql(new_governance, "adapter contract new_governance should be zeroAddress");
  });
  
  it("should have autocompounder propose_governance work correctly", async ()=> {
    // propose governance incorrectly
    await expect(autocompounder.connect(alex).propose_governance(deployer.address)).to.be.revertedWith("must be governance");

    // propose governance correctly
    await expect(autocompounder.connect(deployer).propose_governance(deployer.address)).to.not.be.reverted;

    // verify new_governance was set correctly
    let new_governance = await autocompounder.new_governance();
    expect(deployer.address).to.be.eql(new_governance, "adapter contract new_governance does not match address that was set");
  });
  
  it("should have autocompounder accept_governance work correctly", async ()=> {
    // accept governance incorrectly
    await expect(autocompounder.connect(alex).accept_governance()).to.be.revertedWith("must be new governance");

    // accept governance correctly
    await expect(autocompounder.connect(deployer).accept_governance()).to.not.be.reverted;

    // verify values were set correctly
    let governance = await autocompounder.governance();
    let new_governance = await autocompounder.new_governance();
    expect(deployer.address).to.be.eql(governance, "adapter contract governance does not match address that was set");
    expect(zeroAddress).to.be.eql(new_governance, "adapter contract new_governance should be zeroAddress");
  });
  
  it("should have autocompounder set_autocompound_enabled work correctly", async ()=> {
    // try to set autocompound_enabled
    await expect(autocompounder.connect(alex).set_autocompound_enabled(true)).to.be.revertedWith("must be governance");

    // set autocompound_enabled
    await expect(autocompounder.connect(deployer).set_autocompound_enabled(false)).to.not.be.reverted;

    // verify values were set correctly
    let autocompound_enabled = await autocompounder.autocompound_enabled();
    expect(autocompound_enabled).to.be.eql(false, "adapter contract autocompound_enabled does not match false");

    // set autocompound_enabled
    await expect(autocompounder.connect(deployer).set_autocompound_enabled(true)).to.not.be.reverted;

    // verify values were set correctly
    autocompound_enabled = await autocompounder.autocompound_enabled();
    expect(autocompound_enabled).to.be.eql(true, "adapter contract autocompound_enabled does not match true");

  });

  it("should have adapter sweep_erc work correctly", async ()=> {
    
    // get mlp balances before sweep
    let adapter_mlp_before = await mlp.balanceOf(adapter.address);
    let alex_mlp_before = await mlp.balanceOf(alex.address);

    // verify that only the governance of contract can do sweep_erc
    await expect(adapter.connect(alex).sweep_erc(mlp.address,alex.address)).to.be.revertedWith("must be governance");
    
    // verify that only the governance of contract can do sweep_erc
    await expect(adapter.connect(deployer).sweep_erc(mlp.address,alex.address)).to.not.be.reverted;

    // get mlp balances after sweep
    let adapter_mlp_after = await mlp.balanceOf(adapter.address);
    let alex_mlp_after = await mlp.balanceOf(alex.address);
    
    // check that recipient got the balance
    expect(alex_mlp_after.sub(alex_mlp_before)).to.be.eql(adapter_mlp_before, "recipient balance after should equal contract balance before");
    
    // check that the contract balance is 0 mlp 
    expect(adapter_mlp_after).to.be.eql(BN.from(0), "contract balance after should be 0 mlp");

  });
  
  it("should have autocompounder sweep_erc work correctly", async ()=> {
    
    // get mlp balances before sweep
    let autocompounder_mlp_before = await mlp.balanceOf(autocompounder.address);
    let alex_mlp_before = await mlp.balanceOf(alex.address);

    // verify that only the governance of contract can do sweep_erc
    await expect(autocompounder.connect(alex).sweep_erc(mlp.address,alex.address)).to.be.revertedWith("must be governance");
    
    // verify that only the governance of contract can do sweep_erc
    await expect(autocompounder.connect(deployer).sweep_erc(mlp.address,alex.address)).to.not.be.reverted;

    // get mlp balances after sweep
    let autocompounder_mlp_after = await mlp.balanceOf(autocompounder.address);
    let alex_mlp_after = await mlp.balanceOf(alex.address);
    
    // check that recipient got the balance
    expect(alex_mlp_after.sub(alex_mlp_before)).to.be.eql(autocompounder_mlp_before, "recipient balance after should equal contract balance before");
    
    // check that the contract balance is 0 mlp 
    expect(autocompounder_mlp_after).to.be.eql(BN.from(0), "contract balance after should be 0 mlp");

  });
  
  it("should have autocompounder emergency_withdraw work correctly", async ()=> {
    
    // get mlp balances before emergency_withdraw
    let mojito_mlp_before = await mojitoswap.userInfo(MJT_WKCS_pid, autocompounder.address);
    let autocompounder_mlp_before = await mlp.balanceOf(autocompounder.address);

    // verify that only the governance of contract can do emergency_withdraw
    await expect(autocompounder.connect(alex).emergency_withdraw(MJT_WKCS_pid,mojito_mlp_before)).to.be.revertedWith("must be governance");
    
    console.log("mojito_mlp_before: ",mojito_mlp_before.toString());
    console.log("autocompounder_mlp_before: ",autocompounder_mlp_before.toString());
    
//    await autocompounder.connect(deployer).emergency_withdraw(MJT_WKCS_pid,mojito_mlp_before);
    
    // verify that only the governance of contract can do sweep_erc
    await expect(autocompounder.connect(deployer).emergency_withdraw(MJT_WKCS_pid,mojito_mlp_before)).to.not.be.reverted;

    // get mlp balances after sweep
    let mojito_mlp_after = await await mojitoswap.userInfo(MJT_WKCS_pid, autocompounder.address);
    let autocompounder_mlp_after = await mlp.balanceOf(autocompounder.address);
    
    // check that recipient got the balance
    expect(autocompounder_mlp_after.sub(autocompounder_mlp_before)).to.be.eql(mojito_mlp_before, "recipient balance after should equal contract balance before");
    
    // check that the contract balance is 0 mlp 
    expect(mojito_mlp_after).to.be.eql(BN.from(0), "contract balance after should be 0 mlp");

  });

  it("should have SaffronPoolV2 deposit work correctly", async ()=> {
    
    let betaCap = toWei(5000);
    const depositAmount = toWei(35);
    // should not be able to deposit if deposit is disabled
    await saffronPoolV2.connect(deployer).disable_deposits(true);
    await expect(saffronPoolV2.connect(deployer).deposit(depositAmount)).to.be.revertedWith("deposits disabled");
    await saffronPoolV2.connect(deployer).disable_deposits(false);
 
    // should not be able to deposit 0 to tranche
    await expect(saffronPoolV2.connect(deployer).deposit(toWei(0))).to.be.revertedWith("can't add 0");

    // should not be able to deposit if pool is shut down
    await (saffronPoolV2.connect(deployer).shut_down_pool(true));
    //await expect(saffronPoolV2.connect(deployer).shut_down_pool(true)).to.not.be.reverted;
    await expect(saffronPoolV2.connect(deployer).deposit(depositAmount)).to.be.revertedWith("pool shut down");

    // toggle shut down to off
    await (saffronPoolV2.connect(deployer).shut_down_pool(false));
    //await expect(saffronPoolV2.connect(deployer).shut_down_pool(false)).to.not.be.reverted;

    // initialize tests
    await mlp.connect(deployer).approve(saffronPoolV2.address, BN.from('20000000000000000000'));
    
    // check initialize worked
    await saffronPoolV2.connect(deployer).shut_down_pool(false);
    await saffronPoolV2.connect(deployer).disable_deposits(false);
    await saffronPoolV2.connect(deployer).deposit(toWei('10'));
    let deposits_disabled = await saffronPoolV2.deposits_disabled();
    expect(deposits_disabled).to.be.eql(false,"deposits_disabled should be false after initialize");
    let shut_down = await saffronPoolV2.shut_down();
    expect(shut_down).to.be.eql(false,"shut_down should be false after initialize");

    // verify initialize Token balance
    let balanceTotal = await saffronPositionToken.balanceOf(deployer.address);
    console.log("\nbalanceTotal: ",balanceTotal.toString());
    expect(balanceTotal).to.be.eql(BN.from("10000000000000000000"), "should have 10000000000000000000");

    // approve mlp from deployer, and deposit to SENIOR_TRANCHE
    await mlp.connect(deployer).approve(saffronPoolV2.address, depositAmount);
    //await expect(saffronPoolV2.connect(deployer).deposit(depositAmount, SENIOR_TRANCHE)).to.not.be.reverted;
    await saffronPoolV2.connect(deployer).deposit(depositAmount);
    //await saffronPoolV2.connect(deployer).deposit(depositAmount, SENIOR_TRANCHE).catch((e) => {console.log(e.message);});

    // get senior exchange rate
    senior_exchange_rate = (await saffronPoolV2.senior_exchange_rate());
    
    // verify that LiquidityAdded event is emitted with the correct values
    // approve mlp from deployer, and deposit to SENIOR_TRANCHE
    await mlp.connect(deployer).approve(saffronPoolV2.address, depositAmount);
    await saffronPoolV2.connect(deployer).deposit(depositAmount);

    // verify deployers NFT count
    balanceTotal = await saffronPositionToken.balanceOf(deployer.address);
    console.log("\nbalanceTotal: ",balanceTotal.toString());
    expect(balanceTotal).to.be.eql(BN.from("80000000000000000000"), "should have 80000000000000000000");

    // test adapter
    mockAdapter = await deployContract(deployer, "MockAdapter");
    await saffronPoolV2.connect(deployer).set_adapter(mockAdapter.address);
    await expect(saffronPoolV2.connect(alex).update_exchange_rate()).to.not.be.reverted;
    await saffronPoolV2.connect(deployer).set_adapter(adapter.address);
    await expect(saffronPoolV2.connect(alex).update_exchange_rate()).to.not.be.reverted;

    await expect(mockAdapter.connect(deployer).set_pool(zeroAddress)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_pool(zeroAddress)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_pool(zeroAddress)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).deploy_capital(toWei(1))).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).return_capital(toWei(1),deployer.address)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_holdings(toWei(1))).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_underlying_exchange_rate(toWei(1))).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_interest(toWei(1))).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).set_lp(zeroAddress)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).propose_governance(zeroAddress)).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).get_holdings_view()).to.not.be.reverted;
    await expect(mockAdapter.connect(deployer).accept_governance()).to.not.be.reverted;
    await expect(adapter.connect(deployer).get_holdings_view()).to.not.be.reverted;
    await mlp.connect(deployer).approve(saffronPoolV2.address, 1);
    await expect(saffronPoolV2.connect(deployer).deposit(1)).to.not.be.reverted;
  });
  
  it("should have autocompounder SFI swap all of tokensRewards for tokenA", async ()=> {
    
    // initialize tests
    await mlp.connect(deployer).approve(saffronPoolV2.address, BN.from('20000000000000000000'));
    const betaCap = toWei(50);
    const depositAmount = toWei(10);
    
    // initialize can be called by governance
    // approve mlp from deployer, and deposit to SENIOR_TRANCHE
    let deployerBalance = await mlp.balanceOf(deployer.address);
/*    console.log("deployerBalance:",fromWei(deployerBalance.toString));
    console.log("depositAmount:  ",fromWei(depositAmount.toString));
*/    
    await mlp.connect(deployer).approve(saffronPoolV2.address, depositAmount);
    // toggle disable_deposits on
    await saffronPoolV2.connect(deployer).disable_deposits(false);
    await saffronPoolV2.connect(deployer).shut_down_pool(false);
    // deposit mlp into pool
    
    console.log("depositAmount: ",depositAmount.toString());
    await saffronPoolV2.connect(deployer).deposit(depositAmount);

    // 
    let lp_balance = await saffronPositionToken.balanceOf(deployer.address);
    console.log("withdrawing lp_amount: ",lp_balance.toString());
    await saffronPoolV2.connect(deployer).withdraw(lp_balance);
    //await expect(saffronPoolV2.connect(deployer).withdraw(token_id_senior)).to.not.be.reverted;
    //await saffronPoolV2.connect(deployer).withdraw(token_id_senior);
    console.log("step 9");
    let pool_holdings = await mlp.balanceOf(saffronPoolV2.address);
    
  });
  
  it("should have SaffronPoolV2 withdraw work correctly", async ()=> {
    // shutdown pool
    await saffronPoolV2.connect(deployer).shut_down_pool(true);

    // verify that withdraw won't work with pool shutdown, token_id is 1
    await expect(saffronPoolV2.connect(deployer).withdraw(1)).to.be.revertedWith("removal paused");
    
    // toggle shut down to off
    await saffronPoolV2.connect(deployer).shut_down_pool(false);

  });
  
  it("should have SaffronPoolV2 set_exchange_rate work correctly", async ()=> {
    // verify only governance can set_exchange_rate
    await expect(saffronPoolV2.connect(alex).set_exchange_rate(SENIOR_TRANCHE, toWei(100))).to.be.revertedWith("must be governance");

    // turn pool on to make sure rates can't be changed while pool is running
    saffronPoolV2.connect(deployer).shut_down_pool(false);
    await expect(saffronPoolV2.connect(deployer).set_exchange_rate(SENIOR_TRANCHE, toWei(100))).to.be.revertedWith("pool must be shut down");

    // shutdown pool to make sure rates can be changed while pool is stopped
    saffronPoolV2.connect(deployer).shut_down_pool(true);
    
    let exchange_rate = toWei(100);
    
    // store initial senior exchange rate
    let senior_exchange_rate_before = await saffronPoolV2.senior_exchange_rate();
    // verify new exchange rate isn't 100
    expect(senior_exchange_rate_before).to.not.be.eql(exchange_rate,"senior_exchange_rate_before should not equal 100");
    // set new exchange rate to 100
    await expect(saffronPoolV2.connect(deployer).set_exchange_rate(SENIOR_TRANCHE, exchange_rate)).to.not.be.reverted;
    // get new exchange rate
    let senior_exchange_rate_after = await saffronPoolV2.senior_exchange_rate();
    // verify new exchange rate is 100
    expect(senior_exchange_rate_after).to.be.eql(exchange_rate,"senior_exchange_rate_after should equal 100");
    // set new exchange rate back to original setting
    await expect(saffronPoolV2.connect(deployer).set_exchange_rate(SENIOR_TRANCHE, senior_exchange_rate_before)).to.not.be.reverted;
    // set new exchange rate to original rate
    senior_exchange_rate_after = await saffronPoolV2.senior_exchange_rate();
    // verify is set to original
    expect(senior_exchange_rate_after).to.be.eql(senior_exchange_rate_before,"senior_exchange_rate_after should equal senior_exchange_rate_before");
    
    // store initial fee exchange rate
    let fees_holdings_before = await saffronPoolV2.fees_holdings();
    // verify new exchange rate isn't 100
    expect(fees_holdings_before).to.not.be.eql(exchange_rate,"fees_holdings_before should not equal 100");
    // set new exchange rate to 100
    await expect(saffronPoolV2.connect(deployer).set_exchange_rate(2, exchange_rate)).to.not.be.reverted;
    // get new exchange rate
    let fees_holdings_after = await saffronPoolV2.fees_holdings();
    // verify new exchange rate is 100
    expect(fees_holdings_after).to.be.eql(exchange_rate,"fees_holdings_after should equal 100");
    // set new exchange rate back to original setting
    await expect(saffronPoolV2.connect(deployer).set_exchange_rate(2, fees_holdings_before)).to.not.be.reverted;
    // set new exchange rate to original rate
    fees_holdings_after = await saffronPoolV2.fees_holdings();
    // verify is set to original
    expect(fees_holdings_after).to.be.eql(fees_holdings_before,"fees_holdings_after should equal fees_holdings_before");

    // turn pool back on
    saffronPoolV2.connect(deployer).shut_down_pool(false);
  });

  it("should have SaffronPoolV2 withdraw_fees work correctly", async ()=> {
    // verify only governance can withdraw fees
    await expect(saffronPoolV2.connect(alex).withdraw_fees(deployer.address)).to.be.revertedWith("withdraw unauthorized");

    //  verify can't withdraw fees to zero address
    await expect(saffronPoolV2.connect(deployer).withdraw_fees(zeroAddress)).to.be.revertedWith("can't withdraw to 0 address");
    
    // get fee_exchange_rate
    await saffronPoolV2.update_exchange_rate(); 
    let fees_holdings = await saffronPoolV2.fees_holdings(); 
    let fees = fees_holdings;
    console.log("fees_holdings: ",fees_holdings.toString());
    console.log("fees: ",fromWei(fees));
    
    // get deployer mlp balance before
    let deployer_before = await mlp.balanceOf(deployer.address);
    console.log("deployer_before: ",fromWei(deployer_before));
    
    // verify withdraw does not revert with governance
    await saffronPoolV2.connect(deployer).withdraw_fees(deployer.address);
    
    // get deployer mlp balance after
    let deployer_after = await mlp.balanceOf(deployer.address);
    console.log("deployer_after: ",fromWei(deployer_after));
    
    // verify fees were returned
    expect(deployer_after.sub(deployer_before)).to.be.gte(fees,"withdraw fees returned incorrect mlp amount");
    
    // verify fee exchange rate set to zero after return
    fees_holdings = await saffronPoolV2.fees_holdings(); 
    expect(fees_holdings.isZero(),"fee exchange rate should be zero after withdraw fees");
  });
  
  it("should have SaffronPoolV2 shut_down_pool work correctly", async ()=> {
    // toggle shut_down_pool as not governance 
    await expect(saffronPoolV2.connect(alex).shut_down_pool(deployer)).to.be.revertedWith("must be governance");

    // toggle shut down to off
    await expect(saffronPoolV2.connect(deployer).shut_down_pool(false)).to.not.be.reverted;
    let is_shut_down = await saffronPoolV2.connect(deployer).shut_down();
    expect(is_shut_down).to.be.eql(false);

    // toggle shut down to on
    await expect(saffronPoolV2.connect(deployer).shut_down_pool(true)).to.not.be.reverted;
    is_shut_down = await saffronPoolV2.connect(deployer).shut_down();
    expect(is_shut_down).to.be.eql(true);
  });
  
  it("should have SaffronPoolV2 disable_deposits work correctly", async ()=> {
    // toggle disable_deposits as not governance 
    await expect(saffronPoolV2.connect(alex).disable_deposits(false)).to.be.revertedWith("must be governance");

    // toggle disable_deposits to off
    await expect(saffronPoolV2.connect(deployer).disable_deposits(false)).to.not.be.reverted;
    let disabled = await saffronPoolV2.connect(deployer).deposits_disabled();
    expect(disabled).to.be.eql(false);

    // toggle disable_deposits on
    await expect(saffronPoolV2.connect(deployer).disable_deposits(true)).to.not.be.reverted;
    disabled = await saffronPoolV2.connect(deployer).deposits_disabled();
    expect(disabled).to.be.eql(true);
  });
  
  it("should have SaffronPoolV2 propose_governance work correctly", async ()=> {
    // propose governance incorrectly
    await expect(saffronPoolV2.connect(alex).propose_governance(deployer.address)).to.be.revertedWith("must be governance");

    // propose governance correctly
    await expect(saffronPoolV2.connect(deployer).propose_governance(deployer.address)).to.not.be.reverted;
  });
  
  it("should have SaffronPoolV2 accept_governance work correctly", async ()=> {
    // accept governance incorrectly
    await expect(saffronPoolV2.connect(alex).accept_governance()).to.be.revertedWith("must be new governance");

    // accept governance correctly
    await expect(saffronPoolV2.connect(deployer).accept_governance()).to.not.be.reverted;
  });
  
  it("should have SaffronPoolV2 set_adapter work correctly", async ()=> {
    // set adapter incorrectly
    await expect(saffronPoolV2.connect(alex).set_adapter(deployer.address)).to.be.revertedWith("must be governance");

    // set adapter correctly
    await expect(saffronPoolV2.connect(deployer).set_adapter(adapter.address)).to.not.be.reverted;
  });
  
  it("should have SaffronPositionToken mint work correctly", async ()=> {
    // mint incorrectly
    await expect(saffronPositionToken.connect(deployer).mint(deployer.address, 100)).to.be.revertedWith("only pool can mint");
  });
  
  it("should have SaffronPositionToken burn work correctly", async ()=> {
    // burn incorrectly
    await expect(saffronPositionToken.connect(deployer).burn(deployer.address, 100)).to.be.revertedWith("only pool can burn");
  });

  it("should give us info on the state of the contract", async ()=> {

    await autocompounder.autocompound();
    /*
    console.log(`\n  advancing 200 blocks`);
    for (let i = 1; i <= 100; i++) {
      await hre.network.provider.send("evm_mine");
      await saffronPoolV2.update_exchange_rate();
    }
    */
     //await saffronPoolV2.connect(deployer).withdraw(1);
     //await saffronPoolV2.connect(deployer).withdraw(2);
    await saffronPoolV2.connect(deployer).withdraw_fees(fees.address);
    await autocompounder.autocompound();
    /*
    console.log(`  --- CONTRACT STATE AFTER INITIAL TESTS --- `);
    console.log(`  >>> senior_token_balance   : ${(await saffronPoolV2.senior_token_supply()).mul((await saffronPoolV2.senior_exchange_rate())).div('10000000000000000000000000000')}`);
    console.log(`  >>> fees_token_balance     : ${(await saffronPoolV2.FEES_TOKEN_SUPPLY()).mul((await saffronPoolV2.fees_holdings())).div('10000000000000000000000000000')}`);
*/    
    balanceOfAutocompounder = await autocompounder.get_mojito_chef_holdings();
    // console.log(`  >>> autocompounder balance (LP tokens): \x1b[32m${fromWei(balanceOfAutocompounder).padStart(24)}\x1b[0m mlp`);        

    // mine a block and get balance again
    await network.provider.send('evm_mine',[]);
    balanceOfAutocompounder = await autocompounder.get_mojito_chef_holdings();
    balanceOfPool = await mlp.balanceOf(saffronPoolV2.address);
    console.log(`  >>> autocompounder get_mojito_chef_holdings()         : \x1b[32m${fromWei(balanceOfAutocompounder).padStart(24)}\x1b[0m mlp`);        
    console.log(`  >>> pool balanceOf(pool.address)                   : \x1b[32m${fromWei(balanceOfPool).padStart(24)}\x1b[0m mlp`);        
  });
  
  describe("📜 test everything again", function() {

    async function get_pool_state() {
      let print_pool, print_autocompounder, print_adapter;
      lpName="MJT/WKCS LP";
      print_pool = saffronPoolV2;
      print_autocompounder = autocompounder;
      print_adapter = adapter;

      console.log("`````````````````````PRINTING " + lpName + " POOL STATE``````````````````");
      let position_token_address = await print_pool.position_token();
      let nft_address = await print_pool.NFT();
      let print_position_token = await hre.ethers.getContractAt("SaffronPositionToken", position_token_address);
      let print_nft = await hre.ethers.getContractAt("SaffronPositionNFT", nft_address);

      let balanceOfAutocompounder0 = await print_autocompounder.get_mojito_chef_holdings();
      console.log(`  --- POOL STATE --- `);
      console.log(`  >>> calculated holdings    : ${(await print_pool.get_yield_receiver_supply())}`);
      console.log(`  >>> senior_token_balance   : ${(await print_pool.senior_token_supply()).mul((await print_pool.senior_exchange_rate())).div('10000000000000000000000000000')}`);
      console.log(`  >>> fees_holdings          : ${(await print_pool.fees_holdings())}`);
      console.log(`  --- AUTOCOMPOUNDER STATE --- `);
      console.log(`  >>> autocompounder balance (LP tokens) : \x1b[32m${fromWei(balanceOfAutocompounder0).padStart(24)}\x1b[0m ${lpName}\n`);        
      console.log(`  >>> balance of WKCS        : ${(await wkcs.balanceOf(print_autocompounder.address))}\n`);
      console.log(`  >>> balance of MJT        : ${(await mjt.balanceOf(print_autocompounder.address))}\n`);
      console.log(`  --- NFT STATE --- `);
      console.log(`  >>> NFT  totalsupply: ${(await print_nft.totalSupply())}`);
      await print_user_tokens("deployer", deployer, saffronPoolV2);
      for (let user of users) await print_user_tokens(user, global[user], saffronPoolV2); 
      console.log("`````````````````````````````````````````````````````````````````````````");
    }

    async function print_user_tokens(user, guser, saffronPoolV2) {
      let userTokenCount = await saffronPositionNFT.connect(guser).balanceOf(guser.address);
      if (userTokenCount > 0) console.log(`  >>> ${user} NFTs...`);
      for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
        let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(guser.address, tokenIndex);
        console.log(`  >>> ${user} NFT tokenId ${tokenId} tranche ${(await saffronPositionNFT.tranche(tokenId))}`);
        console.log(`      balance (lp)  : ${(await saffronPositionNFT.balance(tokenId))}`);
        console.log(`      principal     : ${(await saffronPositionNFT.principal(tokenId))}`);
        console.log(`      expiration    : ${(await saffronPositionNFT.expiration(tokenId))}`);
      }

      console.log(`  >>> ${user} ERC20 position_token balance:`);
      console.log(`      balance (lp)    : ${(await saffronPositionToken.balanceOf(guser.address))}`);
      console.log(`      balance (base)  : ${(await saffronPositionToken.balanceOf(guser.address)).mul((await saffronPoolV2.senior_exchange_rate()).div('10000000000000000000000000000'))}`);
    }

    it("tries to cause an error by setting pool to 0 lp then depositing", async () => {
      // toggle disable_deposits on
      await saffronPoolV2.connect(deployer).disable_deposits(false);
      await saffronPoolV2.connect(deployer).shut_down_pool(false);

      // ensure pool is at 0 lp
      let pool_lp_total = await saffronPoolV2.connect(deployer).senior_token_supply();
      expect(pool_lp_total).to.be.eql(BN.from(0),"should be no senior LP tokens in pool");

      //withdraw system nfts
      await saffronPoolV2.update_exchange_rate();
      print_user_tokens("deployer", deployer, saffronPoolV2);

      // try depositing large amount
      let balance = await mlp.balanceOf(deployer.address);
      console.log(`deployer balance: ${balance}`);
      await mlp.connect(deployer).approve(saffronPoolV2.address, balance);
      await saffronPoolV2.connect(deployer).deposit(balance);
      let lp_balance = await saffronPositionToken.balanceOf(deployer.address);
      console.log(`deposited ${fromWei(balance)} to senior tranche for ${lp_balance} SAFF-LP tokens`);

      //get mojitoswap contract
      mojitoswap =  await hre.ethers.getContractAt("IMojitoChef",MOJITOCHEF);
      console.log("mojitoswap contract address: ",mojitoswap.address);
      
      await increaseTime(704800);
      await increaseBlock(BN.from(10));
      await saffronPoolV2.update_exchange_rate();
      await autocompounder.autocompound();

      // get mojitoswap balance
      let mjtBalance=await mojitoswap.userInfo(MJT_WKCS_pid, autocompounder.address);
      console.log("pool mjtBalance: ",fromWei(mjtBalance));

      // ensure pool mjtBalance in Mojito is more than calculated amount from yield receivers
      let senior_calc_amount = (await saffronPoolV2.senior_exchange_rate()).mul((await saffronPoolV2.senior_token_supply())).div('10000000000000000000000000000');
      let fees_calc_amount   = await saffronPoolV2.fees_holdings();
      let total_calc_amount  = senior_calc_amount.add(fees_calc_amount);
      let yield_receiver_supply = await saffronPoolV2.get_yield_receiver_supply();
      console.log(`total_calc_amount    : ${total_calc_amount}`);
      console.log(`yield_receiver_supply: ${yield_receiver_supply}`);
      expect(total_calc_amount).to.be.lte(mjtBalance,"total calc amount should be less than or equal to pool's mjtBalance from Mojito userInfo getter");
      expect(yield_receiver_supply).to.be.lte(mjtBalance,"yield_receiver_supply should be less than or equal to pool's mjtBalance from Mojito userInfo getter");

      // begin withdraw all
      await saffronPoolV2.connect(deployer).withdraw(lp_balance);
      
      //check mlp balance in contract
      let get_yield_receiver_supply=await saffronPoolV2.get_yield_receiver_supply();
      console.log("get_yield_receiver_supply: ",fromWei(get_yield_receiver_supply));
      
      let senior_exchange_rate=await saffronPoolV2.senior_exchange_rate();
      console.log("senior_exchange_rate: ",fromWei(senior_exchange_rate));
      
      await get_pool_state();
      console.log("withdrawing fees to deployer");
      await saffronPoolV2.connect(deployer).withdraw_fees(deployer.address);
      
      
      //check mlp balance in contract again
      balance = await mlp.balanceOf(saffronPoolV2.address);
      console.log("saffronPoolV2: ",fromWei(balance));
      await saffronPoolV2.connect(deployer).update_exchange_rate();
    });
    
  });

  describe("📜 test the insurance fund contract", function() {

    it("deploys the insurance fund contract and hooks it up to the pool", async () => {
      contractFactory = await hre.ethers.getContractFactory("SaffronInsuranceFund");

      // Expect revert on deploying with zero address in either argument
      await expect(contractFactory.connect(deployer).deploy(zeroAddress, zeroAddress)).to.be.revertedWith("can't construct with 0 address");
      await expect(contractFactory.connect(deployer).deploy(deployer.address, zeroAddress)).to.be.revertedWith("can't construct with 0 address");
      await expect(contractFactory.connect(deployer).deploy(zeroAddress, deployer.address)).to.be.revertedWith("can't construct with 0 address");

      // Deploy successfully
      fund = await expect(contractFactory.connect(deployer).deploy(USDC, mlp.address)).to.not.be.reverted;
      await fund.deployed();
      expect(fund.address).to.be.properAddress;

      // Hook up to pool
      saffronPositionNFT = await hre.ethers.getContractAt("SaffronPositionNFT",(await saffronPoolV2.NFT()));
      
      await expect(saffronPoolV2.connect(alex).set_fee_manager(fund.address)).to.be.revertedWith("must be governance");
      
      await saffronPoolV2.connect(deployer).set_fee_manager(fund.address);
      
      // sweep must be governance
      await expect(fund.connect(alex).sweep_erc(usdc.address,deployer.address)).to.be.revertedWith("must be governance");
      await expect(fund.connect(deployer).sweep_erc(usdc.address,deployer.address)).to.not.be.reverted;
      
      await fund.connect(deployer).set_pool(saffronPoolV2.address);

      // Initialize MJT_WKCS_LP
      let routers =     [MOJITO_ROUTER,         MOJITO_ROUTER,       MOJITO_ROUTER      ];
      let tokens_from = [MJT,                   MJT,                 WKCS               ];
      let tokens_to =   [WKCS,                  USDC,                USDC               ];
      let percentages = [BN.from(100),          BN.from(100),        BN.from(100)       ];
      let operations =  [REMOVE_LIQUIDITY_FLAG, SWAP_LIQUIDITY_FLAG, SWAP_LIQUIDITY_FLAG];
      
      await expect(fund.connect(alex).init_conversions(routers, tokens_from, tokens_to, percentages, operations)).to.be.revertedWith("must be governance");
      await expect(fund.connect(deployer).init_conversions([], tokens_from, tokens_to, percentages, operations)).to.be.revertedWith("invalid conversions");
      await expect(fund.connect(deployer).init_conversions(routers, [], tokens_to, percentages, operations)).to.be.revertedWith("invalid conversions");
      await expect(fund.connect(deployer).init_conversions(routers, tokens_from, [], percentages, operations)).to.be.revertedWith("invalid conversions");
      await expect(fund.connect(deployer).init_conversions(routers, tokens_from, tokens_to, [], operations)).to.be.revertedWith("invalid conversions");
      await expect(fund.connect(deployer).init_conversions(routers, tokens_from, tokens_to, [BN.from(101), BN.from(100), BN.from(100)], operations)).to.be.revertedWith("bad percentage");
      await expect(fund.connect(deployer).init_conversions(routers, tokens_from, tokens_to, [BN.from(100), BN.from(101), BN.from(100)], operations)).to.be.revertedWith("bad percentage");
      await expect(fund.connect(deployer).init_conversions(routers, tokens_from, tokens_to, [BN.from(100), BN.from(100), BN.from(101)], operations)).to.be.revertedWith("bad percentage");
      await fund.connect(deployer).init_conversions(routers, tokens_from, tokens_to, percentages, operations);
    
      await expect(fund.connect(alex).deposit(BN.from(0))).to.be.revertedWith("can't deposit 0");
    });

    it("deposits to the insurance fund contract", async () => {
      // Set approvals
      await usdc.connect(deployer).approve(fund.address, BN.from("0"));
      await usdc.connect(deployer).approve(fund.address, BN.from("2000000000000000000000000"));

      for(let user of users) {
        await usdc.connect(global[user]).approve(fund.address, BN.from("0"));
        await usdc.connect(global[user]).approve(fund.address, BN.from("2000000000000000000000000"));
      }

      // Deposit
      //await get_pool_state();
      const amount = toWei("100000",18);
      
      // Check deposit with pool shut down
      await saffronPoolV2.connect(deployer).shut_down_pool(true);
      await expect(fund.connect(alex).deposit(amount)).to.be.revertedWith("pool shut down");
      await saffronPoolV2.connect(deployer).shut_down_pool(false);
      
      // Check deposit with pool deposits disabled
      await saffronPoolV2.connect(deployer).disable_deposits(true);
      await expect(fund.connect(alex).deposit(amount)).to.be.revertedWith("deposits disabled");
      await saffronPoolV2.connect(deployer).disable_deposits(false);
      
      // Make two deposits for some mystical reason
      await usdc.connect(deployer).transfer(alex.address, amount);
      await usdc.connect(deployer).transfer(beth.address, amount);
      console.log("alex depositing");
      await fund.connect(alex).deposit(amount);
      console.log("beth depositing");
      await fund.connect(beth).deposit(amount);

      // Verify total principal matches what is in fund
      let usdc_func_balance=await usdc.balanceOf(fund.address);
      let total_principal=await fund.total_principal();
      expect(total_principal).to.be.eql(usdc_func_balance,"fund total_principal should equal usdc balanceOf fund.address");
    });

    it("earns some interest on the pool and checks the state of the pool then begins to unfreeze NFTs", async () => {
      console.log(`deployer mlp balance1: ${(await mlp.balanceOf(deployer.address))}`);
      let depositAmount = BN.from('20000000');
      // Make 2 deposits in the senior tranche
      await mlp.connect(carl).approve(saffronPoolV2.address, BN.from('0'));
      await mlp.connect(carl).approve(saffronPoolV2.address, depositAmount);
      await saffronPoolV2.connect(carl).deposit(depositAmount);
      // Advance blocks by 100
      await increaseBlock(BN.from(100));
      
      // Deposit some in insurance pool
      await usdc.connect(deployer).transfer(carl.address, BN.from('1000000'));
      await usdc.connect(carl).approve(fund.address, BN.from('500000'));
      await fund.connect(carl).deposit(BN.from('500000'));
      //await get_pool_state();
      // Advance blocks by 100
      await increaseBlock(BN.from(100));
      
      // Deposit some more in insurance pool
      await usdc.connect(carl).approve(fund.address, BN.from('500000'));
      await fund.connect(carl).deposit(BN.from('500000'));

      // Advance blocks by 200
      await increaseBlock(BN.from(200));
      await increaseTime(704800);
      await increaseBlock(BN.from(10));
      await saffronPoolV2.update_exchange_rate();
      await autocompounder.autocompound();

      // Have fund withdraw fees from pool and convert them to insurance assets
      await fund.update();

      for (let user of users) {
        let userTokenCount = await saffronPositionNFT.connect(global[user]).balanceOf(global[user].address);
        for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
          let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
          if ((await saffronPositionNFT.tranche(tokenId)).eq(INSURANCE_TRANCHE)) {
            console.log(`unfreezing ${user}'s insurance token: ${tokenId}`);
            await saffronPoolV2.connect(global[user]).begin_unfreeze_NFT(tokenId);
          }
        }
      }
    });
    
    it("tests emergency_withdraw", async () => {
      let userTokenCount = await saffronPositionNFT.connect(alex).balanceOf(alex.address);
      let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(alex.address, 0);
      console.log(`emergency_withdraw() alex's insurnace token as beth with token_id: ${tokenId}`);
      await expect(fund.connect(beth).emergency_withdraw(tokenId)).to.be.revertedWith("must be owner");
    });

    it("withdraws nfts intermittently", async () => {
      // Advance time and blocks
      await increaseTime(7777777); 
      await increaseBlock(BN.from(100)); 
      
      console.log("Withdrawing all user NFTs");
      // Withdraw
      for (let user of users) {
        let userTokenCount = await saffronPositionNFT.connect(global[user]).balanceOf(global[user].address);
        for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
          let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
          if ((await saffronPositionNFT.tranche(tokenId)).eq(INSURANCE_TRANCHE)) {
            console.log(`withdrawing ${user}'s insurnace token: ${tokenId}`);
            
            await expect(saffronPositionNFT.connect(deployer).tokenURI(tokenId)).to.not.be.reverted;
            
             // check withdraw with pool shut down
            await saffronPoolV2.connect(deployer).shut_down_pool(true);
            await expect(fund.connect(global[user]).withdraw(tokenId)).to.be.revertedWith("pool shut down");
            await saffronPoolV2.connect(deployer).shut_down_pool(false);
           
            // Do withdraw
            await expect(fund.connect(global[user]).withdraw(tokenId)).to.not.be.reverted;

          } else {
            // Check withdraw with tranche other than insurance
            await expect(fund.connect(global[user]).withdraw(tokenId)).to.be.revertedWith("must be insurance NFT");
          }
        }
      }
      await get_pool_state();
    });

    it("fund emergency withdraw and pending_earnings should work correctly", async () => {
      // Deposit
      const amount = BN.from('10000000000');
      await usdc.connect(alex).approve(fund.address, amount);
      await usdc.connect(beth).approve(fund.address, amount);
      await fund.connect(alex).deposit(amount);
      await fund.connect(beth).deposit(amount);
      
      await mlp.connect(carl).approve(saffronPoolV2.address, BN.from('0'));
      await mlp.connect(carl).approve(saffronPoolV2.address, BN.from('2000000000'));

      await saffronPoolV2.connect(carl).deposit(BN.from('2000000000'));
      
      for (let user of users) {
        let userTokenCount = await saffronPositionNFT.connect(global[user]).balanceOf(global[user].address);
        for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
          let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
          // push now for later withdraw loop
          let tranche = await saffronPositionNFT.tranche(tokenId);
          let principal = await saffronPositionNFT.principal(tokenId);
          //let total_holdings = await fund.total_holdings();
          let total_holdings = await usdc.balanceOf(fund.address);
          if (tranche.eq(INSURANCE_TRANCHE)) {

            let pending_earnings = await fund.connect(global[user]).pending_earnings(tokenId);
            console.log("pending_earnings:",pending_earnings.toString());
            
             // Check withdraw with pool shut down
            await saffronPoolV2.connect(deployer).shut_down_pool(true);
            await expect(fund.connect(global[user]).emergency_withdraw(tokenId)).to.be.revertedWith("removal paused");
            await saffronPoolV2.connect(deployer).shut_down_pool(false);
           
            // Do withdraw
            //await fund.connect(global[user]).emergency_withdraw(tokenId);
            await expect(fund.connect(global[user]).emergency_withdraw(tokenId)).to.be.revertedWith("can't redeem NFT: too early");
            
            await saffronPoolV2.connect(global[user]).begin_unfreeze_NFT(tokenId);
            
            // Advance time and blocks
            await increaseTime(7777777); 
            await increaseBlock(BN.from(1));
            
            await expect(fund.connect(global[user]).emergency_withdraw(tokenId)).to.not.be.reverted;
           
//            total_holdings = total_holdings.sub(await fund.total_holdings());
            total_holdings = total_holdings.sub(await usdc.balanceOf(fund.address));
            
            expect(principal).to.be.eql(total_holdings,"total_holdings should have principal amount removed");
            
          }
        }
        await saffronPoolV2.connect(global[user]).withdraw((await saffronPositionToken.balanceOf(global[user].address)));
      }

    });
    
    it("should have fund propose_governance work correctly", async ()=> {
      // propose governance incorrectly
      await expect(fund.connect(alex).propose_governance(deployer.address)).to.be.revertedWith("must be governance");
  
      // propose governance correctly
      await expect(fund.connect(deployer).propose_governance(deployer.address)).to.not.be.reverted;
  
      // verify new_governance was set correctly
      let new_governance = await fund.new_governance();
      expect(deployer.address).to.be.eql(new_governance, "fund contract new_governance does not match address that was set");
    });
    
    it("should have fund accept_governance work correctly", async ()=> {
      // accept governance incorrectly
      await expect(fund.connect(alex).accept_governance()).to.be.revertedWith("must be new governance");
  
      // accept governance correctly
      await expect(fund.connect(deployer).accept_governance()).to.not.be.reverted;
  
      // verify values were set correctly
      let governance = await fund.governance();
      let new_governance = await fund.new_governance();
      expect(deployer.address).to.be.eql(governance, "fund contract governance does not match address that was set");
      expect(zeroAddress).to.be.eql(new_governance, "fund contract new_governance should be zeroAddress");
    });
    
    it("should have fund set_treasury work correctly", async ()=> {
      // set treasury incorrectly
      await expect(fund.connect(alex).set_treasury(deployer.address)).to.be.revertedWith("must be governance");
  
      // set treasury correctly
      await expect(fund.connect(deployer).set_treasury(deployer.address)).to.not.be.reverted;
  
      // verify treasury was set correctly
      let treasury = await fund.treasury();
      expect(deployer.address).to.be.eql(treasury, "fund contract set_treasury does not match address that was set");
    });    
    
    it("should have fund set_pool work correctly", async ()=> {
      // set pool incorrectly
      await expect(fund.connect(alex).set_pool(deployer.address)).to.be.revertedWith("must be governance");
  
      // set pool correctly
      await expect(fund.connect(deployer).set_pool(saffronPoolV2.address)).to.not.be.reverted;
    });    

    it("should test the conversions function by forcing uniswap to swap small amounts", async ()=> {
      console.log("begin should test the conversions function by forcing uniswap to swap small amounts");

      // Add funds to insurance fund to trigger convert()
      const fund_deposit_amount = BN.from('1000');
      console.log(`alex depositing ${fund_deposit_amount} to insurance tranche...`);
      await usdc.connect(deployer).transfer(alex.address, fund_deposit_amount);
      await usdc.connect(alex).approve(fund.address, fund_deposit_amount);
      await fund.connect(alex).deposit(fund_deposit_amount);

      // Add funds to pool and mine a few blocks to generate yield
      const pool_deposit_amount = BN.from('100000000');
      await mlp.connect(carl).approve(saffronPoolV2.address, BN.from('0'));
      await mlp.connect(carl).approve(saffronPoolV2.address, BN.from('2000000000000000000000000'));
      await mlp.connect(deployer).transfer(carl.address, pool_deposit_amount);
      await saffronPoolV2.connect(carl).deposit(pool_deposit_amount);
      await increaseBlock(BN.from(12), false);

      // Get pool state
      await get_pool_state();

      // Generate interest, get pool state, until we have barely enough to swap
      for (let i = 0; i < 10; i++) {
        //console.log(`---- FIRST ITERATION ${i} ----`);
        await increaseBlock(BN.from(100), false);
        await fund.update();
        //await get_pool_state();
      }
      const secondDepositAmount = BN.from('100000000000000000');
      await mlp.connect(deployer).transfer(carl.address, secondDepositAmount);
      await saffronPoolV2.connect(carl).deposit(secondDepositAmount);

      for (let i = 0; i < 10; i++) {
        //console.log(`---- SECOND ITERATION ${i} ----`);
        await increaseBlock(BN.from(1), false);
        await fund.update();
        //await get_pool_state();
      }

      await usdc.connect(dave).approve(fund.address, BN.from('0'));
      await usdc.connect(dave).approve(fund.address, BN.from('2000000000000000000000000'));
      await usdc.connect(deployer).transfer(dave.address, fund_deposit_amount);
      await fund.connect(dave).deposit(fund_deposit_amount);
      await get_pool_state();

      for (let i = 0; i < 10; i++) {
        //console.log(`---- THIRD ITERATION ${i} ----`);
        await increaseBlock(BN.from(1), false);
        await fund.update();
        //await get_pool_state();
      }

    });
    
    it("should remove all assets from pool / autocompounder", async ()=> {

      for (let user of users) {
        let userTokenCount = await saffronPositionNFT.connect(global[user]).balanceOf(global[user].address);
        for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
          let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
          if ((await saffronPositionNFT.expiration(tokenId)).eq(BN.from('0'))) {
            console.log(`unfreezing ${user} tokenId ${tokenId}`);
            await saffronPoolV2.connect(global[user]).begin_unfreeze_NFT(tokenId);
          }
        }
        await saffronPoolV2.connect(global[user]).withdraw((await saffronPositionToken.balanceOf(global[user].address)));
      }
      // Advance time and blocks to await unfreeze
      await increaseTime(7777777); 
      await increaseBlock(BN.from(1));
      for (let user of users) {
        let userTokenCount = await saffronPositionNFT.connect(global[user]).balanceOf(global[user].address);
        for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
          let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
          console.log(`withdrawing  ${user} tokenId ${tokenId}`);
          if ((await saffronPositionNFT.tranche(tokenId)).eq(BN.from('2'))) await fund.connect(global[user]).withdraw(tokenId);
          else await saffronPoolV2.connect(global[user]).withdraw(tokenId);
        }
      }
      
      await saffronPoolV2.connect(deployer).withdraw_fees(deployer.address);
      await fund.update();
      
      // Sweep
      await saffronPoolV2.update_exchange_rate();
      await fund.connect(deployer).sweep_erc(mlp.address, deployer.address);
      await fund.connect(deployer).sweep_erc(usdc.address, deployer.address);
      await get_pool_state();
    });
    async function get_pool_state() {
      let print_pool, print_autocompounder, print_adapter;
      lpName="MJT/WKCS LP";
      print_pool = saffronPoolV2;
      print_autocompounder = autocompounder;
      print_adapter = adapter;

      console.log("`````````````````````PRINTING " + lpName + " POOL STATE``````````````````");
      let position_token_address = await print_pool.position_token();
      let nft_address = await print_pool.NFT();
      let print_position_token = await hre.ethers.getContractAt("SaffronPositionToken", position_token_address);
      let print_nft = await hre.ethers.getContractAt("SaffronPositionNFT", nft_address);

      let balanceOfAutocompounder0 = await print_autocompounder.get_mojito_chef_holdings();
      console.log(`  --- POOL STATE --- `);
      console.log(`  >>> calculated holdings    : ${(await print_pool.get_yield_receiver_supply())}`);
      console.log(`  >>> senior_token_balance   : ${(await print_pool.senior_token_supply()).mul((await print_pool.senior_exchange_rate())).div('10000000000000000000000000000')}`);
      console.log(`  >>> fees_holdings          : ${(await print_pool.fees_holdings())}`);
      console.log(`  --- AUTOCOMPOUNDER STATE --- `);
      console.log(`  >>> autocompounder balance (LP tokens) : \x1b[32m${fromWei(balanceOfAutocompounder0).padStart(24)}\x1b[0m ${lpName}\n`);        
      console.log(`  >>> balance of WKCS        : ${(await wkcs.balanceOf(print_autocompounder.address))}\n`);
      console.log(`  >>> balance of MJT        : ${(await mjt.balanceOf(print_autocompounder.address))}\n`);
      console.log(`  --- NFT STATE --- `);
      console.log(`  >>> NFT  totalsupply: ${(await print_nft.totalSupply())}`);
      await print_user_tokens("deployer", deployer, saffronPoolV2);
      for (let user of users) await print_user_tokens(user, global[user], saffronPoolV2); 
      console.log("`````````````````````````````````````````````````````````````````````````");
    }

    async function print_user_tokens(user, guser, saffronPoolV2) {
      let userTokenCount = await saffronPositionNFT.connect(guser).balanceOf(guser.address);
      if (userTokenCount > 0) console.log(`  >>> ${user} NFTs...`);
      for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
        let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(guser.address, tokenIndex);
        console.log(`  >>> ${user} NFT tokenId ${tokenId} tranche ${(await saffronPositionNFT.tranche(tokenId))}`);
        console.log(`      balance (lp)  : ${(await saffronPositionNFT.balance(tokenId))}`);
        console.log(`      principal     : ${(await saffronPositionNFT.principal(tokenId))}`);
        console.log(`      expiration    : ${(await saffronPositionNFT.expiration(tokenId))}`);
      }

      console.log(`  >>> ${user} ERC20 position_token balance:`);
      console.log(`      balance (lp)    : ${(await saffronPositionToken.balanceOf(guser.address))}`);
      console.log(`      balance (base)  : ${(await saffronPositionToken.balanceOf(guser.address)).mul((await saffronPoolV2.senior_exchange_rate()).div('10000000000000000000000000000'))}`);
    }

  });

  describe("📜 multiple consecutive deposit/withdraw tests", function() {
  
    // constants that determine how many test blocks to run
    const TOTAL_TEST_RUNS = 4;     // total amount of this test to run
    const BLOCKS_PER_TEST_MIN = 25;  // minimum amount of blocks to run per test
    const BLOCKS_PER_TEST_MAX = 50; // maximum amount of blocks to run per test
    const TX_PER_BLOCK_MIN = 1;     // minimum amount of transactions in each test block
    const TX_PER_BLOCK_MAX = 10;     // maximum amount of transactions in each test block
    let accounts;
    let justDeposits,balanceOfAutocompounder;
    let randomDirectSends;
    let lpName,lpNames,trancheNames,trancheDecimals;
    let adapter0,saffronPoolV20,saffronPositionNFT0,lp0,autocompounder0,fund0,token0,tokenName0;
    let saffronPositionToken0;
    const seeds = [];
    let totalEarnings,seniorEarnings,insuranceEarnings,feeEarnings,startingBlock,totalUSDCconversions,totalUSDCsentDirectly;

    async function verify_pool_state(pool, nft, autocompounder) {
      let funds_in_adapter = await autocompounder0.get_mojito_chef_holdings();
      let funds_calculated = await saffronPoolV20.get_yield_receiver_supply();
      if (funds_in_adapter.lt(funds_calculated)) {
        let senior_holdings   = await saffronPoolV20.senior_exchange_rate();
        let senior_supply     = await saffronPoolV20.senior_token_supply();
        let senior_calculated = senior_holdings.mul(senior_supply).div(BN.from('1000000000000000000'));
        let fees_holdings     = await saffronPoolV20.fees_holdings();

        console.log("%%%%%%%%%%%%%%%%%%%%%%% PROBLEM %%%%%%%%%%%%%%%%%%%%%%%");
        console.log(`% funds in adapter     : ${funds_in_adapter}`);
        console.log(`% calcultaed pool funds: ${funds_calculated}`);
        console.log(`% >> senior holdings   : ${senior_holdings   }`);
        console.log(`% >> senior supply     : ${senior_supply     }`);
        console.log(`% >> senior calculated : ${senior_calculated }`);
        console.log(`% >> fees   holdings   : ${fees_holdings     }`);
        console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
      }
    }
    async function print_user_tokens(user, guser) {
      let userTokenCount = await saffronPositionNFT.connect(guser).balanceOf(guser.address);
      if (userTokenCount > 0) console.log(`  >>> ${user} NFTs...`);
      for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
        let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(guser.address, tokenIndex);
        console.log(`  >>> ${user} token ${tokenId} tranche ${(await saffronPositionNFT.tranche(tokenId))}`);
        console.log(`      balance (lp)  : ${(await saffronPositionNFT.balance(tokenId))}`);
        console.log(`      principal     : ${(await saffronPositionNFT.principal(tokenId))}`);
        console.log(`      earnings      : ${(await fund.pending_earnings(tokenId))}`);
        console.log(`      expiration    : ${(await saffronPositionNFT.expiration(tokenId))}`);
      }
    }
    
    before("intialize accounts", async () => {
      console.log("000000000000000000000000000000000000000000000000");
      //await get_pool_state();
      // get some random number seeds to start before replacing the built in random number generator
      for(let i=0;i<100;i++) seeds.push(Math.floor(Math.random()*1000000000000));
      
      // manually set 1st seed to rerun same test
      /*  
       * DO NOT DELETE THIS COMMENT!
       *
      seeds[0]=145157396984;
      seeds[1]=526614189946;
      seeds[2]=904549662211;
      seeds[3]=855963656844;

       * DO NOT DELETE THIS COMMENT!
       */
     
    });

    after("show random seeds used", async ()=>{
      // print seeds of all tests
      console.log(`\n  * Random Seeds Used In These Tests:\n`);
      for(let test=0;test<TOTAL_TEST_RUNS;test++) {
        console.log(`      \x1b[0;31mseeds[${test}]=${seeds[test]};\x1b[0m`);
      }
    });
  
    // run random test multiple times
    for(let test=0;test<TOTAL_TEST_RUNS;test++) {

      it("should have random users depositing and withdrawing randomly return correct amounts", async ()=> {
        
        // seed the random number generator
        randSeed(seeds[test]);
        
        //MJT-WKCS
        adapter0=adapter;
        saffronPoolV20=saffronPoolV2;
        saffronPositionNFT0=saffronPositionNFT;
        saffronPositionToken0=saffronPositionToken;
        autocompounder0=autocompounder;
        lp0=mlp;
        lpName="MJT/WKCS LP";
        fund0=fund;
        token0=mjt;
        tokenName0="MJT";
        
        //console.log("111111111111111111111111111111111111111111111111");
        await saffronPoolV20.update_exchange_rate();
        lpNames=[lpName,lpName,"USDC"];
        trancheNames=["SENIOR","","INSURANCE"];
        trancheDecimals=[18,0,18];
        
        totalEarnings=BN.from(0);
        seniorEarnings=BN.from(0);
        insuranceEarnings=BN.from(0);
        feeEarnings=BN.from(0);
        totalUSDCsentDirectly=BN.from(0);

        // inititalize accounts to test with
        // send all users mlp and usdc to deployer
        for(let user of users) {
          
          // get user's NFTs if any, and clear any NFTs
          let userTokenCount = await saffronPositionNFT.balanceOf(global[user].address);
          if (userTokenCount.gt(BN.from('0'))) console.log(`userTokenCount: ${userTokenCount}`);
          for (let tokenIndex = userTokenCount - 1; tokenIndex >= 0; tokenIndex--) { 
            let tokenId = await saffronPositionNFT.tokenOfOwnerByIndex(global[user].address, tokenIndex);
            let tranche = await saffronPositionNFT.tranche(tokenId);
            let expiration = await saffronPositionNFT.expiration(tokenId);
            if(expiration.isZero()) await saffronPoolV2.connect(global[user]).begin_unfreeze_NFT(tokenId);
            // Advance time and blocks
            await increaseTime(7777777); 
            await increaseBlock(BN.from(1));
            console.log(`withdrawing ${user} tokenId ${tokenId}`);
            await fund.connect(global[user]).withdraw(tokenId);
          }
          
          let balance=await mlp.balanceOf(global[user].address);
          if(!balance.isZero()) await mlp.connect(global[user]).transfer(deployer.address, balance);
          balance=await usdc.balanceOf(global[user].address);
          if(!balance.isZero()) await usdc.connect(global[user]).transfer(deployer.address, balance);
        }
        
        // send users same amount of mlp and usdc
        let balance=await mlp.balanceOf(deployer.address);
        console.log("deployer MJT/WKCS balance:",fromWei(balance));
        balance=await usdc.balanceOf(deployer.address);
        console.log("deployer USDC balance:",fromWei(balance,18));
        
        for(let user of users) {
          console.log(user, global[user].address,`sending ${user} mlp and usdc`);
          await mlp.connect(deployer).transfer(global[user].address, userMLPamount);
          await usdc.connect(deployer).transfer(global[user].address, userUSDCamount);
         }
        
        accounts = {};
        for(let user of users) {
          // get user's current balance
          let userBalance = await lp0.balanceOf(global[user].address);
          let userBalanceUSDC = await usdc.balanceOf(global[user].address);
    
          accounts[user]={
            // user's text name
            name: user,
            // user's starting balance in lp0
            startBalance: userBalance,
            // user's current balance in lp0
            currentBalance: userBalance,
            // user's starting balance in USDC
            startBalanceUSDC: userBalanceUSDC,
            // user's current balance in USDC
            currentBalanceUSDC: userBalanceUSDC,
            // user's total deposit in the SENIOR and INSURANCE tranches
            depositTotal: [BN.from(0),BN.from(0),BN.from(0)],
            // user's NFT position tokens
            tokenIds: [],
            // user's deposit history
            history: [],
            // user's number of deposits
            numDeposits: 0,
          };
        }
  
        // enable pool
        await expect(saffronPoolV20.connect(deployer).disable_deposits(false)).to.not.be.reverted;
        
        //console.log("333333333333333333333333333333333333333333333333");
        await verify_pool_state();
        // send anything in the fees account to the deployer account before starting
        await lp0.connect(fees).transfer(deployer.address, (await lp0.balanceOf(fees.address)));

        //console.log("444444444444444444444444444444444444444444444444");
        await saffronPoolV20.connect(deployer).withdraw_fees(deployer.address);
        
        // set fund's treasury address to fees
        await fund0.set_treasury(fees.address);
        
        let feeBalance0=await lp0.balanceOf(fees.address);
        let feeHoldings0=await saffronPoolV20.fees_holdings();
        console.log("fees balance :",fromWei(feeBalance0));
        console.log("fees holdings:",fromWei(feeHoldings0));
        
        startingBlock=(await hre.ethers.provider.getBlock("latest")).number;
        
        console.log("555555555555555555555555555555555555555555555555");
        await verify_pool_state();
        console.log(`\n---------------------------------------------------------------------------`);
        console.log(` RANDOM DEPOSIT/WITHDRAW TEST #${test}: ${lpName} - RANDOM SEED: ${seeds[test]}`);
        console.log(`---------------------------------------------------------------------------`);

        // autocompound earnings
        let mojitochefHoldings=await autocompounder0.get_mojito_chef_holdings();
        console.log(`\n  \x1b[34mMOJITOSWAP HOLDINGS\x1b[0m ${mojitochefHoldings.toString()}\n`);

        await autocompounder0.connect(deployer).sweep_erc(mjt.address,deployer.address);
        await autocompounder0.connect(deployer).autocompound();
        console.log(`\n  \x1b[34mAUTOCOMPOUNDING\x1b[0m\n`);

        // let randomly have no withdraws just deposits
        justDeposits = 1; //randInt(1); //0 deposits only, 1 deposit and withdraw
        randomDirectSends = 0; //0 do not randomly send tons of tokens to contract, 1 randomly send tons of tokens directly to contract
      
        console.log(`\n  \x1b[36m${justDeposits?"DEPOSITS and WITHDRAWALS enabled":"DEPOSITS ONLY enabled"}\x1b[0m\n`);

        // autocompound earnings
        mojitochefHoldings=await autocompounder0.get_mojito_chef_holdings();
        console.log(`\n  \x1b[34mMOJITOSWAP HOLDINGS\x1b[0m ${mojitochefHoldings.toString()}\n`);
        
        // do this test for random 10 to 50 blocks
        let blockTotal = randInt(BLOCKS_PER_TEST_MIN,BLOCKS_PER_TEST_MAX);
        for(let blockCount=0;blockCount<blockTotal;blockCount++) {

          // random 1 to 5 transactions per block
          let txPerBlock = randInt(TX_PER_BLOCK_MIN,TX_PER_BLOCK_MAX);
          
          console.log(`\n  * Block #${blockCount}, Transactions: ${txPerBlock}`);
          
          // stop auto mining
          await network.provider.send("evm_setAutomine", [false]);
          
          // randomly autocompound occasionally
          let compound = randInt(3)<1; // 25%
          
          if(compound) {
              // autocompound earnings
              mojitochefHoldings=await autocompounder0.get_mojito_chef_holdings();
              console.log(`\n  \x1b[34mMOJITOSWAP HOLDINGS\x1b[0m ${mojitochefHoldings.toString()}\n`);
              
              await autocompounder0.connect(deployer).autocompound();
              console.log(`\n  \x1b[34mAUTOCOMPOUNDING\x1b[0m\n`);
          }
          
          // randomly extract fees occasionally
          let extractFees = randInt(3)<1; // 25%
          
          if(extractFees) {
              // extract fees to fees.address for ease of tallying later
              await saffronPoolV20.connect(deployer).update_exchange_rate();
              let feesHoldings=await saffronPoolV20.fees_holdings();

               //await saffronPoolV20.connect(deployer).withdraw_fees(fees.address);
              await fund0.connect(deployer).update();
              console.log(`\n  \x1b[36mFUND UPDATE -> WITHDRAWING HOLDINGS: ${fromWei(feesHoldings)} ${lpName}\x1b[0m\n`);
          }
          
          // randomly send USDC to fund
          let sendUSDC = randInt(3)<1; // 25%
          
          if(sendUSDC) {
            // get usdc balance of deployer
            let usdcBalance=await usdc.balanceOf(deployer.address);
            // use up to 10% of usdc balance to send directly to fun
            let usdcAmount=BN.from(randInt(1, 99999)).mul(usdcBalance).div(1000000);
            // send random amount of USDC from deployer, right into fund conract
            if (randomDirectSends !== 1) usdcAmount = BN.from('0'); // DONT RANDOMLY SEND
            await usdc.connect(deployer).transfer(fund0.address, usdcAmount);
            console.log(`\n  \x1b[32mSENDING USDC DIRECTLY TO FUND: ${fromWei(usdcAmount,18)} USDC\x1b[0m\n`);
            totalUSDCsentDirectly=totalUSDCsentDirectly.add(usdcAmount);
          }
          
          // randomly send USDC to fund
          let sendTokens = randInt(3)<1; // 25%
          
          if(sendTokens) {
            // pick a random token WKCS, SFI, or MJT
            let tokens=[wkcs,token0];
            let tokenNames=["WKCS",tokenName0];
            let i=randInt(tokens.length-1);
            let token=tokens[i];
            let tokenName=tokenNames[i];
            
            // pick a random contract
            let contracts=[adapter0,saffronPoolV20,saffronPositionNFT0,autocompounder0];
            let contractNames=["ADAPTER","SAFFRONPOOLV2","SAFFRONPOSITIONNFT","AUTOCOMOUNDER"];
            i=randInt(contracts.length-1);
            let contract=contracts[i];
            let contractName=contractNames[i];
            
            // get balance of deployer
            let balance=await token.balanceOf(deployer.address);
            // use up to 10% of token balance to send directly to contract
            let amount=BN.from(randInt(1, 99999)).mul(balance).div(1000000);
            // send random amount of token from deployer, right into conract
            if (randomDirectSends !== 1) amount = BN.from('0'); // DONT RANDOMLY SEND
            await token.connect(deployer).transfer(contract.address, amount);
            console.log(`\n  \x1b[32mSENDING ${tokenName} DIRECTLY TO THE ${contractName} CONTRACT: ${fromWei(amount)} ${tokenName}\x1b[0m\n`);
          }          
          
          // update exchange rate for more accurate results
          await saffronPoolV20.update_exchange_rate();
          await fund0.update();

          // add random transactions to this block
          for(let txCount=0;txCount<txPerBlock;txCount++) {
            //console.log(`    Transaction #${txCount}`);
            
            //pick a random account
            let userIndex = randInt(users.length-1);
            let account = accounts[users[userIndex]];
            //console.log("userIndex: ",userIndex,"account: ",JSON.stringify(account));
            
            // pick random deposit or withdraw
            let depositOrWithdraw = randInt(justDeposits); //0 deposit, 1 unfreeze, unfreezing, and withdraw
            
            //check if DEPOSIT
            if(depositOrWithdraw == DEPOSIT) {
              let tranche, depositAmount;
              
              // is deposit so choose random tranche
              tranche = randInt(1)*2; // 0 senior, 1 nothing, 2 insurance
              
              // pick random amount from current balance from 1 to total amount
              if(tranche==INSURANCE_TRANCHE) {
                // INSURANCE
                depositAmount = BN.from(randInt(1, 999999)).mul(account.currentBalanceUSDC).div(1000000);
              } else {
                // SENIOR
                depositAmount = BN.from(randInt(1, 999999)).mul(account.currentBalance).div(1000000);
              }
              
              // deposit user's lp0 in the chosen tranche
              if (!depositAmount.isZero()) {
                if(tranche==INSURANCE_TRANCHE) {
                  // INSURANCE
                  // approve fund to spend user's usdc
                  await usdc.connect(global[account.name]).approve(fund0.address, depositAmount);

                  await fund0.connect(global[account.name]).deposit(depositAmount);
                } else {
                  // SENIOR
                  // approve saffronPoolV20 to spend user's lp0
                  await lp0.connect(global[account.name]).approve(saffronPoolV20.address, depositAmount);
              
                  await saffronPoolV20.connect(global[account.name]).deposit(depositAmount);
                }
                account.numDeposits++;
              }
              
              // add lp0 to user's account's tranche total
              account.depositTotal[tranche] = account.depositTotal[tranche].add(depositAmount);
              
              // changing colors: https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
              console.log(`     - ${account.name} is depositing                  \x1b[32m${fromWei(depositAmount,trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} into \x1b[35m${trancheNames[tranche]}\x1b[0m tranche`);
              // add to history of this account
              account.history.push({depositAmount:depositAmount,tranche:tranche});
            } else {
                
              // is withdraw so choose random tranche
              tranche = randInt(1)*2; // 0 senior, 1 nothing, 2 insurance
              
              // pick random amount from current balance from 1 to total amount
              if(tranche==INSURANCE_TRANCHE) {
                // INSURANCE
                // is withdraw so select one of the NFTs user owns
                let tokenCount = account.tokenIds.length;
                
                // get next user just in case
                let userIndexNext=(userIndex+1) % users.length;
                // if this user has no tokens to unfreeze/withdraw check the next user
                while(tokenCount==0) {
                  
                  // if back to original user then break
                  if(userIndexNext==userIndex) break;
                  
                  // get user account and token count
                  account = accounts[users[userIndexNext]];
                  tokenCount = account.tokenIds.length;
                  
                  // if user has tokens then break
                  if(tokenCount>0) break;
                  
                  //get next user to check for tokens
                  userIndexNext = (userIndexNext+1) % users.length;
                }
                
                // if there are tokens, do something with them
                if(tokenCount>0) {
                  // pick one at random
                  let tokenIdIndex = randInt(tokenCount-1);
                  let tokenId = account.tokenIds[tokenIdIndex];
                  let expiration = await saffronPositionNFT0.expiration(tokenId);
                  let tokenIdIndexNext = (tokenIdIndex+1) % tokenCount;
                  
                  // look for tokens to withdraw
                  while(expiration.isZero()) {
                    //get next token
                    tokenId = account.tokenIds[tokenIdIndexNext];
                    // get tokens expiration
                    expiration = await saffronPositionNFT0.expiration(tokenId);
                    // get next token index
                    tokenIdIndexNext = (tokenIdIndexNext+1) % tokenCount;
                    
                    if(tokenIdIndexNext==tokenIdIndex) break;
                  }
                  
                  // get NFT details
                  let tranche = await saffronPositionNFT0.tranche(tokenId);
                  let withdrawAmount = await saffronPositionNFT0.balance(tokenId);
                  let withdrawAmountBase;
  
                  let insuranceBaseAsset = await hre.ethers.getContractAt("IERC20", (await fund0.insurance_asset()));
                  let totalHoldings = await insuranceBaseAsset.balanceOf(fund0.address);
                  let totalSupplyLp = await fund0.total_supply_lp();
                  withdrawAmountBase = (totalSupplyLp.eq(BN.from('0'))) ? (await saffronPositionNFT0.principal(tokenId)) : withdrawAmount.mul(totalHoldings).div(totalSupplyLp);
    
                  // check if expiration date > 0
                  if(expiration.isZero()) {
                    console.log(`     - ${account.name} is unfreezing  NFT ${(tokenId).toString().padStart(6)} with \x1b[1;34m${fromWei(withdrawAmountBase, trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} (${fromWei(withdrawAmount,18)} SAFF-LP) from \x1b[35m${trancheNames[tranche]}\x1b[0m tranche`);
    
                    // not unfreezing or melted so call begin_unfreeze_NFT
                    await saffronPoolV20.connect(global[account.name]).begin_unfreeze_NFT(tokenId);
    
                  } else {
                    let blockTimestamp = BN.from((await hre.ethers.provider.getBlock("latest")).timestamp);
  
                    // check if token is unfrozen
                    if(blockTimestamp.gte(expiration)) {
    
                      // token is unfrozen so attempt withdraw
                      await fund0.connect(global[account.name]).withdraw(tokenId);
                      console.log(`     - ${account.name} is withdrawing NFT ${(tokenId).toString().padStart(6)} with \x1b[1;34m${fromWei(withdrawAmountBase, trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} (${fromWei(withdrawAmount,18)} SAFF-LP) from \x1b[35m${trancheNames[tranche]}\x1b[0m tranche`);
  
                      // subtract lp0 from user's account's tranche total
                      account.depositTotal[tranche] = account.depositTotal[tranche].sub(withdrawAmount);
                    } else {
                      console.log(`     - ${account.name} can't withdraw NFT ${(tokenId).toString().padStart(6)} yet  \x1b[1;34m${fromWei(withdrawAmountBase, trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} (${fromWei(withdrawAmount,18)} SAFF-LP) from \x1b[35m${trancheNames[tranche]}\x1b[0m tranche`);
                    }
                  }
                }
                  
              } else {
                // SENIOR WITHDRAW RANDOM AMOUNT
                let withdrawBalance = await saffronPositionToken.balanceOf(global[account.name].address);
                let withdrawAmount = BN.from(randInt(1, 999999)).mul(withdrawBalance).div(1000000);
                await saffronPoolV20.connect(global[account.name]).withdraw(withdrawAmount);
              }
            }
          }  // end transaction group
       
          // mine a block
          await network.provider.send('evm_mine',[]);
          // turn auto mining back on
          await network.provider.send('evm_setAutomine', [true]);
          
          // update account balances of lp0, USDC and SaffronPositionToken tokens
          for(let user of users) {
            // get user's current balance
            accounts[user].currentBalance = await lp0.balanceOf(global[user].address);
            accounts[user].currentBalanceUSDC = await usdc.balanceOf(global[user].address);
            
            // get count of user's NFTs if any
            let userTokenCount = await saffronPositionNFT0.balanceOf(global[user].address);
            
            // clear list of user's tokenIds
            accounts[user].tokenIds=[];
            
            // loop through index of user token count
            for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
              // get tokenId for each index
              let tokenId = await saffronPositionNFT0.tokenOfOwnerByIndex(global[user].address, tokenIndex);
              // add tokenId to tokenIds array
              accounts[user].tokenIds.push(tokenId);
            }  // end user NFT token loop
          }  // end user balance update loop
          
          // autocompound earnings
          mojitochefHoldings=await autocompounder0.get_mojito_chef_holdings();
          console.log(`\n  \x1b[34mMOJITOSWAP HOLDINGS\x1b[0m ${mojitochefHoldings.toString()}\n`);
          
          // move 120 to 20160 blocks into the future (30 minutes to 7 days)
          //await increaseBlock(randInt(120,20160));
          await increaseTime(randInt(704800,704800*2));
          await increaseBlock(BN.from(100)); 
          await autocompounder0.connect(deployer).autocompound();
          console.log(`\n  \x1b[34mAUTOCOMPOUNDING\x1b[0m\n`);

          // print pool state
          console.log(`\n Pool state:`);
          let seniorTVL = (await saffronPoolV20.senior_token_supply()).mul((await saffronPoolV20.senior_exchange_rate())).div(BN.from('1000000000000000000'));
          let feesTVL   = (await saffronPoolV20.fees_holdings());
          console.log(`  * senior TVL: ${fromWei(seniorTVL, trancheDecimals[0])} ${lpNames[0]}`);
          console.log(`  * fees   TVL: ${fromWei(feesTVL, trancheDecimals[0])} ${lpNames[0]}`);
          console.log(`\n Fund state:`);
          console.log(`  * fund   TVL: ${fromWei((await usdc.balanceOf(fund0.address)), trancheDecimals[2])} ${lpNames[2]}`);
        } // end block count loop
  
        // earn a lot of interest by increasing blocks by 2500
        console.log(`\n  * Earning interest by increasing blocks by 2500 `);
        await increaseBlock(2500);
        await autocompounder0.connect(deployer).autocompound();
        console.log(`\n  \x1b[34mAUTOCOMPOUNDING\x1b[0m\n`);

        // unfreeze all users' NFTs
        console.log(`\n  Unfreezing all NFTs`);
        // begin unfreezing
        for(let user of users) {
          let userTokenCount = await saffronPositionNFT0.balanceOf(global[user].address);
          if(userTokenCount.isZero()) { console.log(`     - user: ${user}\ttokenId: \x1b[33mNone\x1b[0m`); }
          // loop through index of user token count, begin unfreezing all
          for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
            let tokenId = await saffronPositionNFT0.tokenOfOwnerByIndex(global[user].address, tokenIndex);
            let tranche = await saffronPositionNFT0.tranche(tokenId);
            let expiration = await saffronPositionNFT0.expiration(tokenId);
            console.log(`     - user: ${user}\ttokenId: \x1b[33m${tokenId}\x1b[0m\ttokenId: \x1b[33m${trancheNames[tranche]}\x1b[0m`);
            if(expiration.isZero()) await saffronPoolV20.connect(global[user]).begin_unfreeze_NFT(tokenId);
          }
        }
        // go 1 week into the future to ensure all NFTs are unfrozen
        console.log(`\n  * Go 8 days into the future`);
        await increaseTime(704800);
        await increaseBlock(BN.from(100)); 
        await autocompounder0.connect(deployer).autocompound();
        console.log(`\n  \x1b[34mAUTOCOMPOUNDING\x1b[0m\n`);
  
        // withdraw all NFTs
        console.log(`\n  * Withdrawing all NFTs`);
        for(let user of users) {
          let account=accounts[user];
          // clear list of user's tokenIds
          account.tokenIds=[];
          let userTokenCount = await saffronPositionNFT0.balanceOf(global[user].address);
          // loop through index of user token count
          for(let tokenIndex=0;tokenIndex<userTokenCount;tokenIndex++) {
            // get tokenId for each index
            let tokenId = await saffronPositionNFT0.tokenOfOwnerByIndex(global[user].address, tokenIndex);
            // add tokenId to tokenIds array
            account.tokenIds.push(tokenId);
          }  // end user NFT token loop
  
          // update exchange rate for more accurate results
          await saffronPoolV20.update_exchange_rate();
          await fund0.update();

          // loop through pre-fetched list of tokenIds, because withdrawing them will burn each one
          userTokenCount = account.tokenIds.length;
          for(let tokenId of account.tokenIds) {
            let tranche = await saffronPositionNFT0.tranche(tokenId);
            let expiration = await saffronPositionNFT0.expiration(tokenId);
            let withdrawAmount = await saffronPositionNFT0.balance(tokenId);
            let insuranceBaseAsset = await hre.ethers.getContractAt("IERC20", (await fund0.insurance_asset()));
            let totalHoldings = await insuranceBaseAsset.balanceOf(fund0.address);
            let totalSupplyLp = await fund0.total_supply_lp();
            withdrawAmountBase = (totalSupplyLp.eq(BN.from('0'))) ? (await saffronPositionNFT0.principal(tokenId)) : withdrawAmount.mul(totalHoldings).div(totalSupplyLp);
            
            //await get_pool_state();
            // INSURANCE
            await fund0.connect(global[account.name]).withdraw(tokenId);

            account.depositTotal[tranche] = account.depositTotal[tranche].sub(withdrawAmount);
            
            console.log(`   - ${account.name} is withdrawing NFT ${(tokenId).toString().padStart(6)} with \x1b[1;34m${fromWei(withdrawAmountBase, trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} (${fromWei(withdrawAmount,18)} SAFF-LP) from \x1b[35m${trancheNames[tranche]}\x1b[0m tranche`);
          }
          
          // SENIOR WITHDRAW LP
          let withdrawAmountLP = await saffronPositionToken0.balanceOf(global[account.name].address);
          await saffronPoolV20.connect(global[account.name]).withdraw(withdrawAmountLP);
          account.depositTotal[tranche] = account.depositTotal[0].sub(withdrawAmountLP);
          console.log(`   - ${account.name} is withdrawing Position ERC20 Tokens  with \x1b[1;34m${fromWei(withdrawAmountLP, trancheDecimals[0]).padStart(24)}\x1b[0m ${lpNames[0]} (${fromWei(withdrawAmountLP,18)} SAFF-LP) from \x1b[35m${trancheNames[0]}\x1b[0m tranche`);
        }
        
        // total all FundsWithdrawn events
        console.log(`\n  * Totaling all FundsWithdrawn events`);
        let fundEvents = await saffronPoolV20.queryFilter("FundsWithdrawn",startingBlock,"latest");
        for(let fundEvent of fundEvents) {
          //let [tranche, principal, lp_amount, amount_base, exchange_rate, token_id, owner, caller]=fundEvent.args;
          let [lp_amount, amount_base, exchange_rate, owner]=fundEvent.args;
          //let tranche0=tranche.toNumber()=="0"?"SENIOR":"JUNIOR";
          let user0= users.find(user => global[user].address.toLowerCase() == owner.toLowerCase());
          //let interest = amount_base.sub(principal);
          let interest = BN.from('0');
           //console.log("FundsWithdrawn",user0,fromWei(principal),fromWei(amount_base),fromWei(interest));
          console.log(`     - EVENT FundsWithdrawn, ${user0} withdrew \x1b[31m${fromWei(amount_base,trancheDecimals[0]).padStart(24)}\x1b[0m ${lpNames[0]} tokens from \x1b[35m${trancheNames[0]}\x1b[0m tranche; interest: \x1b[31m${fromWei(interest,trancheDecimals[0]).padStart(24)}\x1b[0m ${lpNames[0]} tokens`);
          seniorEarnings=seniorEarnings.add(interest);
          totalEarnings=totalEarnings.add(interest);
        }
        // total all USDC FundsWithdrawn events
        fundEvents = await fund0.queryFilter("FundsWithdrawn",startingBlock,"latest");
        for(let fundEvent of fundEvents) {
          let [tranche, principal, earnings, token_id, owner, caller]=fundEvent.args;
          //let tranche0=tranche.toNumber()=="0"?"SENIOR":"JUNIOR";
          let user0= users.find(user => global[user].address.toLowerCase() == owner.toLowerCase());
          let interest = earnings;
          //console.log("FundsWithdrawn",user0,fromWei(principal),fromWei(amount_base),fromWei(interest));
          console.log(`     - EVENT FundsWithdrawn ${tranche}, ${user0} withdrew \x1b[31m${fromWei(principal,trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} tokens from \x1b[35m${trancheNames[tranche]}\x1b[0m tranche; interest: \x1b[31m${fromWei(interest,trancheDecimals[tranche]).padStart(24)}\x1b[0m ${lpNames[tranche]} tokens`);
          insuranceEarnings=insuranceEarnings.add(interest);
        }
        // total all FeesWithdrawn events
        fundEvents = await saffronPoolV20.queryFilter("FeesWithdrawn",startingBlock,"latest");
        for(let fundEvent of fundEvents) {
          let [fee_amount, governance, to]=fundEvent.args;
          //let tranche0=tranche.toNumber()=="0"?"SENIOR":"JUNIOR";
          let interest = fee_amount;
          //console.log("FundsWithdrawn",user0,fromWei(principal),fromWei(amount_base),fromWei(interest));
          console.log(`     - EVENT FeesWithdrawn, INSURANCE FUND withdrew \x1b[31m${fromWei(interest).padStart(24)}\x1b[0m ${lpNames[0]} tokens from \x1b[35mFEE\x1b[0m tranche`);
          feeEarnings=feeEarnings.add(interest);
          totalEarnings=totalEarnings.add(interest);
        }
        
        // total all FundsConverted events
        fundEvents = await fund0.queryFilter("FundsConverted",startingBlock,"latest");
        totalUSDCconversions = BN.from(0);
        for(let fundEvent of fundEvents) {
          let [token_from, token_to, amount_from, amount_to]=fundEvent.args;
          let token_from_name=TOKEN_NAMES[token_from.toLowerCase()]["name"];
          let token_to_name=TOKEN_NAMES[token_to.toLowerCase()]["name"];
          let token_from_decimals=TOKEN_NAMES[token_from.toLowerCase()]["decimals"];
          let token_to_decimals=TOKEN_NAMES[token_to.toLowerCase()]["decimals"];
          
          console.log(`     - EVENT FundsConverted, INSURANCE FUND converted from \x1b[31m${fromWei(amount_from,token_from_decimals).padStart(24)}\x1b[0m ${token_from_name} tokens to \x1b[31m${fromWei(amount_to,token_to_decimals).padStart(24)}\x1b[0m ${token_to_name} tokens`);
          if(token_to.toLowerCase()==USDC.toLowerCase()) {
            totalUSDCconversions=totalUSDCconversions.add(amount_to);
          }
        }

        // get balances after withdraw and report to console 
        // TODO: expect that it's greater than starting balance
        console.log(`\n  * TEST #${test} FINAL RESULTS`);
        let earningsTotal = BN.from(0);
        console.log(`\n    ------------------------`);
        console.log(`    ${lpName.padStart(24-Math.floor(lpName.length/2))}`);
        console.log(`    ------------------------\n`);
        for(let user of users){ 
          let account = accounts[user];
          account.currentBalance = await lp0.balanceOf(global[user].address);
          accountMinimumBalance = account.startBalance.sub(BN.from(account.numDeposits));
          console.log(`    ${account.name}  startBalance: \x1b[32m${fromWei(account.startBalance).padStart(24)}\x1b[0m ${lpName}\tcurrentBalance: \x1b[32m${fromWei(account.currentBalance).padStart(24)}\x1b[0m ${lpName}`);
          console.log(`    ${account.name}  minimumBalance: \x1b[32m${fromWei(accountMinimumBalance).padStart(22)}\x1b[0m\n`);
          // expect depositors to have earned or have the same holdings (in case they attempted to deposit to junior tranche and ended up depositing dust, which would earn 0)
          if (!(account.currentBalance.gte(accountMinimumBalance))) {
            console.log(`     ❗️❗️❗️❗️❗️ ${account.name} started with ${fromWei(account.startBalance)} and withdrew only ${fromWei(account.currentBalance)} (this is below the minimum expected balance of ${fromWei(accountMinimumBalance)}`);
          } else {
            if (!(account.currentBalance.gte(account.startBalance))) {
              console.log(`     ❕❕❕❕❕ ${account.name} started with ${fromWei(account.startBalance)} and withdrew only ${fromWei(account.currentBalance)} (but that's ok because they had deposited ${fromWei(account.numDeposits)} times)`);
            }
          }

          //expect(account.currentBalance).to.be.gte(account.startBalance,`${user} currentBalance of ${fromWei(account.currentBalance)} should be greater than startBalance of ${fromWei(account.startBalance)}`);
          expect(account.currentBalance.add(BN.from(10000))).to.be.gte(accountMinimumBalance,`${user} currentBalance of ${fromWei(account.currentBalance)} should be greater than startBalance of ${fromWei(account.startBalance)}`);
        
          // add to total earnings
          earningsTotal=earningsTotal.add(account.currentBalance.sub(account.startBalance));
        }
        // add senior earnings to total earnings
        totalEarnings=totalEarnings.add(earningsTotal);
        console.log(`\n    user earnings  : \x1b[32m${fromWei(earningsTotal).padStart(24)}\x1b[0m ${lpName}`);
        console.log(`\n    senior earnings: \x1b[32m${fromWei(seniorEarnings).padStart(24)}\x1b[0m ${lpName}`);
        console.log(`    fees earnings  : \x1b[32m${fromWei(feeEarnings).padStart(24)}\x1b[0m ${lpName}`);
        console.log("    ".padEnd(58,"-"));
        console.log(`    total earnings : \x1b[32m${fromWei(totalEarnings).padStart(24)}\x1b[0m ${lpName}`);
        console.log("");
        
        console.log(`\n    ------------------------`);
        console.log(`              USDC            `);
        console.log(`    ------------------------\n`);
        
        let earningsTotalUSDC = BN.from(0);
        for(let user of users){ 
          let account = accounts[user];
          account.currentBalanceUSDC = await usdc.balanceOf(global[user].address);
          console.log(`    ${account.name}  startBalance: \x1b[32m${fromWei(account.startBalanceUSDC,18).padStart(24)}\x1b[0m USDC\tcurrentBalance: \x1b[32m${fromWei(account.currentBalanceUSDC,18).padStart(24)}\x1b[0m USDC`);
          // expect depositors to have earned or have the same holdings (in case they attempted to deposit to junior tranche and ended up depositing dust, which would earn 0)
          expect(account.currentBalanceUSDC.add(BN.from(2000))).to.be.gte(account.startBalanceUSDC,`${user} currentBalance of ${fromWei(account.currentBalanceUSDC,18)} should be greater than startBalance of ${fromWei(account.startBalanceUSDC,18)}`);
        
          // add to total earnings
          earningsTotalUSDC=earningsTotalUSDC.add(account.currentBalanceUSDC.sub(account.startBalanceUSDC));
        }
        console.log(`\n    user earnings USDC: \x1b[32m${fromWei(earningsTotalUSDC,18).padStart(24)}\x1b[0m USDC`);
        console.log(`    insurance earnings: \x1b[32m${fromWei(insuranceEarnings,18).padStart(24)}\x1b[0m USDC`);
        console.log(`\n   conversions to USDC: \x1b[32m${fromWei(totalUSDCconversions,18).padStart(24)}\x1b[0m USDC`);
        console.log(`    USDC sent directly: \x1b[32m${fromWei(totalUSDCsentDirectly,18).padStart(24)}\x1b[0m USDC`);
 
        console.log(`\n    ------------------------`);
        console.log(`             SUMMARY        `);
        console.log(`    ------------------------\n`);
        
        // calculate fees percentage
        let feesBalance = await lp0.balanceOf(fees.address);
        let insuranceBalance = feeEarnings.sub(feesBalance);
        let seniorPercent = BN.from(1000000).mul(earningsTotal).div(totalEarnings).toNumber()/10000.0;
        let insurancePercent = BN.from(1000000).mul(insuranceBalance).div(totalEarnings).toNumber()/10000.0;
        let feesPercent = BN.from(1000000).mul(feesBalance).div(totalEarnings).toNumber()/10000.0;
        let totalPercent = seniorPercent+insurancePercent+feesPercent;
        
        console.log(`    senior %   : \x1b[32m${seniorPercent.toFixed(2).padStart(6)}%\x1b[0m ${lpName} rewards -> \x1b[33m${Math.round(seniorPercent).toString().padStart(3)}%\x1b[0m `);
        console.log(`    insurance %: \x1b[32m${insurancePercent.toFixed(2).padStart(6)}%\x1b[0m ${lpName} rewards -> \x1b[33m${Math.round(insurancePercent).toString().padStart(3)}%\x1b[0m`);
        console.log(`    treasury % : \x1b[32m${feesPercent.toFixed(2).padStart(6)}%\x1b[0m ${lpName} rewards -> \x1b[33m${Math.round(feesPercent).toString().padStart(3)}%\x1b[0m`);
        console.log("    ".padEnd(53,"-"));
        console.log(`    total %    : \x1b[32m${totalPercent.toFixed(2).padStart(6)}%\x1b[0m ${lpName} rewards -> \x1b[33m${Math.round(totalPercent).toString().padStart(3)}%\x1b[0m`);
        
        let poolBalance = await lp0.balanceOf(saffronPoolV20.address);
        let balanceOfAutocompounder1 = await autocompounder0.get_mojito_chef_holdings();
        let feesHoldings=await saffronPoolV20.fees_holdings();

        console.log(`    pool balanceOf                     : \x1b[32m${fromWei(poolBalance).padStart(24)}\x1b[0m ${lpName}`);
        console.log(`    autocompounder0 bal                : \x1b[32m${fromWei(balanceOfAutocompounder1).padStart(24)}\x1b[0m ${lpName}`);
        console.log(`    fees_holdings                      : \x1b[32m${fromWei(feesHoldings).padStart(24)}\x1b[0m ${lpName}`);
        if(!feesHoldings.isZero()) {
          await saffronPoolV20.connect(deployer).withdraw_fees(fees.address);
          console.log(`    WITHDRAWING FEES                   : \x1b[32m${fromWei(feesHoldings).padStart(24)}\x1b[0m ${lpName}`);
          feesHoldings=await saffronPoolV20.fees_holdings();
          console.log(`    fees_holdings after withdrawing    : \x1b[32m${fromWei(feesHoldings).padStart(24)}\x1b[0m ${lpName}`);
        }
        
        // display all balances
        console.log(`\n    --- CONTRACT STATE AFTER INITIAL TESTS --- `);
        console.log(`    >>> senior_token_balance   : \x1b[32m${(await saffronPoolV20.senior_token_supply()).mul((await saffronPoolV20.senior_exchange_rate())).div('10000000000000000000000000000')}\x1b[0m`);
        console.log(`    >>> fees_token_balance     : \x1b[32m${(await saffronPoolV20.fees_holdings())}\x1b[0m`);
        
        balanceOfAutocompounder = await autocompounder0.get_mojito_chef_holdings();
        console.log(`    >>> autocompounder0 balance (LP tokens) : \x1b[32m${fromWei(balanceOfAutocompounder).padStart(24)}\x1b[0m ${lpName}\n`);        
        
      });
    }
  });

  it("should have SaffronPoolV2 sweep_erc work correctly", async ()=> {
    // sweep_erc incorrectly
    await expect(saffronPoolV2.connect(alex).sweep_erc(mlp.address, alex.address)).to.be.revertedWith("must be governance");

    // sweep_erc correctly
    let qlp_bal_before = await mlp.balanceOf(deployer.address);
    await expect(saffronPoolV2.connect(deployer).sweep_erc(mlp.address, deployer.address)).to.not.be.reverted;

    // transfer exact amount back to pool so we don't revert the rest of the tests unexpectedly
    let qlp_bal_after = await mlp.balanceOf(deployer.address);
    await mlp.connect(deployer).transfer(saffronPoolV2.address, qlp_bal_after.sub(qlp_bal_before));
  });

  it("should have SaffronMojitoAutocompounder reset_approvals work correctly", async ()=> {
    
    //check that autocompounder allowance over the LP token is not full
    let allowanceLP=await mlp.connect(deployer).allowance(autocompounder.address, MOJITOCHEF);
    expect(allowanceLP).to.not.be.eql(BN.from("340282366920938463463374607431768211455"), "allowanceLP should not equal max allowance");

    //check that autocompounder allowance over the conversion tokens is not full
    for(let i=0;i<1;i++) {
      let conversion = await autocompounder.conversions(i);
      let token_from = await hre.ethers.getContractAt("IERC20",conversion.token_from);
      let token_to = await hre.ethers.getContractAt("IERC20",conversion.token_to);
      let token_from_allowance=await token_from.allowance(autocompounder.address, conversion.router);
      let token_to_allowance=await token_to.allowance(autocompounder.address, conversion.router);
      expect(token_from_allowance).to.not.be.eql(BN.from("340282366920938463463374607431768211455"), "token_from_allowance should not equal max allowance");
      expect(token_to_allowance).to.not.be.eql(BN.from("340282366920938463463374607431768211455"), "token_to_allowance should not equal max allowance");
    }

    // reset all allowances
    await expect(autocompounder.connect(deployer).reset_approvals()).to.not.be.reverted;

    // check that autocompounder allowance over the LP token is full
    allowanceLP=await mlp.connect(deployer).allowance(autocompounder.address, MOJITOCHEF);
    expect(allowanceLP).to.be.eql(BN.from("340282366920938463463374607431768211455"), "allowanceLP should equal max allowance");

    //check that autocompounder allowance over the conversion tokens is full
    for(let i=0;i<1;i++) {
      let conversion = await autocompounder.conversions(i);
      let token_from = await hre.ethers.getContractAt("IERC20",conversion.token_from);
      let token_to = await hre.ethers.getContractAt("IERC20",conversion.token_to);
      let token_from_allowance=await token_from.allowance(autocompounder.address, conversion.router);
      let token_to_allowance=await token_to.allowance(autocompounder.address, conversion.router);
      expect(token_from_allowance).to.be.eql(BN.from("340282366920938463463374607431768211455"), "token_from_allowance should equal max allowance");
      expect(token_to_allowance).to.be.eql(BN.from("340282366920938463463374607431768211455"), "token_to_allowance should equal max allowance");
    }

  });

  it("should have SaffronMojitoAutocompounder blend work correctly", async ()=> {
	  await expect(autocompounder.connect(alex).blend(toWei(1))).to.be.revertedWith("must be adapter");
    await expect(autocompounder.connect(deployer).blend(toWei(1))).to.be.revertedWith("must be adapter");
  });

  it("should have SaffronMojitoAutocompounder spill work correctly", async ()=> {
	  await expect(autocompounder.connect(alex).spill(toWei(1),deployer.address)).to.be.revertedWith("must be adapter");
    await expect(autocompounder.connect(deployer).spill(toWei(1), deployer.address)).to.be.revertedWith("must be adapter");
  });
 
});

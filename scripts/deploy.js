const hre = require("hardhat")
const { toWei } = require("../test/testHelper");
const { BigNumber: BN } = require("ethers")

// Constants
const REMOVE_LIQUIDITY_FLAG = BN.from(1);
const SWAP_LIQUIDITY_FLAG   = BN.from(2);
const ADD_LIQUIDITY_FLAG    = BN.from(4);
const SUPPORT_FEE_FLAG      = BN.from(8);

// Farm contracts
const MOJITO_FACTORY = "0x79855a03426e15ad120df77efa623af87bd54ef3";   // MojitoSwap router
const MOJITO_ROUTER = "0x8c8067ed3bC19ACcE28C1953bfC18DC85A2127F7";   // MojitoSwap router
const MOJITOCHEF  = "0x25c6d6a65c3ae5d41599ba2211629b24604fea4f";     // MojitoChef

const MJT = "0x2ca48b4eea5a731c2b54e7c3944dbdb87c0cfb6f";
const KCS = "0x4446fc4eb47f2f6586f9faab68b3498f86c07521";
const SFI = "0xd55d9df77b23a7455613f2244ee4b6a45b6e2d00";
const USDT = "0x0039f574ee5cc39bdd162e9a88e3eb1f111baf48";
const ETH = "0xf55af137a98607f7ed2efefa4cd2dfe70e4253b1";
const USDC = "0x980a5afef3d17ad98635f6c5aebcbaeded3c3430";
const BTC = "0xfa93c12cd345c658bc4644d1d4e1b9615952258c";

// -------------------------
//   TODO: TO MAKE NEW POOL: 
// -------------------------

// - update TOKEN_A, TOKEN_B ERC20 addresses
const TOKEN_A = MJT;
const TOKEN_B = KCS;

//const TOKEN_A = MJT;
//const TOKEN_B = USDT;

//const TOKEN_A = KCS;
//const TOKEN_B = USDT;

//const TOKEN_A = MJT;
//const TOKEN_B = USDC;

//const TOKEN_A = KCS;
//const TOKEN_B = USDC;

//const TOKEN_A = USDT;
//const TOKEN_B = USDC;

//const TOKEN_A = ETH;
//const TOKEN_B = KCS;

//const TOKEN_A = BTC;
//const TOKEN_B = KCS;

//const TOKEN_A = MJT;
//const TOKEN_B = SFI;

// - update CONVERSIONS
const CONVERSIONS = [[MOJITO_ROUTER], [TOKEN_A], [TOKEN_B], [BN.from('50')], [SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG|ADD_LIQUIDITY_FLAG]];

const CONVERSIONS2 = [[MOJITO_ROUTER,MOJITO_ROUTER], [MJT,TOKEN_A], [TOKEN_A,TOKEN_B], [BN.from("100"),BN.from("50")], [SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG,SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG|ADD_LIQUIDITY_FLAG]];


// -------------------------
//   END TODO
// -------------------------

// calculated constants
let TOKEN_LP, TOKEN_A_SYMBOL, TOKEN_B_SYMBOL, LP_SYMBOL, PID;

async function main() {
  console.log(`Deploying to ${hre.network.name}`);
  let factory = await hre.ethers.getContractAt("IUniswapV2Factory",MOJITO_FACTORY);
  TOKEN_LP = await factory.getPair(TOKEN_A, TOKEN_B);
  console.log("TOKEN_LP:",TOKEN_LP);
  
  let token_a = await hre.ethers.getContractAt("ERC20",TOKEN_A);
  TOKEN_A_SYMBOL = await token_a.symbol();
  console.log("TOKEN_A_SYMBOL:",TOKEN_A_SYMBOL);

  let token_b = await hre.ethers.getContractAt("ERC20",TOKEN_B);
  TOKEN_B_SYMBOL = await token_b.symbol();
  console.log("TOKEN_B_SYMBOL:",TOKEN_B_SYMBOL);
  
  LP_SYMBOL = TOKEN_A_SYMBOL + "/" + TOKEN_B_SYMBOL;
  
  // Look up pool id for LP in master chef
  let chef = await hre.ethers.getContractAt("IMojitoChef",MOJITOCHEF);
  let poolLength = await chef.poolLength();
  PID = -1;
  for(let i=0; i<poolLength; i++) {
    let poolInfo = await chef.poolInfo(i);
    let address = poolInfo[0].toLowerCase();
    if(address == TOKEN_LP.toLowerCase()) {
        PID = i;
        break;
    }
  }
  
  // If pool ID is not found then exit 
  if(PID==-1) {
    console.log(`ERROR: No pool found with LP token of ${PID}`);  
    return;
  }
  console.log("CHEF PID:",PID);
  
  // Deploy pools
  await deploySaffronV2Pool();
}

async function deploySaffronV2Pool(
) {
  console.log(`\x1B[36mCreating pool Saffron V2 MojitoChef ${LP_SYMBOL} Autocompounding Pool\x1b[0m`);
  
  let adapterName = `MojitoChef ${LP_SYMBOL} MLP Adapter`;
  // Deploy adapter
  let SaffronAdapter = await hre.ethers.getContractFactory("Saffron_Mojito_Adapter");
  let adapter = await SaffronAdapter.deploy(TOKEN_LP, adapterName);
  console.log(`📃🆕 \x1b[32m${adapter.address}\x1b[0m Saffron_Mojito_Adapter (${adapterName}) deployed`);

  // Deploy autocompounder
  let SaffronAutocompounder = await hre.ethers.getContractFactory("SaffronMojitoAutocompounder");
  let autocompounder = await SaffronAutocompounder.deploy(adapter.address, TOKEN_LP, PID, MOJITO_ROUTER, MOJITOCHEF);
  console.log(`📃🆕 \x1b[32m${autocompounder.address}\x1b[0m SaffronMojitoAutocompounder for ${adapterName} deployed`);
  await adapter.set_autocompounder(autocompounder.address);

  // Initialize autocompounder with Converter's init_conversions initialization call
  if(TOKEN_A.toLowerCase()==MJT.toLowerCase()) {
      await autocompounder.init_conversions(...CONVERSIONS);
      console.log(`  SaffronMojitoAutocompounder init_conversions set to:`);
      console.log(`  \x1b[33m${adapter.address} ${CONVERSIONS} \x1b[0m`);
  } else {
      await autocompounder.init_conversions(...CONVERSIONS2);
      console.log(`  SaffronMojitoAutocompounder init_conversions set to:`);
      console.log(`  \x1b[33m${adapter.address} ${CONVERSIONS2} \x1b[0m`);
  }
  
  // Deploy SaffronPoolV2
  let SaffronPoolV2 = await hre.ethers.getContractFactory("SaffronPoolV2");
  let saffronPoolV2 = await SaffronPoolV2.deploy(adapter.address, TOKEN_LP, `Saffron Autocompounder Position Token MOJITOSWAP[${LP_SYMBOL} MLP]`,`SAFF-LP-MOJITOSWAP[${LP_SYMBOL} MLP]`,`Saffron V2 MojitoChef ${LP_SYMBOL} Autocompounding Pool`);
  console.log(`📃🆕 \x1b[32m${saffronPoolV2.address}\x1b[0m SaffronPoolV2 for ${TOKEN_LP} deployed`);

  // Get saffronPositionToken
  let address = await saffronPoolV2.position_token();
  let saffronPositionToken = await hre.ethers.getContractAt("SaffronPositionToken", address);
  console.log(`📃🆕 \x1b[32m${saffronPositionToken.address}\x1b[0m SaffronPositionToken deployed`);

  // Get saffronPositionNFT
  address = await saffronPoolV2.NFT();
  let saffronPositionNFT = await hre.ethers.getContractAt("SaffronPositionNFT", address);
  console.log(`📃🆕 \x1b[32m${saffronPositionNFT.address}\x1b[0m SaffronPositionNFT deployed`);

  // set adapter's pool
  await adapter.set_pool(saffronPoolV2.address);
  console.log(`  Saffron_Mojito_Adapter's pool set to: \x1b[33m${saffronPoolV2.address}\x1b[0m`);

  // set shut_down to false
  await saffronPoolV2.shut_down_pool(false);
  console.log(`  SaffronPoolV2 shut_down set to: `, false);
  
  // set disable_deposits to false
  await saffronPoolV2.disable_deposits(false);
  console.log(`  SaffronPoolV2 disable_deposits set to: `, false);
  
  // setup insurance fund
  let SaffronInsuranceFund = await hre.ethers.getContractFactory("SaffronInsuranceFund");
  let fund = await SaffronInsuranceFund.deploy(USDC, TOKEN_LP);
  console.log(`SaffronInsuranceFund deployed to: \x1b[32m${fund.address}\x1b[0m`);

  // set pool's fee manager to fund
  await saffronPoolV2.set_fee_manager(fund.address);
  console.log(`pool's fee manager set to fund address: \x1b[32m${fund.address}\x1b[0m`);
  
  // set fund's pool to saffronPoolV2 address
  await fund.set_pool(saffronPoolV2.address);
  console.log(`fund's pool manager set to pool address: \x1b[32m${saffronPoolV2.address}\x1b[0m`);

  // initialize fund's conversions
  let routers,tokens_from,tokens_to,percentages,operations;
  
  if(TOKEN_B.toLowerCase()!=USDC.toLowerCase()) {
      routers =     [MOJITO_ROUTER,         MOJITO_ROUTER,                        MOJITO_ROUTER                       ];
      tokens_from = [TOKEN_A,               TOKEN_A,                              TOKEN_B                             ];
      tokens_to =   [TOKEN_B,               USDC,                                 USDC                                ];
      percentages = [BN.from(100),          BN.from(100),                         BN.from(100)                        ];
      operations =  [REMOVE_LIQUIDITY_FLAG, SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG, SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG];
    
      await fund.init_conversions(routers, tokens_from, tokens_to, percentages, operations);
      console.log(`SaffronInsuranceFund init_conversions is set:`);
      console.log(`\x1b[32m - [MOJITO_ROUTER, MOJITO_ROUTER, MOJITO_ROUTER]\x1b[0m`);
      console.log(`\x1b[32m - [TOKEN_A,       TOKEN_A,       TOKEN_B      ]\x1b[0m`);
      console.log(`\x1b[32m - [TOKEN_B,       USDC,          USDC         ]\x1b[0m`);
      console.log(`\x1b[32m - [BN.from(100),  BN.from(100),  BN.from(100) ]\x1b[0m`);
      console.log("");    
  } else {
      routers =     [MOJITO_ROUTER,         MOJITO_ROUTER                       ];
      tokens_from = [TOKEN_A,               TOKEN_A                             ];
      tokens_to =   [TOKEN_B,               USDC                                ];
      percentages = [BN.from(100),          BN.from(100)                        ];
      operations =  [REMOVE_LIQUIDITY_FLAG, SWAP_LIQUIDITY_FLAG|SUPPORT_FEE_FLAG];
    
      await fund.init_conversions(routers, tokens_from, tokens_to, percentages, operations);
      console.log(`SaffronInsuranceFund init_conversions is set:`);
      console.log(`\x1b[32m - [MOJITO_ROUTER, MOJITO_ROUTER]\x1b[0m`);
      console.log(`\x1b[32m - [TOKEN_A,       TOKEN_A      ]\x1b[0m`);
      console.log(`\x1b[32m - [TOKEN_B,       USDC         ]\x1b[0m`);
      console.log(`\x1b[32m - [BN.from(100),  BN.from(100) ]\x1b[0m`);
      console.log("");    
  }
  /* hardhat verify:verify not yet available on KCC explorer
  await verifyContract(adapter, [MJT_WKCS_LP, "MojitoChef MJT/WKCS MLP Adapter"]);
  await verifyContract(autocompounder, [adapter.address, MJT_WKCS_LP, PID, MOJITO_ROUTER, MOJITOCHEF]);
  await verifyContract(saffronPoolV2, [adapter.address, MJT_WKCS_LP,"Saffron Autocompounder Position Token MOJITOSWAP[MJT/WKCS MLP]","SAFF-LP-MOJITOSWAP[MJT/WKCS MLP]"]);
  await verifyContract(saffronPositionToken, ["SaffronPositionToken",address]);
  */
}



// Wait a minute for verification on etherscan
/*
async function verifyContract(contract, constructorArgs) {
  // Check for supported networks
  if (hre.network.name == 'polygon_main') {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    console.log(`--- Verifying contract at ${contract.address} on etherscan`);
    await contract.deployed();
    await delay(60000); // 60 seconds
    await hre.run("verify:verify", { address: contract.address, constructorArguments: constructorArgs });
    console.log(`--- Verification process ended\n\n`);
  }
}
*/

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

  

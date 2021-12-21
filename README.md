# Saffron V2 MojitoSwap

Saffron V2 adapter for MojitoSwap on Kucoin Community Chain

## Development

1. Install the dependencies.

```
npm install
```

2. Create `secrets.json` file in your root directory.

```
  "kcc_rpc": "https://rpc-mainnet.kcc.network",
  "kcc_main_mnemonic": "... ... ...",
```

3. To compile the contracts, use this command.

```bash
  npm run compile
```

## Deploy

Start a local node

```bash
  npx hardhat node
```

In a separate terminal or command window, deploy the contracts to localhost network, use these commands:

First, verify deploy.js has the following lines uncommented and the rest of the pairs commented:

```
const TOKEN_A = MJT;
const TOKEN_B = KCS;
```

```bash
  npm run deploy:localhost
```

At this point, you need the SaffronPoolV2 contract address to update the UI web page; the rest of the addresses will be gotten from that address

Then add some test tokens:

```bash
  npm run deployHelper:localhost
```

At this point you can deposit to the insurance fund and then try unlocking one of the NFT Positions.
After initiating the unlock, in the open terminal type:

```bash
  npx hardhat console --network localhost
```

Once the console is running, type in these commands to advance the chain 800,000 seconds (just over a week)

```bash
  await hre.network.provider.send("evm_increaseTime", [800000]);
  await hre.network.provider.send("evm_mine");
```

At this point, that position NFT should be unlocked completely; you can repeat this chain advancing as needed to do more tests

To deploy the contracts to kcc mainnet, use this command.

```bash
  npm run deploy:kcc
```

## Test

To test the contracts, use this command.

```bash
  npm test
```



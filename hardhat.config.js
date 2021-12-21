const {task} = require("hardhat/config")
const secrets = require("./secrets.json")

require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan");
require("solidity-coverage");
require("hardhat-gas-reporter")
const {removeConsoleLog} = require("hardhat-preprocessor")

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    hardhat: {
      chainId: 321,
      gasPrice: 1e9,
      forking: {
        url: secrets.kcc_rpc ? secrets.kcc_rpc : 'https://rpc-mainnet.kcc.network',
        blockNumber: 4775100
      },
      accounts: {
        mnemonic: secrets.kcc_main_mnemonic
      }
    },
    bsc_main: {
      chainId: 0x38,
      gasPrice: 21e9,
      url: secrets.bsc_rpc ? secrets.bsc_rpc : "https://bsc-dataseed.binance.org/",
      accounts: {
        mnemonic: secrets.bsc_main_mnemonic,
      }
    },
    polygon_main: {
      chainId: 137,
      gasPrice: 200e9,
      url: secrets.polygon_rpc ? secrets.polygon_rpc : 'https://rpc-mainnet.maticvigil.com/',
      timeout: 50000,
      accounts: {
        mnemonic: secrets.polygon_main_mnemonic
      }
    },
    heco_main: {
      chainId: 128,
      gasPrice: 2e9,
      url: secrets.heco_rpc ? secrets.heco_rpc : 'https://http-mainnet-node.huobichain.com/',
      accounts: {
        mnemonic: secrets.heco_main_mnemonic
      }
    },
    kcc_main: {
      chainId: 321,
      gasPrice: 3e9,
      url: secrets.kcc_rpc ? secrets.kcc_rpc : 'https://rpc-mainnet.kcc.network',
      accounts: {
        mnemonic: secrets.kcc_main_mnemonic
      }
    },
    eth_main: {
      chainId: 1,
      gasPrice: 35e9,
      url: secrets.eth_rpc ? secrets.eth_rpc : 'https://cloudflare-eth.com/',
      accounts: {
        mnemonic: secrets.eth_main_mnemonic
      }
    },
    no_logs: {
      // dummy network for generating source stripped of console.log
      url: "localhost"
    }
  },
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999
      }
    }
  },
  mocha: {
    timeout: 1800000
  },
  gasReporter: {
    enabled: !!(process.env.REPORT_GAS),
    coinmarketcap: '', // https://coinmarketcap.com/api/pricing/
    currency: 'USD',
    gasPrice: 21
  },
  preprocess: {
    // Remove console.log from deployed code
    eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat' && hre.network.name !== 'localhost' || !!(process.env.REPORT_GAS)),
  },
  etherscan: {
    // Your API key for Etherscan and its friends
    apiKey: secrets.polygon_etherscan_key
  }
}

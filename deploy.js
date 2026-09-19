require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: PRIVATE_KEY is missing in .env file!');
    console.log('Please create a .env file with your Monad Testnet private key:');
    console.log('PRIVATE_KEY=0xyour_private_key_here');
    console.log('MONAD_RPC_URL=https://testnet-rpc.monad.xyz');
    process.exit(1);
  }

  const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
  const provider = new ethers.JsonRpcProvider(rpcUrl, {
    chainId: 10143,
    name: 'monad-testnet'
  });

  const wallet = new ethers.Wallet(privateKey.trim(), provider);
  console.log('==========================================================');
  console.log('  MONAD QUEUE PLATFORM: CONTRACT DEPLOYMENT');
  console.log('==========================================================');
  console.log('Network:     Monad Testnet (Chain ID 10143)');
  console.log('RPC:        ', rpcUrl);
  console.log('Deployer:   ', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:    ', ethers.formatEther(balance), 'MON');

  if (balance === 0n) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: Deployer balance is 0 MON! Fund this wallet from Monad Testnet faucet first.');
    process.exit(1);
  }

  const compiledPath = path.join(__dirname, 'contracts', 'out_compiled.json');
  if (!fs.existsSync(compiledPath)) {
    console.log('Compiled artifact not found, compiling now...');
    require('./compile.js');
  }

  const { abi, bytecode } = JSON.parse(fs.readFileSync(compiledPath, 'utf8'));

  console.log('\nDeploying MonadQueuePlatform contract to Monad Testnet...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log('Waiting for deployment transaction confirmation...');
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('\x1b[32m%s\x1b[0m', '\nDEPLOYMENT SUCCESSFUL! 🎉');
  console.log('Contract Address:', deployedAddress);
  console.log('Tx Hash:         ', txHash);
  console.log('MonadScan:       ', `https://testnet.monadscan.com/address/${deployedAddress}`);
  console.log('Tx MonadScan:    ', `https://testnet.monadscan.com/tx/${txHash}`);

  // Update web/contractAbi.js
  const contractAbiJsPath = path.join(__dirname, 'web', 'contractAbi.js');
  const abiContent = `// MonadQueuePlatform ABI and Constants for Monad Testnet
(() => {
  const MONAD_TESTNET_CHAIN_ID = 10143;
  const MONAD_TESTNET_RPC = "${rpcUrl}";
  const MONAD_EXPLORER = "https://testnet.monadscan.com";
  const CONTRACT_ADDRESS = "${deployedAddress}";
  const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)};

  if (typeof window !== "undefined") {
    window.MONAD_CONFIG = {
      MONAD_TESTNET_CHAIN_ID,
      MONAD_TESTNET_RPC,
      MONAD_EXPLORER,
      CONTRACT_ADDRESS,
      CONTRACT_ABI
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_RPC, MONAD_EXPLORER, CONTRACT_ADDRESS, CONTRACT_ABI };
  }
})();
`;
  fs.writeFileSync(contractAbiJsPath, abiContent, 'utf8');
  console.log('\nUpdated web/contractAbi.js with new contract address & ABI.');

  // Update verify.json
  const verifyJsonPath = path.join(__dirname, 'verify.json');
  const verifyContent = {
    chainId: 10143,
    contractAddress: deployedAddress,
    contractName: "src/MonadQueuePlatform.sol:MonadQueuePlatform",
    compilerVersion: "v0.8.28",
    notes: "Verification payload for https://agents.devnads.com/v1/verify."
  };
  fs.writeFileSync(verifyJsonPath, JSON.stringify(verifyContent, null, 2), 'utf8');
  console.log('Updated verify.json with new contract address.');
  console.log('==========================================================');
}

main().catch((err) => {
  console.error('\nDeployment error:', err);
  process.exit(1);
});

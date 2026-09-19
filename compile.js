const fs = require('fs');
const path = require('path');
const solc = require('solc');

const contractPath = path.join(__dirname, 'contracts', 'src', 'MonadQueuePlatform.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'MonadQueuePlatform.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

console.log('Compiling MonadQueuePlatform.sol...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasErrors = false;
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.formattedMessage);
    if (err.severity === 'error') hasErrors = true;
  }
}

if (!hasErrors) {
  const contract = output.contracts['MonadQueuePlatform.sol']['MonadQueuePlatform'];
  console.log('Compilation SUCCESS!');
  console.log('Bytecode size:', contract.evm.bytecode.object.length / 2, 'bytes');
  fs.writeFileSync('contracts/out_compiled.json', JSON.stringify({
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  }, null, 2));
} else {
  console.error('Compilation failed with errors.');
  process.exit(1);
}

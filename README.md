# Fuzzhead - o1js Smart Contract Fuzzer

A comprehensive fuzzing tool for testing Mina blockchain smart contracts built with [o1js](https://docs.minaprotocol.com/zkapps/o1js). Fuzzhead automatically discovers, deploys, and tests smart contract methods with randomized inputs to identify potential vulnerabilities and edge cases.

## ✨ Features

- **Automatic Contract Discovery** - Scans TypeScript files and identifies o1js SmartContract classes
- **Method Detection** - Finds all `@method`-decorated functions for comprehensive testing
- **Local Blockchain Simulation** - Uses Mina LocalBlockchain for safe, isolated testing
- **Smart Type Generation** - Generates valid mock data for standard o1js types (`Field`, `Bool`, `UInt32`, `PublicKey`, etc.)
- **Flexible Testing Modes** - Supports both proof-enabled and proof-disabled testing
- **Detailed Reporting** - Clear pass/fail/skip statistics with actionable error messages

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ (recommended for o1js compatibility)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd Fuzzhead

# Install dependencies
npm install

# Verify installation
node src/fuzz-local.mjs --help
```

### Basic Usage

```bash
# Test a smart contract (with proofs enabled)
node src/fuzz-local.mjs path/to/YourContract.ts

# Fast testing (proofs disabled)
COMPILE=0 node src/fuzz-local.mjs path/to/YourContract.ts

# Skip initialization method
SKIP_INIT=1 node src/fuzz-local.mjs path/to/YourContract.ts
```

## 📋 Supported Types

Fuzzhead automatically generates test data for these o1js types:

- **Field types**: `Field`, `Bool`, `UInt8`, `UInt32`, `UInt64`
- **Cryptographic types**: `PublicKey`, `PrivateKey`, `Signature`, `Group`, `Scalar`
- **Primitive types**: `string`, `number`, `boolean`
- **Arrays**: Any array of supported types (e.g., `Field[]`, `Bool[]`)

Methods with unsupported custom types are gracefully skipped with clear reporting.

## 🎯 Example Output

```
Fuzzing file: fuzz-local-bundle.mjs
   (Source: hello-world.ts)
--------------------------------------------------
Imported module exports: HelloWorld, adminPrivateKey, adminPublicKey
Found 3 exports in the module.
  - Found class: HelloWorld
✅ Found SmartContract: HelloWorld
--------------------------------------------------
- Compiling HelloWorld...
- Compilation successful.
- Instantiated HelloWorld successfully.
- Deployed HelloWorld to local Mina.
- Ran init() in a separate transaction.
  -> Calling HelloWorld.update({...Field}, {...PrivateKey})... ❌ Error
     Message: Field.assertEquals(): 4 != 3410760802053037232579132740112414657897109365132631180492412394013181432615

🏁 Fuzzing complete:
   ✅ 0 method(s) passed
   ❌ 1 method(s) failed  
   📊 Total: 1 method(s) tested
```

## ⚙️ Configuration Options

### Environment Variables

| Variable    | Default        | Description                                                |
| ----------- | -------------- | ---------------------------------------------------------- |
| `COMPILE`   | `1` (enabled)  | Set to `0` to disable proof compilation for faster testing |
| `SKIP_INIT` | `0` (disabled) | Set to `1` to skip calling the contract's `init()` method  |

### Usage Examples

```bash
# Full testing with proofs (recommended for production)
node src/fuzz-local.mjs contracts/MyContract.ts

# Fast development testing
COMPILE=0 SKIP_INIT=1 node src/fuzz-local.mjs contracts/MyContract.ts

# Test contract with init but no proofs
COMPILE=0 node src/fuzz-local.mjs contracts/MyContract.ts
```

## 📁 Project Structure

```
Fuzzhead/
├── src/
│   ├── fuzz-local.mjs          # Local fuzzing runner
├── test-contracts/             # Example contracts for testing
│   ├── hello-world.ts
│   ├── sudoku.ts
│   └── merkle.ts
└── .fuzz/                      # Generated build artifacts
```

## 🔧 Advanced Usage

### Testing Custom Contracts

1. **Standard o1js Contract** (recommended):
```typescript
import { SmartContract, method, Field, Bool } from 'o1js';

export class MyContract extends SmartContract {
  @method async myMethod(value: Field, flag: Bool) {
    // Contract logic here
  }
}
```

2. **With Custom Types** (methods will be skipped):
```typescript
class CustomStruct extends Struct({ data: Field }) {}

export class MyContract extends SmartContract {
  @method async myMethod(custom: CustomStruct) {
    // This method will be skipped due to custom type
  }
}
```

### Understanding Results

- **✅ Passed**: Method executed successfully without errors
- **❌ Failed**: Method threw an error (including business logic validation failures)  
- **⏭️ Skipped**: Method uses unsupported parameter types

## 🐛 Troubleshooting

### Common Issues

1. **"ENOENT: plonk_wasm_bg.wasm"**
   - **Solution**: Use Node.js 20 and reinstall dependencies
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **"Invalid fee excess" errors**
   - **Solution**: Use existing test accounts (automatically handled in current version)

3. **"Authorization does not match" errors**
   - **Solution**: Use `COMPILE=0` for faster testing or `SKIP_INIT=1` for contracts with complex init methods

4. **All methods skipped**
   - **Reason**: Contract uses custom types not supported by the fuzzer
   - **Solution**: This is expected behavior for domain-specific contracts

<!-- ## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

[License information] -->

## 🔗 Links

- [o1js Documentation](https://docs.minaprotocol.com/zkapps/o1js)
- [Mina Protocol](https://minaprotocol.com/)
- [Extropy](https://www.extropy.io/)
- [X](https://x.com/Extropy)

---

**Built for the Mina ecosystem** 🚀
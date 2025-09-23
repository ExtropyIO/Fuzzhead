# Fuzzhead - o1js Smart Contract Fuzzer

A comprehensive fuzzing tool for testing Mina blockchain smart contracts built with [o1js](https://docs.minaprotocol.com/zkapps/o1js). Fuzzhead automatically discovers, deploys, and tests smart contract methods with randomized inputs to identify potential vulnerabilities and edge cases.

## ✨ Features

- **Automatic Contract Discovery** - Scans TypeScript files and identifies o1js SmartContract classes
- **Method Detection** - Finds all `@method`-decorated functions for comprehensive testing
- **Configurable Fuzz Testing** - Run multiple iterations per method with random inputs (default: 200 iterations)
- **Local Blockchain Simulation** - Uses Mina LocalBlockchain for safe, isolated testing
- **Smart Type Generation** - Generates valid mock data for standard o1js types (`Field`, `Bool`, `UInt32`, `PublicKey`, etc.)
- **Flexible Testing Modes** - Supports both proof-enabled and proof-disabled testing
- **Enhanced Error Reporting** - Shows detailed error messages for failed tests to aid debugging

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

# Verify installation (run without arguments to see usage)
node src/fuzz-local.mjs
```

### Basic Usage

```bash
# Test a smart contract (200 iterations per method, fast mode)
node src/fuzz-local.mjs path/to/YourContract.ts

# Enable full proof compilation (slower but more comprehensive)
COMPILE=1 node src/fuzz-local.mjs path/to/YourContract.ts

# Customize number of iterations
FUZZ_RUNS=50 node src/fuzz-local.mjs path/to/YourContract.ts
```

## 📋 Supported Types

Fuzzhead automatically generates test data for these o1js types:

- **Field types**: `Field`, `Bool`, `UInt8`, `UInt32`, `UInt64`
- **Cryptographic types**: `PublicKey`, `PrivateKey`, `Signature`, `Group`, `Scalar`
- **Primitive types**: `string`, `number`, `boolean`
- **Arrays**: Any array of supported types (e.g., `Field[]`, `Bool[]`)

Methods with unsupported custom types are gracefully skipped with clear reporting.

## 🎯 Example Output

### Success Case
```
Fuzzing file: simple-test.ts
--------------------------------------------------
Running 200 fuzz iterations per method
Available in module: SimpleTestContract
✅ Found SmartContract: SimpleTestContract
--------------------------------------------------
- Skipping compile SimpleTestContract...
- Running with proofs disabled (COMPILE=0).
- Instantiated SimpleTestContract successfully.
- Deployed SimpleTestContract to local Mina.
  ✅ SimpleTestContract.setValue() PASSED on iteration 1
  ✅ SimpleTestContract.increment() PASSED on iteration 1
  ✅ SimpleTestContract.reset() PASSED on iteration 1

🏁 Fuzzing complete:
   ✅ 800 runs passed
   ❌ 0 runs failed
   📊 Total: 800 runs across 4 method(s)
   🔄 200 iterations per method
```

### Failure Case with Detailed Errors
```
Fuzzing file: fail-test.ts
--------------------------------------------------
  ❌ FailTestContract.alwaysFails() FAILED on iteration 1: Field.assertEquals(): 741211 != 999999999
  ❌ FailTestContract.withdraw() FAILED on iteration 1: Insufficient balance!
  ✅ FailTestContract.divisionTest() PASSED on iteration 1
  ❌ FailTestContract.requireActive() FAILED on iteration 1: Contract is not active!

🏁 Fuzzing complete:
   ✅ 120 runs passed
   ❌ 680 runs failed
   📊 Total: 800 runs across 10 method(s)
   🔄 80 iterations per method
```

## ⚙️ Configuration Options

### Environment Variables

| Variable    | Default        | Description                                                       |
| ----------- | -------------- | ----------------------------------------------------------------- |
| `FUZZ_RUNS` | `200`          | Number of fuzz iterations per method                              |
| `COMPILE`   | `0` (disabled) | Set to `1` to enable proof compilation (slower but comprehensive) |
| `SKIP_INIT` | `1` (enabled)  | Set to `0` to call the contract's `init()` method                 |

### Usage Examples

```bash
# Standard fast testing (default: no proofs, skip init, 200 iterations)
node src/fuzz-local.mjs contracts/MyContract.ts

# Full comprehensive testing with proofs and init
COMPILE=1 SKIP_INIT=0 node src/fuzz-local.mjs contracts/MyContract.ts

# Quick development testing with fewer iterations
FUZZ_RUNS=50 node src/fuzz-local.mjs contracts/MyContract.ts

# Intensive testing for critical contracts
FUZZ_RUNS=1000 COMPILE=1 node src/fuzz-local.mjs contracts/MyContract.ts

# Test contract initialization without proofs
SKIP_INIT=0 node src/fuzz-local.mjs contracts/MyContract.ts
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

- **✅ Passed**: Method executed successfully without errors (shows iteration number)
- **❌ Failed**: Method threw an error (shows detailed error message and iteration number)  
- **⏭️ Skipped**: Method uses unsupported parameter types (summary count only)

### Interpreting Error Messages

The fuzzer now provides detailed error information to help debug contract issues:

- **Assertion Failures**: Shows expected vs actual values (e.g., `Field.assertEquals(): 741211 != 999999999`)
- **Validation Errors**: Shows custom error messages (e.g., `Insufficient balance!`, `Contract is not active!`)
- **Type Conversion Issues**: Shows o1js-specific errors (e.g., `x.toString() was called on a variable field element`)
- **Authorization Errors**: Shows transaction signing issues

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

3. **All methods skipped**
   - **Reason**: Contract uses custom types not supported by the fuzzer
   - **Solution**: This is expected behavior for domain-specific contracts
## 🔗 Links

- [o1js Documentation](https://docs.minaprotocol.com/zkapps/o1js)
- [Mina Protocol](https://minaprotocol.com/)
- [Extropy](https://www.extropy.io/)
- [X](https://x.com/Extropy)

---

**Built for the Mina ecosystem** 🚀
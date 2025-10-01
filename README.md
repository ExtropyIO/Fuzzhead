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
- **Input Value Logging** - Shows successful test inputs to understand contract behavior
- **State Management** - Properly handles contract state initialization and persistence

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
node src/fuzz-o1js.mjs
```

### Basic Usage

```bash
# Test a smart contract (200 iterations per method, fast mode)
node src/fuzz-o1js.mjs path/to/YourContract.ts

# Enable full proof compilation (slower but more comprehensive)
COMPILE=1 node src/fuzz-o1js.mjs path/to/YourContract.ts

# Customize number of iterations
FUZZ_RUNS=50 node src/fuzz-o1js.mjs path/to/YourContract.ts

# Skip contract initialization
SKIP_INIT=1 node src/fuzz-o1js.mjs path/to/YourContract.ts
```

## 📋 Supported Types

Fuzzhead automatically generates test data for these o1js types:

- **Field types**: `Field`, `Bool`, `UInt8`, `UInt32`, `UInt64`
- **Cryptographic types**: `PublicKey`, `PrivateKey`, `Signature`, `Group`, `Scalar`
- **Primitive types**: `string`, `number`, `boolean`
- **Arrays**: Any array of supported types (e.g., `Field[]`, `Bool[]`)

Methods with unsupported custom types are gracefully skipped with clear reporting.

## 🎯 Example Output

### Success Case with Input Logging
```
Fuzzing file: success-test.ts
--------------------------------------------------
Running 3 fuzz iterations per method
Available in module: SuccessTestContract
✅ Found SmartContract: SuccessTestContract
--------------------------------------------------
- Skipping compile SuccessTestContract...
- Running with proofs disabled (COMPILE=0).
- Instantiated SuccessTestContract successfully.
- Deployed SuccessTestContract to local Mina.
- Starting fuzzing of 5 method(s)...
- Fuzzing method: increment
  ✅ SuccessTestContract.increment() PASSED on iteration 1 with args: [15642306456140377162899274593397233099325979169677499799018088248912831241930]
  ✅ SuccessTestContract.increment() PASSED on iteration 2 with args: [17832682169112135381898627975876494676133537861074740613827092748443352213016]
  ✅ SuccessTestContract.increment() PASSED on iteration 3 with args: [20188935582657851009759262452091366309231774932170315181923662941721428845912]
- Fuzzing method: addToTotal
  ✅ SuccessTestContract.addToTotal() PASSED on iteration 1 with args: [180348]
  ✅ SuccessTestContract.addToTotal() PASSED on iteration 2 with args: [855373]
  ✅ SuccessTestContract.addToTotal() PASSED on iteration 3 with args: [461443]

🏁 Fuzzing complete:
   ✅ 12 runs passed
   ❌ 3 runs failed
   📊 Total: 15 runs across 5 method(s)
   🔄 3 iterations per method
```

<!-- ### Failure Case with Detailed Errors
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
``` -->

## ⚙️ Configuration Options

### Environment Variables

| Variable    | Default        | Description                                                       |
| ----------- | -------------- | ----------------------------------------------------------------- |
| `FUZZ_RUNS` | `200`          | Number of fuzz iterations per method                              |
| `COMPILE`   | `0` (disabled) | Set to `1` to enable proof compilation (slower but comprehensive) |
| `SKIP_INIT` | `0` (disabled) | Set to `1` to skip the contract's `init()` method                 |

### Usage Examples

```bash
# Standard fast testing (default: no proofs, with init, 200 iterations)
node src/fuzz-o1js.mjs contracts/MyContract.ts

# Full comprehensive testing with proofs and init
COMPILE=1 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Quick development testing with fewer iterations
FUZZ_RUNS=50 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Intensive testing for critical contracts
FUZZ_RUNS=1000 COMPILE=1 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Test contract initialization without proofs
SKIP_INIT=0 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Skip initialization for contracts that don't need it
SKIP_INIT=1 node src/fuzz-o1js.mjs contracts/MyContract.ts
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

- **✅ Passed**: Method executed successfully without errors (shows iteration number and input values)
- **❌ Failed**: Method threw an error   
- **⏭️ Skipped**: Method uses unsupported parameter types (summary count only)

### Interpreting Error Messages

The fuzzer now provides detailed error information to help debug contract issues:

- **Assertion Failures**: Shows expected vs actual values (e.g., `Field.assertEquals(): 741211 != 999999999`)
- **Validation Errors**: Shows custom error messages (e.g., `Insufficient balance!`, `Contract is not active!`)
- **Type Conversion Issues**: Shows o1js-specific errors (e.g., `x.toString() was called on a variable field element`)
- **Authorization Errors**: Shows transaction signing issues

### State Management

Fuzzhead properly handles contract state:

- **State Initialization**: Calls `init()` method when available to set up initial state
- **State Persistence**: Maintains state across multiple method calls within the same fuzzing session
- **State Consistency**: Uses `requireEquals()` patterns to ensure state consistency
- **Proof-Disabled Mode**: Handles state initialization differently when proofs are disabled

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

5. **Terminal hanging/floating**
   - **Solution**: The fuzzer now includes timeout protection and better error handling to prevent hanging

## 🔗 Links

- [o1js Documentation](https://docs.minaprotocol.com/zkapps/o1js)
- [Mina Protocol](https://minaprotocol.com/)
- [Extropy](https://www.extropy.io/)
- [X](https://x.com/Extropy)

---

**Built for the Mina ecosystem** 🚀
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
- **Unified State Management** - Handles contract initialization for both proof modes
- **Parameterless Method Skipping** - Automatically skips methods with no input parameters

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
✅ Found SmartContract: SuccessTestContract
--------------------------------------------------
- Running with proofs disabled (COMPILE=0).
- Deployed SuccessTestContract to local Mina.
- Skipping init() when proofs disabled to avoid authorization issues.
- Note: Some methods may fail due to uninitialized state - this is expected for fuzzing.
- Starting fuzzing of 5 method(s)...

- Fuzzing method: increment
  (No individual success logs - only failures are shown)

- Skipping method: toggleActive (no input parameters)

🏁 Fuzzing complete:
   ✅ 12 runs passed
   ❌ 3 runs failed
   📊 Total: 15 runs across 5 method(s)
   🔄 3 iterations per method
```

### Failure Case with Detailed Errors
```
Fuzzing file: fail-test.ts
--------------------------------------------------
✅ Found SmartContract: FailTestContract
--------------------------------------------------
- Running with proofs disabled (COMPILE=0).
- Deployed FailTestContract to local Mina.
- Skipping init() when proofs disabled to avoid authorization issues.
- Note: Some methods may fail due to uninitialized state - this is expected for fuzzing.
- Starting fuzzing of 10 method(s)...

- Fuzzing method: alwaysFails
  ❌ FailTestContract.alwaysFails() FAILED on iteration 1: Field.assertEquals(): 741211 != 999999999

- Fuzzing method: requireActive
  ❌ FailTestContract.requireActive() FAILED on iteration 1: Contract is not active!
  Bool.assertTrue(): false != true

- Skipping method: toggleActive (no input parameters)

- Fuzzing method: restrictedAccess
  ❌ FailTestContract.restrictedAccess() FAILED on iteration 1: fromBase58Check: invalid checksum

🏁 Fuzzing complete:
   ✅ 10 runs passed
   ❌ 35 runs failed
   📊 Total: 45 runs across 10 method(s)
   🔄 5 iterations per method
```

## ⚙️ Configuration Options

### Environment Variables

| Variable    | Default        | Description                                                       |
| ----------- | -------------- | ----------------------------------------------------------------- |
| `FUZZ_RUNS` | `200`          | Number of fuzz iterations per method                              |
| `COMPILE`   | `0` (disabled) | Set to `1` to enable proof compilation (slower but comprehensive) |
| `SKIP_INIT` | `1` (disabled) | Set to `0` to force init() execution (only works with COMPILE=1)  |

### Testing Modes

#### Fast Mode (`COMPILE=0`) - Default
- **Speed**: Fast execution, no proof compilation
- **Init Behavior**: Skips `init()` to avoid authorization issues
- **Use Case**: Quick development testing, finding edge cases
- **Expected**: Some methods may fail due to uninitialized state (this is good for fuzzing!)

#### Comprehensive Mode (`COMPILE=1`)
- **Speed**: Slower execution due to proof generation
- **Init Behavior**: Calls `init()` properly with full proving
- **Use Case**: Thorough testing with proper state initialization
- **Expected**: More methods should pass due to proper initialization

### Usage Examples

```bash
# Standard fast testing (default: no proofs, skip init, 200 iterations)
node src/fuzz-o1js.mjs contracts/MyContract.ts

# Full comprehensive testing with proofs and init
COMPILE=1 SKIP_INIT=0 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Quick development testing with fewer iterations
FUZZ_RUNS=50 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Intensive testing for critical contracts
FUZZ_RUNS=1000 COMPILE=1 SKIP_INIT=0 node src/fuzz-o1js.mjs contracts/MyContract.ts

# Test with proofs but skip init (if init has issues)
COMPILE=1 SKIP_INIT=1 node src/fuzz-o1js.mjs contracts/MyContract.ts
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

3. **Parameterless Methods** (automatically skipped):
```typescript
export class MyContract extends SmartContract {
  @method async toggleActive() {
    // This method will be skipped - no input parameters to fuzz
  }
}
```

### Understanding Results

- **✅ Passed**: Method executed successfully without errors (counted in summary, not logged individually)
- **❌ Failed**: Method threw an error (shows detailed error message)
- **⏭️ Skipped**: Method uses unsupported parameter types or has no parameters

### Interpreting Error Messages

The fuzzer provides detailed error information to help debug contract issues:

- **Assertion Failures**: Shows expected vs actual values (e.g., `Field.assertEquals(): 741211 != 999999999`)
- **Validation Errors**: Shows custom error messages (e.g., `Insufficient balance!`, `Contract is not active!`)
- **Type Conversion Issues**: Shows o1js-specific errors (e.g., `x.toString() was called on a variable field element`)
- **Authorization Errors**: Shows transaction signing issues
- **State Issues**: Shows uninitialized state errors (expected in fast mode)

### State Management

Fuzzhead uses a unified approach for state management:

#### Fast Mode (`COMPILE=0`)
- **Init Behavior**: Skips `init()` to avoid authorization issues
- **State**: Contract starts with default uninitialized state
- **Expected**: Some methods fail due to uninitialized state (this is valuable for fuzzing!)
- **Use Case**: Fast iteration, finding edge cases and error conditions

#### Comprehensive Mode (`COMPILE=1`)
- **Init Behavior**: Calls `init()` in a transaction with proper proving
- **State**: Contract is properly initialized with expected state
- **Expected**: More methods should pass due to proper initialization
- **Use Case**: Thorough validation with realistic contract state

## 🐛 Troubleshooting

### Common Issues

1. **"Authorization does not match" errors**
   - **Solution**: Use `COMPILE=0` for fast testing or `COMPILE=1` for comprehensive testing
   - **Note**: This is expected behavior - the fuzzer handles this automatically

2. **All methods failing due to uninitialized state**
   - **Expected in Fast Mode**: This is normal behavior when `COMPILE=0`
   - **Solution**: Use `COMPILE=1` for proper state initialization

3. **Compilation errors with invalid base58 keys**
   - **Solution**: Fix the contract code (invalid base58 strings cause compilation to fail)
   - **Workaround**: Use `COMPILE=0` to test other methods

4. **All methods skipped**
   - **Reason**: Contract uses custom types not supported by the fuzzer
   - **Solution**: This is expected behavior for domain-specific contracts

5. **Terminal hanging/floating**
   - **Solution**: The fuzzer now includes better error handling to prevent hanging

## 🔗 Links

- [o1js Documentation](https://docs.minaprotocol.com/zkapps/o1js)
- [Mina Protocol](https://minaprotocol.com/)
- [Extropy](https://www.extropy.io/)
- [X](https://x.com/Extropy)

---

**Built for the Mina ecosystem** 🚀
# Fuzzhead Benchmark Suite

This directory contains the benchmark harness for testing Fuzzhead against the [DeFiHackLabs](https://github.com/SunWeb3Sec/DeFiHackLabs) dataset of known smart contract vulnerabilities.

## Overview

The benchmark suite automatically:
- Discovers all Solidity contracts in the DeFiHackLabs repository
- Runs Fuzzhead against each contract
- Tracks vulnerability detection rates
- Generates detailed JSON reports

## Prerequisites

1. **DeFiHackLabs submodule** must be initialized:
   ```bash
   cd ../..
   git submodule update --init --recursive
   ```

2. **Fuzzer must be built**:
   ```bash
   cd ..
   cargo build --release
   ```

3. **Anvil must be running**:
   ```bash
   anvil
   ```

## Quick Start

### Run All Benchmarks

```bash
make run
```

This will:
- Check prerequisites
- Test all contracts in DeFiHackLabs
- Generate `benchmark-results.json`

### Test Limited Number of Contracts

```bash
make test-limit MAX_CONTRACTS=10
```

### Test a Single Contract

```bash
make test-single CONTRACT=../../benchmarks/defihacklabs/src/test/2025-02/unverified_35bc_exp.sol
```

## Makefile Commands

| Command                           | Description                      |
| --------------------------------- | -------------------------------- |
| `make build`                      | Build the fuzzer in release mode |
| `make run`                        | Run full benchmark suite         |
| `make test-limit MAX_CONTRACTS=N` | Test first N contracts           |
| `make test-single CONTRACT=path`  | Test a specific contract         |
| `make clean`                      | Remove benchmark results         |
| `make help`                       | Show all available commands      |

## Environment Variables

| Variable        | Default                 | Description                            |
| --------------- | ----------------------- | -------------------------------------- |
| `FORK_URL`      | `http://localhost:8545` | Anvil RPC URL                          |
| `TEST_CASES`    | `50`                    | Number of fuzz iterations per contract |
| `MAX_CONTRACTS` | (unlimited)             | Limit number of contracts to test      |

## Examples

### Custom Test Cases

```bash
TEST_CASES=100 make run
```

### Custom Fork URL

```bash
FORK_URL=http://localhost:8546 make run
```

### Test Recent Contracts Only

```bash
MAX_CONTRACTS=20 TEST_CASES=100 make test-limit
```

## Output

The benchmark suite generates:

1. **Console Output**: Real-time progress and summary
   - Contract being tested
   - Detection status
   - Execution time
   - Final statistics

2. **JSON Report** (`benchmark-results.json`):
   ```json
   {
     "total": 100,
     "detected": 75,
     "missed": 25,
     "total_execution_time_ms": 120000,
     "results": [
       {
         "contract": "unverified_35bc_exp.sol",
         "contract_path": "../../benchmarks/defihacklabs/src/test/2025-02/unverified_35bc_exp.sol",
         "detected": true,
         "execution_time_ms": 1200,
         "fuzz_runs": 50,
         "passed": 45,
         "failed": 5
       }
     ]
   }
   ```

## Understanding Results

- **Detected**: Fuzzhead found indicators of vulnerabilities (reverts, errors, etc.)
- **Missed**: No clear vulnerability indicators found
- **Detection Rate**: Percentage of contracts where vulnerabilities were detected
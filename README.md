# Fuzzhead

A next-generation, multi-layered security fuzzing framework for privacy-preserving blockchains.

`Fuzzhead` is a specialised security tool designed to uncover critical vulnerabilities in the complex architectures of modern privacy-preserving blockchains. Standard EVM fuzzers are essential for testing application logic but are blind to the unique attack surfaces introduced by zero-knowledge (ZK) circuits and Trusted Execution Environments (TEEs). `Fuzzhead` provides a holistic, three-pronged security analysis to secure the entire stack, from dApps down to the core protocol.

## Project Status

**Current Focus: The Horizen Ecosystem**

We have successfully completed a foundational Proof of Concept (POC) of our fuzzing engine for the Mina ecosystem. This initial version validated our core approach to security analysis and demonstrated our team's capability to build effective, specialised fuzzing tools for complex cryptographic systems.

Building on the lessons learned from the Mina POC, we are now directing our full attention to developing `Fuzzhead` for the **Horizen ecosystem**. Our goal is to create a new, more advanced tool specifically tailored to the unique architecture of Horizen's L3 appchain on Base, which heavily utilises both ZK-proofs and TEEs.

## The `Fuzzhead` Architecture

`Fuzzhead` is designed with a modular, three-engine architecture to provide comprehensive, full-stack security coverage for Horizen developers.

### 1. Application Layer Engine (EVM)

This engine provides robust, property-based fuzzing for the on-chain components of an application.
*   **Target:** EVM smart contracts written in **Solidity**.
*   **Purpose:** To detect common on-chain vulnerabilities such as re-entrancy, integer overflows/underflows, access control issues, and broken business logic invariants.
*   **Methodology:** Leverages property-based testing, similar to established tools like Echidna and Foundry, to automatically generate transaction sequences that attempt to violate predefined security properties.

### 2. Cryptographic Layer Engine (ZK-Circuits)

This is the core innovation of `Fuzzhead`. This engine targets the off-chain ZK circuits that are the foundation of Horizen's privacy technology.
*   **Targets:** Zero-knowledge circuits written in **Circom** and **Noir**.
*   **Purpose:** To uncover deep, logic-based flaws unique to ZK circuits, such as soundness vulnerabilities (allowing an invalid proof to be accepted) and completeness vulnerabilities (preventing a valid proof from being generated).
*   **Methodology:** Implements cutting-edge techniques like **program mutation** (inspired by zkFuzz) and **metamorphic testing** (inspired by Circuzz) to find under-constrained or incorrectly implemented circuit logic.

### 3. Protocol Layer Engine (TEE)

This engine provides a unique security analysis of Horizen's core protocol, targeting an attack surface that is completely invisible to other tools.
*   **Target:** The interface between the Horizen node software and the **op-enclave running within AWS Nitro Trusted Execution Environments (TEEs)**.
*   **Purpose:** To ensure the integrity of Horizen's core state transition and attestation mechanism. It tests for vulnerabilities where malformed inputs could crash the enclave, produce an invalid state, or trick the enclave into signing an incorrect attestation.
*   **Methodology:** Employs input fuzzing and state transition analysis to probe the boundary between the node and the secure enclave.

## Roadmap for Horizen

Our development is focused on delivering a powerful, open-source tool for the Horizen community.

*   **Phase 1: MVP Release**
    *   Develop and open-source the core `Fuzzhead` framework.
    *   Release the Application Layer Engine for Solidity contracts.
    *   Release an alpha version of the Cryptographic Layer Engine with initial support for Circom.

*   **Phase 2: Integration & Expansion**
    *   Partner with projects building on Horizen for pilot testing and integration feedback.
    *   Expand the Cryptographic Layer Engine to include full support for Noir.
    *   Develop and release a prototype of the Protocol Layer Engine for TEE testing.

*   **Phase 3: Full-Featured Release & Community Adoption**
    *   Achieve widespread adoption within the Horizen developer community.
    *   Release the complete, stable version of all three engines.
    *   Establish `Fuzzhead` as a standard security tool in the Horizen developer stack.

## Getting Started

### Prerequisites

Before running the fuzzer, ensure you have the following installed:

1. **Rust** (1.70 or later)
   ```bash
   # Install Rust via rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Foundry** (for Anvil)
   ```bash
   # Install Foundry
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

3. **Node.js** (v16 or later) - Required for Solidity compilation
   ```bash
   # Install via nvm (recommended) or your system package manager
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   ```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/fuzzhead.git
   cd fuzzhead/Horizen-POC
   ```

2. **Build the fuzzer:**
   ```bash
   cargo build --release
   ```

   The binary will be available at `target/release/horizen-solidity-fuzzer`

### Running the Fuzzer

#### Step 1: Start Anvil

The fuzzer requires a running Anvil instance to execute contracts. Start Anvil in a separate terminal:

```bash
# Start Anvil on default port (8545)
anvil

# Or start with a fork of mainnet (optional)
anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

#### Step 2: Run the Fuzzer

**Fuzz a single contract:**
```bash
cargo run --release -- \
  --input test-contracts/VaultContract.sol \
  --test-cases 50 \
  --fork-url http://localhost:8545
```

**Fuzz all contracts in a directory:**
```bash
cargo run --release -- \
  --input test-contracts/ \
  --test-cases 100 \
  --fork-url http://localhost:8545
```

**With verbose logging:**
```bash
cargo run --release -- \
  --input test-contracts/VaultContract.sol \
  --test-cases 50 \
  --verbose
```

#### Command Line Options

- `--input` / `-i`: Path to Solidity contract file or directory (required)
- `--test-cases` / `-t`: Number of test cases to generate per method (default: 100)
- `--fork-url`: RPC URL for Anvil fork (default: http://localhost:8545)
- `--verbose` / `-v`: Enable verbose logging

### Example: Fuzzing VaultContract

Here's a complete example of fuzzing the `VaultContract`:

**1. Start Anvil:**
```bash
anvil
```

**2. Run the fuzzer:**
```bash
cd Horizen-POC
cargo run --release -- --input test-contracts/VaultContract.sol --test-cases 50
```

**3. Example Output:**

```
Fuzzing contract: VaultContract
--------------------------------------------------
- Contract compiled successfully (1234 bytes)
- Constructor requires 2 parameter(s)
➤ Deployment requires arguments for 'VaultContract':
Enter value for _minDeposit (uint256): 100
Enter value for _maxWithdrawPerDay (uint256): 1000
✔ Arguments captured successfully!
- Constructor arguments encoded (64 bytes)
- Contract deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
- Starting fuzzing of 5 method(s)...

- Fuzzing method: deposit
  ❌ VaultContract.deposit(50) FAILED on iteration 3: Transaction reverted: Below minimum deposit
  ❌ VaultContract.deposit(0x0000...0000) FAILED on iteration 12: Transaction reverted: Below minimum deposit

- Fuzzing method: withdraw
  ❌ VaultContract.withdraw(5000) FAILED on iteration 7: Transaction reverted: Insufficient balance
  ❌ VaultContract.withdraw(1500) FAILED on iteration 23: Transaction reverted: Exceeds daily limit

- Fuzzing method: setWhitelist
  ❌ VaultContract.setWhitelist(0x7099...79C8, true) FAILED on iteration 15: Transaction reverted: Not owner

- Fuzzing method: setPaused
  ❌ VaultContract.setPaused(false) FAILED on iteration 8: Transaction reverted: Not owner

- Fuzzing method: updateLimits
  ❌ VaultContract.updateLimits(500, 2000) FAILED on iteration 2: Transaction reverted: Not owner

🏁 Fuzzing complete:
   ✅ 235 runs passed
   ❌ 15 runs failed
   ⏭️  0 runs skipped (unsupported parameter types)
   📊 Total: 250 runs across 5 method(s)
   🔄 50 iterations per method
```

### Understanding the Output

- **✅ Passed**: The transaction executed successfully on the EVM
- **❌ Failed**: The transaction reverted with an error (expected behaviour for invalid inputs)
- **⏭️ Skipped**: Test cases skipped due to unsupported parameter types

**Note:** Failed test cases are expected and indicate that the fuzzer is correctly testing edge cases and invalid inputs. The fuzzer generates random inputs, and many will naturally fail due to business logic constraints (for example, insufficient balance, access control, and similar constraints).

### Troubleshooting

**"Connection refused" or "Failed to connect to Anvil"**
- Ensure Anvil is running: `anvil`
- Check the `--fork-url` matches your Anvil instance

**"Contract compilation failed"**
- Ensure Solidity compiler is available (via Foundry)
- Check that your contract has valid Solidity syntax

**"Deployment failed"**
- Verify Anvil is running and accessible
- Check constructor arguments are valid for your contract

**"EVM execution failed"**
- Ensure Anvil is running and not crashed
- Check network connectivity to the fork URL

## Validation & Benchmarking

Fuzzhead's detection capabilities are validated against the **[DeFiHackLabs](https://github.com/SunWeb3Sec/DeFiHackLabs)** dataset, a comprehensive collection of known smart contract vulnerabilities from historical DeFi exploits.

### Running Benchmarks

1. **Initialize the DeFiHackLabs submodule:**
   ```bash
   git submodule update --init --recursive
   ```

2. **Build the fuzzer:**
   ```bash
   cd Horizen-POC
   cargo build --release
   ```

3. **Start Anvil:**
   ```bash
   anvil
   ```

4. **Run the benchmark suite:**
   ```bash
   cd benchmarks
   make run
   ```

   Or test a limited number of contracts:
   ```bash
   make test-limit MAX_CONTRACTS=10
   ```

### Benchmark Results

**Current Performance:** Fuzzhead achieves a **42.9% detection rate** against the DeFiHackLabs benchmark suite, successfully identifying vulnerabilities in 6 out of 14 fuzzable contracts tested.

**Latest Benchmark Run:**
- **Total contracts tested:** 300
- **Compilation errors (skipped):** 286 (unresolved imports, missing dependencies, or contracts requiring full project context)
- **Successfully fuzzed:** 14 contracts
- **Vulnerabilities detected:** 6
- **Detection rate:** 42.9% (of successfully fuzzed contracts)

**Note:** The high number of compilation errors is expected, as many contracts in the DeFiHackLabs dataset have dependencies on other contracts in the project or require specific Foundry project configurations. Only contracts that can be compiled and deployed standalone are successfully fuzzed.

<!-- Results are saved to `benchmark-results.json` and include:
- Detection rate (percentage of vulnerabilities correctly identified)
- Execution time per contract
- Detailed results for each tested contract
- Compilation error classification -->

For detailed benchmark documentation, see `Horizen-POC/benchmarks/README.md`.

## Contributing

We welcome contributions from the security and developer communities! If you are interested in contributing to `Fuzzhead`, submit a pull request.

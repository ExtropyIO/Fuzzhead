# EVM Engine Development Roadmap

## Current Status

### ✅ Completed
- Basic Solidity AST parsing
- Method discovery (public/external methods)
- Random input generation for basic types
- Basic CLI interface
- Test contract structure
- **Real EVM execution via Anvil fork** ✅
- Contract deployment with constructor parameter support
- Real method call execution on Anvil fork
- Revert reason and error message capture
- Gas usage tracking
- State change tracking via Anvil transactions

---

## Next Steps (Priority Order)

### 1. Real EVM Execution Integration ✅ COMPLETE

**Status:** ✅ Completed (via Anvil fork)  
**Priority:** ~~Highest - Blocks all real vulnerability detection~~ (Completed)

**Tasks:**
- [x] Choose EVM runtime library (implemented via Anvil fork executor)
- [x] Add EVM dependency to `Cargo.toml` (using `reqwest` for Anvil RPC)
- [x] Create EVM execution module (`src/anvil_executor.rs`)
- [x] Implement contract deployment to test EVM (via Anvil fork)
- [x] Implement method call execution with generated parameters
- [x] Capture real execution results:
  - [x] Revert reasons and error messages
  - [x] Gas usage tracking
  - [x] Return values (via transaction receipts)
  - [x] State changes (via Anvil transaction execution)
- [ ] Implement state snapshot/restore for efficient fuzzing (future optimization)
- [x] Replace simulated execution in `execute_test_case()` method
- [x] Test with existing test contracts (VaultContract tested successfully)
- [x] Constructor parameter handling and encoding

**Implementation Notes:**
- Used Anvil fork executor (`src/anvil_executor.rs`) instead of direct `revm` integration
- Supports constructor parameters via interactive prompts
- Real transaction execution via `eth_sendTransaction` and `eth_getTransactionReceipt`
- Handles revert reasons and error messages from failed transactions

**Dependencies:** None  
**Time Taken:** Completed

**Why First:** ✅ Without real EVM execution, the fuzzer cannot detect actual vulnerabilities or verify real contract behavior. **This is now complete.**

---

### 2. Property-Based Testing Framework 🎯 NEXT PRIORITY

**Status:** Not Started  
**Priority:** High - Core differentiator per litepaper  
**Current Focus:** This is the next step to implement

**Tasks:**
- [ ] Design property definition DSL (YAML or Rust macros)
- [ ] Create property parser module (`src/properties.rs`)
- [ ] Define property types:
  - [ ] Invariants (always true)
  - [ ] Preconditions (must be true before)
  - [ ] Postconditions (must be true after)
  - [ ] State properties (balance, supply, etc.)
- [ ] Implement property checking after each transaction
- [ ] Property violation detection and reporting
- [ ] Support common property patterns:
  - [ ] "Balance never negative"
  - [ ] "Total supply constant"
  - [ ] "User can't withdraw more than deposited"
  - [ ] "Access control enforced"
- [ ] Create example property files for test contracts
- [ ] CLI flag to specify property file (`--properties`)

**Dependencies:** ✅ EVM Integration (#1) - COMPLETE  
**Estimated Time:** 2-3 weeks  
**Ready to Start:** Yes - all dependencies met

**Why Second:** This is the core innovation that differentiates Fuzzhead from basic fuzzers - property-based testing like Echidna.

---

### 3. Multi-Transaction Sequence Generation

**Status:** Not Started  
**Priority:** High - Many vulnerabilities only appear in sequences

**Tasks:**
- [ ] Design transaction sequence generator (`src/sequence_generator.rs`)
- [ ] State-aware transaction planning:
  - [ ] Setup transactions (deposit, approve, etc.)
  - [ ] Action transactions (transfer, withdraw, etc.)
  - [ ] Verification transactions (check balances, states)
- [ ] Re-entrancy attack pattern generation:
  - [ ] Call same contract method recursively
  - [ ] Cross-contract re-entrancy patterns
- [ ] Access control bypass attempts:
  - [ ] Unauthorized method calls
  - [ ] Role escalation attempts
- [ ] State-dependent test case generation:
  - [ ] Generate inputs based on current contract state
  - [ ] Edge case generation (max values, zero, etc.)
- [ ] Sequence execution and state tracking
- [ ] Property checking across transaction sequences

**Dependencies:** ✅ EVM Integration (#1) - COMPLETE, Property Framework (#2) - Pending  
**Estimated Time:** 2-3 weeks

**Why Third:** Many critical vulnerabilities (re-entrancy, access control, business logic) only manifest in multi-transaction scenarios.

---

### 4. Vulnerability Detection

**Status:** Not Started  
**Priority:** Medium-High - Core value proposition

**Tasks:**
- [ ] Re-entrancy detection:
  - [ ] Call stack analysis
  - [ ] External call detection
  - [ ] State modification before/after external calls
- [ ] Integer overflow/underflow detection:
  - [ ] Arithmetic operation analysis
  - [ ] Boundary value testing
- [ ] Access control bypass detection:
  - [ ] Unauthorized method call detection
  - [ ] Role/permission verification
- [ ] Uninitialized storage detection:
  - [ ] Storage slot analysis
  - [ ] Default value usage detection
- [ ] Business logic invariant violations:
  - [ ] Custom property violations
  - [ ] Unexpected state transitions
- [ ] Vulnerability classification and reporting:
  - [ ] Severity levels (Critical, High, Medium, Low)
  - [ ] Vulnerability descriptions
  - [ ] Exploit proof-of-concept generation

**Dependencies:** ✅ EVM Integration (#1) - COMPLETE, Multi-Transaction Sequences (#3) - Pending  
**Estimated Time:** 2-3 weeks

**Why Fourth:** Automated vulnerability detection is a core value proposition, but requires real execution and sequences to be effective.

---

### 5. Enhanced Type Support

**Status:** Partially Complete  
**Priority:** Medium - Needed for real-world contracts

**Tasks:**
- [ ] Struct handling:
  - [ ] Parse struct definitions from AST
  - [ ] Generate random struct values
  - [ ] Handle nested structs
- [ ] Nested mappings:
  - [ ] `mapping(address => mapping(uint => bool))`
  - [ ] Multi-level mapping generation
- [ ] Dynamic arrays:
  - [ ] Proper sizing and element generation
  - [ ] Array manipulation testing
- [ ] Custom types:
  - [ ] Type alias resolution
  - [ ] Library type imports
- [ ] Tuple support:
  - [ ] Multiple return values
  - [ ] Named tuples
- [ ] Replace "default" fallback with proper error handling

**Dependencies:** ✅ EVM Integration (#1) - COMPLETE  
**Estimated Time:** 1-2 weeks

**Why Fifth:** Real-world contracts use complex types. Current implementation returns "default" for unsupported types, limiting test coverage.

---

### 6. Reporting and Analysis

**Status:** Basic (console output only)  
**Priority:** Medium - Improves usability

**Tasks:**
- [ ] Test case minimization:
  - [ ] Reduce failing test cases to minimal reproducible examples
  - [ ] Remove redundant transactions
- [ ] Code coverage metrics:
  - [ ] Line coverage
  - [ ] Branch coverage
  - [ ] Function coverage
- [ ] Report generation:
  - [ ] HTML report with visualizations
  - [ ] JSON report for CI/CD integration
  - [ ] Markdown report for documentation
- [ ] Vulnerability classification:
  - [ ] Categorize by type (re-entrancy, overflow, etc.)
  - [ ] Prioritize by severity
  - [ ] Include remediation suggestions
- [ ] Gas usage analysis:
  - [ ] Gas optimization opportunities
  - [ ] Gas limit violations
- [ ] Statistics and metrics:
  - [ ] Total test cases executed
  - [ ] Coverage percentage
  - [ ] Vulnerability count by type

**Dependencies:** All previous steps  
**Estimated Time:** 1-2 weeks

**Why Sixth:** Professional reporting makes the tool more usable and helps developers understand and fix issues.

---

## Implementation Timeline

### Phase 1: Foundation ✅ COMPLETE
- Focus: EVM Integration (#1)
- Deliverable: Real contract execution working ✅
- **Status:** Completed via Anvil fork executor

### Phase 2: Core Features 🎯 CURRENT PHASE (Weeks 3-6)
- Focus: Property Framework (#2) + Multi-Transaction Sequences (#3)
- Deliverable: Property-based fuzzing with transaction sequences
- **Status:** Ready to begin - Step 2 (Property Framework) is next priority

### Phase 3: Detection (Weeks 7-9)
- Focus: Vulnerability Detection (#4)
- Deliverable: Automated vulnerability detection working

### Phase 4: Polish (Weeks 10-12)
- Focus: Enhanced Types (#5) + Reporting (#6)
- Deliverable: Production-ready EVM engine

---

## ✅ EVM Integration - Implementation Summary

### What Was Implemented

**Approach:** Anvil Fork Executor (instead of direct `revm` integration)

**Key Components:**
1. **`src/anvil_executor.rs`** - Anvil RPC client for contract deployment and execution
2. **`src/constructor.rs`** - Interactive constructor parameter handling
3. **Updated `src/fuzz_solidity.rs`** - Real EVM execution via Anvil fork

**Features:**
- ✅ Contract deployment with constructor parameter support
- ✅ Real transaction execution via `eth_sendTransaction`
- ✅ Revert reason extraction from failed transactions
- ✅ Gas usage tracking from transaction receipts
- ✅ State change tracking through Anvil transactions
- ✅ Multiple account support for testing access control
- ✅ Nonce management for proper transaction sequencing

**Dependencies Added:**
- `reqwest` - HTTP client for Anvil RPC calls
- `ethers` - ABI encoding/decoding and constructor handling
- `dialoguer` - Interactive constructor parameter prompts

**Testing:**
- ✅ Successfully tested with `VaultContract.sol` (constructor with 2 parameters)
- ✅ Real execution results captured
- ✅ Error handling for deployment and execution failures

**Next Steps:**
- Consider adding state snapshot/restore for more efficient fuzzing
- May want to add direct `revm` integration later for faster execution without RPC overhead

---

## Notes

- Each step builds on previous steps - follow order
- Test incrementally after each major change
- Keep existing test contracts working throughout
- Document API changes as you go
- Consider performance early (state snapshots, parallel execution)

---

**Last Updated:** December 2024  
**Current Focus:** Step 2 - Property-Based Testing Framework  
**Recent Achievement:** ✅ Step 1 (EVM Integration) completed via Anvil fork executor with constructor parameter support


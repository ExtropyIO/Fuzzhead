.PHONY: build run clean help test-single test-limit

# Configuration
FUZZER_BINARY = ../target/release/horizen-solidity-fuzzer
BENCH_DIR = ../../benchmarks/defihacklabs
FORK_URL ?= http://localhost:8545
TEST_CASES ?= 50
MAX_CONTRACTS ?=

help:
	@echo "Fuzzhead Benchmark Suite - Makefile Commands"
	@echo ""
	@echo "Targets:"
	@echo "  build          - Build the fuzzer in release mode"
	@echo "  run            - Run full benchmark suite (requires Anvil running)"
	@echo "  test-single    - Test a single contract (set CONTRACT=path/to/contract.sol)"
	@echo "  test-limit     - Test limited number of contracts (set MAX_CONTRACTS=N)"
	@echo "  clean          - Remove benchmark results"
	@echo ""
	@echo "Environment Variables:"
	@echo "  FORK_URL       - Anvil RPC URL (default: http://localhost:8545)"
	@echo "  TEST_CASES     - Number of test cases per contract (default: 50)"
	@echo "  MAX_CONTRACTS  - Limit number of contracts to test"
	@echo "  CONTRACT       - Path to specific contract for test-single"
	@echo ""
	@echo "Examples:"
	@echo "  make build                    # Build the fuzzer"
	@echo "  make run                      # Run all benchmarks"
	@echo "  make test-limit MAX_CONTRACTS=10  # Test first 10 contracts"
	@echo "  make test-single CONTRACT=../../benchmarks/defihacklabs/src/test/2025-02/unverified_35bc_exp.sol"

build:
	@echo "Building fuzzer..."
	cd .. && cargo build --release
	@echo "✓ Fuzzer built successfully"

check-submodule:
	@if [ ! -d "$(BENCH_DIR)" ]; then \
		echo "Error: DeFiHackLabs submodule not found"; \
		echo "Run: git submodule update --init --recursive"; \
		exit 1; \
	fi

check-anvil:
	@echo "Checking Anvil connection..."
	@curl -s -X POST $(FORK_URL) \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
		> /dev/null 2>&1 || \
		(echo "Error: Cannot connect to Anvil at $(FORK_URL)"; \
		 echo "Start Anvil with: anvil"; \
		 exit 1)
	@echo "✓ Anvil is running"

run: check-submodule check-anvil build
	@echo "Starting benchmark suite..."
	@echo "Fork URL: $(FORK_URL)"
	@echo "Test cases per contract: $(TEST_CASES)"
	@echo ""
	FORK_URL=$(FORK_URL) TEST_CASES=$(TEST_CASES) cargo run --release
	@echo ""
	@echo "✓ Benchmark suite completed"
	@echo "Results saved to: benchmark-results.json"

test-single: check-submodule check-anvil build
	@if [ -z "$(CONTRACT)" ]; then \
		echo "Error: CONTRACT variable not set"; \
		echo "Usage: make test-single CONTRACT=path/to/contract.sol"; \
		exit 1; \
	fi
	@echo "Testing single contract: $(CONTRACT)"
	@echo "Fork URL: $(FORK_URL)"
	@echo ""
	$(FUZZER_BINARY) --input $(CONTRACT) --test-cases $(TEST_CASES) --fork-url $(FORK_URL)

test-limit: check-submodule check-anvil build
	@if [ -z "$(MAX_CONTRACTS)" ]; then \
		echo "Error: MAX_CONTRACTS variable not set"; \
		echo "Usage: make test-limit MAX_CONTRACTS=10"; \
		exit 1; \
	fi
	@echo "Testing first $(MAX_CONTRACTS) contracts..."
	@echo "Fork URL: $(FORK_URL)"
	@echo "Test cases per contract: $(TEST_CASES)"
	@echo ""
	FORK_URL=$(FORK_URL) TEST_CASES=$(TEST_CASES) MAX_CONTRACTS=$(MAX_CONTRACTS) cargo run --release
	@echo ""
	@echo "✓ Limited benchmark test completed"

clean:
	@echo "Cleaning benchmark results..."
	rm -f benchmark-results.json
	@echo "✓ Cleaned"


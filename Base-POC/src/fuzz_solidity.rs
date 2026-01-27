use crate::types::*;
use crate::ast_parser::{ContractInfo, SolidityParser};
use crate::anvil_executor::AnvilForkExecutor;
use crate::contract_compiler::ContractCompiler;
use rand::Rng;
use std::time::Instant;
use std::path::Path;
use sha3::Digest;

pub struct SolidityFuzzer {
    parser: SolidityParser,
    rng: rand::rngs::ThreadRng,
    anvil_executor: AnvilForkExecutor,
    compiler: ContractCompiler,
}

impl SolidityFuzzer {
    pub async fn new(fork_url: &str) -> Result<Self, anyhow::Error> {
        Ok(Self {
            parser: SolidityParser::new(),
            rng: rand::thread_rng(),
            anvil_executor: AnvilForkExecutor::new(fork_url).await?,
            compiler: ContractCompiler::new(),
        })
    }

    pub async fn fuzz_contract(&mut self, source: &str, filename: &str) -> Result<FuzzSummary, anyhow::Error> {
        let contracts = self.parser.parse_contract(source, filename)?;
        let mut total_passed = 0;
        let mut total_failed = 0;
        let mut total_skipped = 0;

        let source_path = Path::new(filename);

        for contract in contracts {
            println!("Fuzzing contract: {}", contract.name);
            println!("{}", "-".repeat(50));
            
            let (contract_bytecode, contract_abi) = match self.compiler.compile_contract_with_abi(source_path, &contract.name) {
                Ok((bytecode, abi)) => {
                    println!("- Contract compiled successfully ({} bytes)", bytecode.len());
                    (bytecode, abi)
                }
                Err(e) => {
                    eprintln!("❌ Compilation failed for contract {}: {}", contract.name, e);
                    eprintln!("   Cannot proceed without compiled bytecode. Please fix compilation errors.");
                    return Err(anyhow::anyhow!("Contract compilation failed: {}", e));
                }
            };
            
            // Deploy contract to Anvil fork
                // Check if contract has constructor parameters
            let constructor_args = if contract_abi.constructor().is_some() && !contract_abi.constructor().unwrap().inputs.is_empty() {
                println!("- Constructor requires {} parameter(s)", contract_abi.constructor().unwrap().inputs.len());
                    
                    // Prompt user for constructor arguments
                match crate::constructor::prompt_for_constructor_args(&contract_abi, &contract.name) {
                        Ok(tokens) => {
                        match contract_abi.constructor().unwrap().encode_input(contract_bytecode.clone(), &tokens) {
                                Ok(encoded_deployment) => {
                                let constructor_args_bytes = &encoded_deployment[contract_bytecode.len()..];
                                    println!("- Constructor arguments encoded ({} bytes)", constructor_args_bytes.len());
                                    Some(constructor_args_bytes.to_vec())
                                }
                                Err(e) => {
                                eprintln!("❌ Failed to encode constructor arguments: {}", e);
                                return Err(anyhow::anyhow!("Constructor argument encoding failed: {}", e));
                                }
                            }
                        }
                        Err(e) => {
                        eprintln!("❌ Failed to get constructor arguments: {}", e);
                        return Err(anyhow::anyhow!("Constructor argument input failed: {}", e));
                        }
                    }
                } else {
                    None
                };
                
            match self.anvil_executor.deploy_contract(&contract.name, &contract_bytecode, constructor_args.as_deref()).await {
                    Ok(addr) => {
                        println!("- Contract deployed at: {}", addr);
                    }
                    Err(e) => {
                    eprintln!("❌ Deployment failed: {}", e);
                    return Err(anyhow::anyhow!("Contract deployment failed: {}", e));
                }
            }
            
            let num_fuzz_runs = std::env::var("FUZZ_RUNS")
                .unwrap_or_else(|_| "50".to_string())
                .parse::<usize>()
                .unwrap_or(50);

            // Find all public/external methods
            let methods_to_test: Vec<_> = contract.methods.iter()
                .filter(|method| {
                    (method.visibility == MethodVisibility::Public || method.visibility == MethodVisibility::External) 
                    && !method.is_constructor 
                    && !method.is_fallback 
                    && !method.is_receive
                })
                .collect();

            if methods_to_test.is_empty() {
                println!("   - No public methods found to fuzz");
                continue;
            }

            println!("- Starting fuzzing of {} method(s)...", methods_to_test.len());
            println!();

            let accounts: Vec<String> = self.anvil_executor.accounts().to_vec();
            let num_accounts = accounts.len();
            
            let method_count = methods_to_test.len();
            for method in methods_to_test {
                if method.parameters.is_empty() {
                    println!("- Skipping method: {} (no input parameters)", method.name);
                    continue;
                }

                println!("- Fuzzing method: {}", method.name);

                let mut method_passed = 0;
                let mut method_failed = 0;
                let mut method_skipped = 0;

                for i in 0..num_fuzz_runs {
                    let mock_args = method.parameters.iter()
                        .map(|param| self.generate_random_value(&param.param_type))
                        .collect::<Vec<_>>();

                    // Check if we can generate all required parameters
                    if mock_args.iter().any(|arg| matches!(arg, SolidityValue::String(ref s) if s == "default")) {
                        method_skipped += 1;
                        continue;
                    }

                    // Rotate sender to test access control
                    // Bias towards non-owner accounts (70% chance) to catch access control issues
                    let sender_index = if num_accounts > 1 && self.rng.gen_range(0..100) < 70 {
                        self.rng.gen_range(1..num_accounts)
                    } else {
                        0
                    };
                    self.anvil_executor.set_sender(sender_index);

                    // Execute on Anvil fork - fail loudly if execution fails
                    let result = self.execute_test_case_evm(&method.name, &mock_args, &contract).await;
                    
                    match result {
                        TestResult::Passed => {
                            method_passed += 1;
                        }
                        TestResult::Failed(error) => {
                            let args_display = self.format_args_for_display(&mock_args);
                            println!("  ❌ {}.{}({}) FAILED on iteration {}: {}", 
                                contract.name, method.name, args_display, i + 1, error);
                            method_failed += 1;
                        }
                    }
                }

                total_passed += method_passed;
                total_failed += method_failed;
                total_skipped += method_skipped;
            }

            println!();
            println!("🏁 Fuzzing complete:");
            println!("   ✅ {} runs passed", total_passed);
            println!("   ❌ {} runs failed", total_failed);
            if total_skipped > 0 {
                println!("   ⏭️  {} runs skipped (unsupported parameter types)", total_skipped);
            }
            println!("   📊 Total: {} runs across {} method(s)", total_passed + total_failed + total_skipped, method_count);
            println!("   🔄 {} iterations per method", num_fuzz_runs);
        }

        Ok(FuzzSummary {
            total_passed,
            total_failed,
            total_skipped,
        })
    }

    /// Execute test case using Anvil fork
    async fn execute_test_case_evm(&mut self, method_name: &str, args: &[SolidityValue], contract: &ContractInfo) -> TestResult {
        let start_time = Instant::now();
        
        // Build method signature for ABI encoding
        let method_signature = self.build_method_signature(method_name, args);
        
        // Encode arguments to ABI format
        let encoded_args = match self.encode_abi_args(args) {
            Ok(encoded) => encoded,
            Err(e) => {
                return TestResult::Failed(format!("ABI encoding failed: {}", e));
            }
        };
        
        // Execute on Anvil fork - fail loudly if execution fails
        match self.anvil_executor.call_method(&contract.name, &method_signature, &encoded_args).await {
            Ok(execution_result) => {
                let _execution_time = start_time.elapsed();
                
                if execution_result.success {
                    TestResult::Passed
                } else {
                    let error_msg = execution_result.error
                        .unwrap_or_else(|| "Execution failed".to_string());
                    TestResult::Failed(error_msg)
                }
            }
            Err(e) => {
                // Fail loudly - no fallback to simulation
                TestResult::Failed(format!("EVM execution failed: {}. Cannot proceed without real EVM execution.", e))
            }
        }
    }
    
    /// Build method signature string (e.g., "transfer(address,uint256)")
    fn build_method_signature(&self, method_name: &str, args: &[SolidityValue]) -> String {
        let param_types: Vec<String> = args.iter()
            .map(|arg| self.solidity_value_to_type_string(arg))
            .collect();
        
        format!("{}({})", method_name, param_types.join(","))
    }
    
    /// Convert SolidityValue to type string for signature
    fn solidity_value_to_type_string(&self, value: &SolidityValue) -> String {
        match value {
            SolidityValue::Uint8(_) => "uint8".to_string(),
            SolidityValue::Uint16(_) => "uint16".to_string(),
            SolidityValue::Uint32(_) => "uint32".to_string(),
            SolidityValue::Uint64(_) => "uint64".to_string(),
            SolidityValue::Uint128(_) => "uint128".to_string(),
            SolidityValue::Uint256(_) => "uint256".to_string(),
            SolidityValue::Int8(_) => "int8".to_string(),
            SolidityValue::Int16(_) => "int16".to_string(),
            SolidityValue::Int32(_) => "int32".to_string(),
            SolidityValue::Int64(_) => "int64".to_string(),
            SolidityValue::Int128(_) => "int128".to_string(),
            SolidityValue::Int256(_) => "int256".to_string(),
            SolidityValue::Address(_) => "address".to_string(),
            SolidityValue::Bool(_) => "bool".to_string(),
            SolidityValue::String(_) => "string".to_string(),
            SolidityValue::Bytes(_) => "bytes".to_string(),
            SolidityValue::Bytes1(_) => "bytes1".to_string(),
            SolidityValue::Bytes2(_) => "bytes2".to_string(),
            SolidityValue::Bytes4(_) => "bytes4".to_string(),
            SolidityValue::Bytes8(_) => "bytes8".to_string(),
            SolidityValue::Bytes16(_) => "bytes16".to_string(),
            SolidityValue::Bytes32(_) => "bytes32".to_string(),
            SolidityValue::Array(_) => "uint256[]".to_string(),
            SolidityValue::Struct(_) => "tuple".to_string(),
        }
    }
    
    /// Encode Solidity values to ABI format
    fn encode_abi_args(&self, args: &[SolidityValue]) -> Result<Vec<u8>, anyhow::Error> {
        let mut encoded = Vec::new();
        
        for arg in args {
            let mut bytes = [0u8; 32]; // ABI encoding uses 32-byte words
            
            match arg {
                SolidityValue::Uint8(v) => {
                    bytes[31] = *v;
                }
                SolidityValue::Uint16(v) => {
                    let be_bytes = v.to_be_bytes();
                    bytes[30..].copy_from_slice(&be_bytes);
                }
                SolidityValue::Uint32(v) => {
                    let be_bytes = v.to_be_bytes();
                    bytes[28..].copy_from_slice(&be_bytes);
                }
                SolidityValue::Uint64(v) => {
                    let be_bytes = v.to_be_bytes();
                    bytes[24..].copy_from_slice(&be_bytes);
                }
                SolidityValue::Uint128(v) => {
                    let be_bytes = v.to_be_bytes();
                    bytes[16..].copy_from_slice(&be_bytes);
                }
                SolidityValue::Uint256(v) => {
                    let val = v.parse::<u128>().unwrap_or(0);
                    let be_bytes = val.to_be_bytes();
                    bytes[16..].copy_from_slice(&be_bytes);
                }
                SolidityValue::Address(addr_str) => {
                    let addr_str_clean = addr_str.strip_prefix("0x").unwrap_or(addr_str);
                    let addr_bytes = hex::decode(addr_str_clean)?;
                    if addr_bytes.len() == 20 {
                        bytes[12..].copy_from_slice(&addr_bytes);
                    } else {
                        return Err(anyhow::anyhow!("Invalid address length"));
                    }
                }
                SolidityValue::Bool(b) => {
                    bytes[31] = if *b { 1 } else { 0 };
                }
                SolidityValue::String(s) => {
                    // Proper ABI encoding for strings is complex (requires offset/length encoding)
                    // For now, we'll encode the string length in the first 32 bytes
                    // and use a hash of the string content (simplified approach)
                    // TODO: Implement full ABI string encoding
                    let len = s.len() as u64;
                    let len_bytes = len.to_be_bytes();
                    bytes[24..].copy_from_slice(&len_bytes);
                    // For constructor, we'll need proper encoding - this is a placeholder
                    // that may not work for all contracts
                }
                SolidityValue::Bytes(bs) => {
                    // Similar to string - simplified encoding
                    let hash = sha3::Keccak256::digest(bs);
                    bytes[..32].copy_from_slice(&hash[..32]);
                }
                _ => {
                    // For other types, use a simplified encoding
                    // TODO: Implement proper ABI encoding for all types
                    return Err(anyhow::anyhow!("Unsupported type for ABI encoding: {:?}", arg));
                }
            }
            
            encoded.extend_from_slice(&bytes);
        }
        
        Ok(encoded)
    }
    
    /// Format arguments for human-readable display in error messages
    fn format_args_for_display(&self, args: &[SolidityValue]) -> String {
        args.iter()
            .map(|arg| self.format_value_for_display(arg))
            .collect::<Vec<_>>()
            .join(", ")
    }
    
    /// Format a single value for display
    fn format_value_for_display(&self, value: &SolidityValue) -> String {
        match value {
            SolidityValue::Uint8(v) => format!("{}", v),
            SolidityValue::Uint16(v) => format!("{}", v),
            SolidityValue::Uint32(v) => format!("{}", v),
            SolidityValue::Uint64(v) => format!("{}", v),
            SolidityValue::Uint128(v) => format!("{}", v),
            SolidityValue::Uint256(v) => format!("{}", v),
            SolidityValue::Int8(v) => format!("{}", v),
            SolidityValue::Int16(v) => format!("{}", v),
            SolidityValue::Int32(v) => format!("{}", v),
            SolidityValue::Int64(v) => format!("{}", v),
            SolidityValue::Int128(v) => format!("{}", v),
            SolidityValue::Int256(v) => format!("{}", v),
            SolidityValue::Address(addr) => {
                if addr.len() > 10 {
                    format!("{}...{}", &addr[..5], &addr[addr.len()-2..])
                } else {
                    addr.clone()
                }
            },
            SolidityValue::Bool(b) => format!("{}", b),
            SolidityValue::String(s) => {
                if s.len() > 30 {
                    format!("\"{}...\"", &s[..27])
                } else {
                    format!("\"{}\"", s)
                }
            },
            SolidityValue::Bytes(bs) => {
                if bs.len() > 8 {
                    format!("0x{}...", hex::encode(&bs[..8]))
                } else {
                    format!("0x{}", hex::encode(bs))
                }
            },
            SolidityValue::Bytes1(bs) => format!("0x{}", hex::encode(bs)),
            SolidityValue::Bytes2(bs) => format!("0x{}", hex::encode(bs)),
            SolidityValue::Bytes4(bs) => format!("0x{}", hex::encode(bs)),
            SolidityValue::Bytes8(bs) => format!("0x{}", hex::encode(bs)),
            SolidityValue::Bytes16(bs) => format!("0x{}...", hex::encode(&bs[..8])),
            SolidityValue::Bytes32(bs) => format!("0x{}...", hex::encode(&bs[..8])),
            SolidityValue::Array(values) => {
                if values.len() > 3 {
                    format!("[{} items]", values.len())
                } else {
                    let items = values.iter()
                        .map(|v| self.format_value_for_display(v))
                        .collect::<Vec<_>>()
                        .join(", ");
                    format!("[{}]", items)
                }
            },
            SolidityValue::Struct(_) => "struct{...}".to_string(),
        }
    }

    fn generate_random_value(&mut self, sol_type: &SolidityType) -> SolidityValue {
        match sol_type {
            SolidityType::Uint8 => SolidityValue::Uint8(self.rng.gen()),
            SolidityType::Uint16 => SolidityValue::Uint16(self.rng.gen()),
            SolidityType::Uint32 => SolidityValue::Uint32(self.rng.gen()),
            SolidityType::Uint64 => SolidityValue::Uint64(self.rng.gen()),
            SolidityType::Uint128 => SolidityValue::Uint128(self.rng.gen()),
            SolidityType::Uint256 => {
                let strategy = self.rng.gen_range(0..100);
                let val = match strategy {
                    // 20% - Very small values (0-100) - good for: counters, indices, percentages, small IDs
                    0..=19 => self.rng.gen_range(0..101),
                    // 20% - Small-medium values (100-100,000) - good for: amounts, IDs, array sizes
                    20..=39 => self.rng.gen_range(100..100_001),
                    // 15% - Medium-large values (100k-10M) - good for: larger amounts, timestamps (recent years)
                    40..=54 => self.rng.gen_range(100_000..10_000_001),
                    // 10% - Edge cases: boundaries that often cause bugs
                    55..=64 => {
                        match self.rng.gen_range(0..6) {
                            0 => 0,                    // Minimum value
                            1 => 1,                    // Smallest non-zero
                            2 => 2,                    // Common threshold
                            3 => u32::MAX as u128,     // 32-bit boundary
                            4 => u64::MAX as u128,     // 64-bit boundary
                            _ => u128::MAX,            // Maximum uint256 (2^256-1)
                        }
                    },
                    // 15% - Powers of 2 (useful for: bit flags, sizes, testing overflow at boundaries)
                    65..=79 => {
                        let power = self.rng.gen_range(0..256); // 2^0 to 2^255
                        if power < 128 {
                            1u128 << power
                        } else {
                            // For powers > 127, use a large value close to max
                            u128::MAX >> self.rng.gen_range(0..10)
                        }
                    },
                    // 10% - Powers of 10 (useful for: decimal math, price calculations)
                    80..=89 => {
                        let power = self.rng.gen_range(0..39); // 10^0 to 10^38 (uint256 max is ~10^77)
                        if power <= 18 {
                            10u128.pow(power)
                        } else {
                            // For larger powers, use multiplier
                            let base = self.rng.gen_range(1..1000);
                            (base as u128) * 10u128.pow(18)
                        }
                    },
                    // 10% - Large random values (stress testing, overflow detection)
                    _ => self.rng.gen::<u128>(),
                };
                SolidityValue::Uint256(val.to_string())
            },
            SolidityType::Int8 => SolidityValue::Int8(self.rng.gen()),
            SolidityType::Int16 => SolidityValue::Int16(self.rng.gen()),
            SolidityType::Int32 => SolidityValue::Int32(self.rng.gen()),
            SolidityType::Int64 => SolidityValue::Int64(self.rng.gen()),
            SolidityType::Int128 => SolidityValue::Int128(self.rng.gen()),
            SolidityType::Int256 => {
                // General-purpose signed integer generation
                let strategy = self.rng.gen_range(0..100);
                let val = match strategy {
                    // 25% - Small values around zero
                    0..=24 => self.rng.gen_range(-100..101),
                    // 25% - Medium positive and negative values
                    25..=49 => self.rng.gen_range(-100_000..100_001),
                    // 15% - Edge cases for signed integers
                    50..=64 => {
                        match self.rng.gen_range(0..6) {
                            0 => 0,                       // Zero
                            1 => 1,                       // Positive one
                            2 => -1,                      // Negative one
                            3 => i32::MAX as i128,        // 32-bit max
                            4 => i32::MIN as i128,        // 32-bit min
                            _ => i64::MAX as i128,        // 64-bit max
                        }
                    },
                    // 15% - Negative boundary testing
                    65..=79 => {
                        let positive = self.rng.gen_range(1..1_000_000);
                        -(positive as i128)
                    },
                    // 20% - Large random values (both positive and negative)
                    _ => self.rng.gen::<i64>() as i128,
                };
                SolidityValue::Int256(val.to_string())
            },
            SolidityType::Address => {
                // General-purpose address generation
                let strategy = self.rng.gen_range(0..100);
                let addr = match strategy {
                    // 25% - Use known test accounts (good for testing with actual funded/privileged accounts)
                    0..=24 => {
                        let test_accounts = [
                            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // (deployer)
                            "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                            "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                            "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
                            "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
                        ];
                        test_accounts[self.rng.gen_range(0..test_accounts.len())].to_string()
                    },
                    // 10% - Zero address (important edge case: often used for burn, null checks, special logic)
                    25..=34 => "0x0000000000000000000000000000000000000000".to_string(),
                    // 5% - Address(1), Address(2) etc - common for precompiles and special addresses
                    35..=39 => {
                        let low_addr = self.rng.gen_range(1..20);
                        format!("0x{:040x}", low_addr)
                    },
                    // 60% - Random addresses (tests arbitrary interactions, access control, etc.)
                    _ => format!("0x{:040x}", self.rng.gen::<u128>() & 0xFFFFFFFFFFFFFFFFFFFFu128),
                };
                SolidityValue::Address(addr)
            },
            SolidityType::Bool => SolidityValue::Bool(self.rng.gen()),
            SolidityType::String => {
                // Generate more realistic ASCII strings instead of random unicode
                let length = self.rng.gen_range(0..50);
                let chars: String = (0..length)
                    .map(|_| {
                        // Printable ASCII characters (space to ~)
                        (self.rng.gen_range(32..127)) as u8 as char
                    })
                    .collect();
                SolidityValue::String(chars)
            },
            SolidityType::Bytes => {
                // Smaller, more realistic byte arrays
                let length = self.rng.gen_range(0..256);
                let bytes: Vec<u8> = (0..length).map(|_| self.rng.gen()).collect();
                SolidityValue::Bytes(bytes)
            },
            SolidityType::Array(inner_type) => {
                let length = self.rng.gen_range(0..10);
                let values: Vec<SolidityValue> = (0..length)
                    .map(|_| self.generate_random_value(inner_type))
                    .collect();
                SolidityValue::Array(values)
            },
            SolidityType::Bytes1 => {
                let bytes: [u8; 1] = [self.rng.gen()];
                SolidityValue::Bytes1(bytes)
            },
            SolidityType::Bytes2 => {
                let bytes: [u8; 2] = [self.rng.gen(), self.rng.gen()];
                SolidityValue::Bytes2(bytes)
            },
            SolidityType::Bytes4 => {
                let bytes: [u8; 4] = [self.rng.gen(), self.rng.gen(), self.rng.gen(), self.rng.gen()];
                SolidityValue::Bytes4(bytes)
            },
            SolidityType::Bytes8 => {
                let bytes: [u8; 8] = [self.rng.gen(); 8];
                SolidityValue::Bytes8(bytes)
            },
            SolidityType::Bytes16 => {
                let bytes: [u8; 16] = [self.rng.gen(); 16];
                SolidityValue::Bytes16(bytes)
            },
            SolidityType::Bytes32 => {
                let bytes: [u8; 32] = [self.rng.gen(); 32];
                SolidityValue::Bytes32(bytes)
            },
            _ => SolidityValue::String("default".to_string()),
        }
    }

}
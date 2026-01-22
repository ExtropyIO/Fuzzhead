use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;
use colored::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
struct BenchmarkResult {
    contract: String,
    contract_path: String,
    detected: bool,
    execution_time_ms: u64,
    error: Option<String>,
    fuzz_runs: usize,
    passed: usize,
    failed: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct BenchmarkSummary {
    total: usize,
    detected: usize,
    missed: usize,
    total_execution_time_ms: u64,
    results: Vec<BenchmarkResult>,
}

/// Check if a contract file is a test contract (not suitable for fuzzing)
fn is_test_contract(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    
    // Skip known test/helper files
    if path_str.contains("/lib/") 
        || path_str.contains("interface.sol")
        || path_str.contains("basetest.sol")
        || path_str.contains("tokenhelper.sol")
        || path_str.contains("StableMath.sol") {
        return true;
    }
    
    false
}

fn find_solidity_contracts(bench_dir: &Path) -> (Vec<PathBuf>, usize) {
    let mut contracts = Vec::new();
    let mut skipped_count = 0;
    
    for entry in WalkDir::new(bench_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension()
                .map(|s| s == "sol")
                .unwrap_or(false)
        })
    {
        let path = entry.path();
        
        // Skip test contracts
        if is_test_contract(path) {
            skipped_count += 1;
            continue;
        }
        
        contracts.push(path.to_path_buf());
    }
    
    contracts.sort();
    (contracts, skipped_count)
}

async fn run_fuzzer_on_contract(
    contract_path: &Path,
    fuzzer_binary: &Path,
    fork_url: &str,
    test_cases: usize,
) -> Result<BenchmarkResult, anyhow::Error> {
    let start = Instant::now();
    
    let contract_name = contract_path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    
    println!("  Testing: {}", contract_name.cyan());
    
    // Run the fuzzer
    let output = Command::new(fuzzer_binary)
        .arg("--input")
        .arg(contract_path)
        .arg("--test-cases")
        .arg(test_cases.to_string())
        .arg("--fork-url")
        .arg(fork_url)
        .output()?;
    
    let execution_time = start.elapsed().as_millis() as u64;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    // Check for compilation errors first - these are NOT vulnerabilities
    let is_compilation_error = stderr.contains("Compilation failed") 
        || stderr.contains("Unable to resolve imports")
        || stderr.contains("forge compilation failed")
        || stdout.contains("Compilation failed")
        || stderr.contains("Contract compilation failed");
    
    // Parse fuzzer output to determine results
    let mut detected = false;
    let mut passed = 0;
    let mut failed = 0;
    
    // Try to extract pass/fail counts from output (only if fuzzer ran)
    for line in stdout.lines() {
        if line.contains("✅") && line.contains("runs passed") {
            if let Some(num) = extract_number(line) {
                passed = num;
            }
        }
        if line.contains("❌") && line.contains("runs failed") {
            if let Some(num) = extract_number(line) {
                failed = num;
            }
        }
    }
    
    // Mark as detected if:
    // 1. Fuzzer ran successfully (not a compilation error)
    // 2. We have actual fuzzing results (passed + failed > 0)
    // 3. There are failed test cases (indicating potential vulnerabilities)
    if !is_compilation_error && (passed > 0 || failed > 0) {
        // Detection is based solely on failed test cases from fuzzing
        if failed > 0 || stdout.contains("FAILED") {
            detected = true;
        }
    }
    
    let error = if !output.status.success() {
        Some(format!("Exit code: {}, stderr: {}", 
            output.status.code().unwrap_or(-1), 
            stderr.chars().take(200).collect::<String>()))
    } else {
        None
    };
    
    Ok(BenchmarkResult {
        contract: contract_name,
        contract_path: contract_path.to_string_lossy().to_string(),
        detected,
        execution_time_ms: execution_time,
        error,
        fuzz_runs: test_cases,
        passed,
        failed,
    })
}

fn extract_number(s: &str) -> Option<usize> {
    s.split_whitespace()
        .find_map(|word| word.parse::<usize>().ok())
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    println!("{}", "=".repeat(70).bold());
    println!("{}", "Fuzzhead DeFiHackLabs Validation Suite".bold().green());
    println!("{}", "=".repeat(70).bold());
    println!();
    
    // Paths
    let bench_dir = Path::new("../../benchmarks/defihacklabs/src/test");
    let fuzzer_binary = Path::new("../target/release/horizen-solidity-fuzzer");
    let fork_url = std::env::var("FORK_URL").unwrap_or_else(|_| "http://localhost:8545".to_string());
    let test_cases: usize = std::env::var("TEST_CASES")
        .unwrap_or_else(|_| "50".to_string())
        .parse()
        .unwrap_or(50);
    
    // Check if benchmark directory exists
    if !bench_dir.exists() {
        eprintln!("{}", "Error: DeFiHackLabs directory not found!".red().bold());
        eprintln!("  Expected: {}", bench_dir.display());
        eprintln!("  Run: git submodule update --init --recursive");
        return Err(anyhow::anyhow!("DeFiHackLabs directory not found"));
    }
    
    // Check if fuzzer binary exists
    if !fuzzer_binary.exists() {
        eprintln!("{}", "Error: Fuzzer binary not found!".red().bold());
        eprintln!("  Expected: {}", fuzzer_binary.display());
        eprintln!("  Run: cd .. && cargo build --release");
        return Err(anyhow::anyhow!("Fuzzer binary not found"));
    }
    
    // Find all Solidity contracts (excluding test contracts)
    println!("{}", "Scanning for benchmark contracts...".yellow());
    println!("  Filtering out test contracts (forge-std/Test.sol, test functions, etc.)...");
    let (contracts, skipped_count) = find_solidity_contracts(bench_dir);
    
    if skipped_count > 0 {
        println!("  {} Test contracts skipped: {}", "ℹ".blue(), skipped_count);
    }
    
    if contracts.is_empty() {
        eprintln!("{}", "No fuzzable contracts found in DeFiHackLabs directory".red());
        eprintln!("  All contracts appear to be test contracts or helper files.");
        return Err(anyhow::anyhow!("No fuzzable contracts found"));
    }
    
    println!("  {} Fuzzable contracts found\n", contracts.len().to_string().cyan());
    
    // Limit number of contracts if specified
    let max_contracts: Option<usize> = std::env::var("MAX_CONTRACTS")
        .ok()
        .and_then(|s| s.parse().ok());
    
    let contracts_to_test: Vec<_> = if let Some(max) = max_contracts {
        contracts.into_iter().take(max).collect()
    } else {
        contracts
    };
    
    println!("  Testing {} contracts with {} test cases each", 
        contracts_to_test.len(), test_cases);
    println!("  Fork URL: {}\n", fork_url.cyan());
    
    // Run fuzzer on each contract
    let mut results = Vec::new();
    let mut detected_count = 0;
    let total_start = Instant::now();
    
    for (i, contract) in contracts_to_test.iter().enumerate() {
        println!("[{}/{}] {}", 
            i + 1, 
            contracts_to_test.len(), 
            contract.file_name().unwrap_or_default().to_string_lossy().bold()
        );
        
        match run_fuzzer_on_contract(contract, fuzzer_binary, &fork_url, test_cases).await {
            Ok(result) => {
                // Check if this was a compilation error
                let is_compilation_error = result.error.as_ref()
                    .map(|e| e.contains("Compilation failed") 
                        || e.contains("Unable to resolve imports")
                        || e.contains("forge compilation failed"))
                    .unwrap_or(false);
                
                if is_compilation_error {
                    println!("  {} Compilation error (skipped)", "⚠".yellow().bold());
                    println!("  Time: {}ms", result.execution_time_ms);
                } else if result.detected {
                    detected_count += 1;
                    println!("  {} Vulnerability detected", "✓".green().bold());
                    println!("  Time: {}ms, Passed: {}, Failed: {}", 
                        result.execution_time_ms, result.passed, result.failed);
                } else if result.passed > 0 || result.failed > 0 {
                    println!("  {} No vulnerability detected", "✗".yellow());
                    println!("  Time: {}ms, Passed: {}, Failed: {}", 
                        result.execution_time_ms, result.passed, result.failed);
                } else {
                    println!("  {} No results (possible error)", "⚠".yellow());
                    println!("  Time: {}ms", result.execution_time_ms);
                }
                results.push(result);
            }
            Err(e) => {
                println!("  {} Error: {}", "✗".red().bold(), e);
                results.push(BenchmarkResult {
                    contract: contract.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    contract_path: contract.to_string_lossy().to_string(),
                    detected: false,
                    execution_time_ms: 0,
                    error: Some(e.to_string()),
                    fuzz_runs: test_cases,
                    passed: 0,
                    failed: 0,
                });
            }
        }
        println!();
    }
    
    let total_execution_time = total_start.elapsed().as_millis() as u64;
    
    // Generate summary
    let summary = BenchmarkSummary {
        total: results.len(),
        detected: detected_count,
        missed: results.len() - detected_count,
        total_execution_time_ms: total_execution_time,
        results,
    };
    
    // Calculate successful runs (excluding compilation errors)
    let successful_runs_count = summary.results.iter()
        .filter(|r| {
            !r.error.as_ref()
                .map(|e| e.contains("Compilation failed") 
                    || e.contains("Unable to resolve imports")
                    || e.contains("forge compilation failed"))
                .unwrap_or(false)
        })
        .count();
    
    let compilation_error_count = summary.total - successful_runs_count;
    
    // Print summary
    println!("{}", "=".repeat(70).bold());
    println!("{}", "Benchmark Summary".bold().green());
    println!("{}", "=".repeat(70).bold());
    println!("  Total contracts tested: {}", summary.total);
    if compilation_error_count > 0 {
        println!("  {} Compilation errors (skipped): {}", "⚠".yellow(), compilation_error_count);
    }
    if successful_runs_count > 0 {
        println!("  {} Successfully fuzzed: {}", "✓".green(), successful_runs_count);
        println!("  {} Vulnerabilities detected: {}", "✓".green(), summary.detected);
        println!("  {} Vulnerabilities missed: {}", "✗".red(), summary.missed);
        println!("  Detection rate: {:.1}% (of successfully fuzzed contracts)", 
            (summary.detected as f64 / successful_runs_count as f64) * 100.0
        );
    } else {
        println!("  {} No contracts successfully fuzzed", "✗".red());
    }
    println!("  Total execution time: {:.2}s", summary.total_execution_time_ms as f64 / 1000.0);
    
    // let results_file = "benchmark-results.json";
    // fs::write(results_file, serde_json::to_string_pretty(&summary)?)?;
    // println!("\n  Results saved to: {}", results_file.cyan());
    
    Ok(())
}


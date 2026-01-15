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
    vulnerability_type: String,
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

fn find_solidity_contracts(bench_dir: &Path) -> Vec<PathBuf> {
    let mut contracts = Vec::new();
    
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
        // Skip library files and interfaces
        let path_str = path.to_string_lossy();
        if !path_str.contains("/lib/") 
            && !path_str.contains("interface.sol")
            && !path_str.contains("basetest.sol")
            && !path_str.contains("tokenhelper.sol")
            && !path_str.contains("StableMath.sol") {
            contracts.push(path.to_path_buf());
        }
    }
    
    contracts.sort();
    contracts
}

fn get_vulnerability_type(contract_path: &Path) -> String {
    let path_str = contract_path.to_string_lossy().to_lowercase();
    let filename = contract_path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    
    // Extract vulnerability type from path or filename
    if path_str.contains("reentrancy") || filename.contains("reentrancy") {
        "reentrancy".to_string()
    } else if path_str.contains("overflow") || filename.contains("overflow") {
        "integer_overflow".to_string()
    } else if path_str.contains("access") || filename.contains("access") {
        "access_control".to_string()
    } else if path_str.contains("unchecked") || filename.contains("unchecked") {
        "unchecked_call".to_string()
    } else if path_str.contains("flashloan") || filename.contains("flashloan") {
        "flashloan".to_string()
    } else if path_str.contains("price") || filename.contains("price") {
        "price_manipulation".to_string()
    } else if path_str.contains("logic") || filename.contains("logic") {
        "logic_flaw".to_string()
    } else if path_str.contains("oracle") || filename.contains("oracle") {
        "bad_oracle".to_string()
    } else {
        "unknown".to_string()
    }
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
    
    // Parse fuzzer output to determine results
    let mut detected = false;
    let mut passed = 0;
    let mut failed = 0;
    
    // Look for indicators of vulnerability detection
    if stdout.contains("FAILED") 
        || stdout.contains("vulnerability")
        || stdout.contains("revert")
        || stdout.contains("reentrancy")
        || stdout.contains("access control")
        || stderr.contains("error") {
        detected = true;
    }
    
    // Try to extract pass/fail counts from output
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
        vulnerability_type: get_vulnerability_type(contract_path),
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
    
    // Find all Solidity contracts
    println!("{}", "Scanning for benchmark contracts...".yellow());
    let contracts = find_solidity_contracts(bench_dir);
    
    if contracts.is_empty() {
        eprintln!("{}", "No Solidity contracts found in DeFiHackLabs directory".red());
        return Err(anyhow::anyhow!("No contracts found"));
    }
    
    println!("  Found {} contracts\n", contracts.len().to_string().cyan());
    
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
                if result.detected {
                    detected_count += 1;
                    println!("  {} Vulnerability detected", "✓".green().bold());
                } else {
                    println!("  {} No vulnerability detected", "✗".yellow());
                }
                println!("  Time: {}ms, Passed: {}, Failed: {}", 
                    result.execution_time_ms, result.passed, result.failed);
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
                    vulnerability_type: get_vulnerability_type(contract),
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
    
    // Print summary
    println!("{}", "=".repeat(70).bold());
    println!("{}", "Benchmark Summary".bold().green());
    println!("{}", "=".repeat(70).bold());
    println!("  Total contracts tested: {}", summary.total);
    println!("  {} Vulnerabilities detected: {}", "✓".green(), summary.detected);
    println!("  {} Vulnerabilities missed: {}", "✗".red(), summary.missed);
    if summary.total > 0 {
        println!("  Detection rate: {:.1}%", 
            (summary.detected as f64 / summary.total as f64) * 100.0
        );
    }
    println!("  Total execution time: {:.2}s", summary.total_execution_time_ms as f64 / 1000.0);
    
    // Save results to JSON
    let results_file = "benchmark-results.json";
    fs::write(results_file, serde_json::to_string_pretty(&summary)?)?;
    println!("\n  Results saved to: {}", results_file.cyan());
    
    Ok(())
}


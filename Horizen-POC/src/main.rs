use clap::Parser;
use std::fs;
use std::path::Path;
use tracing::{error, warn};
use crate::fuzz_solidity::SolidityFuzzer;

mod types;
mod ast_parser;
mod fuzz_solidity;

#[derive(Parser)]
#[command(name = "horizen-solidity-fuzzer")]
#[command(about = "A Solidity fuzzer for Horizen smart contracts")]
#[command(version)]
struct Cli {
    /// Path to the Solidity contract file or directory
    #[arg(short, long)]
    input: String,

    /// Number of test cases to generate per method
    #[arg(short, long, default_value = "100")]
    test_cases: usize,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}


#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.verbose {
        tracing::Level::DEBUG
    } else {
        tracing::Level::INFO
    };

    tracing_subscriber::fmt()
        .with_max_level(log_level)
        .init();

    // Process input (file or directory)
    let input_path = Path::new(&cli.input);
    if input_path.is_file() {
        process_single_file(&cli, input_path).await?;
    } else if input_path.is_dir() {
        process_directory(&cli, input_path).await?;
    } else {
        error!("Input path does not exist: {}", cli.input);
        return Err("Invalid input path".into());
    }

    Ok(())
}

async fn process_single_file(_cli: &Cli, file_path: &Path) -> Result<(), Box<dyn std::error::Error>> {

    let source = fs::read_to_string(file_path)?;
    let mut fuzzer = SolidityFuzzer::new();

    // Run fuzzing
    let _summary = fuzzer.fuzz_contract(&source, file_path.to_str().unwrap())?;
    
    Ok(())
}

async fn process_directory(_cli: &Cli, dir_path: &Path) -> Result<(), Box<dyn std::error::Error>> {

    let mut total_passed = 0;
    let mut total_failed = 0;
    let mut total_skipped = 0;

    // Find all Solidity files
    let solidity_files = find_solidity_files(dir_path)?;

    let file_count = solidity_files.len();
    for file_path in solidity_files {
        
        let source = fs::read_to_string(&file_path)?;
        let mut fuzzer = SolidityFuzzer::new();

        match fuzzer.fuzz_contract(&source, file_path.to_str().unwrap()) {
            Ok(summary) => {
                total_passed += summary.total_passed;
                total_failed += summary.total_failed;
                total_skipped += summary.total_skipped;
            }
            Err(e) => {
                warn!("Failed to process {}: {}", file_path.display(), e);
            }
        }
    }

    // Print combined summary
    println!("\n🏁 Combined Fuzzing Summary:");
    println!("   ✅ {} total runs passed", total_passed);
    println!("   ❌ {} total runs failed", total_failed);
    if total_skipped > 0 {
        println!("   ⏭️  {} total runs skipped", total_skipped);
    }
    println!("   📊 Total: {} runs across {} files", total_passed + total_failed + total_skipped, file_count);

    Ok(())
}

fn find_solidity_files(dir_path: &Path) -> Result<Vec<std::path::PathBuf>, Box<dyn std::error::Error>> {
    let mut solidity_files = Vec::new();
    
    for entry in fs::read_dir(dir_path)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(extension) = path.extension() {
                if extension == "sol" {
                    solidity_files.push(path);
                }
            }
        } else if path.is_dir() {
            // Recursively search subdirectories
            let sub_files = find_solidity_files(&path)?;
            solidity_files.extend(sub_files);
        }
    }
    
    Ok(solidity_files)
}

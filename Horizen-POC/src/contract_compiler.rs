use anyhow::{Context, Result};
use std::process::Command;
use std::path::Path;
use serde_json::Value;
use tracing::{debug, warn};
use ethers::abi::Abi;

/// Contract compiler using forge or solc
pub struct ContractCompiler {
    /// Path to forge executable (if available)
    forge_path: Option<String>,
    /// Path to solc executable (if available)
    solc_path: Option<String>,
}

impl ContractCompiler {
    pub fn new() -> Self {
        // Try to find forge or solc in PATH
        let forge_path = Self::find_executable("forge");
        let solc_path = Self::find_executable("solc");
        
        if forge_path.is_none() && solc_path.is_none() {
            warn!("Neither 'forge' nor 'solc' found in PATH. Contract compilation will fail.");
            warn!("Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup");
            warn!("Or install solc: https://docs.soliditylang.org/en/latest/installing-solidity.html");
        }
        
        Self {
            forge_path,
            solc_path,
        }
    }
    
    pub fn compile_contract(&self, source_path: &Path, contract_name: &str) -> Result<Vec<u8>> {
        let (bytecode, _abi) = self.compile_contract_with_abi(source_path, contract_name)?;
        Ok(bytecode)
    }
    
    pub fn compile_contract_with_abi(&self, source_path: &Path, contract_name: &str) -> Result<(Vec<u8>, Abi)> {
        // Prefer forge if available (Foundry's compiler)
        if let Some(ref forge) = self.forge_path {
            return self.compile_with_forge_full(source_path, contract_name, forge);
        }
        
        // Fall back to solc
        if let Some(ref solc) = self.solc_path {
            return self.compile_with_solc_full(source_path, contract_name, solc);
        }
        
        Err(anyhow::anyhow!(
            "No compiler available. Install Foundry (forge) or solc."
        ))
    }
    
    fn compile_with_forge_full(
        &self,
        source_path: &Path,
        contract_name: &str,
        forge_path: &str,
    ) -> Result<(Vec<u8>, Abi)> {
        debug!("Compiling {} with forge", contract_name);
        
        let temp_dir = std::env::temp_dir().join(format!("fuzzhead_compile_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir)?;
        std::fs::create_dir_all(temp_dir.join("src"))?;
        
        let temp_source = temp_dir.join("src").join(source_path.file_name().unwrap());
        std::fs::copy(source_path, &temp_source)?;
        
        let _init_output = Command::new(forge_path)
            .args(&["init", "--force", "--no-git", "--no-commit"])
            .current_dir(&temp_dir)
            .output();
        
        let _ = std::fs::remove_file(temp_dir.join("src").join("Counter.sol"));
        
        let output = Command::new(forge_path)
            .args(&["build", "--force"])
            .current_dir(&temp_dir)
            .output()
            .context("Failed to execute forge build")?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(anyhow::anyhow!("Forge compilation failed:\nSTDOUT: {}\nSTDERR: {}", stdout, stderr));
        }
        
        // Read the compiled artifact
        // Forge artifact path: out/ContractName.sol/ContractName.json
        let file_stem = source_path.file_stem().unwrap().to_str().unwrap();
        let artifact_path = temp_dir
            .join("out")
            .join(format!("{}.sol", file_stem))
            .join(format!("{}.json", contract_name));
        
        if !artifact_path.exists() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(anyhow::anyhow!("Compiled artifact not found at: {:?}", artifact_path));
        }
        
        let artifact_content = std::fs::read_to_string(&artifact_path)?;
        let artifact: Value = serde_json::from_str(&artifact_content)
            .context("Failed to parse forge artifact JSON")?;
        
        // Extract bytecode (forge uses "bytecode" -> "object")
        let bytecode_hex = artifact
            .get("bytecode")
            .and_then(|v| v.get("object"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                // Try alternative format
                artifact.get("bytecode").and_then(|v| v.as_str())
            })
            .context("Bytecode not found in artifact")?;
        
        // Extract ABI
        let abi_value = artifact
            .get("abi")
            .context("ABI not found in artifact")?;
        
        let abi: Abi = serde_json::from_value(abi_value.clone())
            .context("Failed to parse ABI")?;
        
        // Clean up temp directory
        let _ = std::fs::remove_dir_all(&temp_dir);
        
        // Decode hex to bytes
        let bytecode = hex::decode(bytecode_hex.strip_prefix("0x").unwrap_or(bytecode_hex))?;
        
        Ok((bytecode, abi))
    }
    
    /// Compile using solc (Solidity compiler) and return both bytecode and ABI
    fn compile_with_solc_full(
        &self,
        source_path: &Path,
        contract_name: &str,
        solc_path: &str,
    ) -> Result<(Vec<u8>, Abi)> {
        debug!("Compiling {} with solc", contract_name);
        
        let output = Command::new(solc_path)
            .args(&[
                "--optimize",
                "--combined-json", "bin,abi",
                source_path.to_str().unwrap(),
            ])
            .output()
            .context("Failed to execute solc")?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Solc compilation failed: {}", stderr));
        }
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let json: Value = serde_json::from_str(&stdout)
            .context("Failed to parse solc JSON output")?;
        
        // Extract bytecode from combined JSON
        let contracts = json
            .get("contracts")
            .context("No 'contracts' in solc output")?;
        
        // Find the contract (format: "filename:ContractName")
        let contract_key = format!("{}:{}", source_path.file_name().unwrap().to_str().unwrap(), contract_name);
        let contract = contracts
            .get(&contract_key)
            .context(format!("Contract {} not found in compilation output", contract_name))?;
        
        let bytecode_hex = contract
            .get("bin")
            .and_then(|v| v.as_str())
            .context("Bytecode not found in contract")?;
        
        let abi_str = contract
            .get("abi")
            .and_then(|v| v.as_str())
            .context("ABI not found in contract")?;
        
        let abi: Abi = serde_json::from_str(abi_str)
            .context("Failed to parse ABI")?;
        
        // Decode hex to bytes
        let bytecode = hex::decode(bytecode_hex)?;
        
        Ok((bytecode, abi))
    }
    
    /// Find an executable in PATH
    fn find_executable(name: &str) -> Option<String> {
        if let Ok(output) = Command::new("which").arg(name).output() {
            if output.status.success() {
                if let Ok(path) = String::from_utf8(output.stdout) {
                    return Some(path.trim().to_string());
                }
            }
        }
        None
    }
}

impl Default for ContractCompiler {
    fn default() -> Self {
        Self::new()
    }
}


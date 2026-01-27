use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use tracing::{debug, warn};

pub struct AnvilForkExecutor {
    rpc_url: String,
    client: reqwest::Client,
    deployed_contracts: HashMap<String, String>,
    accounts: Vec<String>,
    current_sender: String,
    nonces: HashMap<String, u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
    id: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TransactionReceipt {
    #[serde(rename = "contractAddress")]
    contract_address: Option<String>,
    status: Option<String>,
    #[serde(rename = "gasUsed")]
    gas_used: Option<String>,
}

impl AnvilForkExecutor {
    pub async fn new(rpc_url: &str) -> Result<Self> {
        debug!("Connecting to Anvil at: {}", rpc_url);
        
        let client = reqwest::Client::new();
        
        let accounts = Self::get_anvil_accounts(&client, rpc_url).await?;
        
        if accounts.is_empty() {
            return Err(anyhow::anyhow!("No accounts found from Anvil"));
        }
        
        debug!("Found {} accounts from Anvil", accounts.len());
        
        // Initialize nonces for each account
        let mut nonces = HashMap::new();
        for account in &accounts {
            let nonce = Self::get_transaction_count(&client, rpc_url, account).await
                .unwrap_or(0);
            nonces.insert(account.clone(), nonce);
        }
        
        Ok(Self {
            rpc_url: rpc_url.to_string(),
            client,
            deployed_contracts: HashMap::new(),
            accounts: accounts.clone(),
            current_sender: accounts[0].clone(),
            nonces,
        })
    }
    
    async fn rpc_call(
        client: &reqwest::Client,
        url: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
            id: 1,
        };
        
        let response = client
            .post(url)
            .json(&request)
            .send()
            .await
            .context("Failed to send RPC request")?;
        
        let rpc_response: JsonRpcResponse = response
            .json()
            .await
            .context("Failed to parse RPC response")?;
        
        if let Some(error) = rpc_response.error {
            // Check if this is a method not supported error (common with public RPCs)
            if error.code == -32601 || error.message.contains("not supported") || error.message.contains("method not found") {
                if method == "eth_sendTransaction" {
                    return Err(anyhow::anyhow!(
                        "RPC error: {} (code: {})\n\n\
                        ⚠️  This RPC endpoint does not support eth_sendTransaction.\n\
                        Public RPCs are read-only and cannot send transactions.\n\n\
                        Solution: Start Anvil locally with --fork-url pointing to your RPC:\n\
                        \t anvil --fork-url {}\n\
                        Then connect to Anvil at http://localhost:8545",
                        error.message, error.code, url
                    ));
                }
            }
            return Err(anyhow::anyhow!("RPC error: {} (code: {})", error.message, error.code));
        }
        
        if rpc_response.result.is_none() {
            warn!("RPC call to {} returned no result. Full response: {:?}", method, rpc_response);
            if method == "eth_sendTransaction" {
                warn!("⚠️  eth_sendTransaction returned no result. This usually means:\n\
                      - The RPC endpoint doesn't support sending transactions (public RPCs are read-only)\n\
                      - You need to use Anvil: 'anvil --fork-url <RPC_URL>' then connect to http://localhost:8545");
            }
        }
        
        rpc_response.result
            .context("No result in RPC response")
    }
    
    /// Get transaction count (nonce) for an address
    async fn get_transaction_count(
        client: &reqwest::Client,
        url: &str,
        address: &str,
    ) -> Result<u64> {
        let params = json!([address, "pending"]);
        let result = Self::rpc_call(client, url, "eth_getTransactionCount", params).await?;
        
        if let Some(hex_str) = result.as_str() {
            let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
            u64::from_str_radix(hex_clean, 16)
                .context("Failed to parse nonce")
        } else {
            Err(anyhow::anyhow!("Invalid nonce format"))
        }
    }
    
    /// Get balance for an address
    async fn get_balance(
        client: &reqwest::Client,
        url: &str,
        address: &str,
    ) -> Result<()> {
        let params = json!([address, "latest"]);
        Self::rpc_call(client, url, "eth_getBalance", params).await?;
        Ok(())
    }
    
    async fn get_anvil_accounts(client: &reqwest::Client, url: &str) -> Result<Vec<String>> {
        let anvil_accounts = vec![
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
            "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        ];
        
        let mut accounts = Vec::new();
        for addr_str in &anvil_accounts {
            match Self::get_balance(client, url, addr_str).await {
                Ok(_) => accounts.push(addr_str.to_string()),
                Err(_) => {
                    warn!("Account {} not found, skipping", addr_str);
                }
            }
        }
        
        if accounts.is_empty() {
            if let Some(first) = anvil_accounts.first() {
                accounts.push(first.to_string());
            }
        }
        
        Ok(accounts)
    }
    
    /// Deploy a contract to the Anvil fork
    pub async fn deploy_contract(
        &mut self,
        contract_name: &str,
        bytecode: &[u8],
        constructor_args: Option<&[u8]>,
    ) -> Result<String> {
        debug!("Deploying contract: {} to Anvil fork", contract_name);
        
        // Combine bytecode with constructor args if provided
        let mut deployment_bytecode = bytecode.to_vec();
        if let Some(args) = constructor_args {
            deployment_bytecode.extend_from_slice(args);
        }
        
        let bytecode_hex = format!("0x{}", hex::encode(&deployment_bytecode));
        
        // Get current nonce
        let nonce = self.nonces.get(&self.current_sender).copied().unwrap_or(0);
        let nonce_hex = format!("0x{:x}", nonce);
        
        // Create deployment transaction
        let tx_params = json!({
            "from": self.current_sender,
            "data": bytecode_hex,
            "value": "0x0",
            "nonce": nonce_hex,
            "gas": "0x1000000", // 16M gas limit (should be enough for most contracts)
        });
        
        let params = json!([tx_params]);
        
        // Send transaction
        let tx_hash = Self::rpc_call(&self.client, &self.rpc_url, "eth_sendTransaction", params).await?;
        
        let tx_hash_str = tx_hash.as_str()
            .context("Invalid transaction hash format")?;
        
        // Wait for transaction receipt
        let receipt = self.wait_for_transaction(tx_hash_str).await?;
        
        // Check if transaction succeeded
        let status = receipt.status.as_deref().unwrap_or("0x0");
        let success = status == "0x1" || status == "1";
        
        if !success {
            // Try to get revert reason by simulating the deployment
            let revert_reason = self.get_deployment_revert_reason(&bytecode_hex).await
                .unwrap_or_else(|_| "Unknown revert reason".to_string());
            
            return Err(anyhow::anyhow!(
                "Contract deployment failed: Transaction reverted (status: {})\nRevert reason: {}",
                status, revert_reason
            ));
        }
        
        // Extract contract address from receipt
        let contract_address = receipt.contract_address
            .context("No contract address in receipt - deployment may have failed")?;
        
        debug!("Contract {} deployed at: {}", contract_name, contract_address);
        
        // Store deployed contract info
        self.deployed_contracts.insert(
            contract_name.to_string(),
            contract_address.clone(),
        );
        
        // Increment nonce
        if let Some(nonce) = self.nonces.get_mut(&self.current_sender) {
            *nonce += 1;
        }
        
        Ok(contract_address)
    }
    
    /// Wait for a transaction to be mined
    async fn wait_for_transaction(&self, tx_hash: &str) -> Result<TransactionReceipt> {
        // Poll for receipt
        let mut attempts = 0;
        loop {
            let params = json!([tx_hash]);
            
            let request = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                method: "eth_getTransactionReceipt".to_string(),
                params,
                id: 1,
            };
            
            let response = self.client
                .post(&self.rpc_url)
                .json(&request)
                .send()
                .await
                .context("Failed to send RPC request")?;
            
            let rpc_response: JsonRpcResponse = response
                .json()
                .await
                .context("Failed to parse RPC response")?;
            
            if let Some(error) = rpc_response.error {
                return Err(anyhow::anyhow!("RPC error: {} (code: {})", error.message, error.code));
            }
            
            // null is a valid response (transaction not mined yet)
            if let Some(result) = rpc_response.result {
                if !result.is_null() {
                    let receipt: TransactionReceipt = serde_json::from_value(result)
                        .context("Failed to parse transaction receipt")?;
                    return Ok(receipt);
                }
            }
            
            attempts += 1;
            if attempts > 100 {
                return Err(anyhow::anyhow!("Transaction not mined after 100 attempts (10 seconds)"));
            }
            
            // Wait a bit before retrying
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }
    
    pub async fn call_method(
        &mut self,
        contract_name: &str,
        method_signature: &str,
        encoded_args: &[u8],
    ) -> Result<MethodExecutionResult> {
        let contract_address = self
            .deployed_contracts
            .get(contract_name)
            .ok_or_else(|| anyhow::anyhow!("Contract {} not deployed", contract_name))?;
        
        debug!(
            "Calling method {} on contract {} at {}",
            method_signature, contract_name, contract_address
        );
        
        // Calculate method selector (first 4 bytes of keccak256 hash of signature)
        let selector = calculate_selector(method_signature);
        
        // Combine selector with encoded args
        let mut call_data = selector.to_vec();
        call_data.extend_from_slice(encoded_args);
        
        let call_data_hex = format!("0x{}", hex::encode(&call_data));
        
        // Get current nonce
        let nonce = self.nonces.get(&self.current_sender).copied().unwrap_or(0);
        let nonce_hex = format!("0x{:x}", nonce);
        
        // Create call transaction
        let tx_params = json!({
            "from": self.current_sender,
            "to": contract_address,
            "data": call_data_hex,
            "value": "0x0",
            "nonce": nonce_hex,
            "gas": "0x1000000", // 16M gas limit
        });
        
        let params = json!([tx_params]);
        
        // Execute the call (send transaction for state changes)
        match Self::rpc_call(&self.client, &self.rpc_url, "eth_sendTransaction", params).await {
            Ok(tx_hash_value) => {
                let tx_hash = tx_hash_value.as_str()
                    .context("Invalid transaction hash")?;
                
                // Wait for receipt
                match self.wait_for_transaction(tx_hash).await {
                    Ok(receipt) => {
                        // Increment nonce
                        if let Some(nonce) = self.nonces.get_mut(&self.current_sender) {
                            *nonce += 1;
                        }
                        
                        let status = receipt.status.as_deref().unwrap_or("0x0");
                        let success = status == "0x1" || status == "1";
                        
                        let gas_used = receipt.gas_used
                            .and_then(|g| u64::from_str_radix(g.strip_prefix("0x").unwrap_or(&g), 16).ok())
                            .unwrap_or(0);
                        
                        if success {
                            Ok(MethodExecutionResult {
                                success: true,
                                gas_used,
                                return_data: vec![],
                                error: None,
                            })
                        } else {
                            // Try to get revert reason using eth_call to simulate the transaction
                            let revert_reason = self.get_revert_reason(
                                contract_address,
                                &call_data_hex,
                            ).await.unwrap_or_else(|_| "Unknown revert reason".to_string());
                            
                            // Extract just the revert reason, removing redundant prefixes and newlines
                            let clean_reason = if revert_reason.contains("execution reverted:") {
                                revert_reason
                                    .split("execution reverted:")
                                    .nth(1)
                                    .map(|s| s.trim().replace('\n', " ").replace('\r', " ").trim().to_string())
                                    .unwrap_or_else(|| revert_reason.replace('\n', " ").replace('\r', " ").trim().to_string())
                            } else if revert_reason.contains("RPC error:") {
                                revert_reason
                                    .split("RPC error:")
                                    .nth(1)
                                    .map(|s| s.trim().replace('\n', " ").replace('\r', " ").trim().to_string())
                                    .unwrap_or_else(|| revert_reason.replace('\n', " ").replace('\r', " ").trim().to_string())
                            } else {
                                revert_reason.replace('\n', " ").replace('\r', " ").trim().to_string()
                            };
                            
                            Ok(MethodExecutionResult {
                                success: false,
                                gas_used,
                                return_data: vec![],
                                error: Some(clean_reason),
                            })
                        }
                    }
                    Err(e) => {
                        Ok(MethodExecutionResult {
                            success: false,
                            gas_used: 0,
                            return_data: vec![],
                            error: Some(format!("Failed to get receipt: {}", e)),
                        })
                    }
                }
            }
            Err(e) => {
                Ok(MethodExecutionResult {
                    success: false,
                    gas_used: 0,
                    return_data: vec![],
                    error: Some(format!("Transaction failed: {}", e)),
                })
            }
        }
    }
    
    /// Set the current transaction sender
    pub fn set_sender(&mut self, sender_index: usize) {
        if sender_index < self.accounts.len() {
            self.current_sender = self.accounts[sender_index].clone();
        }
    }
    
    /// Get the current sender address
    pub fn current_sender(&self) -> &str {
        &self.current_sender
    }
    
    pub fn accounts(&self) -> &[String] {
        &self.accounts
    }
    
    /// Get the RPC URL
    pub fn rpc_url(&self) -> &str {
        &self.rpc_url
    }
    
    /// Try to get revert reason by calling eth_call
    async fn get_revert_reason(
        &self,
        contract_address: &str,
        call_data: &str,
    ) -> Result<String> {
        // Use eth_call to simulate the transaction and get revert reason
        let call_params = json!({
            "to": contract_address,
            "data": call_data,
            "from": self.current_sender,
        });
        
        let params = json!([call_params, "latest"]);
        
        match Self::rpc_call(&self.client, &self.rpc_url, "eth_call", params).await {
            Ok(_) => Ok("No revert reason available".to_string()),
            Err(e) => {
                // Extract the revert reason from the error message
                let error_msg = e.to_string();
                let clean_msg = error_msg.replace('\n', " ").replace('\r', " ").trim().to_string();
                
                if clean_msg.contains("execution reverted:") {
                    if let Some(reason) = clean_msg.split("execution reverted:").nth(1) {
                        Ok(reason.trim().to_string())
                    } else {
                        Ok(clean_msg)
                    }
                } else if clean_msg.contains("revert") || clean_msg.contains("Revert") {
                    Ok(clean_msg)
                } else {
                    Ok(format!("Reverted: {}", clean_msg))
                }
            }
        }
    }
    
    /// Try to get deployment revert reason by simulating the deployment
    async fn get_deployment_revert_reason(
        &self,
        bytecode: &str,
    ) -> Result<String> {
        // Use eth_call to simulate the deployment and get revert reason
        let call_params = json!({
            "data": bytecode,
            "from": self.current_sender,
        });
        
        let params = json!([call_params, "latest"]);
        
        match Self::rpc_call(&self.client, &self.rpc_url, "eth_call", params).await {
            Ok(_) => Ok("No revert reason available".to_string()),
            Err(e) => {
                // The error message might contain the revert reason
                let error_msg = e.to_string();
                Ok(error_msg)
            }
        }
    }
}

/// Result of a contract method execution
#[derive(Debug, Clone)]
pub struct MethodExecutionResult {
    pub success: bool,
    pub gas_used: u64,
    pub return_data: Vec<u8>,
    pub error: Option<String>,
}

/// Calculate the 4-byte function selector from a method signature
pub fn calculate_selector(signature: &str) -> [u8; 4] {
    use sha3::{Digest, Keccak256};
    let hash = Keccak256::digest(signature.as_bytes());
    [hash[0], hash[1], hash[2], hash[3]]
}

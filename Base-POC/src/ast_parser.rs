use std::collections::HashMap;
use crate::types::*;

#[derive(Debug, Clone)]
pub struct ContractInfo {
    pub name: String,
    pub methods: Vec<ContractMethod>,
    pub events: Vec<EventInfo>,
    pub constructor: Option<ContractMethod>,
    pub fallback: Option<ContractMethod>,
    pub receive: Option<ContractMethod>,
}

#[derive(Debug, Clone)]
pub struct EventInfo {
    pub name: String,
    pub parameters: Vec<MethodParameter>,
    pub anonymous: bool,
}

pub struct SolidityParser {
    _contracts: HashMap<String, ContractInfo>,
}

impl SolidityParser {
    pub fn new() -> Self {
        Self {
            _contracts: HashMap::new(),
        }
    }

    pub fn parse_contract(&mut self, source: &str, _filename: &str) -> Result<Vec<ContractInfo>, anyhow::Error> {
        // Later this should use the solang-parser API properly
        let mut contracts = Vec::new();
        
        // Simple regex-based parsing
        let contract_name = self.extract_contract_name(source);
        let methods = self.extract_methods(source);
        let events = Vec::new(); // Simplified - not parsing events for now
        
        let contract_info = ContractInfo {
            name: contract_name,
            methods: methods.clone(),
            events,
            constructor: methods.iter().find(|m| m.is_constructor).cloned(),
            fallback: methods.iter().find(|m| m.is_fallback).cloned(),
            receive: methods.iter().find(|m| m.is_receive).cloned(),
        };
        
        contracts.push(contract_info);
        Ok(contracts)
    }

    fn extract_contract_name(&self, source: &str) -> String {
        // Simple regex to find contract name
        for line in source.lines() {
            let line = line.trim();
            if line.starts_with("contract ") {
                if let Some(name) = line.split_whitespace().nth(1) {
                    return name.replace("{", "").trim().to_string();
                }
            }
        }
        "UnknownContract".to_string()
    }

    fn extract_methods(&self, source: &str) -> Vec<ContractMethod> {
        let mut methods = Vec::new();
        let lines: Vec<&str> = source.lines().collect();
        
        for (i, line) in lines.iter().enumerate() {
            let line = line.trim();
            
            // Look for function definitions
            if line.starts_with("function ") || line.starts_with("constructor") || line.starts_with("fallback") || line.starts_with("receive") {
                let method = self.parse_method_from_line(line, i, &lines);
                methods.push(method);
            }
        }
        
        methods
    }

    fn parse_method_from_line(&self, line: &str, _line_num: usize, _all_lines: &[&str]) -> ContractMethod {
        let is_constructor = line.starts_with("constructor");
        let is_fallback = line.starts_with("fallback");
        let is_receive = line.starts_with("receive");
        
        let name = if is_constructor {
            "constructor".to_string()
        } else if is_fallback {
            "fallback".to_string()
        } else if is_receive {
            "receive".to_string()
        } else {
            // Extract function name
            line.split('(').next().unwrap_or("unknown")
                .split_whitespace().last().unwrap_or("unknown").to_string()
        };

        // Determine visibility
        let visibility = if line.contains("public") {
            MethodVisibility::Public
        } else if line.contains("external") {
            MethodVisibility::External
        } else if line.contains("internal") {
            MethodVisibility::Internal
        } else if line.contains("private") {
            MethodVisibility::Private
        } else {
            MethodVisibility::Public // Default
        };


        // Extract parameters (simplified)
        let parameters = self.extract_parameters_from_line(line);

        ContractMethod {
            name,
            parameters,
            visibility,
            is_constructor,
            is_fallback,
            is_receive,
        }
    }

    fn extract_parameters_from_line(&self, line: &str) -> Vec<MethodParameter> {
        let mut parameters = Vec::new();
        
        // Simple parameter extraction
        if let Some(params_start) = line.find('(') {
            if let Some(params_end) = line.find(')') {
                let params_str = &line[params_start + 1..params_end];
                if !params_str.trim().is_empty() {
                    // Split by comma and parse each parameter
                    for param in params_str.split(',') {
                        let param = param.trim();
                        if !param.is_empty() {
                            let parts: Vec<&str> = param.split_whitespace().collect();
                            if parts.len() >= 2 {
                                let param_type = self.parse_type_from_string(parts[0]);
                                let name = parts[1].to_string();
                                
                                parameters.push(MethodParameter {
                                    name,
                                    param_type,
                                });
                            }
                        }
                    }
                }
            }
        }
        
        parameters
    }

    fn parse_type_from_string(&self, type_str: &str) -> SolidityType {
        match type_str {
            "uint8" => SolidityType::Uint8,
            "uint16" => SolidityType::Uint16,
            "uint32" => SolidityType::Uint32,
            "uint64" => SolidityType::Uint64,
            "uint128" => SolidityType::Uint128,
            "uint256" | "uint" => SolidityType::Uint256,
            "int8" => SolidityType::Int8,
            "int16" => SolidityType::Int16,
            "int32" => SolidityType::Int32,
            "int64" => SolidityType::Int64,
            "int128" => SolidityType::Int128,
            "int256" | "int" => SolidityType::Int256,
            "address" => SolidityType::Address,
            "bool" => SolidityType::Bool,
            "string" => SolidityType::String,
            "bytes" => SolidityType::Bytes,
            _ => SolidityType::Custom(type_str.to_string()),
        }
    }
}
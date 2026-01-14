// type definitions
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum SolidityType {
    Uint8, Uint16, Uint32, Uint64, Uint128, Uint256,
    Int8, Int16, Int32, Int64, Int128, Int256,
    Address, Bool, Bytes1, Bytes2, Bytes4, Bytes8, Bytes16, Bytes32,
    String, Bytes, Array(Box<SolidityType>), Mapping(Box<SolidityType>, Box<SolidityType>),
    Struct(String), Custom(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum SolidityValue {
    Uint8(u8), Uint16(u16), Uint32(u32), Uint64(u64), Uint128(u128), Uint256(String),
    Int8(i8), Int16(i16), Int32(i32), Int64(i64), Int128(i128), Int256(String),
    Address(String), Bool(bool),
    Bytes1([u8; 1]), Bytes2([u8; 2]), Bytes4([u8; 4]), Bytes8([u8; 8]),
    Bytes16([u8; 16]), Bytes32([u8; 32]),
    String(String), Bytes(Vec<u8>), Array(Vec<SolidityValue>),
    Struct(HashMap<String, SolidityValue>),
}

#[derive(Debug, Clone)]
pub struct MethodParameter {
    pub name: String,
    pub param_type: SolidityType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MethodVisibility {
    Public,
    External,
    Internal,
    Private,
}


#[derive(Debug, Clone)]
pub struct ContractMethod {
    pub name: String,
    pub parameters: Vec<MethodParameter>,
    pub visibility: MethodVisibility,
    pub is_constructor: bool,
    pub is_fallback: bool,
    pub is_receive: bool,
}


#[derive(Debug, Clone)]
pub struct FuzzSummary {
    pub total_passed: usize,
    pub total_failed: usize,
    pub total_skipped: usize,
}

#[derive(Debug, Clone)]
pub enum TestResult {
    Passed,
    Failed(String),
}
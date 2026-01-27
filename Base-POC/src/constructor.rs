use anyhow::Result;
use colored::*;
use dialoguer::{theme::ColorfulTheme, Input};
use ethers::abi::{Abi, ParamType, Token};
use ethers::types::{Address, U256};
use std::str::FromStr;

pub fn prompt_for_constructor_args(abi: &Abi, contract_name: &str) -> Result<Vec<Token>> {
    let constructor = match abi.constructor() {
        Some(c) => c,
        None => {
            println!("{} No constructor found for {}. Proceeding with empty args.", "ℹ".blue(), contract_name);
            return Ok(vec![]);
        }
    };

    if constructor.inputs.is_empty() {
        return Ok(vec![]);
    }

    println!("\n{} Deployment requires arguments for '{}':", "➤".yellow(), contract_name.bold());

    let mut args = Vec::new();

    for input in &constructor.inputs {
        let arg_name = if input.name.is_empty() {
            "unnamed".to_string()
        } else {
            input.name.clone()
        };
        let arg_type = &input.kind;

        // Prompt the user for this specific argument
        let token = prompt_single_arg(&arg_name, arg_type)?;
        args.push(token);
    }

    println!("{} Arguments captured successfully!", "✔".green());
    Ok(args)
}

fn prompt_single_arg(name: &str, kind: &ParamType) -> Result<Token> {
    let type_str = format!("{}", kind).dimmed();
    let prompt_text = format!("Enter value for {} ({})", name.bold(), type_str);

    match kind {
        ParamType::Address => {
            let input: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt(&prompt_text)
                .validate_with(|input: &String| -> Result<(), &str> {
                    Address::from_str(input).map(|_| ()).map_err(|_| "Invalid address format (must start with 0x...)")
                })
                .interact_text()?;
            Ok(Token::Address(Address::from_str(&input)?))
        }

        ParamType::Uint(_) | ParamType::Int(_) => {
            let input: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt(&prompt_text)
                .validate_with(|input: &String| -> Result<(), &str> {
                    U256::from_dec_str(input).map(|_| ()).map_err(|_| "Invalid number")
                })
                .interact_text()?;
            Ok(Token::Uint(U256::from_dec_str(&input)?))
        }

        ParamType::String => {
            let input: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt(&prompt_text)
                .interact_text()?;
            Ok(Token::String(input))
        }

        ParamType::Bool => {
            let input: bool = dialoguer::Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt(format!("Set {} to true?", name))
                .interact()?;
            Ok(Token::Bool(input))
        }

        // Fallback for Arrays/Tuples (Complex types)
        _ => {
            println!("{} Complex type detected ({}), please enter raw JSON:", "⚠".yellow(), kind);
            let input: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt(&prompt_text)
                .interact_text()?;
            
            Ok(Token::String(input)) 
        }
    }
}
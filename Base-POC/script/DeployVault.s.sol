// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {VaultContract} from "../test-contracts/VaultContract.sol";

contract DeployVaultContract is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // _minDeposit = 0.1 ETH
        // _maxWithdrawPerDay = 1 ETH
        VaultContract vault = new VaultContract(
            0.1 ether,
            1 ether
        );

        vm.stopBroadcast();
        console.log("VaultContract deployed at:", address(vault));
        console.log("Min Deposit:", vault.minDeposit());
        console.log("Max Withdraw Per Day:", vault.maxWithdrawPerDay());
    }
}

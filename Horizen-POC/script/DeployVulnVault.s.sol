// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {DemoVulnerableVault} from "../test-contracts/DemoVulnerableVault.sol";

contract DeployVulnVaultContract is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // _minDeposit = 0.1 ETH
        DemoVulnerableVault vulnVault = new DemoVulnerableVault(
            0.1 ether
        );

        vm.stopBroadcast();
        console.log("DemoVulnerableVault deployed at:", address(vulnVault));
    }
}

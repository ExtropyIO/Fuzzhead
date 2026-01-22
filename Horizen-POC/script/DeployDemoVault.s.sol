// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {DemoVulnerableVault} from "../test-contracts/DemoVulnerableVault.sol";

contract DeployDemoVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy with minDeposit = 1 ETH
        DemoVulnerableVault vault = new DemoVulnerableVault(
            1 ether
        );
        
        vm.stopBroadcast();
        console.log("DemoVulnerableVault deployed at:", address(vault));
    }
}

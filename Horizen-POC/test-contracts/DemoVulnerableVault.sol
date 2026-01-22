// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title DemoVulnerableVault
 * @dev Intentionally vulnerable contract for demonstrating Fuzzhead's detection capabilities
 *
 * This contract is designed for demonstration purposes only.
 */
contract DemoVulnerableVault {
    address public owner;
    mapping(address => uint256) public balances;
    bool public paused;
    uint256 public minDeposit;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    constructor(uint256 _minDeposit) {
        owner = msg.sender;
        paused = false;
        minDeposit = _minDeposit;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    /**
     * @dev Deposit funds into the vault
     * VULNERABLE: No minimum deposit check in some cases
     */
    function deposit() external payable notPaused {
        // VULNERABILITY: Should check msg.value >= minDeposit but doesn't always
        if (msg.value > 0) {
            balances[msg.sender] += msg.value;
            emit Deposit(msg.sender, msg.value);
        }
    }

    /**
     * @dev Withdraw a specific amount
     * VULNERABLE: Logic error - allows withdrawing more than balance
     */
    function withdraw(uint256 amount) external notPaused {
        // VULNERABILITY: Should be >= but using > allows withdrawing exactly balance + 1
        require(balances[msg.sender] > amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @dev Secure function with proper access control
     */
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerChanged(oldOwner, newOwner);
    }

    /**
     * @dev VULNERABLE: Missing onlyOwner modifier!
     * This bypasses the secure setOwner() function
     */
    function setOwnerUnsafe(address newOwner) external {
        require(newOwner != address(0), "Invalid address");
        // This should require onlyOwner but doesn't
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerChanged(oldOwner, newOwner);
    }

    /**
     * @dev Secure function with proper access control
     */
    function pause() external onlyOwner {
        paused = true;
    }

    /**
     * @dev Secure function with proper access control
     */
    function unpause() external onlyOwner {
        paused = false;
    }

    /**
     * @dev VULNERABLE: Missing onlyOwner modifier!
     * Anyone can change the minimum deposit
     */
    function setMinDeposit(uint256 _minDeposit) external {
        minDeposit = _minDeposit;
    }

    /**
     * @dev View function - no vulnerability
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /**
     * @dev View function - no vulnerability
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

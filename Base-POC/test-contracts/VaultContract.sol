// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title VaultContract
 * @dev A simple vault contract for testing fuzzing with different constructor parameters
 */
contract VaultContract {
    address public owner;
    uint256 public minDeposit;
    uint256 public maxWithdrawPerDay;
    bool public paused;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public lastWithdrawTime;
    mapping(address => uint256) public withdrawnToday;
    mapping(address => bool) public whitelist;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event WhitelistUpdated(address indexed user, bool status);

    constructor(uint256 _minDeposit, uint256 _maxWithdrawPerDay) {
        owner = msg.sender;
        minDeposit = _minDeposit;
        maxWithdrawPerDay = _maxWithdrawPerDay;
        paused = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function deposit(uint256 amount) external notPaused {
        require(amount >= minDeposit, "Below minimum deposit");
        balances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external notPaused {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // Reset daily limit if new day
        if (block.timestamp > lastWithdrawTime[msg.sender] + 1 days) {
            withdrawnToday[msg.sender] = 0;
            lastWithdrawTime[msg.sender] = block.timestamp;
        }

        require(
            withdrawnToday[msg.sender] + amount <= maxWithdrawPerDay,
            "Exceeds daily limit"
        );

        balances[msg.sender] -= amount;
        withdrawnToday[msg.sender] += amount;

        emit Withdraw(msg.sender, amount);
    }

    function setWhitelist(address user, bool status) external onlyOwner {
        whitelist[user] = status;
        emit WhitelistUpdated(user, status);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function updateLimits(
        uint256 _minDeposit,
        uint256 _maxWithdrawPerDay
    ) external onlyOwner {
        minDeposit = _minDeposit;
        maxWithdrawPerDay = _maxWithdrawPerDay;
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getRemainingDailyLimit(
        address user
    ) external view returns (uint256) {
        if (block.timestamp > lastWithdrawTime[user] + 1 days) {
            return maxWithdrawPerDay;
        }
        return maxWithdrawPerDay - withdrawnToday[user];
    }
}

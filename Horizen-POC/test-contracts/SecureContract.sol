// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SecureContract
 * @dev A well-implemented contract with proper security measures
 * This contract demonstrates secure coding practices for comparison
 */
contract SecureContract {
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorized;
    mapping(address => uint256) public lastWithdrawTime;

    address public owner;
    uint256 public totalDeposits;
    bool public paused;
    uint256 public constant WITHDRAWAL_DELAY = 1 days;
    uint256 public constant MAX_WITHDRAWAL = 10 ether;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event AuthorizationChanged(address indexed user, bool status);

    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorized[msg.sender], "Not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    modifier nonReentrant() {
        require(
            lastWithdrawTime[msg.sender] == 0 ||
                block.timestamp >=
                lastWithdrawTime[msg.sender] + WITHDRAWAL_DELAY,
            "Withdrawal too frequent"
        );
        _;
    }

    function deposit() public payable whenNotPaused {
        require(msg.value > 0, "Must send ETH");
        require(msg.value <= 100 ether, "Deposit too large");

        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) public whenNotPaused nonReentrant {
        require(_amount > 0, "Amount must be positive");
        require(_amount <= MAX_WITHDRAWAL, "Withdrawal too large");
        require(balances[msg.sender] >= _amount, "Insufficient balance");
        require(
            address(this).balance >= _amount,
            "Insufficient contract balance"
        );

        // Update state before external call (checks-effects-interactions pattern)
        balances[msg.sender] -= _amount;
        totalDeposits -= _amount;
        lastWithdrawTime[msg.sender] = block.timestamp;

        // Safe external call
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");

        emit Withdraw(msg.sender, _amount);
    }

    function emergencyWithdraw() public onlyAuthorized {
        require(balances[msg.sender] > 0, "No balance");

        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        totalDeposits -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function addLiquidity(uint256 _amount) public payable {
        require(msg.value == _amount, "Value mismatch");
        require(_amount > 0, "Amount must be positive");
        require(_amount <= 50 ether, "Amount too large");

        // Safe arithmetic with Solidity 0.8+
        totalDeposits += _amount;
        balances[msg.sender] += _amount;
    }

    function setAuthorized(address _user, bool _status) public onlyOwner {
        require(_user != address(0), "Invalid address");
        authorized[_user] = _status;
        emit AuthorizationChanged(_user, _status);
    }

    function batchTransfer(
        address[] memory _recipients,
        uint256[] memory _amounts
    ) public {
        require(_recipients.length == _amounts.length, "Array length mismatch");
        require(_recipients.length <= 20, "Too many recipients"); // Reasonable limit

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalAmount += _amounts[i];
        }

        require(balances[msg.sender] >= totalAmount, "Insufficient balance");

        balances[msg.sender] -= totalAmount;

        for (uint256 i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            balances[_recipients[i]] += _amounts[i];
        }
    }

    // View functions
    function getBalance(address _user) public view returns (uint256) {
        return balances[_user];
    }

    function getTotalDeposits() public view returns (uint256) {
        return totalDeposits;
    }

    function isAuthorized(address _user) public view returns (bool) {
        return authorized[_user];
    }

    function canWithdraw(address _user) public view returns (bool) {
        return
            lastWithdrawTime[_user] == 0 ||
            block.timestamp >= lastWithdrawTime[_user] + WITHDRAWAL_DELAY;
    }

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // Owner functions
    function pause() public onlyOwner {
        paused = true;
    }

    function unpause() public onlyOwner {
        paused = false;
    }

    function changeOwner(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    // Emergency functions with proper access control
    function emergencyPause() public onlyOwner {
        paused = true;
    }

    function recoverFunds(address _to, uint256 _amount) public onlyOwner {
        require(_to != address(0), "Invalid address");
        require(_amount <= address(this).balance, "Insufficient balance");

        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Transfer failed");
    }
}

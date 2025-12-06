// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ArosCoin
 * @dev Implementation of the ArosCoin (AROS) token.
 * Supports:
 * - Minting (Restricted to MINTER_ROLE)
 * - Burning (Public)
 * - Staking/Locking mechanism
 */
contract ArosCoin is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 unlockTime;
    }

    // Mapping of user address -> Stake details
    mapping(address => Stake[]) public stakes;

    event Staked(address indexed user, uint256 amount, uint256 unlockTime);
    event Unstaked(address indexed user, uint256 amount);

    constructor(address defaultAdmin, address minter) ERC20("ArosCoin", "AROS") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
    }

    /**
     * @dev Creates `amount` tokens and assigns them to `to`.
     * Only accessible by accounts with MINTER_ROLE (e.g., Emission Layer / Bridge).
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Locks `amount` of tokens for `duration` seconds.
     * Tokens are burned (or transferred to contract) to lock them?
     * Standard staking usually transfers to contract. Here we simply transfer to address(this).
     */
    function stake(uint256 amount, uint256 duration) public {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _transfer(msg.sender, address(this), amount);

        stakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            unlockTime: block.timestamp + duration
        }));

        emit Staked(msg.sender, amount, block.timestamp + duration);
    }

    /**
     * @dev Withdraws unlocked stakes.
     * Iterates through stakes and releases those that are unlocked.
     */
    function withdrawUnlockedStakes() public {
        uint256 totalUnlock = 0;
        Stake[] storage userStakes = stakes[msg.sender];

        for (uint256 i = 0; i < userStakes.length; i++) {
            if (userStakes[i].unlockTime <= block.timestamp && userStakes[i].amount > 0) {
                totalUnlock += userStakes[i].amount;
                userStakes[i].amount = 0; // Mark as withdrawn
            }
        }

        require(totalUnlock > 0, "No unlocked stakes");
        _transfer(address(this), msg.sender, totalUnlock);
        
        emit Unstaked(msg.sender, totalUnlock);
    }

    /**
     * @dev Returns the total staked amount for a user.
     */
    function getStakedBalance(address user) public view returns (uint256) {
        uint256 total = 0;
        Stake[] storage userStakes = stakes[user];
        for (uint256 i = 0; i < userStakes.length; i++) {
             total += userStakes[i].amount;
        }
        return total;
    }
}

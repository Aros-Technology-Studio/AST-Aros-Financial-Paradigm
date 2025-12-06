// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArosCoinReserveManager
 * @dev Contract for issuing and burning ArosCoin tokens with strong protection against double issuance.
 */
contract ArosCoinReserveManager is ERC20Burnable, Ownable {
    // Stores unique references (e.g., tx hashes or ledger entries) already used for minting or burning
    mapping(bytes32 => bool) private usedReferences;

    event Minted(address indexed to, uint256 amount, bytes32 indexed txReference);
    event Burned(address indexed from, uint256 amount, bytes32 indexed txReference);

    constructor() ERC20("ArosCoin", "AROS") Ownable(msg.sender) {}

    /**
     * @dev Issues tokens based on a unique ledger event (e.g. confirmed fiat or crypto deposit).
     * @param to The recipient address
     * @param amount Number of tokens to mint
     * @param txReference Unique reference ID of the transaction/ledger entry
     */
    function mint(address to, uint256 amount, bytes32 txReference) external onlyOwner {
        require(!usedReferences[txReference], "Reference already used");
        _mint(to, amount);
        usedReferences[txReference] = true;
        emit Minted(to, amount, txReference);
    }

    /**
     * @dev Burns tokens on behalf of the platform (e.g. during a fiat/crypto withdrawal).
     * @param from The token holder’s address
     * @param amount Number of tokens to burn
     * @param txReference Unique reference ID of the related transaction
     */
    function burnWithReference(address from, uint256 amount, bytes32 txReference) external onlyOwner {
        require(!usedReferences[txReference], "Reference already used");
        _burn(from, amount);
        usedReferences[txReference] = true;
        emit Burned(from, amount, txReference);
    }

    /**
     * @dev Check if a given reference ID has already been used (for compliance/audit/double-spend protection).
     * @param txReference The reference ID
     */
    function isReferenceUsed(bytes32 txReference) public view returns (bool) {
        return usedReferences[txReference];
    }
}

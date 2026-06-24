// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArosCoinReserveManager
 * @dev On-chain settlement layer for ArosCoin emission and burn cycles.
 *      Tokens are minted only on receipt of a PoT-confirmed process reference
 *      and burned on cycle completion, keeping supply causally tied to verified
 *      work (Model-1 I-EM-1/I-EM-2/I-EM-3). Double-issuance protection is
 *      enforced via the `usedReferences` registry.
 */
contract ArosCoinReserveManager is ERC20Burnable, Ownable {
    // Tracks on-chain references already consumed by a mint or burn; prevents replay.
    mapping(bytes32 => bool) private usedReferences;

    event Minted(address indexed to, uint256 amount, bytes32 indexed txReference);
    event Burned(address indexed from, uint256 amount, bytes32 indexed txReference);

    constructor() ERC20("ArosCoin", "AROS") Ownable(msg.sender) {}

    /**
     * @dev Mints the process part for a PoT-confirmed process, identified by a unique
     *      NodeChain reference. Emission is 1:1 with the verified process amount; the
     *      reference enforces idempotency and prevents double-issuance (I-EM-1/I-EM-2).
     * @param to The recipient address for the minted tokens
     * @param amount Number of tokens to mint (equal to the confirmed process amount)
     * @param txReference Unique NodeChain reference for this PoT-confirmed process
     */
    function mint(address to, uint256 amount, bytes32 txReference) external onlyOwner {
        require(!usedReferences[txReference], "Reference already used");
        _mint(to, amount);
        usedReferences[txReference] = true;
        emit Minted(to, amount, txReference);
    }

    /**
     * @dev Burns the process part on cycle completion, identified by a unique NodeChain
     *      reference. The burn mirrors the mint so the process part nets to zero once
     *      the cycle completes (cycle symmetry, I-EM-3).
     * @param from The token holder whose process part is burned
     * @param amount Number of tokens to burn (must equal the minted process part)
     * @param txReference Unique NodeChain reference for this burn event
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

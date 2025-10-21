// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AROS Token Generation Contract
/// @notice Simplified representation of the Proof-of-Transaction governed mint/burn engine.
contract TokenGenerationContract {
    address public immutable governanceCouncil;
    address public emissionController;
    address public supervisoryVeto;

    mapping(address => bool) public authorisedVaults;
    mapping(uint256 => bytes32) public epochEmissionProofs;

    event EmissionControllerUpdated(address indexed controller);
    event SupervisoryVetoUpdated(address indexed veto);
    event VaultAuthorised(address indexed vault, bool status);
    event Minted(address indexed vault, uint256 amount, uint256 indexed epoch);
    event Burned(address indexed vault, uint256 amount, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governanceCouncil, "GC_ONLY");
        _;
    }

    modifier onlyEmission() {
        require(msg.sender == emissionController, "EMISSION_ONLY");
        _;
    }

    modifier onlyAuthorisedVault() {
        require(authorisedVaults[msg.sender], "VAULT_ONLY");
        _;
    }

    constructor(address _governanceCouncil, address _emissionController, address _supervisoryVeto) {
        governanceCouncil = _governanceCouncil;
        emissionController = _emissionController;
        supervisoryVeto = _supervisoryVeto;
    }

    function setEmissionController(address controller) external onlyGovernance {
        emissionController = controller;
        emit EmissionControllerUpdated(controller);
    }

    function setSupervisoryVeto(address veto) external onlyGovernance {
        supervisoryVeto = veto;
        emit SupervisoryVetoUpdated(veto);
    }

    function setVaultAuthorisation(address vault, bool status) external onlyGovernance {
        authorisedVaults[vault] = status;
        emit VaultAuthorised(vault, status);
    }

    function recordEpochProof(uint256 epochId, bytes32 proofHash) external onlyEmission {
        epochEmissionProofs[epochId] = proofHash;
    }

    function mintToVault(uint256 epochId, address vault, uint256 amount) external onlyEmission {
        require(authorisedVaults[vault], "UNAUTHORISED_VAULT");
        require(epochEmissionProofs[epochId] != bytes32(0), "MISSING_PROOF");
        _mint(vault, amount);
        emit Minted(vault, amount, epochId);
    }

    function burnFromVault(address vault, uint256 amount, string calldata reason) external {
        require(msg.sender == supervisoryVeto || msg.sender == governanceCouncil, "NOT_AUTHORISED");
        _burn(vault, amount);
        emit Burned(vault, amount, reason);
    }

    // Placeholder ERC-20 compatible hooks
    function _mint(address vault, uint256 amount) internal {
        // integrate with actual ERC-20 token logic in implementation repo
    }

    function _burn(address vault, uint256 amount) internal {
        // integrate with actual ERC-20 token logic in implementation repo
    }
}

export const AROS_COIN_ABI = [
    "function mint(address to, uint256 amount, bytes32 txReference) external",
    "function burnWithReference(address from, uint256 amount, bytes32 txReference) external",
    "function isReferenceUsed(bytes32 txReference) view returns (bool)",
    "event Minted(address indexed to, uint256 amount, bytes32 indexed txReference)",
    "event Burned(address indexed from, uint256 amount, bytes32 indexed txReference)"
];

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        hardhat: {
            chainId: 1337 // Default for Localhost
        },
        // Add external networks (Sepolia, Polygon) here
    },
};

export default config;

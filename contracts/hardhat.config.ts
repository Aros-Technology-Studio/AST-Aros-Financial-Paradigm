import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    paths: {
        sources: "./contracts/src",
        tests: "./contracts/test",
        cache: "./contracts/cache",
        artifacts: "./contracts/artifacts"
    },
};

export default config;

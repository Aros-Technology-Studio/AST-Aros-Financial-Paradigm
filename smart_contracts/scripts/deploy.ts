import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const ArosCoinReserveManager = await ethers.getContractFactory("ArosCoinReserveManager");
    const token = await ArosCoinReserveManager.deploy();

    await token.waitForDeployment();

    console.log("ArosCoinReserveManager deployed to:", await token.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

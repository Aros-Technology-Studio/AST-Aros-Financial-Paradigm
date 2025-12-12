import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const ArosCoinReserveManager = await ethers.getContractFactory("ArosCoinReserveManager");
  const contract = await ArosCoinReserveManager.deploy();

  await contract.waitForDeployment();

  console.log("ArosCoinReserveManager deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

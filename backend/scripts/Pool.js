import pkg from 'hardhat';
import fs from 'fs';

const { ethers } = pkg;


async function main() {
    const filePath = "./../frontend/src/contracts/deployedAddresses.json";

    const [deployer] = await ethers.getSigners();
    console.log('Deploying contracts with the account:', deployer.address);

    const PoolFactory = await ethers.getContractFactory('PoolFactory');
    const poolFactory = await PoolFactory.deploy();
    await poolFactory.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("MockToken");
    const usdc = await TokenFactory.deploy("USDC", "USDC");
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();

    const nfs = await TokenFactory.deploy("NFS Token", "NFS");
    await nfs.waitForDeployment();
    const nfsAddress = await nfs.getAddress();

    const Executor = await ethers.getContractFactory("Executor");
    const executor = await Executor.deploy();
    await executor.waitForDeployment();
    const executorAddress = await executor.getAddress();


    console.log('PoolFactory deployed to:', await poolFactory.getAddress());
    console.log('USDC deployed to:', usdcAddress);
    console.log('NFS deployed to:', nfsAddress);
    console.log('Executor deployed to:', executorAddress);

    const addresses = {
        factory: await poolFactory.getAddress(),
        usdc: await usdc.getAddress(),
        nfs: await nfs.getAddress(),
        executor: executorAddress, 
        network: "anvil"
    };
    fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2));
    console.log(`Frontend updated with new addresses!`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
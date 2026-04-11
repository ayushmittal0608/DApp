import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { ethers, Transaction } from "ethers";
import addresses from "../contracts/deployedAddresses.json";
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';

type SwapDetails = {
  tokenIn: string;
  amountIn: bigint;
  minAmountOut: bigint;
  slippageBps: bigint;
};

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const authSigner = ethers.Wallet.createRandom();

const POOL_ABI = PoolArtifact.abi;
const poolInterface = new ethers.Interface(POOL_ABI);

function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, fee: bigint): bigint {
  if (amountIn <= 0n) return 0n;
  const feeBase = 1000000n;
  const amountInWithFee = (amountIn * (feeBase - fee)) / feeBase;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

function simulateSandwich(swap: SwapDetails, reserves: { rIn: bigint; rOut: bigint }, fee: bigint) {
  const { rIn, rOut } = reserves;

  const frontRunAmount = swap.amountIn / 10n;
  const out1 = getAmountOut(frontRunAmount, rIn, rOut, fee);

  const rIn_afterFR = rIn + frontRunAmount;
  const rOut_afterFR = rOut - out1;
  const victimOut = getAmountOut(swap.amountIn, rIn_afterFR, rOut_afterFR, fee);

  const rIn_final = rIn_afterFR + swap.amountIn;
  const rOut_final = rOut_afterFR - victimOut;
  
  const backRunOut = getAmountOut(out1, rOut_final, rIn_final, fee);
  const profit = backRunOut - frontRunAmount;

  return {
    ok: profit > 0n,
    profit,
    frontRunAmount,
    out1
  };
}

provider.on("pending", async (txHash: string) => {
  console.log('Spotting Transaction...')
  try {
    const tx = await provider.getTransaction(txHash);
    console.log(`New pending transaction: ${txHash}`);
    const POOL_ADDRESS = addresses.factory; 
    if (!tx || !tx.to || tx.to.toLowerCase() !== POOL_ADDRESS.toLowerCase()) return;

    const decoded = poolInterface.parseTransaction({ data: tx.data });
    if (!decoded || decoded.name !== "swap") return;

    console.log(`Potential target found on Pool: ${txHash}`);
    const [tokenIn, amountIn, minAmountOut, slippageBps] = decoded.args;
    const swap: SwapDetails = {
      tokenIn,
      amountIn: BigInt(amountIn),
      minAmountOut: BigInt(minAmountOut),
      slippageBps: BigInt(slippageBps)
    };

    const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const poolData = await poolContract.getPoolDetails();
    const assets = poolData[0];
    const fee = BigInt(poolData[1]);

    const resIn = await new ethers.Contract(swap.tokenIn, ["function balanceOf(address) view returns (uint256)"], provider).balanceOf(POOL_ADDRESS);
    const tokenOut = swap.tokenIn.toLowerCase() === assets[0].toLowerCase() ? assets[1] : assets[0];
    const resOut = await new ethers.Contract(tokenOut, ["function balanceOf(address) view returns (uint256)"], provider).balanceOf(POOL_ADDRESS);

    const sim = simulateSandwich(swap, { rIn: BigInt(resIn), rOut: BigInt(resOut) }, fee);

    if (sim.ok) {
      const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
      
      const frontTx = await poolContract.swap.populateTransaction(
        swap.tokenIn, 
        sim.frontRunAmount, 
        0n, 
        0n
      );

      const backTx = await poolContract.swap.populateTransaction(
        tokenOut, 
        sim.out1, 
        0n, 
        0n
      );
      const victimRaw = Transaction.from(tx).serialized;
      const blockNumber = await provider.getBlockNumber();
      
        const bundle = [
          { signer: wallet, transaction: { ...frontTx, gasLimit: 300000 } },
          { signedTransaction: victimRaw },
          { signer: wallet, transaction: { ...backTx, gasLimit: 300000 } }
        ];

        await flashbotsProvider.sendBundle(bundle, blockNumber + 1);
        console.log("Sandwich Bundle Submitted!");
      
    }
  } catch (err) {
    console.error("Error processing swap:", err);
  }
});
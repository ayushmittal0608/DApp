import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDownUp, Settings, Info, RefreshCcw, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import { cn, formatNumber } from '@/src/lib/utils';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import addresses from '../contracts/deployedAddresses.json';
import PoolFactoryArtifact from '../../../backend/artifacts/contracts/PoolFactory.sol/PoolFactory.json';
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';
import { AlertBox, type AlertMessage } from './AlertBox';

export function Swap() {
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [fromToken, setFromToken] = useState('USDC');
  const [toToken, setToToken] = useState('NFS');
  const { provider, account, connect } = useWeb3();
  const [activePoolAddress, setActivePoolAddress] = useState<string | null>(null);
  const [poolUsdc, setPoolUsdc] = useState<string>('0');
  const [poolNfs, setPoolNfs] = useState<string>('0');
  const [feeTier, setFeeTier] = useState<string>('0');
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  const FACTORY_ABI = PoolFactoryArtifact.abi;
  const POOL_ABI = PoolArtifact.abi;
  const ERC20_ABI = [
    "function balanceOf(address account) public view returns (uint256)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function approve(address spender, uint256 amount) public returns (bool)"
  ];

  const loadActivePoolLiquidity = async () => {
    const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (!activeProvider) return;
    const factory = new ethers.Contract(addresses.factory, FACTORY_ABI, activeProvider);
    const active = await factory.activePool();
    if (!active || active === ethers.ZeroAddress) {
      setActivePoolAddress(null);
      setPoolUsdc('0');
      setPoolNfs('0');
      return;
    }
    setActivePoolAddress(active);
    const usdc = new ethers.Contract(addresses.usdc, ERC20_ABI, activeProvider);
    const nfs = new ethers.Contract(addresses.nfs, ERC20_ABI, activeProvider);
    const pool = new ethers.Contract(active, [
      "function fee() view returns (uint256)"
    ], activeProvider);
    const [usdcBal, nfsBal, feeRaw] = await Promise.all([
      usdc.balanceOf(active),
      nfs.balanceOf(active),
      pool.fee()
    ]);
    setPoolUsdc(ethers.formatUnits(usdcBal, 6));
    setPoolNfs(ethers.formatUnits(nfsBal, 18));
    setFeeTier((Number(feeRaw) / 10000).toFixed(2));
  };

  const handleFlipTokens = () => {
    const nextFrom = toToken;
    const nextTo = fromToken;
    setFromToken(nextFrom);
    setToToken(nextTo);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const getMaxFromBalance = () => {
    const max = fromToken === 'USDC' ? poolUsdc : poolNfs;
    const parsed = Number(max);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getMaxForToken = (token: string) => {
    const max = token === 'USDC' ? poolUsdc : poolNfs;
    const parsed = Number(max);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleFromAmountChange = (value: string) => {
    if (value === '') {
      setFromAmount('');
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const max = getMaxFromBalance();
    const clamped = Math.min(parsed, max);
    setFromAmount(clamped.toString());
  };

  const estimateOutput = () => {
    const amountIn = Number(fromAmount);
    const usdc = Number(poolUsdc);
    const nfs = Number(poolNfs);
    const feePercent = Number(feeTier);
    if (!Number.isFinite(amountIn) || amountIn <= 0) return '';
    if (!Number.isFinite(usdc) || !Number.isFinite(nfs) || usdc <= 0 || nfs <= 0) return '';
    if (!Number.isFinite(feePercent) || feePercent < 0) return '';

    const fee = feePercent / 100;
    const amountInWithFee = amountIn * (1 - fee);

    let reserveIn = 0;
    let reserveOut = 0;
    if (fromToken === 'USDC' && toToken === 'NFS') {
      reserveIn = usdc;
      reserveOut = nfs;
    } else if (fromToken === 'NFS' && toToken === 'USDC') {
      reserveIn = nfs;
      reserveOut = usdc;
    } else {
      return '';
    }

    const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    if (!Number.isFinite(amountOut) || amountOut <= 0) return '';
    return amountOut.toFixed(6);
  };

  const priceFromTo = (() => {
    const usdc = Number(poolUsdc);
    const nfs = Number(poolNfs);
    if (!Number.isFinite(usdc) || !Number.isFinite(nfs) || usdc <= 0) {
      return null;
    }
    if (fromToken === 'USDC' && toToken === 'NFS') {
      return nfs / usdc;
    }
    if (fromToken === 'NFS' && toToken === 'USDC') {
      return usdc / nfs;
    }
    return null;
  })();

  const priceNfsToUsdc = (() => {
    const usdc = Number(poolUsdc);
    const nfs = Number(poolNfs);
    if (!Number.isFinite(usdc) || !Number.isFinite(nfs) || nfs <= 0) {
      return null;
    }
    return usdc / nfs;
  })();

  useEffect(() => {
    loadActivePoolLiquidity();
  }, [provider]);

  useEffect(() => {
    const nextOut = estimateOutput();
    setToAmount(nextOut);
  }, [fromAmount, feeTier, poolUsdc, poolNfs, fromToken, toToken]);

  const slippageInfo = (() => {
    const out = Number(toAmount);
    const slip = Number(slippage);
    if (!Number.isFinite(out) || out <= 0) return null;
    if (!Number.isFinite(slip) || slip < 0) return null;
    const slipFrac = slip / 100;
    const slippageAmount = out * slipFrac;
    const minReceived = out - slippageAmount;
    return {
      slippageAmount: slippageAmount.toFixed(6),
      minReceived: minReceived.toFixed(6)
    };
  })();

  const handleConfirmSwap = async () => {
    try {
      setAlert(null);
      if (!account) {
        await connect();
      }
      if (!account) {
        setAlert({ type: 'error', message: 'Please connect your wallet first.' });
        return;
      }
      if (!provider) {
        setAlert({ type: 'error', message: 'Web3 provider not found.' });
        return;
      }
      if (!fromAmount || Number(fromAmount) <= 0) {
        setAlert({ type: 'error', message: 'Enter a valid amount to swap.' });
        return;
      }
      if (!slippageInfo) {
        setAlert({ type: 'error', message: 'Invalid slippage configuration.' });
        return;
      }

      const activeProvider = provider;
      const factory = new ethers.Contract(addresses.factory, FACTORY_ABI, activeProvider);
      const active = await factory.activePool();
      if (!active || active === ethers.ZeroAddress) {
        setAlert({ type: 'error', message: 'No active pool found. Initialize a pool first.' });
        return;
      }

      setAlert({ type: 'info', message: 'Please confirm the swap in your wallet...' });

      const tokenIn = fromToken === 'USDC' ? addresses.usdc : addresses.nfs;
      const decimalsIn = fromToken === 'USDC' ? 6 : 18;
      const decimalsOut = toToken === 'USDC' ? 6 : 18;

      const amountIn = ethers.parseUnits(fromAmount, decimalsIn);
      const minAmountOut = ethers.parseUnits(slippageInfo.minReceived, decimalsOut);
      const slippageBps = Math.round(Number(slippage) * 100);

      const signer = await provider.getSigner();
      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);
      const allowance = await tokenInContract.allowance(await signer.getAddress(), active);
      if (allowance < amountIn) {
        const approveTx = await tokenInContract.approve(active, amountIn);
        await approveTx.wait();
      }

      const poolContract = new ethers.Contract(active, POOL_ABI, signer);
      const tx = await poolContract.swap(tokenIn, amountIn, minAmountOut, slippageBps);
      await tx.wait();
      setAlert({ type: 'success', message: 'Swap completed successfully.' });
      await loadActivePoolLiquidity();
    } catch (error: any) {
      console.error("Failed to swap:", error);
      if (error?.code === 'ACTION_REJECTED') {
        setAlert({ type: 'error', message: 'Transaction rejected by user.' });
      } else {
        const message = error?.shortMessage || error?.reason || error?.message || 'Swap failed.';
        setAlert({ type: 'error', message });
      }
    }
  };

  const priceImpact = (() => {
    const amountIn = Number(fromAmount);
    const amountOut = Number(toAmount);
    const usdc = Number(poolUsdc);
    const nfs = Number(poolNfs);
    if (!Number.isFinite(amountIn) || amountIn <= 0) return null;
    if (!Number.isFinite(amountOut) || amountOut <= 0) return null;
    if (!Number.isFinite(usdc) || !Number.isFinite(nfs) || usdc <= 0 || nfs <= 0) return null;

    let reserveIn = 0;
    let reserveOut = 0;
    if (fromToken === 'USDC' && toToken === 'NFS') {
      reserveIn = usdc;
      reserveOut = nfs;
    } else if (fromToken === 'NFS' && toToken === 'USDC') {
      reserveIn = nfs;
      reserveOut = usdc;
    } else {
      return null;
    }

    const midPrice = reserveOut / reserveIn;
    const executionPrice = amountOut / amountIn;
    if (!Number.isFinite(midPrice) || !Number.isFinite(executionPrice) || midPrice <= 0) return null;
    const impact = Math.max(0, (midPrice - executionPrice) / midPrice);
    return (impact * 100).toFixed(2);
  })();

  return (
    <>
      <AlertBox alert={alert} onClose={() => setAlert(null)} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[800px] mx-auto mt-16 relative"
      >
        {/* Decorative Glow */}
        <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl opacity-50 -z-10" />
        
        <div className="glass-card glow-blue">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">SWAP</h2>
            </div>
            
          </div>
          <div className="space-x-1.5 relative flex">
            <div className="flex-1 bg-slate-900/40 border border-white/5 p-6 rounded-3xl group focus-within:border-blue-500/30 transition-all">
              <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                <span>Pay</span>
                <span className="flex items-center gap-1.5">
                  Reserves: <span className="text-slate-300">{fromToken === 'USDC' ? poolUsdc : poolNfs}</span>
                  <button className="text-blue-400 hover:text-blue-300">MAX</button>
                </span>
              </div>
              <div className="flex items-center gap-6">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={getMaxFromBalance()}
                  placeholder="0.00"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  className="bg-transparent text-4xl font-black text-white outline-none w-full placeholder:text-slate-800"
                />
                <button className="flex items-center gap-3 bg-slate-800/80 hover:bg-slate-700 px-4 py-2.5 rounded-2xl border border-white/5 transition-all shadow-xl">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]",
                      fromToken === 'USDC' ? "bg-blue-500" : "bg-purple-500"
                    )}
                  />
                  <span className="font-black text-sm tracking-tight">{fromToken}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/8 z-10">
              <button
                onClick={handleFlipTokens}
                className="w-12 h-12 bg-slate-900 border-[6px] border-[#02040a] rounded-2xl flex items-center justify-center hover:bg-blue-600 group transition-all shadow-2xl"
              >
                <ArrowDownUp className="w-5 h-5 text-blue-400 group-hover:text-white group-hover:scale-110 transition-all" />
              </button>
            </div>

            <div className="flex-1 bg-slate-900/40 border border-white/5 p-6 rounded-3xl pt-8 group focus-within:border-purple-500/30 transition-all">
              <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                <span>Receive</span>
                <span className="flex items-center gap-1.5">
                  Reserves: <span className="text-slate-300">{toToken === 'USDC' ? poolUsdc : poolNfs}</span>
                  <button className="text-blue-400 hover:text-blue-300">MAX</button>
                </span>
              </div>
              <div className="flex items-center gap-6">
                <input
                  type="number"
                  placeholder="0.00"
                  
                  value={toAmount}
                  readOnly
                  className="bg-transparent text-4xl font-black text-white outline-none w-full placeholder:text-slate-800"
                />
                <button className="flex items-center gap-3 bg-slate-800/80 hover:bg-slate-700 px-4 py-2.5 rounded-2xl border border-white/5 transition-all shadow-xl">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]",
                      toToken === 'USDC' ? "bg-blue-500" : "bg-purple-500"
                    )}
                  />
                  <span className="font-black text-sm tracking-tight">{toToken}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 px-2 ">
            
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-slate-500 flex items-center gap-2">
                Price Impact <Info className="w-3.5 h-3.5" />
              </span>
              <span className="text-green-400">
                {priceImpact !== null ? `${priceImpact}%` : '< 0.01%'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-slate-500 flex items-center gap-2">
                Fee Tier <Info className="w-3.5 h-3.5" />
              </span>
              <span className="text-slate-300">{feeTier}%</span>
            </div>
            
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-slate-500 flex items-center gap-2">
                Slippage <Info className="w-3.5 h-3.5" />
              </span>
              <div className="flex gap-1.5">
                {['0.1', '0.5', '1.0'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={cn(
                      "px-3 py-1 rounded-lg transition-all border",
                      slippage === s 
                        ? "bg-blue-600/20 border-blue-500 text-blue-400" 
                        : "bg-slate-900 border-white/5 text-slate-600 hover:text-slate-400"
                    )}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-slate-500 flex items-center gap-2">
                Slippage Amount <Info className="w-3.5 h-3.5" />
              </span>
              <span className="text-slate-300">
                {slippageInfo ? `${slippageInfo.slippageAmount} ${toToken}` : `-- ${toToken}`}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-slate-500 flex items-center gap-2">
                Minimum Received <Info className="w-3.5 h-3.5" />
              </span>
              <span className="text-slate-300">
                {slippageInfo ? `${slippageInfo.minReceived} ${toToken}` : `-- ${toToken}`}
              </span>
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-blue-200/80">
                  {priceFromTo !== null
                    ? `1 ${fromToken} = ${priceFromTo.toFixed(6)} ${toToken}`
                    : `1 ${fromToken} = -- ${toToken}`}
                </span>
              </div>
              <RefreshCcw className="w-3 h-3 text-blue-400 cursor-pointer hover:rotate-180 transition-transform duration-500" />
            </div>
          </div>

          <button className="w-full mt-8 btn-primary group" onClick={handleConfirmSwap}>
            <span className="relative z-10">CONFIRM SWAP</span>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          
        </div>
      </motion.div>
    </>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

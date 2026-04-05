import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Info, Settings2, BarChart3, Layers, Target, Zap } from 'lucide-react';
import { KernelVisualizer } from './KernelVisualizer';
import { cn } from '@/src/lib/utils';
import { useWeb3 } from '../hooks/useWeb3';
import { ethers } from 'ethers';
import addresses from '../contracts/deployedAddresses.json';
import { AlertBox, type AlertMessage } from './AlertBox';
import FactoryArtifact from '../../../backend/artifacts/contracts/PoolFactory.sol/PoolFactory.json';
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';

const FACTORY_CONTRACT_ADDRESS = addresses.factory;
const FACTORY_CONTRACT_ABI = FactoryArtifact.abi;
const POOL_CONTRACT_ABI = PoolArtifact.abi;

export function InitializePool({ onPoolCreated = () => {} }: { onPoolCreated?: (address: string) => void }) {
  const [feeTier, setFeeTier] = useState('0.3');
  const [kernelType, setKernelType] = useState('gaussian');
  const [initialPrice, setInitialPrice] = useState('1.00000');
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { account, connect, sendTransaction, provider } = useWeb3();

  const handleInitialize = async () => {
    try {
      if (isInitializing || isInitialized) return;
      setIsInitializing(true);
      setAlert(null);
      let currentAccount = account;
      if (!currentAccount) {
        await connect();
        
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        currentAccount = accounts[0];
        
        if (!currentAccount) {
          setAlert({ type: 'error', message: 'Please connect your wallet first.' });
          setIsInitializing(false);
          return;
        }
      }

      if (!provider) {
        setAlert({ type: 'error', message: 'Web3 Provider not found.' });
        setIsInitializing(false);
        return;
      }

      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(
        FACTORY_CONTRACT_ADDRESS,
        FACTORY_CONTRACT_ABI,
        signer
      );

      setAlert({ type: 'info', message: 'Please confirm the transaction in MetaMask...' });

      const tx = await poolContract.createPool(
        [addresses.usdc, addresses.nfs],    
        ethers.parseUnits(feeTier, 4),        
        ethers.parseUnits(initialPrice, 18),    
        kernelType
      );

      console.log('Transaction submitted:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction receipt:', receipt);

      const iface = new ethers.Interface(FACTORY_CONTRACT_ABI);
      const parsedLog = receipt.logs
        ?.map((log: any) => {
          try {
            return iface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: any) => parsed && parsed.name === 'PoolCreated');

      const legacyEvent = receipt.events?.find((e: any) => e.event === 'PoolCreated');

      const newPoolAddress =
        parsedLog?.args?.poolAddress ??
        parsedLog?.args?.[0] ??
        legacyEvent?.args?.poolAddress ??
        legacyEvent?.args?.[0];

      if (!newPoolAddress) {
        setAlert({ type: 'error', message: 'Failed to retrieve new pool address from transaction receipt.' });
        return;
      }

      console.log("New Pool:", newPoolAddress);

      setAlert({ type: 'info', message: 'Initializing pool parameters...' });

      const newPoolContract = new ethers.Contract(
        newPoolAddress,
        POOL_CONTRACT_ABI,
        signer
      );

      const initTx = await newPoolContract.initializePool(
        [addresses.usdc, addresses.nfs],
        ethers.parseUnits(feeTier, 4),
        ethers.parseUnits(initialPrice, 18),
        kernelType
      );

      console.log('Initialize tx submitted:', initTx.hash);
      await initTx.wait();

      onPoolCreated(newPoolAddress);

      setAlert({ type: 'success', message: 'Protocol Infrastructure Initialized Successfully.' });
      setIsInitialized(true);

    } catch (error: any) {
      console.error('Error initializing pool:', error);
      
      if (error.code === 'ACTION_REJECTED') {
        setAlert({ type: 'error', message: 'Transaction rejected by user.' });
      } else {
        const message = error?.shortMessage || error?.reason || error?.message || 'Failed to initialize pool.';
        setAlert({ type: 'error', message });
      }
    } finally {
      setIsInitializing(false);
    } 
  };
  
  return (
    <>
      <AlertBox alert={alert} onClose={() => setAlert(null)} />
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[1200px] mx-auto mt-16"
    >
      <div className="glass-card glow-blue p-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tighter">PROTOCOL INITIALIZATION</h2>
            <p className="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase mt-2">Deploy Concentrated Liquidity Infrastructure</p>
          </div>
          <div className="flex items-center gap-3">
            
            <button
              onClick={handleInitialize}
              disabled={isInitializing}
              className={cn(
                "btn-primary px-4 py-2 text-[10px] tracking-[0.2em] group",
                (isInitializing) && "opacity-60 cursor-not-allowed"
              )}
            >
              <span className="relative z-10">
                {isInitializing ? "INITIALIZING..." : "INITIALIZE PROTOCOL"}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
          
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5 space-y-10">
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Layers className="w-4 h-4 text-blue-400" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Configuration</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AssetButton symbol="USDC" color="bg-blue-500" />
                <AssetButton symbol="NFS" color="bg-purple-500" />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-4 h-4 text-purple-400" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Fee Architecture</label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['0.05', '0.3', '1.0'].map((fee) => (
                  <button
                    key={fee}
                    onClick={() => setFeeTier(fee)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all relative group",
                      feeTier === fee 
                        ? "bg-blue-600/10 border-blue-500 text-blue-400" 
                        : "bg-slate-900/40 border-white/5 text-slate-500 hover:border-white/10"
                    )}
                  >
                    <div className="text-lg font-black">{fee}%</div>
                    <div className="text-[9px] font-bold opacity-60 uppercase tracking-tighter">Efficiency</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-6">
                <Zap className="w-4 h-4 text-yellow-500" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Price Oracle Seed</label>
              </div>
              <div className="relative group">
                <input
                  type="number"
                  value={initialPrice}
                  placeholder="1.00000"
                  onChange={(e)=> setInitialPrice(e.target.value)}
                  className="w-full input-field text-xl font-black pr-24"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-600 uppercase tracking-widest">USDC / NFS</span>
              </div>
            </section>
          </div>

          <div className="lg:col-span-7 space-y-10">
            <section className="bg-slate-950/40 border border-white/5 rounded-[2.5rem] p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Kernel Geometry</label>
                </div>
                <div className="flex gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/5">
                  {['gaussian', 'uniform', 'triangular'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setKernelType(type)}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        kernelType === type ? "bg-blue-600 text-white shadow-lg" : "text-slate-600 hover:text-slate-400"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              
              <KernelVisualizer />

              
            </section>

            
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );
}


function AssetButton({ symbol, color }: { symbol: string, color: string }) {
  return (
    <button className="flex items-center justify-between bg-slate-900/40 border border-white/5 p-4 rounded-2xl hover:border-white/10 transition-all group">
      <div className="flex items-center gap-3">
        <div className={cn("w-8 h-8 rounded-full shadow-lg group-hover:scale-110 transition-transform", color)} />
        <span className="font-black text-sm tracking-tight text-white">{symbol}</span>
      </div>
      <Plus className="w-4 h-4 text-slate-700 group-hover:text-blue-400 transition-colors" />
    </button>
  );
}

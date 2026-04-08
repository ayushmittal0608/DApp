import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import addresses from '../contracts/deployedAddresses.json';
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';
import PoolFactoryArtifact from '../../../backend/artifacts/contracts/PoolFactory.sol/PoolFactory.json';

export function KernelVisualizer() {
  const { provider } = useWeb3();
  const [kernelType, setKernelType] = useState<'gaussian' | 'uniform' | 'triangular'>('gaussian');
  const [initialPrice, setInitialPrice] = useState<number>(100);

  useEffect(() => {
    const loadKernel = async () => {
      const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
      if (!activeProvider) return;
      const factory = new ethers.Contract(addresses.factory, PoolFactoryArtifact.abi, activeProvider);
      const active = await factory.activePool();
      if (!active || active === ethers.ZeroAddress) return;
      const pool = new ethers.Contract(active, PoolArtifact.abi, activeProvider);
      const [, , initPrice, kType] = await pool.getPoolDetails();
      setInitialPrice(Number(ethers.formatUnits(initPrice, 18)) || 100);
      const normalized = (kType || 'gaussian').toLowerCase();
      if (normalized === 'uniform' || normalized === 'triangular' || normalized === 'gaussian') {
        setKernelType(normalized as 'gaussian' | 'uniform' | 'triangular');
      }
    };
    loadKernel();
  }, [provider]);

  const { data, minPrice, maxPrice } = useMemo(() => {
    const center = Number.isFinite(initialPrice) && initialPrice > 0 ? initialPrice : 100;
    const min = center * 0.8;
    const max = center * 1.2;
    const points = 41;
    const step = (max - min) / (points - 1);
    const sigma = (max - min) / 6; 
    const peak = 200;

    const series = Array.from({ length: points }, (_, i) => {
      const price = min + step * i;
      let liquidity = 0;
      if (kernelType === 'gaussian') {
        const z = (price - center) / sigma;
        liquidity = peak * Math.exp(-0.5 * z * z);
      } else if (kernelType === 'uniform') {
        liquidity = peak * 0.6;
      } else {
        
        const t = Math.max(0, 1 - Math.abs(price - center) / (max - center));
        liquidity = peak * t;
      }
      return { price: Number(price.toFixed(2)), liquidity: Number(liquidity.toFixed(2)) };
    });
    return { data: series, minPrice: min, maxPrice: max };
  }, [initialPrice, kernelType]);

  return (
    <div className="w-full h-56 bg-slate-950/60 rounded-3xl p-6 border border-white/5 relative group">
      <div className="absolute inset-0 bg-blue-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6 relative">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Liquidity Distribution</span>
          <span className="text-xs font-bold text-blue-400 mt-0.5">{kernelType.toUpperCase()} KERNEL v1.0</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400">ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="h-32 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorLiq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="price" hide />
            <YAxis hide />
            <Tooltip 
              cursor={{ stroke: '#3b82f6', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 border border-white/10 p-3 rounded-xl shadow-2xl">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Price Point</p>
                      <p className="text-sm font-black text-white">{payload[0].payload.price} USDC</p>
                      <div className="mt-2 pt-2 border-t border-white/5">
                        <p className="text-[10px] font-bold text-blue-400 uppercase">Density: {payload[0].value}</p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine x={Number(initialPrice.toFixed(2))} stroke="#3b82f6" strokeDasharray="3 3" />
            <Area 
              type="monotone" 
              dataKey="liquidity" 
              stroke="#3b82f6" 
              fillOpacity={1} 
              fill="url(#colorLiq)" 
              strokeWidth={3}
              animationDuration={2000}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase tracking-widest">
        <span>Min: {minPrice.toFixed(2)}</span>
        <span className="text-blue-500/50">Current: {initialPrice.toFixed(2)}</span>
        <span>Max: {maxPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}

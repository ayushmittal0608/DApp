import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Droplets, Plus, Minus, History, ExternalLink, ArrowUpRight, TrendingUp, Shield, Flame } from 'lucide-react';
import { cn, formatNumber } from '@/src/lib/utils';
import { ethers } from 'ethers';
import addresses from '../contracts/deployedAddresses.json';
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';
import PoolFactoryArtifact from '../../../backend/artifacts/contracts/PoolFactory.sol/PoolFactory.json';
import { useWeb3 } from '../hooks/useWeb3';

const FACTORY_ADDRESS = addresses.factory;
const POOL_ABI = PoolArtifact.abi;
const FACTORY_ABI = PoolFactoryArtifact.abi;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)"
];


export function Pool() {
  const [activeTab, setActiveTab] = useState<'positions' | 'create'>('positions');
  const [poolDetailsList, setPoolDetailsList] = useState<any[]>([]);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMints, setIsLoadingMints] = useState(false);
  
  const [mintEvents, setMintEvents] = useState<Array<{
    provider: string;
    usdcAmount: string;
    nfsAmount: string;
    usdcAmountRaw: bigint;
    nfsAmountRaw: bigint;
    txHash: string;
    blockNumber: number;
  }>>([]);
  const [swapEvents, setSwapEvents] = useState<Array<{
    sender: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    txHash: string;
    blockNumber: number;
  }>>([]);
  const seenMintEvents = useRef<Set<string>>(new Set());
  const seenSwapEvents = useRef<Set<string>>(new Set());
  const lastMintBlock = useRef<number | null>(null);
  const lastSwapBlock = useRef<number | null>(null);
  const { provider, account, connect } = useWeb3();
  const [usdcAmount, setUsdcAmount] = useState<number>(0);
  const [nfsAmount, setNfsAmount] = useState<number>(0);

  const resolvePoolAddress = async () => {
    const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (!activeProvider) {
      return null;
    }
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, activeProvider);
    try {
      const active = await factory.activePool();
      if (active && active !== ethers.ZeroAddress) {
        return active;
      }
    } catch (err) {
      console.error("Failed to fetch active pool from factory:", err);  
    }
    const pools: string[] = await factory.getPools();
    if (!pools || pools.length === 0) {
      return null;
    }
    return pools[pools.length - 1];
  };

  const getActivePoolAddress = async () => {
    const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (!activeProvider) {
      return null;
    }
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, activeProvider);
    const active = await factory.activePool();
    if (!active || active === ethers.ZeroAddress) {
      return null;
    }
    return active;
  };

  const resolveSymbol = (assetAddress: string) => {
    const addr = assetAddress?.toLowerCase?.() ?? '';
    if (addr === addresses.usdc.toLowerCase()) return 'USDC';
    if (addr === addresses.nfs.toLowerCase()) return 'NFS';
    return assetAddress;
  };

  const handleBurnMint = async (
    txHash: string,
    blockNumber: number,
    usdcAmountRaw: bigint,
    nfsAmountRaw: bigint
  ) => {
    if (!account) {
      await connect();
    }
    if (!provider) {
      console.warn("Wallet not connected. Cannot burn position.");
      return;
    }
    const activePoolAddress = await getActivePoolAddress();
    if (!activePoolAddress) {
      console.warn("No pool available. Initialize a pool first.");
      return;
    }
    if (usdcAmountRaw === undefined || nfsAmountRaw === undefined) {
      console.error("Invalid burn amounts provided.");
      return;
    }

    try {
      setIsLoading(true);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(activePoolAddress, POOL_ABI, signer);
      const [userUsdc, userNfs] = await Promise.all([
        poolContract.userUsdcDeposit(account),
        poolContract.userNfsDeposit(account)
      ]);
      if (userUsdc < usdcAmountRaw || userNfs < nfsAmountRaw) {
        console.warn("Insufficient deposited balance to burn these amounts.", {
          userUsdc: userUsdc.toString(),
          userNfs: userNfs.toString(),
          burnUsdc: usdcAmountRaw.toString(),
          burnNfs: nfsAmountRaw.toString()
        });
        return;
      }
      const tx = await poolContract.burn(usdcAmountRaw, nfsAmountRaw);
      await tx.wait();
      setMintEvents((prev) => prev.filter((evt) => !(evt.txHash === txHash && evt.blockNumber === blockNumber)));
      await Promise.all([
        loadPoolData(),
        loadMintEvents()
      ]);
    } catch (err) {
      console.error("Failed to burn position:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMint = async () => {
    if(!account) {
      await connect();
    }
    if (!provider) {
      console.warn("Wallet not connected. Cannot mint position.");
      return;
    }
    const activePoolAddress = await getActivePoolAddress();
    if (!activePoolAddress) {
      console.warn("No pool available. Initialize a pool first.");
      return;
    }
    try {
      setIsLoading(true);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(activePoolAddress, POOL_ABI, signer);
      
      const usdcContract = new ethers.Contract(addresses.usdc, ERC20_ABI, signer);
      const nfsContract = new ethers.Contract(addresses.nfs, ERC20_ABI, signer);

      const usdcAmountWei = ethers.parseUnits(usdcAmount.toString(), 6); 
      const nfsAmountWei = ethers.parseUnits(nfsAmount.toString(), 18); 

      console.log("Approving USDC...");
      const app1 = await usdcContract.approve(activePoolAddress, usdcAmountWei);
      await app1.wait();

      console.log("Approving NFS...");
      const app2 = await nfsContract.approve(activePoolAddress, nfsAmountWei);
      await app2.wait();

      console.log("Calling Mint with:", { usdcAmountWei, nfsAmountWei });
      const tx = await poolContract.mint(usdcAmountWei, nfsAmountWei);
      console.log("Minting position with amounts:", { usdc: usdcAmountWei.toString(), nfs: nfsAmountWei.toString() });
      await tx.wait();
      console.log("Position minted successfully!");
      await loadMintEvents();
    }
    catch (err) {
      console.error("Failed to mint position:", err);
    }
    finally {
      setIsLoading(false);
    }
  };

  const adjustAmount = (token: 'USDC' | 'NFS', delta: number) => {
    if (token === 'USDC') {
      setUsdcAmount((prev) => Math.max(0, Number((prev + delta).toFixed(6))));
      return;
    }
    setNfsAmount((prev) => Math.max(0, Number((prev + delta).toFixed(6))));
  };

  const onAmountInput = (token: 'USDC' | 'NFS', value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }
    if (token === 'USDC') {
      setUsdcAmount(Math.max(0, parsed));
      return;
    }
    setNfsAmount(Math.max(0, parsed));
  };
  console.log("Web3 State:", { provider, account });
  const loadMintEvents = async () => {
    if (!account) {
      await connect();
    }
    const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (!activeProvider) {
      console.warn("No provider available. Cannot fetch mint events.");
      return;
    }
    const activePoolAddress = await getActivePoolAddress();
    if (!activePoolAddress) {
      console.warn("No pool available. Initialize a pool first.");
      setMintEvents([]);
      return;
    }
    try {
      setIsLoadingMints(true);
      const poolContract = new ethers.Contract(activePoolAddress, POOL_ABI, activeProvider);
      const [events, removedEvents] = await Promise.all([
        poolContract.queryFilter(poolContract.filters.LiquidityAdded()),
        poolContract.queryFilter(poolContract.filters.LiquidityRemoved())
      ]);
      const mapped = events.map((ev: any) => {
        const providerAddr = ev.args?.provider ?? ev.args?.[0] ?? '';
        const usdc = ev.args?.usdcAmount ?? ev.args?.[1] ?? 0n;
        const nfs = ev.args?.nfsAmount ?? ev.args?.[2] ?? 0n;
        const eventKey = `${ev.transactionHash}-${ev.logIndex ?? ev.index ?? 0}`;
        seenMintEvents.current.add(eventKey);
        return {
          provider: providerAddr,
          usdcAmount: ethers.formatUnits(usdc, 6),
          nfsAmount: ethers.formatUnits(nfs, 18),
          usdcAmountRaw: BigInt(usdc),
          nfsAmountRaw: BigInt(nfs),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber
        };
      });
      if (events.length > 0) {
        const latestBlock = Math.max(...events.map((ev: any) => ev.blockNumber || 0));
        lastMintBlock.current = latestBlock || lastMintBlock.current;
      }
      const removedList = removedEvents.map((ev: any) => ({
        provider: (ev.args?.provider ?? ev.args?.[0] ?? '').toLowerCase(),
        usdc: (ev.args?.usdcAmount ?? ev.args?.[1] ?? 0n).toString(),
        nfs: (ev.args?.nfsAmount ?? ev.args?.[2] ?? 0n).toString()
      }));
      const filtered = mapped.filter((m) => {
        const idx = removedList.findIndex((r) =>
          r.provider === m.provider.toLowerCase() &&
          r.usdc === m.usdcAmountRaw.toString() &&
          r.nfs === m.nfsAmountRaw.toString()
        );
        if (idx >= 0) {
          removedList.splice(idx, 1);
          return false;
        }
        return true;
      });
      setMintEvents(filtered.reverse());
    } catch (err) {
      console.error("Failed to fetch mint events:", err);
    } finally {
      setIsLoadingMints(false);
    }
  };

  const loadSwapEvents = async () => {
    if (!account) {
      await connect();
    }
    const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (!activeProvider) {
      console.warn("No provider available. Cannot fetch swap events.");
      return;
    }
    const activePoolAddress = await getActivePoolAddress();
    if (!activePoolAddress) {
      setSwapEvents([]);
      return;
    }
    try {
      const poolContract = new ethers.Contract(activePoolAddress, POOL_ABI, activeProvider);
      const events = await poolContract.queryFilter(poolContract.filters.Swap());
      const mapped = events.map((ev: any) => {
        const sender = ev.args?.sender ?? ev.args?.[0] ?? '';
        const tokenIn = ev.args?.tokenIn ?? ev.args?.[1] ?? '';
        const tokenOut = ev.args?.tokenOut ?? ev.args?.[2] ?? '';
        const amountIn = ev.args?.amountIn ?? ev.args?.[3] ?? 0n;
        const amountOut = ev.args?.amountOut ?? ev.args?.[4] ?? 0n;
        const eventKey = `${ev.transactionHash}-${ev.logIndex ?? ev.index ?? 0}`;
        seenSwapEvents.current.add(eventKey);
        const inDecimals = tokenIn.toLowerCase() === addresses.usdc.toLowerCase() ? 6 : 18;
        const outDecimals = tokenOut.toLowerCase() === addresses.usdc.toLowerCase() ? 6 : 18;
        return {
          sender,
          tokenIn: resolveSymbol(tokenIn),
          tokenOut: resolveSymbol(tokenOut),
          amountIn: ethers.formatUnits(amountIn, inDecimals),
          amountOut: ethers.formatUnits(amountOut, outDecimals),
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber
        };
      });
      if (events.length > 0) {
        const latestBlock = Math.max(...events.map((ev: any) => ev.blockNumber || 0));
        lastSwapBlock.current = latestBlock || lastSwapBlock.current;
      }
      setSwapEvents(mapped.reverse());
    } catch (err) {
      console.error("Failed to fetch swap events:", err);
    }
  };

  const loadPoolData = async () => {
    if (!account){
      await connect();
    }
    if(!provider) {
      console.warn("No provider available. Cannot fetch pool data.");
      return;
    }
    try {
      setIsLoading(true);
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
      const pools: string[] = await factory.getPools();
      if (!pools || pools.length === 0) {
        setPoolDetailsList([]);
        return;
      }
      const activePoolAddress: string = await factory.activePool();
      const details = await Promise.all(
        pools.map(async (addr) => {
          const poolContract = new ethers.Contract(addr, POOL_ABI, provider);
          const [assets, fee, initialPrice, kernelType, tvl, volume24h, apr] = await poolContract.getPoolDetails();
          const isInit = await poolContract.isInitialized();
          const pair = assets?.length === 2
            ? `${resolveSymbol(assets[0])} / ${resolveSymbol(assets[1])}`
            : 'Unknown Pair';
          const status = addr.toLowerCase() === activePoolAddress.toLowerCase() && isInit
          ? 'Active'
          : 'Inactive';
          return {
            id: addr,
            address: addr,
            pair,
            fee: `${(Number(fee) / 10000).toFixed(2)}%`,
            tvl: `${ethers.formatUnits(tvl, 18)}`,
            volume: `${ethers.formatUnits(volume24h, 18)}`,
            apr: `${(Number(apr) / 100).toFixed(2)}%`,
            status,
            initialPrice: ethers.formatUnits(initialPrice, 18),
            kernel: kernelType
          };
        })
      );
      setPoolDetailsList(details.reverse());
    } catch (err) {
      console.error("Failed to fetch pool:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadActivePoolBalances = async () => {
    if (!provider) {
      return;
    }
    try {
      const activeProvider = provider || (window?.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
      if (!activeProvider) return;
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, activeProvider);
      const active = await factory.activePool();
      if (!active || active === ethers.ZeroAddress) {
        return;
      }

      const poolContract = new ethers.Contract(active, POOL_ABI, activeProvider);
      const [assets, fee, initialPrice, kernelType] = await poolContract.getPoolDetails();
      const token0 = assets?.[0];
      const token1 = assets?.[1];
      if (!token0 || !token1) {
        return;
      }

      const token0Contract = new ethers.Contract(token0, ERC20_ABI, activeProvider);
      const token1Contract = new ethers.Contract(token1, ERC20_ABI, activeProvider);
      const [token0Bal, token1Bal] = await Promise.all([
        token0Contract.balanceOf(active),
        token1Contract.balanceOf(active)
      ]);

      const usdcValue = BigInt(token0Bal) * 10n ** 12n;
      const nfsValue = (BigInt(token1Bal) * BigInt(initialPrice)) / 10n ** 18n;
      const tvl = usdcValue + nfsValue;

      setPoolDetailsList((prev) =>
        prev.map((pool) =>
          pool.address.toLowerCase() === active.toLowerCase()
            ? {
                ...pool,
                tvl: `${ethers.formatUnits(tvl, 18)}`,
                fee: `${(Number(fee) / 10000).toFixed(2)}%`,
                kernel: kernelType,
                initialPrice: ethers.formatUnits(initialPrice, 18)
              }
            : pool
        )
      );
    } catch (err) {
      console.error("Failed to load active pool balances:", err);
    }
  };

  const handleManagePool = async (pool: { address: string }) => {
    if (!account) {
      await connect();
    }
    if (!provider) {
      console.warn("Wallet not connected. Cannot manage pool.");
      return;
    }
    try {
      setIsLoading(true);
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(pool.address, POOL_ABI, signer);
      const isInit = await poolContract.isInitialized();
      console.log('Pool initialization status:', isInit);
      if (!isInit) {
        const [assetsRaw, fee, initialPrice, kernelType] = await poolContract.getPoolDetails();
        const assets = Array.from(assetsRaw || []);
        const initTx = await poolContract.initializePool(assets, fee, initialPrice, kernelType);
        await initTx.wait();
      }
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
      console.log("Setting active pool to:", pool.address);
      const tx = await factory.setActivePool(pool.address);
      console.log("Transaction sent. Hash:", tx.hash); 
      await tx.wait();
      setPoolAddress(pool.address);
      await Promise.all([loadPoolData(), loadMintEvents()]);
    } catch (err) {
      console.error("Failed to manage pool:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const syncPoolAddress = async () => {
      try {
        const addr = await resolvePoolAddress();
        setPoolAddress(addr);
      } catch (err) {
        console.error("Failed to resolve pool address:", err);
        setPoolAddress(null);
      }
    };
    syncPoolAddress();
  }, [provider, account]);

  useEffect(() => {
    seenMintEvents.current = new Set();
    lastMintBlock.current = null;
    setMintEvents([]);
    seenSwapEvents.current = new Set();
    lastSwapBlock.current = null;
    setSwapEvents([]);
  }, [poolAddress]);

  useEffect(() => {
    loadPoolData();
    loadMintEvents();
    loadSwapEvents();
  }, [provider, account, poolAddress]);

  useEffect(() => {
    if (!provider) return;
    if (!poolAddress) return;
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const handleLiquidityAdded = (providerAddr: string, usdc: bigint, nfs: bigint, event: any) => {
      const txHash = event?.log?.transactionHash || event?.transactionHash || '';
      const blockNumber = event?.log?.blockNumber || event?.blockNumber || 0;
      const logIndex = event?.log?.index ?? event?.logIndex ?? event?.index ?? 0;
      const eventKey = `${txHash}-${logIndex}`;
      if (seenMintEvents.current.has(eventKey)) {
        return;
      }
      seenMintEvents.current.add(eventKey);
      setMintEvents((prev) => [
        {
          provider: providerAddr,
          usdcAmount: ethers.formatUnits(usdc, 6),
          nfsAmount: ethers.formatUnits(nfs, 18),
          usdcAmountRaw: usdc,
          nfsAmountRaw: nfs,
          txHash,
          blockNumber
        },
        ...prev
      ]);
      if (blockNumber) {
        lastMintBlock.current = Math.max(lastMintBlock.current || 0, blockNumber);
      }
    };
    const handleLiquidityRemoved = (providerAddr: string, usdc: bigint, nfs: bigint) => {
      setMintEvents((prev) => {
        const idx = prev.findIndex((evt) =>
          evt.provider.toLowerCase() === providerAddr.toLowerCase() &&
          evt.usdcAmountRaw.toString() === usdc.toString() &&
          evt.nfsAmountRaw.toString() === nfs.toString()
        );
        if (idx < 0) return prev;
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      });
    };
    const handleSwapEvent = (sender: string, tokenIn: string, tokenOut: string, amountIn: bigint, amountOut: bigint, event: any) => {
      const txHash = event?.log?.transactionHash || event?.transactionHash || '';
      const blockNumber = event?.log?.blockNumber || event?.blockNumber || 0;
      const logIndex = event?.log?.index ?? event?.logIndex ?? event?.index ?? 0;
      const eventKey = `${txHash}-${logIndex}`;
      if (seenSwapEvents.current.has(eventKey)) {
        return;
      }
      seenSwapEvents.current.add(eventKey);
      const inDecimals = tokenIn.toLowerCase() === addresses.usdc.toLowerCase() ? 6 : 18;
      const outDecimals = tokenOut.toLowerCase() === addresses.usdc.toLowerCase() ? 6 : 18;
      setSwapEvents((prev) => [
        {
          sender,
          tokenIn: resolveSymbol(tokenIn),
          tokenOut: resolveSymbol(tokenOut),
          amountIn: ethers.formatUnits(amountIn, inDecimals),
          amountOut: ethers.formatUnits(amountOut, outDecimals),
          txHash,
          blockNumber
        },
        ...prev
      ]);
      if (blockNumber) {
        lastSwapBlock.current = Math.max(lastSwapBlock.current || 0, blockNumber);
      }
    };
    const handleSwap = async () => {
      try {
        await loadActivePoolBalances();
      } catch (err) {
        console.error("Failed to refresh pool balances after swap:", err);
      }
    };
    poolContract.on("LiquidityAdded", handleLiquidityAdded);
    poolContract.on("LiquidityRemoved", handleLiquidityRemoved);
    poolContract.on("Swap", handleSwap);
    poolContract.on("Swap", handleSwapEvent);
    const handleBlock = async (blockNumber: number) => {
      const fromBlock = lastMintBlock.current ? lastMintBlock.current + 1 : blockNumber;
      if (blockNumber < fromBlock) return;
      try {
        const events = await poolContract.queryFilter(poolContract.filters.LiquidityAdded(), fromBlock, blockNumber);
        if (events.length === 0) return;
        const newEvents = events
          .map((ev: any) => {
            const txHash = ev.transactionHash;
            const logIndex = ev.logIndex ?? ev.index ?? 0;
            const eventKey = `${txHash}-${logIndex}`;
            if (seenMintEvents.current.has(eventKey)) {
              return null;
            }
            seenMintEvents.current.add(eventKey);
            const providerAddr = ev.args?.provider ?? ev.args?.[0] ?? '';
            const usdc = ev.args?.usdcAmount ?? ev.args?.[1] ?? 0n;
            const nfs = ev.args?.nfsAmount ?? ev.args?.[2] ?? 0n;
            return {
              provider: providerAddr,
              usdcAmount: ethers.formatUnits(usdc, 6),
              nfsAmount: ethers.formatUnits(nfs, 18),
              usdcAmountRaw: usdc,
              nfsAmountRaw: nfs,
              txHash,
              blockNumber: ev.blockNumber
            };
          })
          .filter(Boolean) as Array<{
            provider: string;
            usdcAmount: string;
            nfsAmount: string;
            usdcAmountRaw: bigint;
            nfsAmountRaw: bigint;
            txHash: string;
            blockNumber: number;
          }>;
        if (newEvents.length > 0) {
          setMintEvents((prev) => [...newEvents.reverse(), ...prev]);
          lastMintBlock.current = blockNumber;
        }
      } catch (err) {
        console.error("Failed to poll mint events:", err);
      }
    };
    provider.on("block", handleBlock);
    return () => {
      poolContract.off("LiquidityAdded", handleLiquidityAdded);
      poolContract.off("LiquidityRemoved", handleLiquidityRemoved);
      poolContract.off("Swap", handleSwap);
      poolContract.off("Swap", handleSwapEvent);
      provider.off("block", handleBlock);
    };
  }, [provider, poolAddress]);



  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[1200px] mx-auto mt-14 px-4"
    >
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter">LIQUIDITY HUB</h2>
          <p className="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase mt-2">Manage Your Yield Infrastructure</p>
        </div>
        <div className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-white/5">
          <TabButton 
            active={activeTab === 'positions'} 
            onClick={() => setActiveTab('positions')}
            label="MY POSITIONS"
          />
          <TabButton 
            active={activeTab === 'create'} 
            onClick={() => setActiveTab('create')}
            label="EXPLORE"
          />
        </div>
      </div>

      {activeTab === 'positions' ? (
        <div className="space-y-6">
          <div className="glass-card border-dashed border-2 border-white/5 flex flex-col items-center justify-left py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20" />
              <div className="relative w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-white/10">
                <Droplets className="w-10 h-10 text-blue-400" />
              </div>
            </div>
            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Liquidity Hub</h3>
            <p className="text-slate-500 text-xs mb-6 max-w-[260px] font-medium leading-relaxed">
              {isLoadingMints
                ? "Syncing mint events from the chain..."
                : mintEvents.length > 0
                  ? "Latest deployed liquidity positions"
                  : "No active liquidity nodes detected. Deploy capital to start earning protocol fees."}
            </p>
            <button
              onClick={async () => {
                await loadMintEvents();
              }}
              className="px-4 py-2 mb-6 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 border border-white/5 transition-all"
            >
              {isLoadingMints ? "SYNCING..." : "REFRESH MINTS"}
            </button>

            {mintEvents.length > 0 && (
              <div className="w-full max-w-[700px] mb-6 rounded-2xl border border-white/5 bg-slate-950/40 overflow-hidden">
                <div className="grid grid-cols-5 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                  <div className="px-4 py-3 font-black">Provider</div>
                  <div className="px-4 py-3 font-black">USDC</div>
                  <div className="px-4 py-3 font-black">NFS</div>
                  <div className="px-4 py-3 font-black">Block</div>
                  <div className="px-4 py-3 font-black text-right">Actions</div>
                </div>
                {mintEvents.map((evt) => (
                  <div key={`${evt.txHash}-${evt.blockNumber}`} className="grid grid-cols-5 text-xs text-slate-200 border-b border-white/5 last:border-b-0">
                    <div className="px-4 py-3 font-mono">{evt.provider.slice(0, 6)}...{evt.provider.slice(-4)}</div>
                    <div className="px-4 py-3 font-mono text-green-400">{evt.usdcAmount}</div>
                    <div className="px-4 py-3 font-mono text-purple-400">{evt.nfsAmount}</div>
                    <div className="px-4 py-3 font-mono text-slate-400">{evt.blockNumber}</div>
                    <div className="px-4 py-3 text-right">
                      <button
                        className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-300 transition-all"
                        onClick={() => handleBurnMint(evt.txHash, evt.blockNumber, evt.usdcAmountRaw, evt.nfsAmountRaw)}
                        disabled={!account || evt.provider.toLowerCase() !== account.toLowerCase() || isLoading}
                        title={!account
                          ? "Connect wallet to burn"
                          : evt.provider.toLowerCase() !== account.toLowerCase()
                            ? "Only the original provider can burn"
                            : "Burn this mint"}
                      >
                        <Flame className="w-3.5 h-3.5 inline-block align-middle" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="w-full max-w-[700px] mb-6 rounded-2xl border border-white/5 bg-slate-950/40 overflow-hidden">
              <div className="grid grid-cols-5 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <div className="px-4 py-3 font-black">Sender</div>
                <div className="px-4 py-3 font-black">In</div>
                <div className="px-4 py-3 font-black">Out</div>
                <div className="px-4 py-3 font-black">Block</div>
                <div className="px-4 py-3 font-black text-right">Pair</div>
              </div>
              {swapEvents.length > 0 ? (
                swapEvents.map((evt) => (
                  <div key={`${evt.txHash}-${evt.blockNumber}`} className="grid grid-cols-5 text-xs text-slate-200 border-b border-white/5 last:border-b-0">
                    <div className="px-4 py-3 font-mono">{evt.sender.slice(0, 6)}...{evt.sender.slice(-4)}</div>
                    <div className="px-4 py-3 font-mono text-green-400">{evt.amountIn}</div>
                    <div className="px-4 py-3 font-mono text-purple-400">{evt.amountOut}</div>
                    <div className="px-4 py-3 font-mono text-slate-400">{evt.blockNumber}</div>
                    <div className="px-4 py-3 font-mono text-right">{evt.tokenIn}/{evt.tokenOut}</div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  No swaps yet.
                </div>
              )}
            </div>

            <button className="btn-primary" 
              onClick={handleMint}
              disabled={isLoading || (usdcAmount <= 0 && nfsAmount <= 0)}
              >
              {isLoading ? "PROCESSING..." : "DEPLOY LIQUIDITY"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { id: 'usdc', token: 'USDC', amount: usdcAmount, onInput: (v: string) => onAmountInput('USDC', v), onInc: () => adjustAmount('USDC', 0.01), onDec: () => adjustAmount('USDC', -0.01) },
              { id: 'nfs', token: 'NFS', amount: nfsAmount, onInput: (v: string) => onAmountInput('NFS', v), onInc: () => adjustAmount('NFS', 0.01), onDec: () => adjustAmount('NFS', -0.01) },
            ].map((card) => (
              <div key={card.id} className="glass-card group cursor-pointer hover:border-blue-500/30 transition-all">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-2xl border-4 border-[#02040a] shadow-xl" />
                      <div className="w-10 h-10 bg-purple-500 rounded-2xl border-4 border-[#02040a] shadow-xl" />
                    </div>
                    <div>
                      <span className="block font-black text-white tracking-tight">{card.token}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fee Tier: {poolDetailsList?.[0]?.fee || '0'}</span>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-black rounded-lg uppercase tracking-widest">
                    OPTIMAL RANGE
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-4 bg-white/5 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Liquidity</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        step="0.000001"
                        value={card.amount}
                        onChange={(e) => card.onInput(e.target.value)}
                        className="w-full bg-transparent text-lg font-black text-white font-mono outline-none"
                      />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{card.token}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Fee Tier</p>
                    <p className="text-lg font-black text-green-400 font-mono">{poolDetailsList?.[0]?.fee || '0'}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={card.onInc}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Increase
                  </button>
                  <button
                    onClick={card.onDec}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                  >
                    <Minus className="w-3.5 h-3.5" /> Decrease
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-card p-10">

           <div className="mt-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-lg font-black text-white tracking-tight">ALL POOLS</h4>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">Manage & Discover</p>
                </div>
                <button 
                  onClick={loadPoolData}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 border border-white/5 transition-all">
                  {isLoading ? "SYNCING..." : "REFRESH"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-950/40">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-black">Pool</th>
                      <th className="px-6 py-4 font-black">Fee Tier</th>
                      <th className="px-6 py-4 font-black">TVL</th>
                      <th className="px-6 py-4 font-black">24h Volume</th>
                      <th className="px-6 py-4 font-black">APR</th>
                      <th className="px-6 py-4 font-black">Initial Price</th>
                      <th className="px-6 py-4 font-black">Kernel</th>
                      <th className="px-6 py-4 font-black">Status</th>
                      <th className="px-6 py-4 font-black text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {poolDetailsList.length > 0 ? (
                    poolDetailsList.map((pool) => (
                    <tr key={pool.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-black text-white">{pool.pair}</td>
                      <td className="px-6 py-4 text-slate-300 font-mono">{pool.fee}</td>
                      <td className="px-6 py-4 text-green-400 font-mono">{pool.tvl}</td>
                      <td className="px-6 py-4 text-purple-400 font-mono">{pool.volume}</td>
                      <td className="px-6 py-4 text-blue-400 font-mono">{pool.apr}</td>
                      <td className="px-2 py-4 text-slate-300 font-mono text-center">{pool.initialPrice}</td>
                      <td className="px-6 py-4 text-blue-400 font-black uppercase">{pool.kernel}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                          pool.status === 'Active' ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                          {pool.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          onClick={() => handleManagePool(pool)}
                          disabled={isLoading || pool.status === 'Active'}
                          title={pool.status === 'Active' ? 'This pool is already active' : 'Set this pool as active'}
                        >
                          {pool.status === 'Active' ? 'Current Pool' : 'Set Pool'}
                        </button>
                      </td>
                    </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-500 font-bold uppercase tracking-widest">
                        {isLoading ? "Fetching Blockchain State..." : "No Pools Found. Please Initialize."}
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      )}
    </motion.div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
        active ? "bg-slate-800 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
      )}
    >
      {label}
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="p-6 bg-slate-900/40 rounded-3xl border border-white/5">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-white tracking-tight">{value}</p>
    </div>
  );
}

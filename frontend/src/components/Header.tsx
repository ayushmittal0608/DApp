import { motion } from 'motion/react';
import { Wallet, ChevronDown, Activity, Zap, Globe, ShieldCheck } from 'lucide-react';
import { formatAddress } from '@/src/lib/utils';
import { ethers } from 'ethers';

interface HeaderProps {
  account: string | null;
  balance: string | null;
  connect: () => void;
  isConnecting: boolean;
}

export function Header({ account, balance, connect, isConnecting }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-8 py-6">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl flex items-center justify-center shadow-2xl border border-white/10">
                <Activity className="text-white w-7 h-7" />
              </div>
            </div>
           
          </div>

        </div>

        <div className="flex items-center gap-6">
          <div className="hidden xl:flex items-center gap-6 px-6 py-2.5 glass rounded-2xl border-white/5">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {balance ? `${balance} ETH` : '0.00 ETH'}
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            
          </div>
          
          <button
            onClick={connect}
            disabled={isConnecting}
            className="group relative flex items-center gap-3 px-6 py-3 bg-white text-black rounded-2xl text-[11px] font-black tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            <ShieldCheck className="w-4 h-4" />
            {account ? formatAddress(account) : isConnecting ? 'CONNECTING...' : 'CONNECT SYSTEM'}
          </button>
        </div>
      </div>
    </header>
  );
}

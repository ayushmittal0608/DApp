import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { Swap } from './components/Swap';
import { Pool } from './components/Pool';
import { InitializePool } from './components/InitializePool';
import { MempoolMonitor } from './components/MempoolMonitor';

import { AlertBox } from './components/AlertBox';
import { useWeb3 } from './hooks/useWeb3';
import { LayoutGrid, Repeat, PlusCircle, Activity } from 'lucide-react';

type View = 'swap' | 'pool' | 'initialize' | 'mempool';

export default function App() {
  const { account, connect, isConnecting, alert, clearAlert, balance } = useWeb3();
  const [currentView, setCurrentView] = useState<View>('swap');
  
  return (
    <div className="min-h-screen selection:bg-blue-500/30">
      <div className="noise" />
      
      <Header 
        account={account} 
        connect={connect} 
        balance={balance}
        isConnecting={isConnecting} 
      />
      
      <AlertBox alert={alert} onClose={clearAlert} />

      <main className="max-w-[1440px] mx-auto px-8 pt-12 pb-32">
        <AnimatePresence mode="wait">
          {currentView === 'swap' && (
            <motion.div
              key="swap"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <Swap />
            </motion.div>
          )}
          {currentView === 'pool' && (
            <motion.div
              key="pool"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <Pool />
            </motion.div>
          )}
          {currentView === 'initialize' && (
            <motion.div
              key="initialize"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <InitializePool />
            </motion.div>
          )}
          {currentView === 'mempool' && (
            <motion.div
              key="mempool"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <MempoolMonitor />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="fixed top-2 left-1/3 -translate-x-1/2 z-50">
        <div className="p-2 flex items-center gap-2 border-white/10">
          <NavButton 
            active={currentView === 'swap'} 
            onClick={() => setCurrentView('swap')}
            icon={<Repeat className="w-4 h-4" />}
            label="SWAP"
          />
          <NavButton 
            active={currentView === 'pool'} 
            onClick={() => setCurrentView('pool')}
            icon={<LayoutGrid className="w-4 h-4" />}
            label="POOLS"
          />
          <NavButton 
            active={currentView === 'initialize'} 
            onClick={() => setCurrentView('initialize')}
            icon={<PlusCircle className="w-4 h-4" />}
            label="CREATE"
          />
          <NavButton
            active={currentView === 'mempool'}
            onClick={() => setCurrentView('mempool')}
            icon={<Activity className="w-4 h-4" />}
            label="MEMPOOL"
          />
          
          
        </div>
      </div>

      

      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[180px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[180px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '64px 64px' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#02040a]/80" />
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 px-6 py-3.5 rounded-lg text-[11px] font-black tracking-[0.15em] transition-all duration-500 group ${
        active ? 'text-white' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-[0_0_20px_rgba(37,99,235,0.4)]"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <span className="relative z-10 group-hover:scale-110 transition-transform">{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Trash2, WifiOff } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useMempoolMonitor } from '../hooks/useMempoolMonitor';
import { ethers } from 'ethers';
import type { DecodedCalldata } from '../lib/decodeCalldata';

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function shortAddr(addr?: string | null) {
  if (!addr) return '-';
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function isDecodeError(decoded: DecodedCalldata): decoded is Extract<DecodedCalldata, { ok: false }> {
  return decoded.ok === false;
}

export function MempoolMonitor() {
  const wsUrl = import.meta.env.VITE_WS_RPC_URL as string | undefined;
  const { status, error, transport, items, clear } = useMempoolMonitor({
    wsUrl,
    maxItems: 80,
    enabled: true,
  });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const decodedText = isDecodeError(it.decoded)
        ? it.decoded.reason
        : `${it.decoded.contractLabel} ${it.decoded.functionName} ${it.decoded.signature}`;
      return (
        it.hash.toLowerCase().includes(q) ||
        (it.from ?? '').toLowerCase().includes(q) ||
        (it.to ?? '').toLowerCase().includes(q) ||
        decodedText.toLowerCase().includes(q) ||
        (it.data ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const connected = status === 'connected';
  const missingWs = !wsUrl;

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[1200px] mx-auto mt-16">
      <div className="glass-card glow-blue p-10">
        <div className="flex items-center justify-between mb-6 gap-6">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
              <Activity className="w-7 h-7 text-blue-400" />
              MEMPOOL MONITOR
            </h2>
            <p className="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase mt-2">
              Pending transactions with best-effort calldata decoding
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                'px-3 py-2 rounded-xl border text-[10px] font-black tracking-[0.18em] uppercase',
                connected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-slate-900/40 border-white/10 text-slate-400'
              )}
            >
              {missingWs ? (
                <span className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4" />
                  NEED `VITE_WS_RPC_URL`
                </span>
              ) : status === 'connecting' ? (
                transport === 'http' ? 'HTTP POLLING' : 'CONNECTING'
              ) : status === 'error' ? (
                'ERROR'
              ) : connected ? (
                transport === 'http' ? 'HTTP POLLING' : 'CONNECTED'
              ) : (
                'IDLE'
              )}
            </div>

            <button
              onClick={clear}
              className="btn-primary px-4 py-2 text-[10px] tracking-[0.2em] group"
              disabled={items.length === 0}
            >
              <span className="relative z-10 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                CLEAR
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {missingWs && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-200">
            <div className="text-[11px] font-black tracking-[0.2em] uppercase opacity-80">Config required</div>
            <div className="text-sm font-medium mt-1">
              Add a WebSocket RPC URL to your frontend env, e.g. <code className="font-mono">VITE_WS_RPC_URL=ws://127.0.0.1:8545</code>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200">
            <div className="text-[11px] font-black tracking-[0.2em] uppercase opacity-80">Connection issue</div>
            <div className="text-sm font-medium mt-1">{error}</div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by hash, address, method, or calldata..."
            className="w-full input-field text-sm font-bold"
          />
          <div className="text-[10px] font-black text-slate-500 tracking-[0.25em] uppercase whitespace-nowrap">
            {filtered.length} / {items.length}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-6 text-slate-400">
              <div className="text-[11px] font-black tracking-[0.2em] uppercase opacity-70">No pending transactions</div>
              <div className="text-sm font-medium mt-1">Trigger a tx (or broaden your filter) to see mempool activity.</div>
            </div>
          ) : (
            filtered.map((tx) => {
              const decoded = tx.decoded;
              const valueEth = tx.valueWei ? ethers.formatEther(BigInt(tx.valueWei)) : '0';
              return (
                <div key={tx.hash} className="bg-slate-950/40 border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Tx</div>
                      <div className="text-sm font-black text-white truncate">{shortHash(tx.hash)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Value</div>
                      <div className="text-sm font-black text-blue-300">{valueEth} ETH</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">From</div>
                      <div className="text-sm font-bold text-slate-200">{shortAddr(tx.from)}</div>
                    </div>
                    <div className="md:col-span-4">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">To</div>
                      <div className="text-sm font-bold text-slate-200">{shortAddr(tx.to)}</div>
                    </div>
                    <div className="md:col-span-4">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Decoded</div>
                      {!isDecodeError(decoded) ? (
                        <div className="text-sm font-black text-emerald-200">
                          {decoded.contractLabel}.{decoded.functionName}
                        </div>
                      ) : (
                        <div className="text-sm font-black text-slate-400">{decoded.reason}</div>
                      )}
                    </div>
                  </div>

                  {!isDecodeError(decoded) && (
                    <div className="mt-3 bg-slate-900/40 border border-white/5 rounded-xl p-3">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Signature</div>
                      <div className="text-xs font-mono text-slate-200 break-all">{decoded.signature}</div>
                      <div className="mt-2 text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Args</div>
                      <pre className="mt-1 text-xs font-mono text-slate-200 whitespace-pre-wrap break-words">
                        {JSON.stringify(decoded.args, null, 2)}
                      </pre>
                    </div>
                  )}

                  {isDecodeError(decoded) && tx.data && tx.data !== '0x' && (
                    <div className="mt-3 bg-slate-900/40 border border-white/5 rounded-xl p-3">
                      <div className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">Calldata</div>
                      <div className="text-xs font-mono text-slate-200 break-all">{tx.data}</div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}

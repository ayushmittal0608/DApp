import { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { decodeCalldata, type DecodedCalldata } from '../lib/decodeCalldata';
import { mempoolEngine, type MempoolTransport } from '../lib/mempoolEngine';

export type PendingTxItem = {
  hash: string;
  from?: string;
  to?: string | null;
  nonce?: number;
  data?: string;
  valueWei?: string;
  firstSeenAtMs: number;
  decoded: DecodedCalldata;
};

type Status = 'idle' | 'connecting' | 'connected' | 'error';

function toTxItem(tx: ethers.TransactionResponse, firstSeenAtMs: number): PendingTxItem {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    nonce: tx.nonce,
    data: tx.data,
    valueWei: typeof tx.value === 'bigint' ? tx.value.toString() : undefined,
    firstSeenAtMs,
    decoded: decodeCalldata({ to: tx.to, data: tx.data, value: tx.value }),
  };
}

export function useMempoolMonitor({
  wsUrl,
  maxItems = 60,
  enabled = true,
}: {
  wsUrl: string | undefined;
  maxItems?: number;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<MempoolTransport>(null);
  const [items, setItems] = useState<PendingTxItem[]>([]);

  const seen = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const processingRun = useRef<number | null>(null);
  const monitorRun = useRef(0);

  const MAX_QUEUE = 300;
  const BATCH_SIZE = 10;
  const THROTTLE_MS = 120;

  const addTx = useCallback((tx: ethers.TransactionResponse) => {
    if (!tx?.hash) return;
    if (seen.current.has(tx.hash)) return;

    seen.current.add(tx.hash);
    const item = toTxItem(tx, Date.now());

    setItems((prev) => {
      const next = [item, ...prev];
      if (next.length > maxItems) next.length = maxItems;
      return next;
    });
  }, [maxItems]);

  const processQueue = useCallback(async (runId: number) => {
    if (processingRun.current !== null) return;
    processingRun.current = runId;

    try {
      while (queue.current.length && monitorRun.current === runId) {
        const batch = queue.current.splice(0, BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((hash) => mempoolEngine.getTransaction(hash))
        );

        if (monitorRun.current !== runId) {
          return;
        }

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            addTx(result.value);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    } finally {
      if (processingRun.current === runId) {
        processingRun.current = null;
      }
    }
  }, [addTx]);

  useEffect(() => {
    const runId = monitorRun.current + 1;
    monitorRun.current = runId;

    if (!enabled || !wsUrl) {
      setStatus('idle');
      setError(null);
      setTransport(null);
      return;
    }

    mempoolEngine.init(wsUrl);

    const unsubscribeState = mempoolEngine.subscribeState((snapshot) => {
      if (monitorRun.current !== runId) return;

      setStatus(snapshot.status);
      setError(snapshot.error);
      setTransport(snapshot.transport);
    });

    const unsubscribePending = mempoolEngine.subscribe((hash: string) => {
      if (monitorRun.current !== runId) return;
      if (seen.current.has(hash)) return;

      queue.current.push(hash);

      if (queue.current.length > MAX_QUEUE) {
        queue.current.splice(0, queue.current.length - MAX_QUEUE);
      }

      if (processingRun.current === null) {
        void processQueue(runId);
      }
    });

    return () => {
      if (monitorRun.current === runId) {
        monitorRun.current = runId + 1;
      }

      unsubscribePending();
      unsubscribeState();

      queue.current = [];
      seen.current.clear();

      if (processingRun.current === runId) {
        processingRun.current = null;
      }

      setStatus('idle');
      setError(null);
      setTransport(null);
    };
  }, [wsUrl, enabled, processQueue]);

  const clear = useCallback(() => {
    seen.current.clear();
    queue.current = [];
    setItems([]);
  }, []);

  return {
    status,
    error,
    transport,
    items,
    clear,
  };
}

import { ethers } from 'ethers';

type PendingHandler = (hash: string) => void;
type StateHandler = (snapshot: MempoolEngineSnapshot) => void;

export type MempoolTransport = 'ws' | 'http' | null;

export type MempoolEngineSnapshot = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  transport: MempoolTransport;
};

function formatEngineError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallbackMessage;
}

function isRpcMethodUnsupported(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes('method not found') ||
    m.includes('does not exist') ||
    m.includes('not available') ||
    m.includes('unsupported')
  );
}

function isFilterNotFound(message: string) {
  const m = message.toLowerCase();
  return m.includes('filter not found') || m.includes('unknown filter');
}

function normalizeRpcUrls(rpcUrl: string): { wsUrl: string | null; httpUrl: string | null; error: string | null } {
  const trimmed = rpcUrl.trim();
  if (!trimmed) {
    return { wsUrl: null, httpUrl: null, error: 'RPC URL is missing.' };
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      const httpUrl = (() => {
        const copy = new URL(url.toString());
        copy.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        return copy.toString();
      })();

      return { wsUrl: trimmed, httpUrl, error: null };
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { wsUrl: null, httpUrl: trimmed, error: null };
    }

    return { wsUrl: null, httpUrl: null, error: `Unsupported RPC URL protocol: ${url.protocol}` };
  } catch {
    return { wsUrl: null, httpUrl: null, error: 'RPC URL must include a protocol, e.g. ws://127.0.0.1:8545' };
  }
}

class MempoolEngine {
  private wsProvider: ethers.WebSocketProvider | null = null;
  private httpProvider: ethers.JsonRpcProvider | null = null;
  private readProvider: ethers.AbstractProvider | null = null;
  private subscribers = new Set<PendingHandler>();
  private stateSubscribers = new Set<StateHandler>();
  private initialized = false;
  private wsUrl: string | null = null;
  private httpUrl: string | null = null;
  private generation = 0;
  private destroyTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private detachWebSocketLifecycle: (() => void) | null = null;
  private pendingFilterId: string | null = null;
  private pendingFilterUnsupported = false;
  private snapshot: MempoolEngineSnapshot = {
    status: 'idle',
    error: null,
    transport: null,
  };

  private emitPending = (txHash: string) => {
    if (typeof txHash !== 'string') return;

    for (const sub of this.subscribers) {
      sub(txHash);
    }
  };

  init(wsUrl: string) {
    const normalized = normalizeRpcUrls(wsUrl);
    const nextWsUrl = normalized.wsUrl;
    const nextHttpUrl = normalized.httpUrl;

    if (normalized.error) {
      this.shutdown(true);
      this.initialized = false;
      this.generation += 1;
      this.wsUrl = null;
      this.httpUrl = null;
      this.setSnapshot({
        status: 'error',
        error: normalized.error,
        transport: null,
      });
      return;
    }

    if (
      this.initialized &&
      this.wsUrl === nextWsUrl &&
      this.httpUrl === nextHttpUrl &&
      (this.wsProvider !== null || this.httpProvider !== null)
    ) {
      this.cancelScheduledDestroy();
      return;
    }

    this.shutdown(true);

    this.generation += 1;
    this.wsUrl = nextWsUrl;
    this.httpUrl = nextHttpUrl;
    this.pendingFilterId = null;
    this.pendingFilterUnsupported = false;
    this.initialized = true;
    this.setSnapshot({
      status: 'connecting',
      error: null,
      transport: null,
    });

    this.startWebSocket(this.generation);
  }

  subscribeState(handler: StateHandler) {
    this.stateSubscribers.add(handler);
    handler(this.snapshot);

    return () => {
      this.stateSubscribers.delete(handler);
    };
  }

  async getTransaction(hash: string) {
    const provider = this.readProvider;
    if (!provider) return null;

    try {
      return await provider.getTransaction(hash);
    } catch (error) {
      const message = formatEngineError(error, 'Failed to load pending transaction.');

      if (
        message.includes('provider destroyed') ||
        message.includes('cancelled request') ||
        message.includes('websocket closed')
      ) {
        return null;
      }

      throw error;
    }
  }

  subscribe(handler: PendingHandler) {
    this.cancelScheduledDestroy();
    this.subscribers.add(handler);

    return () => {
      this.subscribers.delete(handler);

      if (this.subscribers.size === 0) {
        this.scheduleDestroy();
      }
    };
  }

  destroy() {
    this.shutdown(true);
    this.wsUrl = null;
    this.httpUrl = null;
    this.initialized = false;
    this.generation += 1;
    this.setSnapshot({
      status: 'idle',
      error: null,
      transport: null,
    });
  }

  private setSnapshot(next: Partial<MempoolEngineSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
    };

    for (const sub of this.stateSubscribers) {
      sub(this.snapshot);
    }
  }

  private cancelScheduledDestroy() {
    if (this.destroyTimer !== null) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }
  }

  private scheduleDestroy() {
    this.cancelScheduledDestroy();
    this.destroyTimer = setTimeout(() => {
      if (this.subscribers.size === 0) {
        this.destroy();
      }
    }, 750);
  }

  private startWebSocket(generation: number) {
    if (!this.wsUrl) {
      this.startHttpPolling(generation);
      return;
    }

    const provider = new ethers.WebSocketProvider(this.wsUrl);
    this.wsProvider = provider;
    this.readProvider = provider;

    const websocket = provider.websocket as WebSocket;
    let pendingSubscribed = false;

    const onOpen = () => {
      if (this.wsProvider !== provider || this.generation !== generation) return;
      if (pendingSubscribed) return;

      pendingSubscribed = true;
      provider.on('pending', this.emitPending);
      this.setSnapshot({
        status: 'connected',
        error: null,
        transport: 'ws',
      });
    };

    const onFailure = () => {
      if (this.wsProvider !== provider || this.generation !== generation) return;

      this.cleanupWebSocket(false);
      this.startHttpPolling(generation);
    };

    websocket.addEventListener('open', onOpen);
    websocket.addEventListener('error', onFailure);
    websocket.addEventListener('close', onFailure);

    this.detachWebSocketLifecycle = () => {
      websocket.removeEventListener('open', onOpen);
      websocket.removeEventListener('error', onFailure);
      websocket.removeEventListener('close', onFailure);

      if (pendingSubscribed) {
        provider.removeListener('pending', this.emitPending);
      }
    };

    if (websocket.readyState === WebSocket.OPEN) {
      onOpen();
    }
  }

  private startHttpPolling(generation: number) {
    if (!this.httpUrl) {
      this.setSnapshot({
        status: 'error',
        error: 'The mempool monitor needs a valid RPC URL.',
        transport: null,
      });
      return;
    }

    this.httpProvider ??= new ethers.JsonRpcProvider(this.httpUrl, undefined, {
      staticNetwork: true,
    });
    this.readProvider = this.httpProvider;
    this.setSnapshot({
      status: 'connecting',
      error: null,
      transport: 'http',
    });

    const poll = async () => {
      if (this.generation !== generation || !this.httpProvider) return;

      try {
        let hashes: string[] = [];

        if (!this.pendingFilterUnsupported) {
          if (!this.pendingFilterId) {
            try {
              const filterId = await this.httpProvider.send('eth_newPendingTransactionFilter', []);
              if (typeof filterId === 'string') {
                this.pendingFilterId = filterId;
              }
            } catch (error) {
              const message = formatEngineError(error, '');
              if (message && isRpcMethodUnsupported(message)) {
                this.pendingFilterUnsupported = true;
              }
            }
          }

          if (this.pendingFilterId) {
            try {
              const changes = await this.httpProvider.send('eth_getFilterChanges', [this.pendingFilterId]);
              if (Array.isArray(changes)) {
                hashes = changes.filter((value): value is string => typeof value === 'string');
              }
            } catch (error) {
              const message = formatEngineError(error, '');
              if (message && isFilterNotFound(message)) {
                this.pendingFilterId = null;
              } else if (message && isRpcMethodUnsupported(message)) {
                this.pendingFilterUnsupported = true;
                this.pendingFilterId = null;
              } else {
                this.pendingFilterId = null;
              }
            }
          }
        }

        if (hashes.length === 0) {
          const pendingBlock = await this.httpProvider.send('eth_getBlockByNumber', ['pending', false]) as
            | { transactions?: string[] }
            | null;

          hashes = (pendingBlock?.transactions ?? []).filter((value): value is string => typeof value === 'string');
        }

        if (this.generation !== generation || !this.httpProvider) return;

        for (const hash of hashes) {
          this.emitPending(hash);
        }

        this.setSnapshot({
          status: 'connected',
          error: null,
          transport: 'http',
        });
      } catch (error) {
        this.setSnapshot({
          status: 'error',
          error: formatEngineError(error, 'Unable to read pending transactions from the RPC.'),
          transport: 'http',
        });
      } finally {
        if (this.generation !== generation || !this.httpProvider) return;

        this.pollTimer = setTimeout(
          () => void poll(),
          this.snapshot.status === 'error' ? 2500 : 1200,
        );
      }
    };

    void poll();
  }

  private cleanupWebSocket(destroyProvider: boolean) {
    const provider = this.wsProvider;
    if (!provider) return;

    this.wsProvider = null;
    if (this.readProvider === provider) {
      this.readProvider = null;
    }

    this.detachWebSocketLifecycle?.();
    this.detachWebSocketLifecycle = null;

    provider.removeAllListeners();

    try {
      provider.websocket.close();
    } catch {}

    if (destroyProvider) {
      void provider.destroy().catch(() => undefined);
    }
  }

  private shutdown(destroyProviders: boolean) {
    this.cancelScheduledDestroy();

    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.cleanupWebSocket(destroyProviders);

    if (this.httpProvider) {
      if (this.pendingFilterId) {
        void this.httpProvider.send('eth_uninstallFilter', [this.pendingFilterId]).catch(() => undefined);
      }
      this.pendingFilterId = null;
      this.pendingFilterUnsupported = false;

      if (this.readProvider === this.httpProvider) {
        this.readProvider = null;
      }

      if (destroyProviders) {
        try {
          this.httpProvider.destroy();
        } catch {}
      }

      this.httpProvider = null;
    }
  }
}

export const mempoolEngine = new MempoolEngine();

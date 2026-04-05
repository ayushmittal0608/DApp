import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

export function useWeb3() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: 'error' | 'info' | 'success' } | null>(null);
  const [txStatus, setTxStatus] = useState<{ hash: string; status: 'pending' | 'confirmed' | 'reverted' } | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setAlert({ message: 'MetaMask not detected. Please install the extension to continue.', type: 'error' });
      return;
    }

    try {
      setIsConnecting(true);
      setAlert(null);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const network = await browserProvider.getNetwork();
      
      setAccount(accounts[0]);
      setProvider(browserProvider);

      window.provider = browserProvider;
      window.account = accounts[0];

      setChainId(Number(network.chainId));
      setBalance(ethers.formatEther(await browserProvider.getBalance(accounts[0])));
    } catch (error) {
      console.error('Connection error:', error);
      setAlert({ message: 'Wallet connection failed. Please unlock your wallet and try again.', type: 'error' });
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || null);
        if(accounts[0] && provider) {
          provider.getBalance(accounts[0]).then(balance => {
            setBalance(ethers.formatEther(balance));
          });
        } else {
          setBalance(null);
        }
      });
      window.ethereum.on('chainChanged', (hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      });
    }
  }, [provider]);

  const clearAlert = useCallback(() => setAlert(null), []);

  const sendTransaction = useCallback(
    async (tx: ethers.TransactionRequest) => {
      if (!provider) {
        setAlert({ message: 'Connect your wallet first.', type: 'error' });
        return;
      }

      try {
        setAlert({ message: 'Transaction submitted. Waiting for confirmation...', type: 'info' });
        
        const signer = await provider.getSigner();
        const txResponse = await signer.sendTransaction(tx);

        setTxStatus({ hash: txResponse.hash, status: 'pending' });

        const receipt = await txResponse.wait();

        if (receipt && receipt.status === 1) {
          setTxStatus({ hash: txResponse.hash, status: 'confirmed' });
          setAlert({ message: 'Transaction confirmed!', type: 'success' });
          if(account) {
            const newBalance = await provider.getBalance(account);
            console.log('New balance:', newBalance);
            console.log('New balance:', ethers.formatEther(newBalance));
            setBalance(ethers.formatEther(newBalance));
          }
        } else {
          setTxStatus({ hash: txResponse.hash, status: 'reverted' });
          setAlert({ message: 'Transaction reverted.', type: 'error' });
        }

        return receipt;
      } catch (error: any) {
        console.error('Transaction error:', error);
        setAlert({ message: error?.message || 'Transaction failed', type: 'error' });
      }
    },
    [provider, account]
  );

  return { account, provider, chainId, balance, connect, isConnecting, alert, sendTransaction, clearAlert };
}

declare global {
  interface Window {
    provider?: import('ethers').BrowserProvider;
    account?: string;
    ethereum: any;
  }
}


import { usePrivy } from '@privy-io/react-auth';

interface LockConfig {
  name: string;
  symbol: string;
  keyPrice: string;
  maxNumberOfKeys: number;
  expirationDuration: number;
  currency: string;
}

interface DeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: string;
  error?: string;
}

// Unlock Protocol PublicLock factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  base: '0x449f2fd99174e1785CF2A1c79E665Fec3dD1DdC6', // Base mainnet
  baseSepolia: '0x127fF2f2B82DdE45472964C0F39735fD35e6e0c4' // Base Sepolia testnet
};

// PublicLock ABI - minimal interface for deployment
const UNLOCK_FACTORY_ABI = [
  {
    "inputs": [
      {"type": "uint256", "name": "_expirationDuration"},
      {"type": "address", "name": "_tokenAddress"},
      {"type": "uint256", "name": "_keyPrice"},
      {"type": "uint256", "name": "_maxNumberOfKeys"},
      {"type": "string", "name": "_lockName"},
      {"type": "bytes12", "name": "_salt"}
    ],
    "name": "createLock",
    "outputs": [{"type": "address", "name": ""}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export const deployLock = async (config: LockConfig): Promise<DeploymentResult> => {
  try {
    console.log('Deploying lock with config:', config);
    
    // Check if we have access to a wallet via Privy
    if (typeof window !== 'undefined' && window.ethereum) {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts.length === 0) {
        throw new Error('No wallet account available');
      }

      // Check network - we'll deploy on Base (chainId: 8453)
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(chainId, 16);
      
      // For now, we'll work with Base mainnet (8453) or Base Sepolia (84532)
      let factoryAddress: string;
      let networkName: string;
      
      if (currentChainId === 8453) {
        factoryAddress = UNLOCK_FACTORY_ADDRESSES.base;
        networkName = 'base';
      } else if (currentChainId === 84532) {
        factoryAddress = UNLOCK_FACTORY_ADDRESSES.baseSepolia;
        networkName = 'baseSepolia';
      } else {
        // Switch to Base mainnet if not on a supported network
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }], // Base mainnet
          });
          factoryAddress = UNLOCK_FACTORY_ADDRESSES.base;
          networkName = 'base';
        } catch (switchError) {
          throw new Error('Please switch to Base network to deploy your event');
        }
      }

      // Convert price to wei (assuming ETH/native token)
      const keyPriceWei = config.currency === 'FREE' 
        ? '0' 
        : (parseFloat(config.keyPrice) * 1e18).toString();

      // Token address (0x0 for native ETH)
      const tokenAddress = '0x0000000000000000000000000000000000000000';

      // Generate a random salt for unique deployment
      const salt = '0x' + Array.from({length: 24}, () => Math.floor(Math.random() * 16).toString(16)).join('');

      // Prepare transaction data
      const web3 = new (window as any).Web3(window.ethereum);
      const contract = new web3.eth.Contract(UNLOCK_FACTORY_ABI, factoryAddress);

      const txData = contract.methods.createLock(
        config.expirationDuration, // expiration duration in seconds
        tokenAddress, // token address (0x0 for ETH)
        keyPriceWei, // key price in wei
        config.maxNumberOfKeys, // max number of keys
        config.name, // lock name
        salt // salt for unique deployment
      ).encodeABI();

      // Send transaction
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: factoryAddress,
          data: txData,
          gas: '0x493E0', // 300,000 gas limit
        }],
      });

      console.log('Lock deployment transaction sent:', txHash);

      // Wait for transaction confirmation
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 30; // Wait up to 5 minutes

      while (!receipt && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        try {
          receipt = await web3.eth.getTransactionReceipt(txHash);
        } catch (error) {
          console.log('Waiting for transaction confirmation...');
        }
        attempts++;
      }

      if (!receipt) {
        throw new Error('Transaction confirmation timeout. Please check the blockchain explorer for status.');
      }

      if (receipt.status === false) {
        throw new Error('Transaction failed. Please try again.');
      }

      // Extract lock address from logs (the contract address created)
      const lockAddress = receipt.logs?.[0]?.address || 'Unknown';

      console.log('Lock deployed successfully:', {
        transactionHash: txHash,
        lockAddress: lockAddress
      });

      return {
        success: true,
        transactionHash: txHash,
        lockAddress: lockAddress
      };
    } else {
      // No wallet available - show helpful message
      return {
        success: false,
        error: 'No wallet detected. Please connect a Web3 wallet to deploy your event.'
      };
    }
  } catch (error) {
    console.error('Error deploying lock:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deploy lock'
    };
  }
};

export const getBlockExplorerUrl = (txHash: string, network: string = 'base'): string => {
  const explorers = {
    base: 'https://basescan.org/tx/',
    baseSepolia: 'https://sepolia.basescan.org/tx/'
  };
  
  return `${explorers[network as keyof typeof explorers] || explorers.base}${txHash}`;
};

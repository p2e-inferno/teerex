
import { writeContract, waitForTransactionReceipt, getAccount } from '@wagmi/core';
import { parseEther, encodeFunctionData } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';
import { wagmiConfig } from './wagmiConfig';

interface LockConfig {
  name: string;
  symbol: string;
  keyPrice: string;
  maxNumberOfKeys: number;
  expirationDuration: number;
  currency: string;
  price: number;
}

interface DeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: string;
  error?: string;
}

// Unlock Protocol PublicLock factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0x449f2fd99174e1785CF2A1c79E665Fec3dD1DdC6', // Base mainnet
  [baseSepolia.id]: '0x127fF2f2B82DdE45472964C0F39735fD35e6e0c4' // Base Sepolia testnet
} as const;

// PublicLock factory ABI - only the createLock function we need
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
] as const;

export const deployLock = async (config: LockConfig): Promise<DeploymentResult> => {
  try {
    console.log('Deploying lock with config:', config);
    
    // Get the current account from wagmi
    const account = getAccount(wagmiConfig);
    
    if (!account.address) {
      throw new Error('No wallet connected. Please connect your wallet first.');
    }

    // Determine the chain and factory address
    const chainId = account.chainId;
    let factoryAddress: `0x${string}`;
    
    if (chainId === base.id) {
      factoryAddress = UNLOCK_FACTORY_ADDRESSES[base.id];
    } else if (chainId === baseSepolia.id) {
      factoryAddress = UNLOCK_FACTORY_ADDRESSES[baseSepolia.id];
    } else {
      throw new Error('Please switch to Base network to deploy your event.');
    }

    // Convert price to wei (assuming ETH/native token)
    const keyPriceWei = config.currency === 'FREE' 
      ? 0n 
      : parseEther(config.price.toString());

    // Token address (0x0 for native ETH)
    const tokenAddress = '0x0000000000000000000000000000000000000000' as `0x${string}`;

    // Generate a random salt for unique deployment (12 bytes)
    const saltBytes = new Uint8Array(12);
    crypto.getRandomValues(saltBytes);
    const salt = `0x${Array.from(saltBytes, byte => byte.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;

    console.log('Deploying with params:', {
      expirationDuration: config.expirationDuration,
      tokenAddress,
      keyPrice: keyPriceWei.toString(),
      maxNumberOfKeys: config.maxNumberOfKeys,
      lockName: config.name,
      salt
    });

    // Deploy the lock using wagmi
    const txHash = await writeContract(wagmiConfig, {
      address: factoryAddress,
      abi: UNLOCK_FACTORY_ABI,
      functionName: 'createLock',
      args: [
        BigInt(config.expirationDuration),
        tokenAddress,
        keyPriceWei,
        BigInt(config.maxNumberOfKeys),
        config.name,
        salt
      ],
    });

    console.log('Lock deployment transaction sent:', txHash);

    // Wait for transaction confirmation
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      hash: txHash,
      timeout: 300000, // 5 minutes timeout
    });

    if (receipt.status === 'reverted') {
      throw new Error('Transaction failed. Please try again.');
    }

    // Extract lock address from logs
    // The lock address should be in the transaction receipt logs
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
  } catch (error) {
    console.error('Error deploying lock:', error);
    
    let errorMessage = 'Failed to deploy lock';
    
    if (error instanceof Error) {
      if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled. Please try again when ready.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to deploy the smart contract. Please add more ETH to your wallet.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: errorMessage
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

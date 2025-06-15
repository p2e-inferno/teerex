
import { parseEther } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';

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

// Function to encode the createLock function call
const encodeFunctionData = (functionName: string, params: any[]): string => {
  // Function selector for createLock(uint256,address,uint256,uint256,string,bytes12)
  const functionSelector = '0x385ac9b9';
  
  // Helper function to pad hex values
  const padHex = (value: string, length: number = 64): string => {
    return value.replace('0x', '').padStart(length, '0');
  };
  
  // Helper function to encode string parameter
  const encodeString = (str: string): string => {
    const utf8Bytes = new TextEncoder().encode(str);
    const lengthHex = utf8Bytes.length.toString(16).padStart(64, '0');
    const dataHex = Array.from(utf8Bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const paddedDataHex = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64, '0');
    return lengthHex + paddedDataHex;
  };
  
  const [expirationDuration, tokenAddress, keyPrice, maxNumberOfKeys, lockName, salt] = params;
  
  // Encode parameters
  const encodedParams = [
    padHex(expirationDuration.toString(16)), // uint256
    padHex(tokenAddress.slice(2)), // address
    padHex(BigInt(keyPrice).toString(16)), // uint256
    padHex(maxNumberOfKeys.toString(16)), // uint256
    padHex('c0'), // offset for string (192 bytes = 0xc0)
    padHex('100'), // offset for bytes12 (256 bytes = 0x100)
    encodeString(lockName), // string
    padHex(salt.slice(2), 24) // bytes12 (12 bytes = 24 hex chars)
  ].join('');
  
  return functionSelector + encodedParams;
};

export const deployLock = async (config: LockConfig, wallet: any): Promise<DeploymentResult> => {
  try {
    console.log('Deploying lock with config:', config);
    
    if (!wallet) {
      throw new Error('No wallet provided. Please connect your wallet first.');
    }

    // Get the current chain ID
    const chainId = await wallet.getChainId();
    let factoryAddress: string;
    
    if (chainId === base.id) {
      factoryAddress = UNLOCK_FACTORY_ADDRESSES[base.id];
    } else if (chainId === baseSepolia.id) {
      factoryAddress = UNLOCK_FACTORY_ADDRESSES[baseSepolia.id];
    } else {
      throw new Error('Please switch to Base network to deploy your event.');
    }

    // Convert price to wei (assuming ETH/native token)
    const keyPriceWei = config.currency === 'FREE' 
      ? '0' 
      : parseEther(config.price.toString()).toString();

    // Token address (0x0 for native ETH)
    const tokenAddress = '0x0000000000000000000000000000000000000000';

    // Generate a random salt for unique deployment (12 bytes)
    const saltBytes = new Uint8Array(12);
    crypto.getRandomValues(saltBytes);
    const salt = `0x${Array.from(saltBytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;

    console.log('Deploying with params:', {
      expirationDuration: config.expirationDuration,
      tokenAddress,
      keyPrice: keyPriceWei,
      maxNumberOfKeys: config.maxNumberOfKeys,
      lockName: config.name,
      salt
    });

    // Encode the function call data using our custom encoder
    const data = encodeFunctionData('createLock', [
      config.expirationDuration,
      tokenAddress,
      keyPriceWei,
      config.maxNumberOfKeys,
      config.name,
      salt
    ]);

    console.log('Encoded transaction data:', data);

    // Send transaction using Privy wallet
    const txResponse = await wallet.sendTransaction({
      to: factoryAddress,
      data: data,
      value: '0'
    });

    console.log('Lock deployment transaction sent:', txResponse.hash);

    // Wait for transaction confirmation using Privy's method
    const receipt = await wallet.waitForTransactionReceipt(txResponse.hash);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed. Please try again.');
    }

    // Extract lock address from logs
    const lockAddress = receipt.logs?.[0]?.address || 'Unknown';

    console.log('Lock deployed successfully:', {
      transactionHash: txResponse.hash,
      lockAddress: lockAddress
    });

    return {
      success: true,
      transactionHash: txResponse.hash,
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

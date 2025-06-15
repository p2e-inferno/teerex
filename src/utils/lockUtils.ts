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

// Unlock Protocol PublicLock factory contract addresses (corrected)
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0xd0b14797b9D08493392865647384974470202A78', // Base mainnet
  [baseSepolia.id]: '0x259813B665C8f6074391028ef782e27B65840d89' // Base Sepolia testnet
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

    // Get the Ethereum provider from Privy wallet
    const provider = await wallet.getEthereumProvider();

    // Always switch to Base Sepolia for testing
    const targetChainId = baseSepolia.id;
    const targetChainIdHex = `0x${targetChainId.toString(16)}`;

    console.log(`Switching wallet to Base Sepolia (Chain ID: ${targetChainId})`);

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (switchError: any) {
      // If the chain hasn't been added to MetaMask, add it
      if (switchError.code === 4902) {
        console.log('Adding Base Sepolia network to wallet');
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: targetChainIdHex,
              chainName: 'Base Sepolia',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }

    // Wait a moment for the network switch to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify we're on the correct network
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    const currentChainIdDecimal = parseInt(currentChainId, 16);
    
    console.log('Current chain ID after switch:', currentChainIdDecimal);
    
    if (currentChainIdDecimal !== targetChainId) {
      throw new Error(`Failed to switch to Base Sepolia. Current network: ${currentChainIdDecimal}, Expected: ${targetChainId}`);
    }

    const factoryAddress = UNLOCK_FACTORY_ADDRESSES[baseSepolia.id];

    console.log('Using Unlock Factory Address:', factoryAddress);

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

    // Send transaction using Privy wallet provider
    const txResponse = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet.address,
        to: factoryAddress,
        data: data,
        value: '0x0'
      }]
    });

    console.log('Lock deployment transaction sent:', txResponse);

    // Wait for transaction confirmation
    let receipt = null;
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 60 seconds
    
    while (!receipt && attempts < maxAttempts) {
      try {
        receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txResponse]
        });
        
        if (!receipt) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }

    if (!receipt) {
      throw new Error('Transaction receipt not found. Please check the blockchain explorer.');
    }

    if (receipt.status !== '0x1') {
      throw new Error('Transaction failed. Please try again.');
    }

    // Extract lock address from logs
    const lockAddress = receipt.logs?.[0]?.address || 'Unknown';

    console.log('Lock deployed successfully:', {
      transactionHash: txResponse,
      lockAddress: lockAddress
    });

    return {
      success: true,
      transactionHash: txResponse,
      lockAddress: lockAddress
    };
  } catch (error) {
    console.error('Error deploying lock:', error);
    
    let errorMessage = 'Failed to deploy lock';
    
    if (error instanceof Error) {
      if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
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

export const getBlockExplorerUrl = (txHash: string, network: string = 'baseSepolia'): string => {
  const explorers = {
    base: 'https://basescan.org/tx/',
    baseSepolia: 'https://sepolia.basescan.org/tx/'
  };
  
  return `${explorers[network as keyof typeof explorers] || explorers.baseSepolia}${txHash}`;
};

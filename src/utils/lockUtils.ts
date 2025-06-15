
import { parseEther } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';
import { ethers } from 'ethers';

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

// Unlock Protocol factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0xd0b14797b9D08493392865647384974470202A78', // Base mainnet
  [baseSepolia.id]: '0x259813B665C8f6074391028ef782e27B65840d89' // Base Sepolia testnet
} as const;

// Unlock factory ABI (simplified)
const UnlockABI = [
  {
    "inputs": [
      { "internalType": "bytes", "name": "calldata", "type": "bytes" },
      { "internalType": "uint256", "name": "version", "type": "uint256" }
    ],
    "name": "createUpgradeableLockAtVersion",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// PublicLock ABI for encoding initialize function - matching successful transaction structure
const PublicLockABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_lockCreator", "type": "address" },
      { "internalType": "uint256", "name": "_expirationDuration", "type": "uint256" },
      { "internalType": "address", "name": "_tokenAddress", "type": "address" },
      { "internalType": "uint256", "name": "_keyPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "_maxNumberOfKeys", "type": "uint256" },
      { "internalType": "string", "name": "_lockName", "type": "string" }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

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

    // Create ethers provider and signer
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Version 14 to match successful transaction
    const version = 14;

    // Create an instance of the Unlock factory contract
    const unlock = new ethers.Contract(factoryAddress, UnlockABI, signer);

    // Use unlimited values for duration and max keys like in successful transaction
    const expirationDuration = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const maxNumberOfKeys = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    
    // Convert price to wei (0 for FREE)
    const keyPriceWei = config.currency === 'FREE' ? 0n : parseEther(config.price.toString());

    // Token address (0x0 for native ETH)
    const tokenAddress = '0x0000000000000000000000000000000000000000';

    // Create calldata using PublicLock's ABI - matching the successful transaction format
    const lockInterface = new ethers.Interface(PublicLockABI);
    const calldata = lockInterface.encodeFunctionData(
      'initialize',
      [
        wallet.address, // address of the first lock manager
        expirationDuration, // unlimited expiration duration
        tokenAddress, // address of an ERC20 contract to use as currency (or 0x0 for native)
        keyPriceWei, // Amount to be paid
        maxNumberOfKeys, // unlimited number of keys
        config.name, // Name of membership contract
      ]
    );

    console.log('Creating lock with calldata and version:', version);

    // Create the lock
    const tx = await unlock.createUpgradeableLockAtVersion(calldata, version);
    console.log('Lock deployment transaction sent:', tx.hash);

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    console.log('Transaction receipt:', receipt);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed. Please try again.');
    }

    // Extract lock address from the transaction receipt logs
    let lockAddress = 'Unknown';
    
    // Look for the NewLock event - the lock address should be in the logs
    if (receipt.logs && receipt.logs.length > 0) {
      for (const log of receipt.logs) {
        if (log.topics && log.topics.length > 2) {
          // The lock address is typically in the second topic (index 1) or third topic (index 2)
          const potentialAddress = `0x${log.topics[2].slice(-40)}`;
          if (potentialAddress !== '0x0000000000000000000000000000000000000000') {
            lockAddress = potentialAddress;
            break;
          }
        }
      }
    }

    console.log('Lock deployed successfully:', {
      transactionHash: tx.hash,
      lockAddress: lockAddress
    });

    return {
      success: true,
      transactionHash: tx.hash,
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

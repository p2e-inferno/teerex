import { parseEther, createWalletClient, custom, createPublicClient, http, keccak256, toHex, `0x${string}` } from 'viem';
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

// Unlock Protocol factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0xd0b14797b9D08493392865647384974470202A78', // Base mainnet
  [baseSepolia.id]: '0x259813B665C8f6074391028ef782e27B65840d89' // Base Sepolia testnet
} as const;

const unlockFactoryAbi = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "_expirationDuration", "type": "uint256" },
      { "internalType": "address", "name": "_tokenAddress", "type": "address" },
      { "internalType": "uint256", "name": "_keyPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "_maxNumberOfKeys", "type": "uint256" },
      { "internalType": "string", "name": "_lockName", "type": "string" },
      { "internalType": "bytes32", "name": "_salt", "type": "bytes32" }
    ],
    "name": "createUpgradeableLock",
    "outputs": [ { "internalType": "address", "name": "newLockAddress", "type": "address" } ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

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
              nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }

    // Verify we're on the correct network
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    const currentChainIdDecimal = parseInt(currentChainId, 16);
    
    if (currentChainIdDecimal !== targetChainId) {
      throw new Error(`Failed to switch to Base Sepolia. Current network: ${currentChainIdDecimal}, Expected: ${targetChainId}`);
    }

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: baseSepolia,
        transport: custom(provider),
    });

    const factoryAddress = UNLOCK_FACTORY_ADDRESSES[baseSepolia.id];
    console.log('Using Unlock Factory Address:', factoryAddress);

    const keyPriceWei = config.currency === 'FREE' 
      ? 0n 
      : parseEther(config.price.toString());
    const tokenAddress = '0x0000000000000000000000000000000000000000';
    
    // Create a unique salt for the lock
    const salt = keccak256(toHex(`${config.name}-${Date.now()}`));

    console.log(`Simulating lock creation for "${config.name}"`);

    const { request } = await publicClient.simulateContract({
        address: factoryAddress,
        abi: unlockFactoryAbi,
        functionName: 'createUpgradeableLock',
        args: [
            BigInt(config.expirationDuration),
            tokenAddress,
            keyPriceWei,
            BigInt(config.maxNumberOfKeys),
            config.name,
            salt
        ],
        account: wallet.address as `0x${string}`,
    });
    
    console.log('Simulation successful. Sending transaction...');
    const txResponse = await walletClient.writeContract(request);

    console.log('Lock deployment transaction sent:', txResponse);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txResponse });

    console.log('Transaction receipt:', receipt);

    if (receipt.status !== 'success') {
      throw new Error('Transaction failed on-chain. Please check the transaction on the block explorer.');
    }
    
    let lockAddress = 'Unknown';
    // NewLock event signature: event NewLock(address indexed lockOwner, address indexed newLockAddress);
    const newLockEventTopic = '0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7';
    const newLockLog = receipt.logs.find(log => log.topics[0] === newLockEventTopic);
    
    if (newLockLog && newLockLog.topics[2]) {
      lockAddress = `0x${newLockLog.topics[2].slice(-40)}`;
    } else {
        throw new Error('Could not determine lock address from transaction logs.');
    }

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
        // More specific viem/blockchain error messages
        if (error.message.includes('User rejected')) {
            errorMessage = 'Transaction was cancelled. Please try again when ready.';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient funds to deploy the smart contract. Please add more ETH to your wallet.';
        } else if (error.message.includes('Nonce too high') || error.message.includes('Nonce too low')) {
            errorMessage = 'There was a network issue (nonce). Please try again in a moment.';
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

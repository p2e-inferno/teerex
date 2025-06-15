import { parseEther, createWalletClient, custom, createPublicClient, http, encodeFunctionData, type Address } from 'viem';
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

// ABI for the PublicLock's initialize function (v13)
const publicLockAbi = [{
    "inputs": [
      { "internalType": "address", "name": "lockManager", "type": "address" },
      { "internalType": "uint256", "name": "expirationDuration", "type": "uint256" },
      { "internalType": "address", "name": "tokenAddress", "type": "address" },
      { "internalType": "uint256", "name": "keyPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "maxNumberOfKeys", "type": "uint256" },
      { "internalType": "string", "name": "lockName", "type": "string" }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}] as const;

// ABI for the Unlock factory's createUpgradeableLockAtVersion function
const unlockFactoryAbi = [{
    "inputs": [
        { "internalType": "bytes", "name": "calldata", "type": "bytes" },
        { "internalType": "uint256", "name": "version", "type": "uint256" }
    ],
    "name": "createUpgradeableLockAtVersion",
    "outputs": [
        { "internalType": "address", "name": "newLockAddress", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
}] as const;

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
        account: wallet.address as Address,
        chain: baseSepolia,
        transport: custom(provider),
    });

    const factoryAddress = UNLOCK_FACTORY_ADDRESSES[baseSepolia.id];
    console.log('Using Unlock Factory Address:', factoryAddress);

    const keyPriceWei = config.currency === 'FREE' 
      ? 0n 
      : parseEther(config.price.toString());
    const tokenAddress = '0x0000000000000000000000000000000000000000' as Address;
    
    // Encode the calldata for the PublicLock's initialize function
    const calldata = encodeFunctionData({
      abi: publicLockAbi,
      functionName: 'initialize',
      args: [
        wallet.address as Address, // lockManager
        BigInt(config.expirationDuration),
        tokenAddress,
        keyPriceWei,
        BigInt(config.maxNumberOfKeys),
        config.name,
      ]
    });

    const lockVersion = 13n; // Using PublicLock v13

    console.log(`Simulating lock creation for "${config.name}" with version ${lockVersion}`);

    const { result: newLockAddress, request } = await publicClient.simulateContract({
        address: factoryAddress,
        abi: unlockFactoryAbi,
        functionName: 'createUpgradeableLockAtVersion',
        args: [
            calldata,
            lockVersion
        ],
        account: wallet.address as Address,
    });
    
    console.log('Simulation successful. Sending transaction...');
    const txResponse = await walletClient.writeContract(request);

    console.log('Lock deployment transaction sent:', txResponse);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txResponse });

    console.log('Transaction receipt:', receipt);

    if (receipt.status !== 'success') {
      throw new Error('Transaction failed on-chain. Please check the transaction on the block explorer.');
    }
    
    if (!newLockAddress) {
      throw new Error('Could not determine lock address from transaction simulation.');
    }

    console.log('Lock deployed successfully:', {
      transactionHash: txResponse,
      lockAddress: newLockAddress
    });

    return {
      success: true,
      transactionHash: txResponse,
      lockAddress: newLockAddress
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

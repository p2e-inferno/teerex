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

// Unlock Protocol factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0xd0b14797b9D08493392865647384974470202A78', // Base mainnet
  [baseSepolia.id]: '0x259813B665C8f6074391028ef782e27B65840d89' // Base Sepolia testnet
} as const;

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

    // --- New deployment logic based on Unlock Protocol v13 docs ---
    // We will call `createUpgradeableLockAtVersion(bytes calldata, uint16 version)` on the factory.
    // The `calldata` is the encoded `initialize` function of the PublicLock contract.

    const publicLockVersion = 13;

    // 1. Prepare data for PublicLock's `initialize` function
    // `initialize(address lockManager, uint256 expirationDuration, address tokenAddress, uint256 keyPrice, uint256 maxNumberOfKeys, string memory lockName)`
    const initializeFunctionSelector = '0x14a1a541';

    const keyPriceWei = config.currency === 'FREE' 
      ? '0' 
      : parseEther(config.price.toString()).toString();
    const tokenAddress = '0x0000000000000000000000000000000000000000';

    const padHex = (value: string): string => {
      return value.replace('0x', '').padStart(64, '0');
    };

    // Encode `initialize` parameters
    const encodedLockManager = padHex(wallet.address);
    const encodedExpirationDuration = padHex(config.expirationDuration.toString(16));
    const encodedTokenAddress = padHex(tokenAddress);
    const encodedKeyPrice = padHex(BigInt(keyPriceWei).toString(16));
    const encodedMaxNumberOfKeys = padHex(config.maxNumberOfKeys.toString(16));

    // String encoding for lockName
    const nameBytes = new TextEncoder().encode(config.name);
    const nameLengthHex = padHex(nameBytes.length.toString(16));
    const nameHex = Array.from(nameBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const paddedNameHex = nameHex.padEnd(Math.ceil(nameHex.length / 64) * 64, '0');

    // Offset for string parameter (6th parameter, so 5 * 32 = 160 bytes = 0xa0)
    const stringOffsetHex = padHex('a0');

    // Construct the `initialize` calldata
    const initializeCalldata = initializeFunctionSelector +
      encodedLockManager +
      encodedExpirationDuration +
      encodedTokenAddress +
      encodedKeyPrice +
      encodedMaxNumberOfKeys +
      stringOffsetHex +
      nameLengthHex +
      paddedNameHex;

    // 2. Prepare data for Factory's `createUpgradeableLockAtVersion` function
    // `createUpgradeableLockAtVersion(bytes memory _calldata, uint16 _version)`
    const factoryFunctionSelector = '0x3247a3ff';

    // This function has a dynamic `bytes` type as the first argument, so we need offsets.
    // The static part contains the offset to calldata (32 bytes) and the version (32 bytes).
    const calldataOffsetHex = padHex('40'); // Offset is 2 * 32 = 64 bytes = 0x40
    const encodedVersion = padHex(publicLockVersion.toString(16));

    // The dynamic part contains the length of the calldata, then the calldata itself.
    const initializeCalldataBytes = initializeCalldata.replace('0x', '');
    const initializeCalldataLengthInBytes = initializeCalldataBytes.length / 2;
    const encodedCalldataLength = padHex(initializeCalldataLengthInBytes.toString(16));

    // The calldata itself must be padded to a multiple of 32 bytes.
    const paddedInitializeCalldata = initializeCalldataBytes.padEnd(Math.ceil(initializeCalldataBytes.length / 64) * 64, '0');
    
    // 3. Construct the final transaction data
    const finalEncodedData = factoryFunctionSelector +
      calldataOffsetHex +
      encodedVersion +
      encodedCalldataLength +
      paddedInitializeCalldata;

    console.log('Final encoded transaction data:', finalEncodedData);
    
    // Send transaction using Privy wallet provider
    const txResponse = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: wallet.address,
        to: factoryAddress,
        data: finalEncodedData,
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

    console.log('Transaction receipt:', receipt);

    if (receipt.status !== '0x1') {
      throw new Error('Transaction failed. Please try again.');
    }

    // Extract lock address from logs
    // The NewLock event should be emitted with the lock address
    let lockAddress = 'Unknown';
    
    if (receipt.logs && receipt.logs.length > 0) {
      // Look for NewLock event in logs
      for (const log of receipt.logs) {
        if (log.topics && log.topics.length > 0) {
          // NewLock event signature: 0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7
          if (log.topics[0] === '0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7') {
            // The lock address is in the second topic
            if (log.topics[1]) {
              lockAddress = '0x' + log.topics[1].slice(-40);
              break;
            }
          }
        }
      }
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

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

interface PurchaseResult {
  success: boolean;
  transactionHash?: string;
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
      { "internalType": "uint16", "name": "version", "type": "uint16" }
    ],
    "name": "createUpgradeableLockAtVersion",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// PublicLock ABI for encoding initialize function and purchasing keys
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
  },
  {
    "inputs": [
      { "internalType": "uint256[]", "name": "_values", "type": "uint256[]" },
      { "internalType": "address[]", "name": "_recipients", "type": "address[]" },
      { "internalType": "address[]", "name": "_referrers", "type": "address[]" },
      { "internalType": "address[]", "name": "_keyManagers", "type": "address[]" },
      { "internalType": "bytes[]", "name": "_data", "type": "bytes[]" }
    ],
    "name": "purchase",
    "outputs": [{ "internalType": "uint256[]", "name": "tokenIds", "type": "uint256[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "keyPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_keyOwner", "type": "address" }],
    "name": "getHasValidKey",
    "outputs": [{ "internalType": "bool", "name": "isValid", "type": "bool" }],
    "stateMutability": "view",
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

    // Create ethers provider and signer
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Version must match the PublicLock version (using v14 as per successful transaction)
    const version = 14;

    // Create an instance of the Unlock factory contract
    const unlock = new ethers.Contract(factoryAddress, UnlockABI, signer);

    // Convert price to wei (assuming ETH/native token)
    const keyPriceWei = config.currency === 'FREE' 
      ? 0n 
      : parseEther(config.price.toString());

    // Token address (0x0 for native ETH)
    const tokenAddress = '0x0000000000000000000000000000000000000000';

    // Create calldata using PublicLock's ABI to encode the initialize function
    const lockInterface = new ethers.Interface(PublicLockABI);
    const calldata = lockInterface.encodeFunctionData(
      'initialize(address,uint256,address,uint256,uint256,string)',
      [
        wallet.address, // address of the first lock manager
        config.expirationDuration, // expirationDuration (in seconds)
        tokenAddress, // address of an ERC20 contract to use as currency (or 0x0 for native)
        keyPriceWei, // Amount to be paid
        config.maxNumberOfKeys, // Maximum number of NFTs that can be purchased
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

    // The lock address is found by parsing the `NewLock` event from the transaction logs.
    let lockAddress = 'Unknown';
    
    // Look for NewLock event in logs
    if (receipt.logs && receipt.logs.length > 0) {
      // The Unlock factory contract emits a `NewLock` event.
      // event NewLock(address indexed newLockAddress, address indexed lockOwner);
      // The event signature for NewLock(address,address) is 0x4462941b3546736a49592b3def1a338b5550c6630f590136d5a153835a242f27
      const newLockEventSignature = '0x4462941b3546736a49592b3def1a338b5550c6630f590136d5a153835a242f27';
      const newLockLog = receipt.logs.find(
        (log: any) => log.topics && log.topics[0] === newLockEventSignature
      );
      
      if (newLockLog && newLockLog.topics && newLockLog.topics[1]) {
        // topic[1] is the newLockAddress (the first indexed parameter)
        lockAddress = `0x${newLockLog.topics[1].slice(-40)}`;
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

export const purchaseKey = async (
  lockAddress: string,
  price: number, // The price in ETH (not wei)
  currency: string,
  wallet: any
): Promise<PurchaseResult> => {
  try {
    console.log(`Purchasing key for lock: ${lockAddress}`);
    if (!wallet || !wallet.address) {
      throw new Error('No wallet provided or not connected.');
    }

    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);

    const keyPriceWei = currency === 'FREE'
      ? 0n
      : parseEther(price.toString());

    // Verify on-chain price matches expected price
    const onChainKeyPrice = await lockContract.keyPrice();
    if (onChainKeyPrice !== keyPriceWei) {
        console.error(`Price mismatch: Expected ${keyPriceWei}, but on-chain price is ${onChainKeyPrice}`);
        throw new Error('The ticket price has changed. Please refresh and try again.');
    }
    
    console.log(`Calling purchase for recipient: ${wallet.address} with value: ${keyPriceWei.toString()} wei`);

    const tx = await lockContract.purchase(
      [keyPriceWei], // _values: For a single key purchase, this is the price.
      [wallet.address], // _recipients
      ['0x0000000000000000000000000000000000000000'], // _referrers
      ['0x0000000000000000000000000000000000000000'], // _keyManagers
      ['0x'], // _data: An array with a single empty bytes value.
      {
        value: keyPriceWei // Send ETH with the transaction
      }
    );

    console.log('Purchase transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction receipt:', receipt);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed. Please try again.');
    }

    return {
      success: true,
      transactionHash: tx.hash,
    };

  } catch (error) {
    console.error('Error purchasing key:', error);
    
    let errorMessage = 'Failed to purchase ticket.';
    if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
            errorMessage = 'Transaction was cancelled. Please try again when ready.';
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = 'Insufficient funds to purchase the ticket. Please add more ETH to your wallet.';
        } else {
            errorMessage = error.message;
        }
    }
    
    return {
      success: false,
      error: errorMessage,
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

// --- New Functions ---

const getReadOnlyProvider = () => {
  // Using a public RPC for read-only operations on Base Sepolia
  return new ethers.JsonRpcProvider('https://sepolia.base.org');
};

/**
 * Gets the total number of keys that have been sold for a lock.
 */
export const getTotalKeys = async (lockAddress: string): Promise<number> => {
  try {
    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    const totalSupply = await lockContract.totalSupply();
    return Number(totalSupply);
  } catch (error) {
    console.error(`Error fetching total keys for ${lockAddress}:`, error);
    return 0; // Return 0 if there's an error so UI doesn't break
  }
};

/**
 * Checks if a user has a valid, non-expired key for a specific lock.
 */
export const checkKeyOwnership = async (lockAddress: string, userAddress: string): Promise<boolean> => {
  try {
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      return false;
    }
    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    return await lockContract.getHasValidKey(userAddress);
  } catch (error) {
    console.error(`Error checking key ownership for ${lockAddress}:`, error);
    return false;
  }
};

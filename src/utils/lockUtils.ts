
import { parseEther, parseUnits } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';
import { getRpcUrl, getExplorerTxUrl, getTokenAddress, ZERO_ADDRESS, CHAINS } from '@/lib/config/network-config';
import { ethers } from 'ethers';

interface LockConfig {
  name: string;
  symbol: string;
  keyPrice: string;
  maxNumberOfKeys: number;
  expirationDuration: number;
  currency: string;
  price: number;
  maxKeysPerAddress?: number;
  transferable?: boolean;
  requiresApproval?: boolean;
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
  },
  {
    "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
    "name": "isLockManager",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Add lock manager function
  {
    "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
    "name": "addLockManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Renounce lock manager function
  {
    "inputs": [],
    "name": "renounceLockManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Grant keys function for lock managers
  {
    "inputs": [
      { "internalType": "uint256[]", "name": "_expirationTimestamps", "type": "uint256[]" },
      { "internalType": "address[]", "name": "_recipients", "type": "address[]" },
      { "internalType": "address[]", "name": "_keyManagers", "type": "address[]" }
    ],
    "name": "grantKeys",
    "outputs": [{ "internalType": "uint256[]", "name": "tokenIds", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ERC-721 standard functions
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Unlock Protocol specific functions
  {
    "inputs": [
      { "internalType": "address", "name": "_user", "type": "address" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" }
    ],
    "name": "setMaxKeysPerAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_user", "type": "address" }],
    "name": "maxKeysPerAddress",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxKeysPerAddress",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Minimal ERC20 ABI for decimals/allowance/approve
const ERC20_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'owner', type: 'address' }, { internalType: 'address', name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'value', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;

const decimalsCache: Record<string, number> = {};

const getTokenInfo = async (chainId: number, symbol: string): Promise<{ address: string; decimals: number }> => {
  if (symbol === 'FREE') return { address: ZERO_ADDRESS, decimals: 18 };
  if (symbol === 'ETH') return { address: ZERO_ADDRESS, decimals: 18 };
  const address = getTokenAddress(chainId, symbol as 'USDC');
  if (decimalsCache[address]) return { address, decimals: decimalsCache[address] };
  const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId));
  const token = new ethers.Contract(address, ERC20_ABI, provider);
  const dec = Number(await token.decimals());
  decimalsCache[address] = dec;
  return { address, decimals: dec };
};

const ensureCorrectNetwork = async (rawProvider: any, chainId: number) => {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported chainId ${chainId}`);
  const targetChainIdHex = `0x${chainId.toString(16)}`;
  try {
    await rawProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainIdHex }] });
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      await rawProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: targetChainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls?.default?.http || [getRpcUrl(chainId)],
          blockExplorerUrls: [chain.blockExplorers?.default?.url].filter(Boolean),
        }],
      });
    } else {
      throw switchError;
    }
  }
};

/**
 * Checks if an address is a lock manager for a given lock
 */
export const checkIfLockManager = async (
  lockAddress: string,
  managerAddress: string
): Promise<boolean> => {
  try {
    if (!lockAddress || !ethers.isAddress(lockAddress)) {
      throw new Error('Invalid lock address.');
    }
    
    if (!ethers.isAddress(managerAddress)) {
      throw new Error('Invalid manager address.');
    }

    // Use a public RPC provider for read-only operations
    const rpcUrl = 'https://sepolia.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    const isManager = await lockContract.isLockManager(managerAddress);
    
    return isManager;
  } catch (error) {
    console.error('Error checking lock manager status:', error);
    return false;
  }
};

/**
 * Adds a lock manager to an existing lock
 */
export const addLockManager = async (
  lockAddress: string,
  managerAddress: string,
  wallet: any
): Promise<{ success: boolean; error?: string; transactionHash?: string }> => {
  try {
    if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
      throw new Error('Invalid lock address.');
    }
    
    if (!ethers.isAddress(managerAddress)) {
      throw new Error('Invalid manager address.');
    }
    
    if (!wallet || !wallet.address) {
      throw new Error('No wallet provided or not connected.');
    }

    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);

    // Check if user is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error('You must be a lock manager to add another lock manager.');
    }

    // Add the new lock manager
    const tx = await lockContract.addLockManager(managerAddress);
    console.log('Add lock manager transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('Transaction failed. Please try again.');
    }

    return { 
      success: true, 
      transactionHash: tx.hash 
    };
  } catch (error) {
    console.error('Error adding lock manager:', error);
    
    let errorMessage = 'Failed to add lock manager.';
    if (error instanceof Error) {
      if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
        errorMessage = 'Transaction was cancelled. Please try again when ready.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to complete the transaction. Please add more ETH to your wallet.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return { success: false, error: errorMessage };
  }
};

export const deployLock = async (config: LockConfig, wallet: any, chainId: number): Promise<DeploymentResult> => {
  try {
    console.log('Deploying lock with config:', config);
    
    if (!wallet) {
      throw new Error('No wallet provided. Please connect your wallet first.');
    }

    if (!chainId) {
      throw new Error('Missing chainId for deployment.');
    }

    // Get the Ethereum provider from Privy wallet
    const provider = await wallet.getEthereumProvider();
    await ensureCorrectNetwork(provider, chainId);

    const factoryAddress = UNLOCK_FACTORY_ADDRESSES[chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES];
    console.log('Using Unlock Factory Address:', factoryAddress);

    // Create ethers provider and signer
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Version must match the PublicLock version (using v14 as per successful transaction)
    const version = 14;

    // Create an instance of the Unlock factory contract
    const unlock = new ethers.Contract(factoryAddress, UnlockABI, signer);

    // Resolve token address & decimals
    let tokenAddress = ZERO_ADDRESS;
    let keyPriceWei = 0n;
    if (config.currency !== 'FREE') {
      const { address, decimals } = await getTokenInfo(chainId, config.currency);
      tokenAddress = address;
      keyPriceWei = tokenAddress === ZERO_ADDRESS
        ? parseEther(config.price.toString())
        : parseUnits(config.price.toString(), decimals);
    }

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

    // Extract lock address from the return value or logs
    let lockAddress = 'Unknown';
    
    // First try to get it from the return value if available
    if (receipt.logs && receipt.logs.length > 0) {
      // Create an interface for the Unlock factory to parse logs
      const unlockInterface = new ethers.Interface([
        "event NewLock(address indexed lockOwner, address indexed newLockAddress)"
      ]);
      
      // Parse all logs to find the NewLock event
      for (const log of receipt.logs) {
        try {
          const parsedLog = unlockInterface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog && parsedLog.name === 'NewLock') {
            lockAddress = parsedLog.args.newLockAddress;
            console.log('Found lock address from NewLock event:', lockAddress);
            break;
          }
        } catch (e) {
          // This log isn't a NewLock event, continue
          continue;
        }
      }
    }

    // If we still don't have a valid address, try alternative extraction
    if (lockAddress === 'Unknown' && receipt.logs && receipt.logs.length > 0) {
      // Look for any log that might contain an address
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      for (const log of receipt.logs) {
        if (log.topics && log.topics.length > 1) {
          for (let i = 1; i < log.topics.length; i++) {
            const potentialAddress = `0x${log.topics[i].slice(-40)}`;
            if (addressRegex.test(potentialAddress) && potentialAddress !== wallet.address) {
              lockAddress = potentialAddress;
              console.log('Found potential lock address from log topics:', lockAddress);
              break;
            }
          }
          if (lockAddress !== 'Unknown') break;
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

export const purchaseKey = async (
  lockAddress: string,
  price: number,
  currency: string,
  wallet: any,
  chainId: number
): Promise<PurchaseResult> => {
  try {
    console.log(`Purchasing key for lock: ${lockAddress}`);
    
    // Validate lock address before proceeding
    if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
      throw new Error('Invalid lock address. The event may not have been properly deployed.');
    }
    
    if (!wallet || !wallet.address) {
      throw new Error('No wallet provided or not connected.');
    }

    if (!chainId) throw new Error('Missing chainId for purchase.');

    const provider = await wallet.getEthereumProvider();
    await ensureCorrectNetwork(provider, chainId);
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);
    let decimals = 18;
    let tokenAddress = ZERO_ADDRESS;
    if (currency !== 'FREE') {
      const info = await getTokenInfo(chainId, currency);
      tokenAddress = info.address;
      decimals = info.decimals;
    }

    const expectedPrice = currency === 'FREE' ? 0n : (tokenAddress === ZERO_ADDRESS ? parseEther(price.toString()) : parseUnits(price.toString(), decimals));
    const onChainKeyPrice = await lockContract.keyPrice();
    if (onChainKeyPrice !== expectedPrice) {
      console.error(`Price mismatch: Expected ${expectedPrice}, on-chain ${onChainKeyPrice}`);
      throw new Error('The ticket price has changed. Please refresh and try again.');
    }

    // ERC20 path
    if (tokenAddress !== ZERO_ADDRESS) {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const owner = await signer.getAddress();
      const allowance = await token.allowance(owner, lockAddress);
      if (allowance < onChainKeyPrice) {
        try {
          const approveTx = await token.approve(lockAddress, onChainKeyPrice);
          await approveTx.wait();
        } catch (e: any) {
          if (String(e?.message || '').toLowerCase().includes('must be zero')) {
            const resetTx = await token.approve(lockAddress, 0);
            await resetTx.wait();
            const approveTx2 = await token.approve(lockAddress, onChainKeyPrice);
            await approveTx2.wait();
          } else {
            throw e;
          }
        }
      }
      const tx = await lockContract.purchase(
        [onChainKeyPrice],
        [owner],
        ['0x0000000000000000000000000000000000000000'],
        ['0x0000000000000000000000000000000000000000'],
        ['0x']
      );
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error('Transaction failed.');
      return { success: true, transactionHash: tx.hash };
    }

    // ETH path
    const tx = await lockContract.purchase(
      [onChainKeyPrice],
      [wallet.address],
      ['0x0000000000000000000000000000000000000000'],
      ['0x0000000000000000000000000000000000000000'],
      ['0x'],
      { value: onChainKeyPrice }
    );
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Transaction failed.');
    return { success: true, transactionHash: tx.hash };

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


export const getBlockExplorerUrl = (txHash: string, chainId?: number): string => {
  if (chainId) return getExplorerTxUrl(chainId, txHash);
  return getExplorerTxUrl(baseSepolia.id, txHash);
};

// --- New Functions ---

const getReadOnlyProvider = (chainId: number = baseSepolia.id) => {
  return new ethers.JsonRpcProvider(getRpcUrl(chainId));
};

/**
 * Gets the total number of keys that have been sold for a lock.
 */
export const getTotalKeys = async (lockAddress: string, chainId: number = baseSepolia.id): Promise<number> => {
  try {
    // Validate lock address before proceeding
    if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
      console.warn(`Invalid lock address: ${lockAddress}`);
      return 0;
    }
    
    const provider = getReadOnlyProvider(chainId);
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
export const checkKeyOwnership = async (lockAddress: string, userAddress: string, chainId: number = baseSepolia.id): Promise<boolean> => {
  try {
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      return false;
    }
    
    // Validate lock address before proceeding
    if (lockAddress === 'Unknown') {
      return false;
    }
    
    const provider = getReadOnlyProvider(chainId);
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    return await lockContract.getHasValidKey(userAddress);
  } catch (error) {
    console.error(`Error checking key ownership for ${lockAddress}:`, error);
    return false;
  }
};

/**
 * Gets the number of keys (tickets) owned by a specific user for a lock.
 */
export const getUserKeyBalance = async (lockAddress: string, userAddress: string, chainId: number = baseSepolia.id): Promise<number> => {
  try {
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      return 0;
    }
    
    // Validate lock address before proceeding
    if (lockAddress === 'Unknown') {
      return 0;
    }
    
    const provider = getReadOnlyProvider(chainId);
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    const balance = await lockContract.balanceOf(userAddress);
    return Number(balance);
  } catch (error) {
    console.error(`Error fetching user key balance for ${lockAddress}:`, error);
    return 0;
  }
};

/**
 * Configures max keys per address for a lock (requires lock manager permissions).
 */
export const configureMaxKeysPerAddress = async (
  lockAddress: string,
  maxKeys: number,
  wallet: any
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
      throw new Error('Invalid lock address.');
    }
    
    if (!wallet || !wallet.address) {
      throw new Error('No wallet provided or not connected.');
    }

    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);

    // Check if user is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error('You must be a lock manager to configure this setting.');
    }

    // Set max keys per address globally for the lock
    const tx = await lockContract.setMaxKeysPerAddress(
      '0x0000000000000000000000000000000000000000', // Zero address means global setting
      maxKeys
    );

    console.log('Max keys per address configuration sent:', tx.hash);
    await tx.wait();

    return { success: true };
  } catch (error) {
    console.error('Error configuring max keys per address:', error);
    
    let errorMessage = 'Failed to configure max keys per address.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return { success: false, error: errorMessage };
  }
};

/**
 * Gets the maximum number of keys a user can own for this lock.
 */
export const getMaxKeysPerAddress = async (lockAddress: string, userAddress?: string): Promise<number> => {
  try {
    if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
      return 1; // Default fallback
    }
    
    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);
    
    // Try user-specific limit first, then global limit
    if (userAddress && ethers.isAddress(userAddress)) {
      try {
        const userLimit = await lockContract.maxKeysPerAddress(userAddress);
        if (Number(userLimit) > 0) {
          return Number(userLimit);
        }
      } catch {
        // Fall through to global limit
      }
    }
    
    // Get global limit
    const globalLimit = await lockContract.maxKeysPerAddress();
    return Number(globalLimit) || 1; // Default to 1 if not set
  } catch (error) {
    console.error(`Error fetching max keys per address for ${lockAddress}:`, error);
    return 1; // Default fallback
  }
};

# Unlock Protocol Crypto Payments Guide

This guide explains how cryptocurrency payments work in this event ticketing application using Unlock Protocol and Privy wallet integration.

## Overview

The app supports two payment methods:
1. **Crypto payments** - Direct blockchain transactions using Unlock Protocol smart contracts
2. **Fiat payments** - Traditional payment via Paystack, with backend key granting

## Database Schema Differences

### Crypto Payments (Direct Blockchain)
- **No database storage for payment transactions** - payments are handled directly on-chain
- Creates **tickets** record only after successful blockchain purchase
- Uses **gas_transactions** table to track gas costs for service operations

### Fiat Payments (Paystack + Backend Granting)
- **paystack_transactions** table stores payment details
- **key_grant_attempts** table tracks backend key granting attempts
- **tickets** table links to paystack_transaction_id

## Architecture Components

### 1. Wallet Integration (Privy)

The app uses Privy for wallet management and authentication:

```typescript
// src/components/PrivyProvider.tsx
<Privy
  appId={appId}
  config={{
    loginMethods: ['email', 'wallet', 'sms'],
    defaultChain: {
      id: 84532, // Base Sepolia testnet
      name: 'Base Sepolia',
    },
    embeddedWallets: {
      createOnLogin: 'users-without-wallets',
    },
  }}
>
```

### 2. Smart Contract Integration (Unlock Protocol)

Unlock Protocol functions are handled in `src/utils/lockUtils.ts`:

```typescript
// Contract addresses for different chains
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: '0xd0b14797b9D08493392865647384974470202A78',
  [baseSepolia.id]: '0x259813B665C8f6074391028ef782e27B65840d89'
};

// Core purchase function
export const purchaseKey = async (
  lockAddress: string,
  price: number,
  currency: string,
  wallet: any
): Promise<PurchaseResult> => {
  // Get provider from Privy wallet
  const provider = await wallet.getEthereumProvider();
  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  // Create contract instance
  const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);
  
  // Execute purchase transaction
  const tx = await lockContract.purchase(
    [keyPriceWei], // values
    [wallet.address], // recipients
    ['0x0000000000000000000000000000000000000000'], // referrers
    ['0x0000000000000000000000000000000000000000'], // keyManagers
    ['0x'], // data
    { value: keyPriceWei }
  );
};
```

## Complete Crypto Payment Flow

### Step 1: Event Selection
User browses events on `/explore` page and clicks "Get Ticket":

```typescript
// src/pages/Explore.tsx
const handleEventDetails = (event: PublishedEvent) => {
  setSelectedEvent(event);
  
  const hasCrypto = event.payment_methods?.includes('crypto') || event.currency !== 'FREE';
  const hasPaystack = event.payment_methods?.includes('fiat') && event.paystack_public_key;
  
  if (hasCrypto && hasPaystack) {
    setActiveModal('payment-method'); // Show choice
  } else if (hasCrypto) {
    setActiveModal('crypto-purchase'); // Direct to crypto
  }
};
```

### Step 2: Payment Method Selection
If both payment methods are available, user sees selection dialog:

```typescript
// src/components/events/PaymentMethodDialog.tsx
<Button onClick={onSelectCrypto}>
  <Wallet className="w-5 h-5" />
  <div>
    <div>Pay with Crypto</div>
    <div>{event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}</div>
  </div>
</Button>
```

### Step 3: Crypto Purchase Dialog
User interacts with the crypto purchase interface:

```typescript
// src/components/events/EventPurchaseDialog.tsx
const handlePurchase = async () => {
  const wallet = wallets[0]; // Get first Privy wallet
  
  if (!wallet) {
    toast({
      title: 'Wallet not connected',
      description: 'Please connect your wallet to purchase a ticket.',
      variant: 'destructive',
    });
    return;
  }

  const result = await purchaseKey(event.lock_address, event.price, event.currency, wallet);
  
  if (result.success && result.transactionHash) {
    const explorerUrl = getBlockExplorerUrl(result.transactionHash, 'baseSepolia');
    toast({
      title: 'Purchase Successful!',
      description: (
        <div>
          <p>You've successfully purchased a ticket for {event.title}.</p>
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            View Transaction
          </a>
        </div>
      ),
    });
  }
};
```

### Step 4: Blockchain Transaction Execution

The `purchaseKey` function handles the actual blockchain interaction:

```typescript
// src/utils/lockUtils.ts
export const purchaseKey = async (lockAddress, price, currency, wallet) => {
  try {
    // 1. Validate inputs
    if (!ethers.isAddress(lockAddress)) {
      throw new Error('Invalid lock address');
    }

    // 2. Get Ethereum provider from Privy wallet
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // 3. Create contract instance
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, signer);

    // 4. Convert price to wei
    const keyPriceWei = currency === 'FREE' ? 0n : parseEther(price.toString());

    // 5. Verify on-chain price matches expected
    const onChainKeyPrice = await lockContract.keyPrice();
    if (onChainKeyPrice !== keyPriceWei) {
      throw new Error('Price mismatch. Please refresh and try again.');
    }

    // 6. Execute purchase transaction
    const tx = await lockContract.purchase(
      [keyPriceWei], // values
      [wallet.address], // recipients  
      ['0x0000000000000000000000000000000000000000'], // referrers
      ['0x0000000000000000000000000000000000000000'], // keyManagers
      ['0x'], // data
      { value: keyPriceWei } // ETH value sent
    );

    // 7. Wait for confirmation
    const receipt = await tx.wait();
    
    return {
      success: true,
      transactionHash: tx.hash,
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
};
```

## Key Technical Details

### Privy Wallet Integration
- **Provider Access**: `wallet.getEthereumProvider()` returns Web3 provider
- **Signer Creation**: Uses ethers.js BrowserProvider wrapper
- **Multi-wallet Support**: Users can have multiple wallets, app uses `wallets[0]`

### Smart Contract Interaction
- **ABI**: Uses PublicLock ABI for purchase function
- **Parameters**: Purchase function takes arrays for batch operations
- **Value Transfer**: ETH sent via transaction `value` field
- **Gas**: Gas fees automatically calculated by wallet

### Network Management
- **Default Chain**: Base Sepolia (testnet) - Chain ID 84532
- **Supported Chains**: Base Sepolia and Base Mainnet
- **Auto-switching**: Wallet automatically switches to correct network

### Error Handling
- **Address Validation**: Checks if lock address is valid
- **Price Verification**: Compares expected vs on-chain price
- **User-friendly Messages**: Translates technical errors to readable text
- **Transaction Cancellation**: Handles user rejection gracefully

### Transaction Verification
- **Block Explorer Links**: Provides links to view transactions
- **Receipt Validation**: Checks transaction status before marking success
- **Event Logs**: Could parse transaction logs for additional data

## Database Storage (Post-Purchase)

Unlike fiat payments, crypto purchases don't create database records during payment. The ticket ownership is verified directly from the blockchain:

```typescript
// Checking if user owns a ticket (from blockchain)
const hasValidKey = await lockContract.getHasValidKey(userAddress);
const userKeyBalance = await lockContract.balanceOf(userAddress);
```

## Error Scenarios

### Common Error Cases:
1. **Wallet not connected** - User needs to connect wallet first
2. **Insufficient funds** - Not enough ETH for ticket + gas fees  
3. **Price mismatch** - On-chain price differs from displayed price
4. **Invalid lock address** - Event's smart contract address is invalid
5. **Transaction rejection** - User cancels transaction in wallet
6. **Network issues** - RPC or blockchain connectivity problems

### Error Handling Strategy:
- Validate all inputs before blockchain calls
- Provide clear, actionable error messages
- Allow users to retry failed transactions
- Display transaction status and explorer links

## Integration with Other App Features

### My Tickets Page
Uses blockchain queries to show user's owned tickets:

```typescript
// src/pages/MyTickets.tsx
const fetchTickets = async () => {
  if (!authenticated || !user?.wallet?.address) return;
  
  const eventsWithTickets = await getEventsWithUserTickets(user.wallet.address);
  setTickets(eventsWithTickets);
};
```

### Event Display
Shows real-time ticket sales from blockchain:

```typescript
// src/pages/Explore.tsx
useEffect(() => {
  const fetchKeysSold = async () => {
    const promises = events.map(event => getTotalKeys(event.lock_address));
    const results = await Promise.all(promises);
    // Update UI with current sales numbers
  };
}, [events]);
```

This architecture provides a seamless crypto payment experience while maintaining security and decentralization through direct blockchain interaction.
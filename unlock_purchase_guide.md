
# Unlock Protocol Crypto Payment Implementation Guide

## Project Overview
This is a **React + Vite + TypeScript** project (not Next.js) that integrates Unlock Protocol for NFT ticket purchases using cryptocurrency payments.

## Current Implementation Status

### ✅ Already Implemented
- `lockUtils.ts` with `purchaseKey()` function
- `EventPurchaseDialog` component for crypto payments UI
- Wallet connection via Privy
- Payment method selection dialog
- Base Sepolia network configuration

### 🔧 Key Files & Functions

#### 1. Core Purchase Function (`src/utils/lockUtils.ts`)
```typescript
export const purchaseKey = async (
  lockAddress: string,
  price: number, // The price in ETH (not wei)
  currency: string,
  wallet: any
): Promise<PurchaseResult> => {
  // Validates lock address
  // Converts price to wei using parseEther()
  // Verifies on-chain price matches expected price
  // Calls lock.purchase() with proper parameters
  // Returns transaction hash on success
}
```

#### 2. Purchase Dialog Component (`src/components/events/EventPurchaseDialog.tsx`)
- Handles the crypto payment UI
- Shows wallet connection status
- Displays event details and pricing
- Manages purchase flow and error states

#### 3. Payment Method Selection (`src/components/events/PaymentMethodDialog.tsx`)
- Allows users to choose between crypto and fiat payments
- Conditionally shows options based on event configuration

## Implementation Guide for LLM Integration

### Step 1: Trigger Crypto Purchase Flow

In your event listing/details component, when user clicks "Get Ticket":

```typescript
// In src/pages/Explore.tsx (already implemented)
const handleEventDetails = (event: PublishedEvent) => {
  setSelectedEvent(event);
  
  const hasCrypto = event.payment_methods?.includes('crypto') || event.currency !== 'FREE';
  const hasPaystack = event.payment_methods?.includes('fiat') && event.paystack_public_key && event.ngn_price;
  
  if (hasCrypto && hasPaystack) {
    setActiveModal('payment-method'); // Show payment method selection
  } else if (hasCrypto) {
    setActiveModal('crypto-purchase'); // Direct to crypto purchase
  }
};
```

### Step 2: EventPurchaseDialog Implementation Pattern

```typescript
// Key components of the purchase dialog:
import { purchaseKey } from '@/utils/lockUtils';
import { usePrivy } from '@privy-io/react-auth';

const EventPurchaseDialog = ({ event, isOpen, onClose }) => {
  const { user, authenticated } = usePrivy();
  const [isPurchasing, setIsPurchasing] = useState(false);
  
  const handlePurchase = async () => {
    if (!authenticated || !user?.wallet) {
      // Handle wallet connection
      return;
    }
    
    setIsPurchasing(true);
    try {
      const result = await purchaseKey(
        event.lock_address,
        event.price,
        event.currency,
        user.wallet
      );
      
      if (result.success) {
        // Show success message
        // Close dialog
        // Refresh event data
      } else {
        // Show error message
      }
    } catch (error) {
      // Handle error
    } finally {
      setIsPurchasing(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Purchase UI */}
    </Dialog>
  );
};
```

### Step 3: Network & Wallet Management

The app uses **Base Sepolia** testnet:

```typescript
// From lockUtils.ts
const targetChainId = baseSepolia.id; // 84532
const targetChainIdHex = `0x${targetChainId.toString(16)}`;

// Automatic network switching
await provider.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: targetChainIdHex }],
});
```

### Step 4: Error Handling Patterns

```typescript
// From purchaseKey function - comprehensive error handling:
if (!lockAddress || lockAddress === 'Unknown' || !ethers.isAddress(lockAddress)) {
  throw new Error('Invalid lock address. The event may not have been properly deployed.');
}

if (!wallet || !wallet.address) {
  throw new Error('No wallet provided or not connected.');
}

// Price verification
const onChainKeyPrice = await lockContract.keyPrice();
if (onChainKeyPrice !== keyPriceWei) {
  throw new Error('The ticket price has changed. Please refresh and try again.');
}

// User-friendly error messages
if (error.message.includes('User rejected')) {
  errorMessage = 'Transaction was cancelled. Please try again when ready.';
} else if (error.message.includes('insufficient funds')) {
  errorMessage = 'Insufficient funds to purchase the ticket. Please add more ETH to your wallet.';
}
```

### Step 5: Integration with Existing Event System

Events are stored in Supabase with these crypto-relevant fields:

```sql
-- From events table
lock_address TEXT NOT NULL,        -- Unlock Protocol lock contract address
price NUMERIC NOT NULL DEFAULT 0, -- Price in ETH/token
currency TEXT NOT NULL DEFAULT 'FREE', -- 'ETH', 'USDC', or 'FREE'
payment_methods TEXT[] DEFAULT ARRAY['crypto'], -- ['crypto', 'fiat']
chain_id BIGINT NOT NULL DEFAULT 84532, -- Base Sepolia
```

### Step 6: Complete Purchase Flow Implementation

```typescript
// Complete purchase flow (pseudo-code):
const completeCryptoPurchase = async (event: PublishedEvent, wallet: any) => {
  try {
    // 1. Validate inputs
    if (!event.lock_address || event.lock_address === 'Unknown') {
      throw new Error('Event not properly configured for crypto payments');
    }
    
    // 2. Check user's existing ownership (optional)
    const hasKey = await checkKeyOwnership(event.lock_address, wallet.address);
    if (hasKey) {
      throw new Error('You already own a ticket for this event');
    }
    
    // 3. Execute purchase
    const result = await purchaseKey(
      event.lock_address,
      event.price,
      event.currency,
      wallet
    );
    
    if (result.success) {
      // 4. Update UI state
      toast.success('Ticket purchased successfully!');
      
      // 5. Optional: Update local state/cache
      // refreshEventData();
      
      return { success: true, txHash: result.transactionHash };
    } else {
      throw new Error(result.error || 'Purchase failed');
    }
  } catch (error) {
    toast.error(error.message);
    return { success: false, error: error.message };
  }
};
```

### Step 7: Testing & Debugging

For testing on Base Sepolia:
- Use testnet ETH from Base Sepolia faucet
- Lock contracts should be deployed on Base Sepolia (chain ID: 84532)
- Wallet should be connected to Base Sepolia network
- Use block explorer: https://sepolia.basescan.org/

### Key Utilities Available

```typescript
// From lockUtils.ts - additional useful functions:
getTotalKeys(lockAddress) // Get total tickets sold
checkKeyOwnership(lockAddress, userAddress) // Check if user owns ticket
getUserKeyBalance(lockAddress, userAddress) // Get user's ticket count
getMaxKeysPerAddress(lockAddress) // Get purchase limit per user
getBlockExplorerUrl(txHash) // Get explorer URL for transaction
```

### UI Components Structure

```
src/components/events/
├── EventCard.tsx                 // Event listing card
├── EventPurchaseDialog.tsx       // Crypto purchase dialog ✅
├── PaymentMethodDialog.tsx       // Payment method selection ✅
└── PaystackPaymentDialog.tsx     // Fiat purchase dialog ✅
```

## LLM Integration Instructions

When implementing crypto purchases:

1. **Always check wallet connection first** via Privy
2. **Validate event configuration** (lock_address, price, currency)
3. **Use existing purchaseKey() function** - don't reimplement
4. **Handle network switching** to Base Sepolia automatically
5. **Provide clear error messages** for user-friendly UX
6. **Show transaction progress** and final success/error states
7. **Refresh event data** after successful purchase to update UI

The crypto payment flow is already well-implemented - the main integration points are:
- Triggering the `EventPurchaseDialog` component
- Handling the purchase result and updating UI accordingly
- Managing wallet connection state through Privy

## Database Integration

After successful crypto purchase, optionally track in database:

```typescript
// Optional: Record crypto purchase in database
const { error } = await supabase
  .from('tickets')
  .insert({
    event_id: event.id,
    owner_wallet: wallet.address,
    status: 'active',
    grant_tx_hash: result.transactionHash
  });
```

This implementation leverages your existing robust foundation while providing clear integration points for LLM-assisted development.

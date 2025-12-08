# Teerex Project Description & Analysis

## 1. Project Overview

**Teerex** is a hybrid decentralized ticketing platform designed to bridge the gap between traditional event management (Web2) and blockchain-based ownership (Web3). It allows event organizers to create events where tickets are issued as Non-Fungible Tokens (NFTs) via the **Unlock Protocol**, while providing a seamless user experience that supports both crypto-native users and traditional users who prefer fiat payments.

The platform abstracts away the complexities of blockchain interaction for non-technical users (Gasless transactions, Fiat-to-NFT bridges) while offering full on-chain transparency and ownership for those who want it. It also leverages the **Ethereum Attestation Service (EAS)** to provide verifiable proofs of attendance and reputation.

---

## 2. Technology Stack

### Frontend
- **Framework:** React (Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** React Query, React Context
- **Routing:** React Router DOM
- **Forms:** React Hook Form + Zod validation
- **Web3 Integration:**
  - `wagmi` / `viem`: Wallet connection and blockchain interaction.
  - `ethers.js`: Smart contract interaction.
  - `@privy-io/react-auth`: Authentication (Social logins + Embedded Wallets).

### Backend & Infrastructure
- **Platform:** Supabase
  - **Database:** PostgreSQL
  - **Auth:** Supabase Auth (integrated with Privy)
  - **Edge Functions:** Server-side logic (Deno/TypeScript)
- **Payments:** Paystack (Fiat processing)
- **Blockchain:**
  - **Unlock Protocol:** Smart contracts for event "Locks" and ticket "Keys".
  - **Ethereum Attestation Service (EAS):** On-chain attestations.
  - **Networks:** Base (Mainnet & Testnets, extendable to other EVM chains supported by Unlock Protocol).

### Key Libraries
- `@ethereum-attestation-service/eas-sdk`: For creating and reading attestations.
- `react-paystack`: Paystack integration for React.
- `lucide-react`: Iconography.

---

## 3. Architecture & How It Works

### 3.1 Event Creation
1.  **User Action:** A creator fills out the event form (Title, Date, Price, Capacity, etc.).
2.  **Smart Contract Deployment:**
    *   The platform creates an **Unlock Protocol "Lock"** smart contract.
    *   This Lock represents the event and manages ticket inventory and sales.
    *   **Gasless Deployment:** The system attempts to deploy this contract using a Relayer (Service Wallet), covering the gas fees for the creator to lower the barrier to entry.
3.  **Database Sync:** Event metadata is stored in Supabase for fast indexing and querying (e.g., for the `/explore` page), linked to the on-chain `lock_address`.

### 3.2 Ticketing & Payments
The platform supports a dual-pathway payment system:

#### A. Crypto Route (Web3 Native)
*   **User Action:** Connects wallet, pays in ETH or USDC directly to the smart contract.
*   **Mechanism:** The frontend calls the `purchase()` function on the Lock contract.
*   **Result:** The user immediately receives the NFT ticket in their wallet.

#### B. Fiat Route (Web2 Friendly)
*   **User Action:** Pays in NGN (Nigerian Naira) using a card/bank transfer via Paystack.
*   **Mechanism:**
    1.  **Payment:** User completes transaction on Paystack.
    2.  **Webhook:** Paystack notifies the `paystack-webhook` Edge Function.
    3.  **Verification:** The function verifies the payment signature and checks for idempotency.
    4.  **Issuance:** The function uses a **Service Wallet** (acting as a Relayer) to call the `grantKeys()` function on the smart contract, minting the NFT to the user's embedded Privy wallet.
*   **Result:** The user gets a valid blockchain ticket without needing to hold crypto or pay gas.

### 3.3 Attestations
*   Teerex uses **EAS** to create on-chain records of actions.
*   **Attendance:** When a ticket is used/scanned, an attestation is created linking the `eventId`, `ticketHolder`, and `timestamp`.
*   **Reputation:** Users can rate events, creating "Like" attestations that build an on-chain reputation graph for organizers.

---

## 4. Stakeholders & User Roles

### 4.1 Administrators (`/admin`)
*   **Role:** Platform super-users.
*   **Capabilities:**
    *   Manage blockchain network configurations (RPC URLs, Chain IDs).
    *   Configure EAS Schemas.
    *   Manage Gas Sponsorship policies (who gets free transactions).
    *   View global transaction stats and event logs.
*   **Access Control:** Protected by `is-admin` Edge Function and `AdminRoute` component.

### 4.2 Event Creators
*   **Role:** Organizers hosting events.
*   **Capabilities:**
    *   **Create Events:** Deploy new Lock contracts.
    *   **Manage Events:** Update event details (Title, Description, Images).
        *   *Note:* Updates are authorized by checking if the user is a **Lock Manager** on-chain.
    *   **View Sales:** Track ticket sales and revenue.
    *   **Manage Drafts:** Save events before publishing.
    *   **Withdraw Funds:** (Implicit via Unlock Protocol) Funds accumulate in the smart contract and can be withdrawn by the Lock Manager.

### 4.3 Attendees
*   **Role:** Users buying tickets.
*   **Capabilities:**
    *   **Discover:** Browse and filter events.
    *   **Purchase:** Buy tickets using Fiat or Crypto.
    *   **Access:** View purchased tickets (`/my-tickets`) and QR codes.
    *   **Attest:** Receive proofs of attendance.

---

## 5. Financials

### Payment Methods
*   **Cryptocurrency:** ETH (Native), USDC (ERC20).
*   **Fiat:** NGN (via Paystack).

### Fee Structure
*   **Platform Fees:** Currently, the codebase does not explicitly deduct a platform fee at the application layer.
    *   *Crypto:* 99% of the price goes to the Lock contract (Creator) 1% goes to Unlock Protocol.
    *   *Fiat:* Paystack fees apply. The remaining amount is "granted" as a key. The revenue likely sits in the Paystack account or is manually settled.
*   **Gas Fees:**
    *   **Sponsored:** Event creation and Fiat-ticket issuance are sponsored by the platform (User pays $0 gas), with a backup fallback to users wallet if service is down.
    *   **User Paid:** Crypto-native ticket purchases require the user to pay gas.

### Configurability
*   **Pricing:** Creators set the price. Can be `0` (Free).
*   **Currency:** Configurable per event.
*   **Refunds:** Not explicitly handled in the current automated flow (handled via policy or manual admin intervention).

---

## 6. Monetization Strategy

### Current (Implicit/Potential)
1.  **Transaction Fees:** The platform could implement a "Application Fee" in the Unlock Protocol purchase call to take a % of every ticket sale.
2.  **Gas Sponsorship Premium:** Charging creators a monthly subscription to enable "Gasless" features for their attendees.
3.  **Promoted Events:** Charging for visibility on the `/explore` page.
4.  **Fiat On-Ramp Spreads:** Taking a small margin on the FX conversion if settling Fiat payments to Crypto.

---

## 7. Security Measures

### 7.1 Authentication & Authorization
*   **Privy:** Handles secure key management for users (Embedded Wallets) and social login.
*   **On-Chain Auth:** Critical actions (updating events) verify that the user's wallet is a `LockManager` on the blockchain, ensuring true decentralized ownership.

### 7.2 Data Security
*   **RLS (Row Level Security):** PostgreSQL policies strictly limit data access.
    *   *Example:* Users can only view their own drafts. Public events are viewable by all.
*   **Input Validation:** `zod` schemas validate all form inputs before submission.

### 7.3 Payment Security
*   **Webhook Signatures:** Paystack webhooks are verified using HMAC SHA-512 to prevent spoofing.
*   **Idempotency:** Transactions are checked against the database (`paystack_transactions`) to prevent double-minting of tickets.


---

## 8. Roadmap to Decentralization

To move towards a fully decentralized architecture, the following steps are recommended:

1.  **Metadata on IPFS:** Currently, event details live in Supabase. Moving `title`, `description`, and `image` to IPFS (referenced by the Lock contract) would remove the dependency on the centralized database.
2.  **Decentralized Indexing:** Replace Supabase query logic with **The Graph** subgraphs to index Unlock Protocol events directly from the blockchain.
3.  **DAO Governance:** Implement a DAO to allow community members to vote on platform fees, supported networks, and featured events.
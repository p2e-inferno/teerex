# Gaming Bundles End-to-End (NFT + EAS)

This document describes the current end-to-end flow for **Gaming Bundles** (vendor-created NFT-backed bundles) including online purchase, offline purchase with EAS receipts, and redemption/claim.

## Overview
- Vendors create **Gaming Bundles** (e.g., "1 hour PS5", "3 matches EA FC") with rich metadata including console, location, game title, and images.
- Each bundle is backed by a unique Unlock lock address (NFT keys) that must be deployed before bundle creation.
- Bundles include mandatory location (gaming center address) and optional console selection.
- Bundle images are uploaded, cropped to 1:1 aspect ratio, and stored for NFT metadata.
- Buyers can purchase online (Paystack/crypto) or offline (cash).
- Offline purchases issue an **EAS attestation** and a **claim code** (hash stored in DB).
- Claims mint/transfer an NFT to the buyer's wallet; redemptions record consumption.
- Vendors can **reissue** lost claim receipts (rotates claim code; old code invalidated).

## Key Entities
- `gaming_bundles`: bundle metadata including:
  - Core: title, description, bundle_type, quantity_units, unit_label
  - Metadata: console (optional), location (required), game_title (optional), image_url (optional)
  - Pricing: price_fiat, fiat_symbol, price_dg
  - Contract: bundle_address (Unlock lock), chain_id
  - Vendor: vendor_id (creator)
- `gaming_bundle_orders`: purchase records (online/offline), fulfillment status, EAS UID.
- `gaming_bundle_redemptions`: one redemption per order.
- `gaming_bundle_claim_code_rotations`: audit trail for claim code rotations.

## Access Control (Vendor Gate)
- Vendor access is enforced by **Unlock key ownership** on Base mainnet.
- The vendor must hold a valid key for `VENDOR_LOCK_ADDRESS`.
- Edge functions use `requireVendor()` to verify access.

## Claim Code Security
- **Only `claim_code_hash` is stored** in the DB (SHA-256).
- Plaintext claim codes are shown once to the vendor and never persisted.
- A DB leak cannot be used to claim tickets.
- Reissue rotates the hash and **invalidates previous codes**.

---

## End-to-End Flows

### 1) Vendor Creates a Bundle
1. Vendor signs in and opens `/vendor/gaming-bundles`.
2. Fills in bundle form with:
   - **Title** (required) - Bundle name
   - **Description** - What the bundle includes
   - **Game Title** (optional) - e.g., "EA FC 26"
   - **Console** (optional dropdown) - PS5, PS4, XBOX Series X, XBOX One, Nintendo Switch, PC, Other
   - **Location** (required) - Physical gaming center address (e.g., "Gaming Arena Lagos")
   - **Bundle Image** (optional) - Uploaded and cropped to 1:1 aspect ratio for NFT metadata
   - **Bundle Type** - TIME, MATCHES, PASS, OTHER
   - **Quantity & Units** - e.g., 60 minutes, 3 matches
   - **Pricing** - Fiat (NGN) and/or DG (crypto)
   - **Chain** - Base Mainnet or Sepolia
3. **Deploys Bundle Contract** (mandatory):
   - Must fill in title and location before deploying
   - Deploys Unlock Protocol lock with `maxKeysPerAddress: 100` (allows repeat purchases)
   - Lock address is auto-filled after deployment
   - Deploy button is disabled until title and location are provided
4. **Creates Bundle**:
   - Create button is disabled until lock is deployed and location is filled
   - Calls `create-gaming-bundle` edge function with all metadata
   - Bundle is saved to database and listed publicly
5. Bundle appears on `/gaming-bundles` (public list) and `/gaming-bundles/:id` (details page) with image, console, and location displayed.

### 2) Online Purchase (Paystack or Crypto)
1. Buyer visits `/gaming-bundles/:id` and sees:
   - Bundle image (if uploaded)
   - Console badge (if specified)
   - Location with MapPin icon
   - Game title badge (if specified)
   - Pricing options (NGN via Paystack and/or DG via crypto)
2. Buyer selects payment method:
   - **Paystack (Fiat)**: Opens payment dialog, completes NGN payment
   - **Crypto (DG)**: Connects wallet, approves transaction
3. Payment is confirmed (Paystack/crypto flow).
4. Wallet is created via Privy (email-based) if needed.
5. NFT key is minted to buyer's wallet.
6. Order is saved with `fulfillment_method = "NFT"`.

### 3) Offline/Cash Purchase (EAS Receipt)
1. Vendor opens `/vendor/bundles-pos` and selects a bundle.
2. Vendor records buyer details (optional name/phone/address).
3. System creates an order with `fulfillment_method = "EAS"`.
4. EAS attestation is issued to the **service wallet**.
5. Vendor receives a **claim code** + QR/URL and gives it to buyer.
6. Only `claim_code_hash` is stored in DB.

### 4) Claim Later (Convert EAS → NFT)
1. Buyer opens `/gaming-bundles/claim` with claim code.
2. Buyer connects wallet (Privy or external).
3. Server hashes claim code and verifies order + EAS attestation.
4. NFT key is minted/transferred to the buyer.
5. Order updates to `fulfillment_method = "EAS_TO_NFT"` and stores recipient.

### 5) Redemption at Venue
1. Vendor opens `/vendor/bundles-redeem`.
2. Vendor redeems by order ID or claim code.
3. Server verifies status + prevents double redemption.
4. A redemption record is created in `gaming_bundle_redemptions`.

### 6) Reissue Claim Code (Lost Receipt)
1. Vendor opens `/vendor/bundles-orders` and searches order.
2. Clicks **Reissue**, server generates a new claim code.
3. Old claim code hash is invalidated.
4. Rotation is logged in `gaming_bundle_claim_code_rotations`.
5. Vendor prints or shares the new QR/claim code.

---

## Example User Stories

### Vendor / Creator
- As a vendor, I create a "1 hour PS5" bundle by:
  - Filling in title, description, console (PS5), and location (Gaming Arena Lagos)
  - Uploading and cropping a bundle image for NFT marketplace display
  - Deploying an Unlock Protocol lock contract (mandatory)
  - Setting pricing (NGN 5000, 50 DG)
  - Creating the bundle (disabled until lock is deployed)
- A walk-in customer pays cash, so I record the sale in POS and hand them a QR receipt.
- The next day they lose the receipt, so I find the order and reissue a new claim code.
- I redeem the ticket when they arrive to play, and the system blocks double redemption.

### Admin
- As an admin, I can see bundles and orders in Supabase and audit claim code rotations.
- I can monitor that offline orders include EAS UID and are correctly redeemed.
- I can verify vendors by checking keys on the vendor lock contract.

### Buyer / Attendee
- As a buyer, I browse gaming bundles and see:
  - Bundle images, console types, game titles, and locations
  - Clear pricing in both NGN and DG
  - Location information to know where to redeem
- I pay online with Paystack and receive an NFT ticket in my wallet with bundle metadata.
- If I paid cash, I later claim by entering the claim code and connecting my wallet.
- I present the NFT/claim to the vendor for redemption at the specified gaming center location.

---

## UI + API Map

### Frontend
- Vendor bundles: `/vendor/gaming-bundles`
- Vendor POS (offline): `/vendor/bundles-pos`
- Vendor redemption: `/vendor/bundles-redeem`
- Vendor order search + reissue: `/vendor/bundles-orders`
- Public bundle list: `/gaming-bundles`
- Bundle detail: `/gaming-bundles/:id`
- Claim page: `/gaming-bundles/claim`

### Edge Functions
- `create-gaming-bundle` - Creates bundle with console, location, image_url
- `list-gaming-bundles` - Lists bundles with optional filters:
  - `console` - Filter by console type
  - `location` - Search location (case-insensitive partial match)
  - `bundle_type` - Filter by bundle type
  - `mine` - Show only vendor's bundles
  - `include_inactive` - Include inactive bundles
  - `bundle_id` - Get specific bundle
  - `q` - Search title and description
- `record-gaming-bundle-sale` (offline + EAS)
- `init-gaming-bundle-transaction` (online checkout)
- `claim-gaming-bundle`
- `redeem-gaming-bundle`
- `list-gaming-bundle-orders` (vendor)
- `rotate-gaming-bundle-claim-code` (vendor)

---

## UI Components

### Bundle Display Components
- **GamingBundleCard** (used in list views):
  - Displays bundle image at top (h-40 overflow)
  - Shows badges: bundle_type, console (if present), game_title (if present)
  - Displays location with MapPin icon
  - Shows pricing in NGN and DG
  - Displays sold count

- **GamingBundleDetails** (bundle detail page):
  - Large hero image (max-h-80) at top
  - Console and game title badges in header
  - Location with MapPin icon below title
  - Payment buttons for NGN and DG
  - Integrates PaystackPaymentDialog and ProcessingDialog

### Vendor Form (`VendorGamingBundles`)
- **Image Upload**: Uses `ImageCropper` component (1:1 aspect ratio)
- **Console Dropdown**: PS5, PS4, XBOX Series X, XBOX One, Nintendo Switch, PC, Other
- **Location Input**: Required field with MapPin icon, free text entry
- **Lock Deployment**: Mandatory before bundle creation
  - Deploy button disabled until title + location filled
  - Lock address auto-populated after deployment
  - Uses `maxKeysPerAddress: 100` for repeat purchases
- **Create Button**: Disabled until lock deployed and location filled

---

## Database Schema Updates

### `gaming_bundles` Table
New columns added in migration `20251230_add_gaming_bundle_console_location.sql`:
- `console` (TEXT, nullable) - Gaming console type (PS5, XBOX, etc.)
- `location` (TEXT, required) - Physical gaming center location
- Indexes:
  - `idx_gaming_bundles_location` on `location`
  - `idx_gaming_bundles_console` on `console` (partial index WHERE console IS NOT NULL)

Existing columns:
- `image_url` (TEXT, nullable) - Cropped 1:1 bundle image for NFT metadata
- All other bundle metadata fields

---

## Operational Notes
- New migrations must be applied before deploy: `supabase migration up --local`
- Functions in `supabase/functions/**` must be deployed after edits.
- Type regeneration required after schema changes: `npx supabase gen types typescript --local`
- Required secrets include service wallet key and EAS schema UID.

## Security Notes
- No plaintext claim codes are stored in DB.
- Attestations are issued server-side only.
- Vendor access is enforced via Unlock key ownership on Base mainnet.
- Bundle images stored in Supabase `event-images` bucket (reusing event infrastructure).

---

## Testing

### Integration Tests (`tests/integration/pages/VendorGamingBundles.test.tsx`)
Test coverage for the vendor bundle creation flow:

1. **UI Rendering**:
   - Console dropdown renders correctly
   - Location input field is present and required

2. **Lock Deployment Validation**:
   - Create button is disabled until lock is deployed
   - Deploy button is disabled without title AND location
   - Filling only title keeps deploy button disabled
   - Deploy button enables after both title and location are filled

3. **Bundle Creation Flow**:
   - Complete flow: fill form → deploy lock → create bundle
   - Verifies console and location are sent to edge function
   - Verifies Privy authorization header is included
   - Success toast shown after creation

4. **Error Handling**:
   - Vendor access denied error handled properly
   - Destructive toast variant shown on errors

5. **Form Validation**:
   - Location field required validation
   - Create button remains disabled without deployed lock address

### Manual Testing Checklist
- [ ] Image upload and cropping works (1:1 aspect ratio)
- [ ] Deployed lock address appears in readonly input
- [ ] Console dropdown shows all options (PS5, PS4, XBOX, etc.)
- [ ] Location autocomplete/search (future enhancement)
- [ ] Bundle cards display image, console, location correctly
- [ ] Bundle details page shows all metadata
- [ ] Filtering by console and location works
- [ ] NFT metadata includes bundle image URL


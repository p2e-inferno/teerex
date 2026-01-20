# Vendor Payout Accounts Feature

This document describes the end-to-end implementation of the Vendor Payout Accounts feature, which enables event creators to receive fiat (NGN) payments directly into their bank accounts via Paystack subaccounts.

## Overview

When attendees purchase tickets using fiat currency (Nigerian Naira via Paystack), the payment is automatically split:
- **95%** goes to the event creator's bank account
- **5%** platform commission is retained by TeeRex

This is achieved through Paystack's Subaccount feature, which requires vendors to register and verify their bank account details before receiving fiat payments.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VENDOR PAYOUT FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

1. VENDOR REGISTRATION
   ┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
   │ Vendor fills │────▶│ Paystack Resolve    │────▶│ Account name     │
   │ bank details │     │ API verifies account│     │ returned         │
   └──────────────┘     └─────────────────────┘     └────────┬─────────┘
                                                             │
   ┌──────────────────────────────────────────────────────────▼─────────────┐
   │ submit-payout-account edge function                                    │
   │ 1. Validates input                                                     │
   │ 2. Verifies account via Paystack                                       │
   │ 3. Creates Paystack subaccount                                         │
   │ 4. Stores in vendor_payout_accounts table                              │
   └────────────────────────────────────────────────────────────────────────┘

2. PAYMENT FLOW (Ticket Purchase)
   ┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
   │ Attendee     │────▶│ init-paystack-      │────▶│ Transaction with │
   │ buys ticket  │     │ transaction         │     │ subaccount_code  │
   └──────────────┘     └─────────────────────┘     └────────┬─────────┘
                                                             │
   ┌──────────────────────────────────────────────────────────▼─────────────┐
   │ Paystack processes payment with split:                                 │
   │ • 95% → Vendor's bank account (via subaccount)                         │
   │ • 5%  → Platform account (commission)                                  │
   └────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### vendor_payout_accounts Table

```sql
CREATE TABLE public.vendor_payout_accounts (
  id UUID PRIMARY KEY,
  vendor_id TEXT NOT NULL,                    -- Privy user ID
  provider TEXT DEFAULT 'paystack',           -- Payment provider
  provider_account_id TEXT,                   -- Paystack internal ID
  provider_account_code TEXT UNIQUE,          -- e.g., "ACCT_xxx" for Paystack
  business_name TEXT NOT NULL,                -- Verified account holder name
  account_holder_name TEXT,                   -- From Paystack resolve
  currency TEXT DEFAULT 'NGN',
  settlement_bank_code TEXT,                  -- e.g., "044" (Access Bank)
  settlement_bank_name TEXT,                  -- Human-readable bank name
  account_number TEXT,                        -- 10-digit NUBAN
  percentage_charge NUMERIC DEFAULT 5,        -- Platform commission
  status TEXT DEFAULT 'pending_verification', -- pending|verified|failed|suspended
  is_verified BOOLEAN DEFAULT false,
  verification_status TEXT,
  verification_error TEXT,
  submitted_at TIMESTAMP,
  verified_at TIMESTAMP,
  -- Admin oversight fields
  suspended_by TEXT,
  suspended_at TIMESTAMP,
  suspension_reason TEXT,
  provider_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Edge Functions

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `list-nigerian-banks` | Returns list of Nigerian banks with codes | No |
| `resolve-bank-account` | Verifies account number and returns holder name | No |
| `get-vendor-payout-account` | Gets vendor's payout account status | Yes (Privy) |
| `submit-payout-account` | Submits new payout account for verification | Yes (Privy) |
| `retry-payout-verification` | Retries failed verification with updated details | Yes (Privy) |
| `admin-list-payout-accounts` | Lists all payout accounts (admin only) | Yes (Admin) |
| `admin-suspend-payout-account` | Suspends/unsuspends accounts | Yes (Admin) |

## Frontend Components

### Hooks

- **`useBanks()`** - Fetches Nigerian bank list (returns test bank in development)
- **`useResolveAccount(accountNumber, bankCode)`** - Real-time account verification
- **`useDebounce(value, delayMs)`** - Debounces input for API efficiency

### Pages

- **`/vendor/payout-account`** - Vendor self-service page for managing payout accounts
- **`/admin/payout-accounts`** - Admin dashboard for oversight

## Development vs Production Mode

The system behaves differently based on the `VITE_NODE_ENV` environment variable:

### Development Mode (`VITE_NODE_ENV="development"`)

- **Bank List**: Returns only "Test Bank (Development)" with code `001`
- **Account Resolution**: Calls real Paystack API with test bank code `001`
- **Why**: Paystack test mode limits real bank resolution to 3 calls/day, but test bank code `001` has no limits

### Production Mode

- **Bank List**: Fetches all Nigerian banks from Paystack API
- **Account Resolution**: Verifies real bank accounts via Paystack

## User Stories

### Creator (Event Organizer)

#### Story 1: Setting Up Payout Account

> As an event creator, I want to add my bank account so I can receive payments when attendees buy tickets to my events.

**Flow:**
1. Creator navigates to `/vendor/payout-account`
2. Selects their bank from the searchable dropdown
3. Enters their 10-digit NUBAN account number
4. System automatically verifies and displays the account holder name
5. Creator confirms and submits
6. System creates Paystack subaccount and marks account as verified
7. Creator can now enable fiat payments on their events

**Acceptance Criteria:**
- Account holder name is displayed before submission (from Paystack)
- Business name uses the verified account holder name (prevents fraud)
- Clear error messages if verification fails
- Can retry with corrected details

#### Story 2: Receiving Payment

> As an event creator with a verified payout account, I want to automatically receive 95% of ticket sales in my bank account.

**Flow:**
1. Creator creates event with fiat payment enabled
2. Attendee purchases ticket via Paystack
3. Paystack splits payment automatically:
   - 95% to creator's subaccount → settled to their bank (T+1)
   - 5% to platform account
4. Creator receives funds next business day

**Acceptance Criteria:**
- Payment split happens automatically
- No manual intervention required
- Creator sees transaction in Paystack dashboard

#### Story 3: Handling Verification Failure

> As a creator whose bank account verification failed, I want to understand why and retry with correct information.

**Flow:**
1. Creator submits bank details
2. Verification fails (e.g., wrong account number)
3. System shows clear error message and allows retry
4. Creator corrects details and resubmits
5. Verification succeeds

**Acceptance Criteria:**
- Error message explains the issue
- Previous details are pre-filled for editing
- Unlimited retries allowed

---

### Admin (Platform Administrator)

#### Story 4: Monitoring Payout Accounts

> As an admin, I want to view all vendor payout accounts to ensure compliance and handle issues.

**Flow:**
1. Admin navigates to `/admin/payout-accounts`
2. Views table of all payout accounts with filters
3. Can filter by status (verified, failed, suspended)
4. Can view full details of any account

**Acceptance Criteria:**
- Paginated list of all accounts
- Filter by status
- Search by business name or account number
- View verification metadata

#### Story 5: Suspending a Problematic Account

> As an admin, I want to suspend a vendor's payout account if there are fraud concerns or disputes.

**Flow:**
1. Admin identifies problematic account
2. Clicks "Suspend" and enters reason
3. Account status changes to "suspended"
4. Vendor can no longer receive fiat payments
5. Vendor is notified (future: email notification)

**Acceptance Criteria:**
- Suspension requires a reason
- Suspended accounts cannot receive payments
- Audit trail shows who suspended and when
- Can unsuspend if issue is resolved

#### Story 6: Reviewing Platform Commission

> As an admin, I want to configure the platform commission rate.

**Flow:**
1. Commission rate stored in `platform_config` table
2. Default is 5% (configurable)
3. New subaccounts use the configured rate
4. Existing subaccounts retain their original rate

**Acceptance Criteria:**
- Commission rate is configurable
- Changes apply to new accounts only
- Historical rates preserved for existing accounts

---

### Attendee (Ticket Buyer)

#### Story 7: Purchasing a Ticket with Fiat

> As an attendee, I want to buy a ticket using my Nigerian bank card so I can attend the event.

**Flow:**
1. Attendee views event with fiat payment enabled
2. Clicks "Get Tickets" and selects "Pay with Card/Bank"
3. Enters email and phone number
4. Paystack checkout opens
5. Completes payment (card, bank transfer, or USSD)
6. Receives ticket confirmation
7. NFT ticket is minted to their wallet

**Acceptance Criteria:**
- Seamless Paystack checkout experience
- Clear confirmation after payment
- Ticket appears in "My Tickets"
- Payment split is invisible to attendee

#### Story 8: Event Without Verified Payout Account

> As an attendee, I should not be able to pay with fiat if the creator hasn't set up their payout account.

**Flow:**
1. Attendee views event
2. Creator has no verified payout account
3. Fiat payment option is hidden or disabled
4. Only crypto payment options shown
5. Attendee can still purchase with crypto

**Acceptance Criteria:**
- Fiat option only shows for verified vendors
- Clear UX (option hidden, not broken)
- Crypto payments always available

---

## API Reference

### Resolve Bank Account

```bash
GET /functions/v1/resolve-bank-account?account_number=0123456789&bank_code=044
```

**Response (Success):**
```json
{
  "ok": true,
  "account_number": "0123456789",
  "account_name": "JOHN DOE",
  "bank_id": 1
}
```

**Response (Error):**
```json
{
  "ok": false,
  "error": "Could not resolve account number",
  "details": "Please verify the account number and bank are correct."
}
```

### Submit Payout Account

```bash
POST /functions/v1/submit-payout-account
Headers:
  X-Privy-Authorization: Bearer <token>
Body:
{
  "business_name": "JOHN DOE",
  "settlement_bank_code": "044",
  "settlement_bank_name": "Access Bank",
  "account_number": "0123456789"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "payout_account": {
    "id": "uuid",
    "status": "verified",
    "business_name": "JOHN DOE",
    "account_number": "****6789",
    "provider_account_code": "ACCT_xxx",
    "percentage_charge": 5
  }
}
```

### Get Vendor Payout Account

```bash
GET /functions/v1/get-vendor-payout-account
Headers:
  X-Privy-Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "payout_account": {
    "id": "uuid",
    "status": "verified",
    "business_name": "JOHN DOE",
    "account_number": "****6789",
    "settlement_bank_name": "Access Bank"
  },
  "can_receive_fiat_payments": true
}
```

## Security Considerations

1. **Account Holder Name as Business Name**: The verified account holder name from Paystack is used as the business name. This prevents vendors from entering arbitrary names that don't match their bank account, reducing fraud and payment disputes.

2. **RLS Policies**: Vendors can only view/edit their own payout accounts. Service role required for admin operations.

3. **Masked Account Numbers**: Account numbers are masked in API responses (e.g., `****6789`).

4. **Admin Audit Trail**: Suspensions include who suspended, when, and why.

5. **Verification Required**: Only verified accounts can receive payments.

## Configuration

### Environment Variables

**Frontend (.env):**
```
VITE_NODE_ENV="development"  # or "production"
VITE_SUPABASE_URL="..."
VITE_SUPABASE_ANON_KEY="..."
```

**Edge Functions:**
```
PAYSTACK_SECRET_KEY="sk_test_xxx"  # or sk_live_xxx for production
SUPABASE_URL="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

### Platform Config (Database)

```sql
-- Default commission rate
INSERT INTO platform_config (key, value) VALUES
  ('default_payout_commission', '{"percentage": 5}');
```

## Testing

### Development Testing

1. Set `VITE_NODE_ENV="development"` in `.env`
2. Only "Test Bank (Development)" will appear in dropdown
3. Enter any 10-digit number as account number
4. System uses Paystack test bank code `001`
5. Account resolves successfully without daily limits

### Production Testing

1. Set `VITE_NODE_ENV="production"` (or remove the variable)
2. Real Nigerian banks appear in dropdown
3. Use real bank account details
4. Note: Paystack test mode allows 3 real bank resolves/day

## Future Enhancements

- Email notifications for verification status changes
- Support for additional payment providers (Stripe, M-Pesa)
- Vendor payout history and analytics
- Automatic retry of failed settlements
- Multi-currency support (GHS for Ghana)

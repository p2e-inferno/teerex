/**
 * Shared Paystack API utilities for subaccount management
 * Used by vendor payout account edge functions
 */

// const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// ============================================================================
// Types
// ============================================================================

export interface PaystackSubaccountCreateParams {
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
  primary_contact_email?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackSubaccountData {
  id: number;
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
  is_verified: boolean;
  settlement_schedule: string;
  active: boolean;
  migrate: boolean;
  currency: string;
}

export interface PaystackSubaccountResponse {
  status: boolean;
  message: string;
  data: PaystackSubaccountData;
}

export interface PaystackBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: string | null;
  pay_with_bank: boolean;
  active: boolean;
  country: string;
  currency: string;
  type: string;
}

export interface PaystackBankListResponse {
  status: boolean;
  message: string;
  data: PaystackBank[];
}

export interface PaystackAccountResolveData {
  account_number: string;
  account_name: string;
  bank_id: number;
}

export interface PaystackAccountResolveResponse {
  status: boolean;
  message: string;
  data: PaystackAccountResolveData;
}

export interface PaystackTransactionVerifyData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  created_at?: string | null;
  channel?: string | null;
  gateway_response?: string | null;
  message?: string | null;
  customer?: { email?: string | null } | null;
  authorization?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface PaystackTransactionVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackTransactionVerifyData;
}

export interface PaystackTransferRecipientCreateParams {
  type: "nuban";
  name: string;
  account_number: string;
  bank_code: string;
  currency: "NGN";
  metadata?: Record<string, unknown>;
}

export interface PaystackTransferRecipientData {
  id: number;
  recipient_code: string;
  name: string;
  type: string;
  currency: string;
  active: boolean;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

export interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: PaystackTransferRecipientData;
}

export interface PaystackTransferInitiateParams {
  source: "balance";
  amount: number;
  recipient: string;
  reference: string;
  reason?: string;
  currency?: "NGN";
}

export interface PaystackTransferData {
  id: number;
  amount: number;
  currency: string;
  reference: string;
  source: string;
  reason?: string | null;
  status: string;
  transfer_code: string;
  recipient?: unknown;
  failures?: unknown;
  gateway_response?: string | null;
  transferred_at?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: PaystackTransferData;
}

export interface PaystackBalance {
  currency: string;
  balance: number;
}

export interface PaystackBalanceResponse {
  status: boolean;
  message: string;
  data: PaystackBalance[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPaystackHeaders(): HeadersInit {
  const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

function isPaystackTestMode(): boolean {
  return String(Deno.env.get("PAYSTACK_SECRET_KEY") || "").startsWith("sk_test_");
}

function isPaystackTestTransferAccount(accountNumber: string, bankCode: string): boolean {
  return bankCode === "057" && accountNumber === "0000000000";
}

// ============================================================================
// Subaccount API
// ============================================================================

/**
 * Create a Paystack subaccount for a vendor
 * @see https://paystack.com/docs/api/subaccount/#create
 */
export async function createPaystackSubaccount(
  params: PaystackSubaccountCreateParams
): Promise<PaystackSubaccountResponse> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/subaccount`, {
    method: "POST",
    headers: getPaystackHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to create Paystack subaccount");
  }

  return data as PaystackSubaccountResponse;
}

/**
 * Fetch a specific subaccount by code or ID
 * @see https://paystack.com/docs/api/subaccount/#fetch
 */
export async function fetchPaystackSubaccount(
  idOrCode: string
): Promise<PaystackSubaccountResponse> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/subaccount/${idOrCode}`, {
    method: "GET",
    headers: getPaystackHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to fetch Paystack subaccount");
  }

  return data as PaystackSubaccountResponse;
}

/**
 * Update a Paystack subaccount
 * @see https://paystack.com/docs/api/subaccount/#update
 */
export async function updatePaystackSubaccount(
  idOrCode: string,
  params: Partial<PaystackSubaccountCreateParams> & { active?: boolean }
): Promise<PaystackSubaccountResponse> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/subaccount/${idOrCode}`, {
    method: "PUT",
    headers: getPaystackHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to update Paystack subaccount");
  }

  return data as PaystackSubaccountResponse;
}

// ============================================================================
// Bank API
// ============================================================================

/**
 * List all Nigerian banks with codes
 * @see https://paystack.com/docs/api/miscellaneous/#bank
 */
export async function listNigerianBanks(): Promise<PaystackBank[]> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/bank?country=nigeria&perPage=100`,
    {
      method: "GET",
      headers: getPaystackHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to fetch Nigerian banks");
  }

  return (data as PaystackBankListResponse).data;
}

/**
 * Verify/resolve an account number with bank code
 * Returns the account holder name if valid
 * @see https://paystack.com/docs/api/verification/#resolve-account
 */
export async function verifyAccountNumber(
  accountNumber: string,
  bankCode: string
): Promise<PaystackAccountResolveResponse> {
  if (isPaystackTestMode() && isPaystackTestTransferAccount(accountNumber, bankCode)) {
    return {
      status: true,
      message: "Account number resolved",
      data: {
        account_number: accountNumber,
        account_name: "Test",
        bank_id: 0,
      },
    };
  }

  const response = await fetch(
    `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(
      accountNumber
    )}&bank_code=${encodeURIComponent(bankCode)}`,
    {
      method: "GET",
      headers: getPaystackHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to verify account number");
  }

  return data as PaystackAccountResolveResponse;
}

// ============================================================================
// Transaction API
// ============================================================================

/**
 * Verify a Paystack transaction by reference.
 * @see https://paystack.com/docs/api/transaction/#verify
 */
export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackTransactionVerifyResponse> {
  const ref = String(reference || "").trim();
  if (!ref) throw new Error("reference_required");

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: getPaystackHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to verify Paystack transaction");
  }

  return data as PaystackTransactionVerifyResponse;
}

/**
 * Initiate a refund for a transaction. Omitting amount refunds it in full. Refunds settle
 * asynchronously (Paystack emits refund.processed/failed later); a successful response here means
 * the refund was accepted, not yet settled.
 * @see https://paystack.com/docs/api/refund/#create
 */
export async function refundPaystackTransaction(params: {
  reference: string;
  amountKobo?: number;
  customerNote?: string;
  merchantNote?: string;
}): Promise<{ ok: boolean; data?: any; error?: string }> {
  const ref = String(params.reference || "").trim();
  if (!ref) return { ok: false, error: "reference_required" };

  const body: Record<string, unknown> = { transaction: ref };
  if (params.amountKobo != null) body.amount = params.amountKobo;
  if (params.customerNote) body.customer_note = params.customerNote;
  if (params.merchantNote) body.merchant_note = params.merchantNote;

  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
      method: "POST",
      headers: getPaystackHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "paystack_refund_network_error" };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status) {
    return { ok: false, error: data?.message || `paystack_refund_failed_${response.status}`, data };
  }
  return { ok: true, data: data.data };
}

/**
 * Retry a refund that Paystack marked as needing customer bank details.
 * @see https://paystack.com/docs/api/refund/#retry
 */
export async function retryPaystackRefundWithCustomerDetails(params: {
  refundId: string | number;
  accountNumber: string;
  bankId: string | number;
  currency?: "NGN";
}): Promise<{ ok: boolean; data?: any; error?: string }> {
  const refundId = String(params.refundId || "").trim();
  if (!refundId) return { ok: false, error: "refund_id_required" };

  const body = {
    refund_account_details: {
      currency: params.currency || "NGN",
      account_number: String(params.accountNumber || "").trim(),
      bank_id: String(params.bankId || "").trim(),
    },
  };
  if (!body.refund_account_details.account_number || !body.refund_account_details.bank_id) {
    return { ok: false, error: "refund_account_details_required" };
  }

  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/refund/retry_with_customer_details/${encodeURIComponent(refundId)}`, {
      method: "POST",
      headers: getPaystackHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "paystack_refund_retry_network_error" };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.status) {
    return { ok: false, error: data?.message || `paystack_refund_retry_failed_${response.status}`, data };
  }
  return { ok: true, data: data.data };
}

// ============================================================================
// Transfer Recipient API
// ============================================================================

/**
 * Create a Paystack transfer recipient for user redemptions.
 * @see https://paystack.com/docs/api/transfer-recipient/#create
 */
export async function createPaystackTransferRecipient(
  params: PaystackTransferRecipientCreateParams
): Promise<PaystackTransferRecipientResponse> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transferrecipient`, {
    method: "POST",
    headers: getPaystackHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to create Paystack transfer recipient");
  }

  return data as PaystackTransferRecipientResponse;
}

// ============================================================================
// Transfer API
// ============================================================================

/**
 * Initiate a Paystack transfer from the integration balance.
 * @see https://paystack.com/docs/api/transfer/#initiate
 */
export async function initiatePaystackTransfer(
  params: PaystackTransferInitiateParams
): Promise<PaystackTransferResponse> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transfer`, {
    method: "POST",
    headers: getPaystackHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to initiate Paystack transfer");
  }

  return data as PaystackTransferResponse;
}

/**
 * Verify a Paystack transfer by reference.
 * @see https://paystack.com/docs/api/transfer/#verify
 */
export async function verifyPaystackTransfer(
  reference: string
): Promise<PaystackTransferResponse> {
  const ref = String(reference || "").trim();
  if (!ref) throw new Error("reference_required");

  const response = await fetch(`${PAYSTACK_BASE_URL}/transfer/verify/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: getPaystackHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to verify Paystack transfer");
  }

  return data as PaystackTransferResponse;
}

// ============================================================================
// Transfer Control API
// ============================================================================

/**
 * Fetch available Paystack integration balances.
 * @see https://paystack.com/docs/api/transfer-control/#check-balance
 */
export async function getPaystackBalances(): Promise<PaystackBalance[]> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/balance`, {
    method: "GET",
    headers: getPaystackHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to fetch Paystack balance");
  }

  return (data as PaystackBalanceResponse).data;
}

// ============================================================================
// Utility Functions
// ============================================================================

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Computes expected Paystack amount in minor units (eg kobo) from a fiat amount in major units.
 * Prefer `priceFiat` when available, fall back to `amountFiat`.
 */
export function getExpectedPaystackAmountKobo(params: {
  priceFiatKobo?: unknown;
  amountFiatKobo?: unknown;
  priceFiat?: unknown;
  amountFiat?: unknown;
}): number {
  const direct = asNumber(params.priceFiatKobo) ?? asNumber(params.amountFiatKobo);
  if (direct !== null) return direct;
  const expectedFiat = asNumber(params.priceFiat) ?? asNumber(params.amountFiat) ?? 0;
  return Math.round(expectedFiat * 100);
}

/**
 * Resolves expected fiat currency (uppercased) from order/bundle fields.
 */
export function getExpectedFiatCurrency(params: {
  orderCurrency?: unknown;
  bundleCurrency?: unknown;
  defaultCurrency?: string;
}): string {
  return String(params.orderCurrency || params.bundleCurrency || params.defaultCurrency || "NGN").toUpperCase();
}

/**
 * Validates Paystack amount/currency against expected values.
 * `paystackAmountKobo` is the amount in minor units (eg kobo), as returned by Paystack.
 */
export function verifyPaystackAmountAndCurrency(params: {
  paystackAmountKobo: unknown;
  paystackCurrency: unknown;
  expectedAmountKobo: number;
  expectedCurrency: string;
}): string[] {
  const amount = asNumber(params.paystackAmountKobo);
  const currency = String(params.paystackCurrency || "").toUpperCase();
  const issues: string[] = [];
  if (!currency || currency !== params.expectedCurrency) issues.push("currency_mismatch");
  if (amount === null || amount !== params.expectedAmountKobo) issues.push("amount_mismatch");
  return issues;
}

/**
 * Mask account number for display (show last 4 digits)
 * e.g., "0123456789" -> "****6789"
 */
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) {
    return "****";
  }
  return "****" + accountNumber.slice(-4);
}

/**
 * Validate Nigerian bank account number format (10 digits)
 */
export function isValidNigerianAccountNumber(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber);
}

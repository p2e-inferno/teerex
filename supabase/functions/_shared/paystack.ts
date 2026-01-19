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

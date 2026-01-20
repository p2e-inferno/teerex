/**
 * Pluggable Verification Module for Vendor Payout Accounts
 *
 * This module provides a strategy pattern for vendor verification.
 * Different verification strategies can be swapped via configuration
 * without changing the subaccount creation logic.
 *
 * Supported strategies:
 * - paystack_account: Verify bank account via Paystack API (default)
 * - bvn: Bank Verification Number (future)
 * - unlock_key: Verify user has valid Unlock Protocol key (future)
 * - gooddollar: GoodDollar face verification (future)
 * - manual: Await manual admin approval (fallback)
 */

import { verifyAccountNumber } from "./paystack.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a verification check
 */
export interface VerificationResult {
  verified: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  retryHint?: string; // User-facing hint on how to fix the issue
}

/**
 * Context for verification - contains all data needed by any strategy
 */
export interface VerificationContext {
  vendor_id: string;
  provider: string;
  business_name: string;

  // Bank verification fields (Paystack)
  settlement_bank_code?: string;
  account_number?: string;

  // Future strategy fields
  wallet_address?: string; // For Unlock key check
  bvn?: string; // For BVN verification
  phone_number?: string; // For mobile money
}

/**
 * Available verification strategies
 */
export type VerificationStrategy =
  | "paystack_account"
  | "bvn"
  | "unlock_key"
  | "gooddollar"
  | "manual";

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * Paystack Account Resolve strategy (default)
 * Verifies bank account exists and returns account holder name
 */
async function verifyPaystackAccount(
  ctx: VerificationContext
): Promise<VerificationResult> {
  if (!ctx.settlement_bank_code || !ctx.account_number) {
    return {
      verified: false,
      error: "Bank code and account number are required",
      retryHint: "Please provide your bank and account number",
    };
  }

  // Validate account number format (Nigerian banks use 10 digits)
  if (!/^\d{10}$/.test(ctx.account_number)) {
    return {
      verified: false,
      error: "Invalid account number format",
      retryHint: "Nigerian bank account numbers must be exactly 10 digits",
    };
  }

  try {
    const result = await verifyAccountNumber(
      ctx.account_number,
      ctx.settlement_bank_code
    );

    return {
      verified: true,
      metadata: {
        account_name: result.data.account_name,
        bank_id: result.data.bank_id,
        verified_account_number: result.data.account_number,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Parse common Paystack errors for user-friendly messages
    let retryHint = "Please verify your bank details and try again";
    if (message.toLowerCase().includes("could not resolve")) {
      retryHint = "Account number not found. Please check your account number.";
    } else if (message.toLowerCase().includes("invalid bank")) {
      retryHint = "Invalid bank selected. Please choose the correct bank.";
    }

    return {
      verified: false,
      error: message,
      retryHint,
    };
  }
}

/**
 * BVN Verification strategy (future implementation)
 */
async function verifyBVN(
  _ctx: VerificationContext
): Promise<VerificationResult> {
  // TODO: Implement BVN verification when needed
  return {
    verified: false,
    error: "BVN verification is not yet implemented",
    retryHint: "Please use bank account verification instead",
  };
}

/**
 * Unlock Protocol Key Check strategy (future implementation)
 * Verifies user holds a valid key from a specific lock
 */
async function verifyUnlockKey(
  _ctx: VerificationContext
): Promise<VerificationResult> {
  // TODO: Implement Unlock key verification when needed
  return {
    verified: false,
    error: "Unlock key verification is not yet implemented",
    retryHint: "Please use bank account verification instead",
  };
}

/**
 * GoodDollar Face Verification strategy (future implementation)
 */
async function verifyGoodDollar(
  _ctx: VerificationContext
): Promise<VerificationResult> {
  // TODO: Implement GoodDollar verification when needed
  return {
    verified: false,
    error: "GoodDollar verification is not yet implemented",
    retryHint: "Please use bank account verification instead",
  };
}

/**
 * Manual Approval strategy (fallback)
 * Returns pending status - admin must approve manually
 */
async function verifyManual(
  _ctx: VerificationContext
): Promise<VerificationResult> {
  return {
    verified: false,
    error: "Awaiting manual review by platform administrators",
    retryHint:
      "Your account is pending manual review. We will notify you once approved.",
  };
}

// ============================================================================
// Main Verification Function
// ============================================================================

/**
 * Verify a vendor using the specified strategy
 *
 * @param context - Verification context with vendor and account data
 * @param strategy - Which verification strategy to use
 * @returns VerificationResult with verified status and metadata
 */
export async function verifyVendor(
  context: VerificationContext,
  strategy: VerificationStrategy
): Promise<VerificationResult> {
  switch (strategy) {
    case "paystack_account":
      return await verifyPaystackAccount(context);
    case "bvn":
      return await verifyBVN(context);
    case "unlock_key":
      return await verifyUnlockKey(context);
    case "gooddollar":
      return await verifyGoodDollar(context);
    case "manual":
      return await verifyManual(context);
    default:
      return {
        verified: false,
        error: `Unknown verification strategy: ${strategy}`,
        retryHint: "Please contact support",
      };
  }
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get the configured verification strategy for the platform
 * Can be overridden via VENDOR_VERIFICATION_STRATEGY environment variable
 */
export function getVerificationStrategy(): VerificationStrategy {
  const configured = Deno.env.get("VENDOR_VERIFICATION_STRATEGY");

  // Validate configured strategy
  const validStrategies: VerificationStrategy[] = [
    "paystack_account",
    "bvn",
    "unlock_key",
    "gooddollar",
    "manual",
  ];

  if (configured && validStrategies.includes(configured as VerificationStrategy)) {
    return configured as VerificationStrategy;
  }

  // Default to paystack_account
  return "paystack_account";
}

/**
 * Check if a verification strategy is available/implemented
 */
export function isStrategyAvailable(strategy: VerificationStrategy): boolean {
  const availableStrategies: VerificationStrategy[] = [
    "paystack_account",
    "manual",
  ];
  return availableStrategies.includes(strategy);
}

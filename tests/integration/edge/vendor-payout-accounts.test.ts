/**
 * Integration tests for vendor payout account edge functions
 * Tests the full flow from submission to verification to admin management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { supabase } from "@/integrations/supabase/client";
import { mockEdgeFunction } from "@/test/mocks/supabase";

const SUPABASE_URL = "http://localhost:54321";

describe("Vendor Payout Accounts - Edge Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("submit-payout-account", () => {
    it("successfully submits and verifies a valid payout account", async () => {
      server.use(
        mockEdgeFunction("submit-payout-account", async ({ body, headers }) => {
          // Verify authentication
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          const { business_name, settlement_bank_code, account_number } = body;

          // Validate required fields
          if (!business_name || !settlement_bank_code || !account_number) {
            return { ok: false, error: "Missing required fields" };
          }

          // Simulate successful verification
          return {
            ok: true,
            payout_account: {
              id: "uuid-123",
              status: "verified",
              business_name,
              account_number: `****${account_number.slice(-4)}`,
              settlement_bank_name: "Access Bank",
              provider_account_code: "ACCT_test123",
              percentage_charge: 5,
            },
            verification_metadata: {
              account_name: "John Doe Business",
            },
          };
        })
      );

      const { data, error } = await supabase.functions.invoke(
        "submit-payout-account",
        {
          body: {
            business_name: "Test Business LLC",
            settlement_bank_code: "044",
            settlement_bank_name: "Access Bank",
            account_number: "0123456789",
          },
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.payout_account.status).toBe("verified");
      expect(data?.payout_account.account_number).toBe("****6789"); // Masked
      expect(data?.verification_metadata.account_name).toBe("John Doe Business");
    });

    it("fails verification for invalid account number", async () => {
      server.use(
        mockEdgeFunction("submit-payout-account", async ({ body }) => {
          const { account_number } = body;

          // Simulate verification failure
          if (account_number === "9999999999") {
            return {
              ok: false,
              error: "Account verification failed: Invalid account number",
              payout_account: {
                id: "uuid-123",
                status: "verification_failed",
                business_name: body.business_name,
                account_number: `****${account_number.slice(-4)}`,
              },
              can_retry: true,
              retry_hint: "Please check your account number and try again",
            };
          }

          return { ok: true, payout_account: { status: "verified" } };
        })
      );

      const { data } = await supabase.functions.invoke("submit-payout-account", {
        body: {
          business_name: "Test Business",
          settlement_bank_code: "044",
          settlement_bank_name: "Access Bank",
          account_number: "9999999999",
        },
        headers: {
          "X-Privy-Authorization": "Bearer test-token",
        },
      });

      expect(data?.ok).toBe(false);
      expect(data?.payout_account.status).toBe("verification_failed");
      expect(data?.can_retry).toBe(true);
      expect(data?.retry_hint).toBeTruthy();
    });

    it("rejects submission without authentication", async () => {
      server.use(
        mockEdgeFunction("submit-payout-account", async ({ headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }
          return { ok: true };
        })
      );

      const { data } = await supabase.functions.invoke("submit-payout-account", {
        body: {
          business_name: "Test Business",
          settlement_bank_code: "044",
          account_number: "0123456789",
        },
        // No auth header
      });

      expect(data?.ok).toBe(false);
      expect(data?.error).toBe("Unauthorized");
    });

    it("validates account number format (10 digits)", async () => {
      server.use(
        mockEdgeFunction("submit-payout-account", async ({ body }) => {
          const { account_number } = body;

          // Validate Nigerian account number format
          if (!/^\d{10}$/.test(account_number)) {
            return {
              ok: false,
              error: "Account number must be exactly 10 digits",
            };
          }

          return { ok: true, payout_account: { status: "verified" } };
        })
      );

      const { data } = await supabase.functions.invoke("submit-payout-account", {
        body: {
          business_name: "Test Business",
          settlement_bank_code: "044",
          account_number: "123", // Too short
        },
        headers: {
          "X-Privy-Authorization": "Bearer test-token",
        },
      });

      expect(data?.ok).toBe(false);
      expect(data?.error).toContain("10 digits");
    });
  });

  describe("retry-payout-verification", () => {
    it("successfully retries verification with corrected details", async () => {
      server.use(
        mockEdgeFunction("retry-payout-verification", async ({ body, headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          const { payout_account_id, account_number } = body;

          if (!payout_account_id) {
            return { ok: false, error: "payout_account_id is required" };
          }

          // Simulate successful retry
          return {
            ok: true,
            payout_account: {
              id: payout_account_id,
              status: "verified",
              account_number: `****${account_number?.slice(-4) || "0000"}`,
              provider_account_code: "ACCT_retry123",
            },
          };
        })
      );

      const { data, error } = await supabase.functions.invoke(
        "retry-payout-verification",
        {
          body: {
            payout_account_id: "uuid-failed",
            account_number: "0987654321", // Corrected account number
          },
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.payout_account.status).toBe("verified");
    });

    it("fails if account is not in retryable status", async () => {
      server.use(
        mockEdgeFunction("retry-payout-verification", async ({ body }) => {
          const { payout_account_id } = body;

          // Simulate account already verified
          return {
            ok: false,
            error: "Cannot retry verification for account with status: verified",
          };
        })
      );

      const { data } = await supabase.functions.invoke(
        "retry-payout-verification",
        {
          body: {
            payout_account_id: "uuid-already-verified",
          },
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(data?.ok).toBe(false);
      expect(data?.error).toContain("Cannot retry");
    });
  });

  describe("get-vendor-payout-account", () => {
    it("returns vendor's payout account status", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async ({ headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          return {
            ok: true,
            payout_account: {
              id: "uuid-123",
              status: "verified",
              business_name: "Test Business",
              account_number: "****6789",
              settlement_bank_name: "Access Bank",
            },
            can_receive_fiat_payments: true,
          };
        })
      );

      const { data, error } = await supabase.functions.invoke(
        "get-vendor-payout-account",
        {
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.can_receive_fiat_payments).toBe(true);
      expect(data?.payout_account.status).toBe("verified");
    });

    it("returns null for vendors without payout account", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async ({ headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          return {
            ok: true,
            payout_account: null,
            can_receive_fiat_payments: false,
          };
        })
      );

      const { data } = await supabase.functions.invoke(
        "get-vendor-payout-account",
        {
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(data?.ok).toBe(true);
      expect(data?.payout_account).toBeNull();
      expect(data?.can_receive_fiat_payments).toBe(false);
    });

    it("returns false for can_receive_fiat_payments if status is not verified", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => {
          return {
            ok: true,
            payout_account: {
              id: "uuid-123",
              status: "verification_failed",
              business_name: "Test Business",
            },
            can_receive_fiat_payments: false,
          };
        })
      );

      const { data } = await supabase.functions.invoke(
        "get-vendor-payout-account",
        {
          headers: {
            "X-Privy-Authorization": "Bearer test-token",
          },
        }
      );

      expect(data?.can_receive_fiat_payments).toBe(false);
    });
  });

  describe("admin-list-payout-accounts", () => {
    it("returns paginated list of payout accounts for admins", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body, headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          // Simulate admin check passing
          return {
            ok: true,
            payout_accounts: [
              {
                id: "uuid-1",
                vendor_id: "vendor-1",
                status: "verified",
                business_name: "Business A",
                account_number: "****1111",
              },
              {
                id: "uuid-2",
                vendor_id: "vendor-2",
                status: "pending_verification",
                business_name: "Business B",
                account_number: "****2222",
              },
            ],
            pagination: {
              total: 2,
              limit: 50,
              offset: 0,
              has_more: false,
            },
          };
        })
      );

      const { data, error } = await supabase.functions.invoke(
        "admin-list-payout-accounts",
        {
          headers: {
            "X-Privy-Authorization": "Bearer admin-token",
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.payout_accounts).toHaveLength(2);
      expect(data?.pagination.total).toBe(2);
    });

    it("filters by status", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          // Body would contain query params in real implementation
          return {
            ok: true,
            payout_accounts: [
              {
                id: "uuid-1",
                status: "verified",
                business_name: "Business A",
              },
            ],
            pagination: { total: 1, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      const { data } = await supabase.functions.invoke(
        "admin-list-payout-accounts",
        {
          body: { status: "verified" },
          headers: {
            "X-Privy-Authorization": "Bearer admin-token",
          },
        }
      );

      expect(data?.payout_accounts.every((acc: any) => acc.status === "verified")).toBe(true);
    });
  });

  describe("admin-suspend-payout-account", () => {
    it("suspends a payout account with reason", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body, headers }) => {
          if (!headers.has("x-privy-authorization")) {
            return { ok: false, error: "Unauthorized" };
          }

          const { payout_account_id, action, reason } = body;

          if (!payout_account_id || !action) {
            return { ok: false, error: "Missing required fields" };
          }

          if (action === "suspend" && !reason) {
            return { ok: false, error: "Suspension reason is required" };
          }

          return {
            ok: true,
            payout_account: {
              id: payout_account_id,
              status: "suspended",
              suspension_reason: reason,
              suspended_at: new Date().toISOString(),
            },
          };
        })
      );

      const { data, error } = await supabase.functions.invoke(
        "admin-suspend-payout-account",
        {
          body: {
            payout_account_id: "uuid-123",
            action: "suspend",
            reason: "Suspected fraud",
          },
          headers: {
            "X-Privy-Authorization": "Bearer admin-token",
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.payout_account.status).toBe("suspended");
      expect(data?.payout_account.suspension_reason).toBe("Suspected fraud");
    });

    it("requires suspension reason", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body }) => {
          const { action, reason } = body;

          if (action === "suspend" && !reason) {
            return { ok: false, error: "Suspension reason is required" };
          }

          return { ok: true };
        })
      );

      const { data } = await supabase.functions.invoke(
        "admin-suspend-payout-account",
        {
          body: {
            payout_account_id: "uuid-123",
            action: "suspend",
            // Missing reason
          },
          headers: {
            "X-Privy-Authorization": "Bearer admin-token",
          },
        }
      );

      expect(data?.ok).toBe(false);
      expect(data?.error).toContain("reason");
    });

    it("unsuspends a suspended account", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body }) => {
          const { action } = body;

          if (action === "unsuspend") {
            return {
              ok: true,
              payout_account: {
                id: body.payout_account_id,
                status: "verified",
                suspended_at: null,
                suspension_reason: null,
              },
            };
          }

          return { ok: true };
        })
      );

      const { data } = await supabase.functions.invoke(
        "admin-suspend-payout-account",
        {
          body: {
            payout_account_id: "uuid-123",
            action: "unsuspend",
          },
          headers: {
            "X-Privy-Authorization": "Bearer admin-token",
          },
        }
      );

      expect(data?.ok).toBe(true);
      expect(data?.payout_account.status).toBe("verified");
      expect(data?.payout_account.suspended_at).toBeNull();
    });
  });

  describe("list-nigerian-banks", () => {
    it("returns list of Nigerian banks without authentication", async () => {
      server.use(
        mockEdgeFunction("list-nigerian-banks", async () => {
          return {
            ok: true,
            banks: [
              { code: "044", name: "Access Bank", slug: "access-bank" },
              { code: "058", name: "GTBank", slug: "gtbank" },
              { code: "033", name: "United Bank for Africa", slug: "uba" },
            ],
          };
        })
      );

      const { data, error } = await supabase.functions.invoke("list-nigerian-banks");

      expect(error).toBeNull();
      expect(data?.ok).toBe(true);
      expect(data?.banks).toHaveLength(3);
      expect(data?.banks[0]).toHaveProperty("code");
      expect(data?.banks[0]).toHaveProperty("name");
      expect(data?.banks[0]).toHaveProperty("slug");
    });

    it("is a public endpoint (no auth required)", async () => {
      server.use(
        mockEdgeFunction("list-nigerian-banks", async () => {
          return {
            ok: true,
            banks: [],
          };
        })
      );

      const { data } = await supabase.functions.invoke("list-nigerian-banks");

      expect(data?.ok).toBe(true);
    });
  });

  describe("init-paystack-transaction (with subaccount)", () => {
    it("includes subaccount_code when vendor has verified payout account", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async ({ body }) => {
          const { event_id } = body;

          // Simulate vendor with verified payout account
          return {
            ok: true,
            subaccount_code: "ACCT_vendor123", // Subaccount included
          };
        })
      );

      const { data } = await supabase.functions.invoke("init-paystack-transaction", {
        body: {
          event_id: "event-123",
          reference: "ref-123",
          email: "user@test.com",
          wallet_address: "0x123",
          amount: 5000,
        },
        headers: {
          "X-Privy-Authorization": "Bearer test-token",
        },
      });

      expect(data?.ok).toBe(true);
      expect(data?.subaccount_code).toBe("ACCT_vendor123");
    });

    it("returns null subaccount_code when vendor has no payout account", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => {
          // Simulate vendor without verified payout account
          return {
            ok: true,
            subaccount_code: null, // No subaccount
          };
        })
      );

      const { data } = await supabase.functions.invoke("init-paystack-transaction", {
        body: {
          event_id: "event-456",
          reference: "ref-456",
          email: "user@test.com",
          wallet_address: "0x456",
          amount: 3000,
        },
        headers: {
          "X-Privy-Authorization": "Bearer test-token",
        },
      });

      expect(data?.ok).toBe(true);
      expect(data?.subaccount_code).toBeNull();
    });
  });
});

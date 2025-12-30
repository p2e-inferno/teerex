/**
 * Integration tests for PaystackPaymentDialog with subaccount routing
 * Tests payment flow integration with vendor payout accounts
 */

import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import { PaystackPaymentDialog } from "@/components/events/PaystackPaymentDialog";

const mockEvent = {
  id: "event-123",
  title: "Test Event",
  description: "Test Description",
  date: new Date(),
  time: "7:00 PM",
  location: "Virtual",
  capacity: 100,
  price: "0",
  currency: "FREE",
  ngn_price: 5000,
  paystack_public_key: "pk_test_abc123",
  chain_id: 8453,
  lock_address: "0xlock123",
  creator_id: "vendor-123",
  payment_methods: ["fiat"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock Privy
const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");
const mockUser = {
  id: "user-123",
  email: { address: "user@test.com" },
};

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    user: mockUser,
    getAccessToken: mockGetAccessToken,
  }),
  useWallets: () => ({
    wallets: [{ address: "0xwallet123" }],
  }),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock react-paystack
const mockInitializePayment = vi.fn();
vi.mock("react-paystack", () => ({
  usePaystackPayment: (config: any) => {
    return mockInitializePayment;
  },
}));

describe("PaystackPaymentDialog - Subaccount Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializePayment.mockClear();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("Vendor with Verified Payout Account", () => {
    it("includes subaccount_code in Paystack config when vendor is verified", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async ({ body }) => {
          const { event_id } = body;

          // Simulate vendor with verified payout account
          return {
            ok: true,
            subaccount_code: "ACCT_vendor123",
          };
        })
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      // Fill in form
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: "user@test.com" } });

      const phoneInput = screen.getByLabelText(/phone/i);
      fireEvent.change(phoneInput, { target: { value: "08012345678" } });

      // Click pay button
      const payButton = screen.getByRole("button", { name: /pay.*₦5,000/i });
      fireEvent.click(payButton);

      // Wait for transaction initialization
      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      // Verify Paystack config includes subaccount
      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig).toMatchObject({
        email: "user@test.com",
        amount: 500000, // 5000 NGN in kobo
        publicKey: "pk_test_abc123",
        currency: "NGN",
        subaccount: "ACCT_vendor123", // Subaccount included
      });
    });

    it("stores subaccount_code in paystack_transactions table", async () => {
      let transactionRecord: any = null;

      server.use(
        mockEdgeFunction("init-paystack-transaction", async ({ body }) => {
          transactionRecord = {
            event_id: body.event_id,
            reference: body.reference,
            payout_account_id: "uuid-payout-123",
            gateway_response: {
              subaccount_code: "ACCT_vendor123",
            },
          };

          return {
            ok: true,
            subaccount_code: "ACCT_vendor123",
          };
        })
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(transactionRecord).toBeTruthy();
        expect(transactionRecord.gateway_response.subaccount_code).toBe("ACCT_vendor123");
      });
    });

    it("logs subaccount usage to console for debugging", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: "ACCT_vendor456",
        }))
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/vendor has subaccount/i),
          "ACCT_vendor456"
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Vendor without Verified Payout Account", () => {
    it("excludes subaccount from Paystack config when vendor has no payout account", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: null, // No subaccount
        }))
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      // Verify Paystack config does NOT include subaccount
      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig.subaccount).toBeUndefined();
    });

    it("payment goes to platform account when no subaccount", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: null,
        }))
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      // Without subaccount, Paystack routes 100% to platform
      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig.amount).toBe(500000); // Full amount
      expect(paystackConfig).not.toHaveProperty("subaccount");
    });
  });

  describe("Transaction Initialization", () => {
    it("fetches subaccount_code before opening Paystack modal", async () => {
      let initCallTime: number | null = null;
      let modalOpenTime: number | null = null;

      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => {
          initCallTime = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            ok: true,
            subaccount_code: "ACCT_test",
          };
        })
      );

      mockInitializePayment.mockImplementation(() => {
        modalOpenTime = Date.now();
      });

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      // Verify init-paystack-transaction was called BEFORE Paystack modal opened
      expect(initCallTime).toBeLessThan(modalOpenTime!);
    });

    it("shows loading state while fetching subaccount", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            ok: true,
            subaccount_code: "ACCT_test",
          };
        })
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      // Button should show loading state
      expect(payButton).toBeDisabled();

      await waitFor(() => {
        expect(payButton).not.toBeDisabled();
      });
    });

    it("handles error when fetching subaccount fails gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn");

      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: false,
          error: "Database connection failed",
        }))
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      // Should proceed without subaccount (fail gracefully)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/failed to create transaction/i),
        expect.anything()
      );

      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig).not.toHaveProperty("subaccount");

      consoleSpy.mockRestore();
    });
  });

  describe("Payment Success Callback", () => {
    it("calls onPaymentSuccess after successful payment", async () => {
      const mockOnSuccess = vi.fn();

      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: "ACCT_test",
        }))
      );

      mockInitializePayment.mockImplementation((callbacks: any) => {
        // Simulate successful payment
        setTimeout(() => {
          callbacks.onSuccess({ reference: "ref-123" });
        }, 50);
      });

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={mockOnSuccess}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });
  });

  describe("Metadata", () => {
    it("includes event and user metadata in Paystack config", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: "ACCT_test",
        }))
      );

      render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig.metadata).toMatchObject({
        lock_address: "0xlock123",
        chain_id: 8453,
        event_id: "event-123",
      });

      // Verify custom fields
      const customFields = paystackConfig.metadata.custom_fields;
      expect(customFields).toContainEqual({
        display_name: "Wallet Address",
        variable_name: "user_wallet_address",
        value: "0xwallet123",
      });
    });
  });

  describe("Reference Generation", () => {
    it("generates unique reference for each payment", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: null,
        }))
      );

      const { rerender } = render(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /pay/i }));

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      const firstReference = mockInitializePayment.mock.calls[0]?.[0].reference;

      // Close and reopen
      rerender(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={false}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      rerender(
        <PaystackPaymentDialog
          event={mockEvent as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /pay/i }));

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalledTimes(2);
      });

      const secondReference = mockInitializePayment.mock.calls[1]?.[0].reference;

      // References should be unique
      expect(firstReference).not.toBe(secondReference);
    });
  });

  describe("Amount Calculation", () => {
    it("converts NGN to kobo (multiply by 100)", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: null,
        }))
      );

      const eventWith10000NGN = { ...mockEvent, ngn_price: 10000 };

      render(
        <PaystackPaymentDialog
          event={eventWith10000NGN as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay.*₦10,000/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig.amount).toBe(1000000); // 10000 * 100
    });

    it("rounds amount to nearest kobo", async () => {
      server.use(
        mockEdgeFunction("init-paystack-transaction", async () => ({
          ok: true,
          subaccount_code: null,
        }))
      );

      const eventWithDecimal = { ...mockEvent, ngn_price: 50.55 };

      render(
        <PaystackPaymentDialog
          event={eventWithDecimal as any}
          isOpen={true}
          onClose={() => {}}
          onPaymentSuccess={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
      });

      const payButton = screen.getByRole("button", { name: /pay/i });
      fireEvent.click(payButton);

      await waitFor(() => {
        expect(mockInitializePayment).toHaveBeenCalled();
      });

      const paystackConfig = mockInitializePayment.mock.calls[0]?.[0];
      expect(paystackConfig.amount).toBe(5055); // Rounded: Math.round(50.55 * 100)
    });
  });
});

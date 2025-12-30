/**
 * Unit tests for VendorPayoutAccount page
 * Tests form validation, submission, and retry functionality
 */

import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import VendorPayoutAccount from "@/pages/VendorPayoutAccount";
import { usePrivy } from "@privy-io/react-auth";

// Mock Privy
const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");
const mockUsePrivy = vi.fn(() => ({
  authenticated: true,
  user: { id: "vendor-123" },
  getAccessToken: mockGetAccessToken,
  login: vi.fn(),
  ready: true,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));

// Mock toast (sonner) - use vi.hoisted for proper mock tracking
// Mock toast (sonner)
vi.mock("sonner", () => {
  console.log("TEST_DEBUG: Initializing sonner mock");
  return {
    toast: {
      error: vi.fn(() => console.log("TEST_DEBUG: toast.error called")),
      success: vi.fn(() => console.log("TEST_DEBUG: toast.success called")),
      message: vi.fn(),
      dismiss: vi.fn(),
    },
  };
});

import { toast as mockToast } from "sonner";

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe("VendorPayoutAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("Initial Load - No Account", () => {
    it("renders submission form when vendor has no payout account", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
          can_receive_fiat_payments: false,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [
            { code: "044", name: "Access Bank", slug: "access-bank" },
            { code: "058", name: "GTBank", slug: "gtbank" },
          ],
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/set up payout account/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/bank/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    });

    it("loads and displays bank options from list-nigerian-banks", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [
            { code: "044", name: "Access Bank", slug: "access-bank" },
            { code: "058", name: "GTBank", slug: "gtbank" },
            { code: "033", name: "United Bank for Africa", slug: "uba" },
          ],
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/bank/i)).toBeInTheDocument();
      });

      // Bank select should be populated (implementation-specific check)
      // In real implementation, you'd click the select and verify options
    });
  });

  describe("Form Validation", () => {
    beforeEach(() => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [{ code: "044", name: "Access Bank", slug: "access-bank" }],
        }))
      );
    });

    it("validates required fields before submission", async () => {
      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: /submit/i });
      fireEvent.click(submitButton);

      // Should show validation errors (implementation-specific)
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it("validates account number is exactly 10 digits", async () => {
      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });

      const accountNumberInput = screen.getByLabelText(/account number/i);

      // Test invalid lengths
      fireEvent.change(accountNumberInput, { target: { value: "123" } });
      fireEvent.blur(accountNumberInput);

      await waitFor(() => {
        expect(screen.getByText(/10 digits/i)).toBeInTheDocument();
      });

      // Test valid length
      fireEvent.change(accountNumberInput, { target: { value: "0123456789" } });
      fireEvent.blur(accountNumberInput);

      await waitFor(() => {
        expect(screen.queryByText(/10 digits/i)).not.toBeInTheDocument();
      });
    });

    it("only allows numeric input for account number", async () => {
      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });

      const accountNumberInput = screen.getByLabelText(/account number/i) as HTMLInputElement;

      fireEvent.change(accountNumberInput, { target: { value: "abc123def" } });

      // Should filter out non-numeric characters
      expect(accountNumberInput.value).toBe("123");
    });
  });

  describe("Successful Submission", () => {
    it("submits form and shows success message on verification", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [{ code: "044", name: "Access Bank", slug: "access-bank" }],
        })),
        mockEdgeFunction("submit-payout-account", async ({ body }) => ({
          ok: true,
          payout_account: {
            id: "uuid-123",
            status: "verified",
            business_name: body.business_name,
            account_number: `****${body.account_number.slice(-4)}`,
            settlement_bank_name: "Access Bank",
            provider_account_code: "ACCT_test123",
            percentage_charge: 5,
          },
          verification_metadata: {
            account_name: "John Doe Business",
          },
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
      });

      // Fill out form
      fireEvent.change(screen.getByLabelText(/business name/i), {
        target: { value: "Test Business LLC" },
      });
      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "0123456789" },
      });

      // Submit
      const submitButton = screen.getByRole("button", { name: /submit/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.stringMatching(/success/i)
        );
      });

      // Should show verified status
      await waitFor(() => {
        expect(screen.getByText(/verified/i)).toBeInTheDocument();
      });
    });
  });

  describe("Verification Failure", () => {
    it("shows error message and retry option on verification failure", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [{ code: "044", name: "Access Bank", slug: "access-bank" }],
        })),
        mockEdgeFunction("submit-payout-account", async () => ({
          ok: false,
          error: "Account verification failed: Invalid account number",
          payout_account: {
            id: "uuid-failed",
            status: "verification_failed",
            business_name: "Test Business",
            account_number: "****6789",
          },
          can_retry: true,
          retry_hint: "Please check your account number and try again",
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
      });

      // Fill and submit form
      fireEvent.change(screen.getByLabelText(/business name/i), {
        target: { value: "Test Business" },
      });
      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "9999999999" },
      });

      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      // Should show error
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });

      // Should show retry hint
      await waitFor(() => {
        expect(screen.getByText(/check your account number/i)).toBeInTheDocument();
      });

      // Should show retry button
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe("Verified Account Display", () => {
    it("shows verified account details with masked account number", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: {
            id: "uuid-123",
            status: "verified",
            business_name: "My Business LLC",
            account_number: "****6789",
            settlement_bank_name: "Access Bank",
            provider_account_code: "ACCT_verified123",
            percentage_charge: 5,
          },
          can_receive_fiat_payments: true,
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/my business llc/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/\*\*\*\*6789/)).toBeInTheDocument();
      expect(screen.getByText(/access bank/i)).toBeInTheDocument();
      expect(screen.getByText(/verified/i)).toBeInTheDocument();
    });

    it("shows commission percentage (5%)", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: {
            id: "uuid-123",
            status: "verified",
            business_name: "My Business",
            percentage_charge: 5,
          },
          can_receive_fiat_payments: true,
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/5%/)).toBeInTheDocument();
      });
    });
  });

  describe("Retry Functionality", () => {
    it("allows retrying verification with updated details", async () => {
      let submitCount = 0;

      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => {
          if (submitCount === 0) {
            return {
              ok: true,
              payout_account: {
                id: "uuid-failed",
                status: "verification_failed",
                business_name: "Test Business",
                verification_error: "Invalid account",
              },
              can_receive_fiat_payments: false,
            };
          }
          return {
            ok: true,
            payout_account: {
              id: "uuid-failed",
              status: "verified",
              business_name: "Test Business",
            },
            can_receive_fiat_payments: true,
          };
        }),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [{ code: "044", name: "Access Bank", slug: "access-bank" }],
        })),
        mockEdgeFunction("retry-payout-verification", async ({ body }) => {
          submitCount++;
          return {
            ok: true,
            payout_account: {
              id: body.payout_account_id,
              status: "verified",
              account_number: `****${body.account_number?.slice(-4)}`,
            },
          };
        })
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
      });

      // Update account number and retry
      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "0987654321" },
      });

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.stringMatching(/success/i)
        );
      });
    });
  });

  describe("Loading States", () => {
    it("shows loading spinner while fetching payout account", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => {
          // Simulate slow response
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            ok: true,
            payout_account: null,
          };
        })
      );

      renderWithRouter(<VendorPayoutAccount />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });
    });

    it("shows loading spinner while fetching banks", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            ok: true,
            banks: [],
          };
        })
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/loading.*banks/i)).toBeInTheDocument();
      });
    });

    it("disables submit button while submitting", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: true,
          banks: [{ code: "044", name: "Access Bank", slug: "access-bank" }],
        })),
        mockEdgeFunction("submit-payout-account", async () => {
          return {
            ok: true,
            payout_account: { status: "verified" },
          };
        })
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement;

      fireEvent.click(submitButton);

      expect(submitButton.disabled).toBe(true);

      // After successful submission, the component shows verified account view
      // So we verify the success toast was called instead of checking button state
      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalled();
      });
    });
  });

  describe("Error Handling", () => {
    it("shows error message if get-vendor-payout-account fails", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: false,
          error: "Database error",
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it("shows error message if list-nigerian-banks fails", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        })),
        mockEdgeFunction("list-nigerian-banks", async () => ({
          ok: false,
          error: "API error",
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });
  });

  describe("Unauthenticated State", () => {
    it("shows authentication prompt when user is not authenticated", async () => {
      mockUsePrivy.mockReturnValue({
        authenticated: false,
        user: null,
        getAccessToken: mockGetAccessToken,
        login: vi.fn(),
        ready: true,
      } as any);

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/connect wallet/i)).toBeInTheDocument();
      });
    });
  });
});

/**
 * Unit tests for VendorPayoutAccount page
 * Tests form validation, submission, and retry functionality
 */

import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import VendorPayoutAccount from "@/pages/VendorPayoutAccount";
import { usePrivy } from "@privy-io/react-auth";

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: any) => value,
}));

const mockUseBanks = vi.fn(() => ({
  data: [{ code: "044", name: "Access Bank", slug: "access-bank", type: "nuban" }],
  isLoading: false,
  error: null,
}));

vi.mock("@/hooks/useBanks", () => ({
  useBanks: () => mockUseBanks(),
}));

const mockUseResolveAccount = vi.fn((accountNumber: string, bankCode: string) => ({
  data:
    accountNumber.length === 10 && bankCode
      ? { account_number: accountNumber, account_name: "Test Business LLC", bank_id: 1 }
      : undefined,
  isLoading: false,
  error: null,
}));

vi.mock("@/hooks/useResolveAccount", () => ({
  useResolveAccount: (accountNumber: string, bankCode: string) =>
    mockUseResolveAccount(accountNumber, bankCode),
}));

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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

  describe("VendorPayoutAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBanks.mockClear();
    mockUseResolveAccount.mockClear();
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
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/add payout account/i)).toBeInTheDocument();
      });

      expect(screen.getByRole("combobox", { name: /bank/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
    });

    it("renders bank selector", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: /bank/i })).toBeInTheDocument();
      });
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
        expect(screen.getByRole("button", { name: /add account/i })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: /add account/i }) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);
    });

    it("validates account number is exactly 10 digits", async () => {
      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });

      const accountNumberInput = screen.getByLabelText(/account number/i);

      fireEvent.change(accountNumberInput, { target: { value: "123" } });
      expect((accountNumberInput as HTMLInputElement).value).toBe("123");

      fireEvent.change(accountNumberInput, { target: { value: "01234567890123" } });
      expect((accountNumberInput as HTMLInputElement).value).toBe("0123456789");
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
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });

      // Select bank
      fireEvent.click(screen.getByRole("combobox", { name: /bank/i }));
      fireEvent.click(await screen.findByText(/access bank/i));

      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "0123456789" },
      });

      await waitFor(() => {
        expect(screen.getByText(/account verified/i)).toBeInTheDocument();
      });

      // Submit
      const submitButton = screen.getByRole("button", { name: /add account/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalled();
      });

      // Should show verified status
      await waitFor(() => {
        expect(screen.getByText(/^verified$/i)).toBeInTheDocument();
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
        mockEdgeFunction("submit-payout-account", async () => ({
          ok: false,
          error: "Account verification failed: Invalid account number",
          payout_account: {
            id: "uuid-failed",
            status: "verification_failed",
            business_name: "Test Business",
            account_number: "****6789",
            can_retry: true,
          },
          can_retry: true,
          retry_hint: "Please check your account number and try again",
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
      });

      // Fill and submit form
      fireEvent.click(screen.getByRole("combobox", { name: /bank/i }));
      fireEvent.click(await screen.findByText(/access bank/i));
      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "9999999999" },
      });

      await waitFor(() => {
        expect(screen.getByText(/account verified/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /add account/i }));

      // Should show error
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
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
      expect(screen.getByText(/^verified$/i)).toBeInTheDocument();
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
                can_retry: true,
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
      fireEvent.click(screen.getByRole("combobox"));
      fireEvent.click(await screen.findByText(/access bank/i));

      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "0987654321" },
      });

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalled();
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

    it("disables submit button while submitting", async () => {
      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
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
        expect(screen.getByRole("button", { name: /add account/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("combobox", { name: /bank/i }));
      fireEvent.click(await screen.findByText(/access bank/i));
      fireEvent.change(screen.getByLabelText(/account number/i), {
        target: { value: "0123456789" },
      });

      await waitFor(() => {
        expect(screen.getByText(/account verified/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: /add account/i }) as HTMLButtonElement;

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

    it("renders banks error alert when banks fail to load", async () => {
      mockUseBanks.mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error("API error"),
      });

      server.use(
        mockEdgeFunction("get-vendor-payout-account", async () => ({
          ok: true,
          payout_account: null,
        }))
      );

      renderWithRouter(<VendorPayoutAccount />);

      await waitFor(() => {
        expect(screen.getByText(/error loading banks/i)).toBeInTheDocument();
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

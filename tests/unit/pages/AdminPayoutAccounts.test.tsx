/**
 * Unit tests for AdminPayoutAccounts page
 * Tests admin oversight dashboard functionality
 */

import * as React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import AdminPayoutAccounts from "@/pages/AdminPayoutAccounts";

// Mock Privy
const mockGetAccessToken = vi.fn().mockResolvedValue("admin-token");
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    user: { id: "admin-123" },
    getAccessToken: mockGetAccessToken,
  }),
}));

// Mock toast (sonner)
const { mockToast } = vi.hoisted(() => {
  return {
    mockToast: {
      error: vi.fn(),
      success: vi.fn(),
      message: vi.fn(),
      dismiss: vi.fn(),
    },
  };
});
vi.mock("sonner", () => ({
  toast: mockToast,
}));



const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

const mockPayoutAccounts = [
  {
    id: "uuid-1",
    vendor_id: "vendor-1",
    provider: "paystack",
    business_name: "Business Alpha LLC",
    account_number: "****1234",
    settlement_bank_name: "Access Bank",
    status: "verified",
    verified_at: "2024-01-15T10:00:00Z",
    percentage_charge: 5,
  },
  {
    id: "uuid-2",
    vendor_id: "vendor-2",
    provider: "paystack",
    business_name: "Business Beta Inc",
    account_number: "****5678",
    settlement_bank_name: "GTBank",
    status: "verification_failed",
    verification_error: "Invalid account number",
    percentage_charge: 5,
  },
  {
    id: "uuid-3",
    vendor_id: "vendor-3",
    provider: "paystack",
    business_name: "Business Gamma Ltd",
    account_number: "****9012",
    settlement_bank_name: "UBA",
    status: "suspended",
    suspended_at: "2024-02-01T14:00:00Z",
    suspension_reason: "Suspected fraud",
    percentage_charge: 5,
  },
];

describe("AdminPayoutAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(
      mockEdgeFunction("is-admin", async () => ({
        is_admin: true,
      }))
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("Initial Load", () => {
    it("renders admin dashboard with payout accounts list", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: {
            total: 3,
            limit: 50,
            offset: 0,
            has_more: false,
          },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/business beta inc/i)).toBeInTheDocument();
      expect(screen.getByText(/business gamma ltd/i)).toBeInTheDocument();
    });

    it("displays loading state while fetching accounts", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            ok: true,
            payout_accounts: [],
            pagination: { total: 0, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });
    });

    it("shows empty state when no payout accounts exist", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: [],
          pagination: { total: 0, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/no payout accounts/i)).toBeInTheDocument();
      });
    });
  });

  describe("Stats Cards", () => {
    it("displays count of verified accounts", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const verifiedCount = screen.getByText("1"); // 1 verified account
        expect(verifiedCount).toBeInTheDocument();
      });
    });

    it("displays count of failed verifications", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const failedCount = screen.getByText("1"); // 1 failed verification
        expect(failedCount).toBeInTheDocument();
      });
    });

    it("displays count of suspended accounts", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const suspendedCount = screen.getByText("1"); // 1 suspended account
        expect(suspendedCount).toBeInTheDocument();
      });
    });
  });

  describe("Table Display", () => {
    beforeEach(() => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );
    });

    it("displays business names", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });
    });

    it("displays masked account numbers", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/\*\*\*\*1234/)).toBeInTheDocument();
      });

      expect(screen.getByText(/\*\*\*\*5678/)).toBeInTheDocument();
      expect(screen.getByText(/\*\*\*\*9012/)).toBeInTheDocument();
    });

    it("displays bank names", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/access bank/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/gtbank/i)).toBeInTheDocument();
      expect(screen.getByText(/uba/i)).toBeInTheDocument();
    });

    it("displays status badges with appropriate styling", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const verifiedBadge = screen.getByText("verified");
        expect(verifiedBadge).toHaveClass(/success|green/); // Implementation-specific
      });

      const failedBadge = screen.getByText("verification_failed");
      expect(failedBadge).toHaveClass(/destructive|red/);

      const suspendedBadge = screen.getByText("suspended");
      expect(suspendedBadge).toHaveClass(/warning|amber/);
    });
  });

  describe("Filtering", () => {
    it("filters accounts by status (verified)", async () => {
      let currentStatus: string | null = null;

      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          currentStatus = (body as any)?.status || null;

          const filtered = currentStatus
            ? mockPayoutAccounts.filter((acc) => acc.status === currentStatus)
            : mockPayoutAccounts;

          return {
            ok: true,
            payout_accounts: filtered,
            pagination: { total: filtered.length, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
      });

      // Click filter dropdown and select "verified"
      const statusFilter = screen.getByLabelText(/status/i);
      fireEvent.click(statusFilter);

      const verifiedOption = screen.getByText("Verified");
      fireEvent.click(verifiedOption);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
        expect(screen.queryByText(/business beta inc/i)).not.toBeInTheDocument();
      });
    });

    it("filters accounts by provider (paystack)", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          const provider = (body as any)?.provider || null;

          const filtered = provider
            ? mockPayoutAccounts.filter((acc) => acc.provider === provider)
            : mockPayoutAccounts;

          return {
            ok: true,
            payout_accounts: filtered,
            pagination: { total: filtered.length, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
      });

      // All mock accounts are Paystack, so should show all 3
      const providerFilter = screen.getByLabelText(/provider/i);
      fireEvent.click(providerFilter);

      const paystackOption = screen.getByText("Paystack");
      fireEvent.click(paystackOption);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });
    });

    it("clears filters when 'All' is selected", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBe(4); // Header + 3 rows
      });
    });
  });

  describe("Search", () => {
    it("searches accounts by business name", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          const search = (body as any)?.search || "";

          const filtered = mockPayoutAccounts.filter((acc) =>
            acc.business_name.toLowerCase().includes(search.toLowerCase())
          );

          return {
            ok: true,
            payout_accounts: filtered,
            pagination: { total: filtered.length, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: "Alpha" } });

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
        expect(screen.queryByText(/business beta inc/i)).not.toBeInTheDocument();
      });
    });

    it("searches accounts by vendor ID", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          const search = (body as any)?.search || "";

          const filtered = mockPayoutAccounts.filter((acc) =>
            acc.vendor_id.toLowerCase().includes(search.toLowerCase())
          );

          return {
            ok: true,
            payout_accounts: filtered,
            pagination: { total: filtered.length, limit: 50, offset: 0, has_more: false },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: "vendor-2" } });

      await waitFor(() => {
        expect(screen.getByText(/business beta inc/i)).toBeInTheDocument();
        expect(screen.queryByText(/business alpha llc/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Pagination", () => {
    it("displays pagination controls when has_more is true", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 100, limit: 50, offset: 0, has_more: true },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/showing 1.*50.*100/i)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    it("loads next page when clicking next button", async () => {
      let currentOffset = 0;

      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ body }) => {
          currentOffset = (body as any)?.offset || 0;

          return {
            ok: true,
            payout_accounts: mockPayoutAccounts,
            pagination: { total: 100, limit: 50, offset: currentOffset, has_more: currentOffset < 50 },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
      });

      const nextButton = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(currentOffset).toBe(50);
      });
    });
  });

  describe("Suspend Account", () => {
    beforeEach(() => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );
    });

    it("opens suspend dialog when clicking suspend button", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      // Find suspend button for verified account
      const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
      fireEvent.click(suspendButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/suspend payout account/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    });

    it("requires suspension reason before submitting", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
      fireEvent.click(suspendButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /confirm suspend/i })).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /confirm suspend/i });
      fireEvent.click(confirmButton);

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
      });
    });

    it("successfully suspends account with reason", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body }) => {
          const { payout_account_id, action, reason } = body;

          if (action === "suspend") {
            return {
              ok: true,
              payout_account: {
                id: payout_account_id,
                status: "suspended",
                suspension_reason: reason,
                suspended_at: new Date().toISOString(),
              },
            };
          }

          return { ok: true };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
      fireEvent.click(suspendButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
      });

      const reasonInput = screen.getByLabelText(/reason/i);
      fireEvent.change(reasonInput, { target: { value: "Suspected fraud" } });

      const confirmButton = screen.getByRole("button", { name: /confirm suspend/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.stringMatching(/suspended/i)
        );
      });
    });
  });

  describe("Unsuspend Account", () => {
    beforeEach(() => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );
    });

    it("shows unsuspend button for suspended accounts", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business gamma ltd/i)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /unsuspend/i })).toBeInTheDocument();
    });

    it("successfully unsuspends account", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body }) => {
          const { payout_account_id, action } = body;

          if (action === "unsuspend") {
            return {
              ok: true,
              payout_account: {
                id: payout_account_id,
                status: "verified",
                suspended_at: null,
                suspension_reason: null,
              },
            };
          }

          return { ok: true };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /unsuspend/i })).toBeInTheDocument();
      });

      const unsuspendButton = screen.getByRole("button", { name: /unsuspend/i });
      fireEvent.click(unsuspendButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          expect.stringMatching(/unsuspended/i)
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("shows error message if fetching accounts fails", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: false,
          error: "Database connection failed",
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.any(String)
        );
      });
    });

    it("shows error message if suspension fails", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        })),
        mockEdgeFunction("admin-suspend-payout-account", async () => ({
          ok: false,
          error: "Failed to suspend account",
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
        fireEvent.click(suspendButtons[0]);
      });

      await waitFor(() => {
        const reasonInput = screen.getByLabelText(/reason/i);
        fireEvent.change(reasonInput, { target: { value: "Test reason" } });
      });

      const confirmButton = screen.getByRole("button", { name: /confirm suspend/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          expect.any(String)
        );
      });
    });
  });

  describe("Admin Authorization", () => {
    it("redirects or shows error if user is not admin", async () => {
      server.use(
        mockEdgeFunction("is-admin", async () => ({
          is_admin: false,
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/access denied/i)).toBeInTheDocument();
      });
    });
  });
});

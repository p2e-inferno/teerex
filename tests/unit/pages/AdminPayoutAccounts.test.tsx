/**
 * Unit tests for AdminPayoutAccounts page
 * Tests admin oversight dashboard functionality
 */

import * as React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

      expect(screen.getByText(/checking admin access/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/no payout accounts found/i)).toBeInTheDocument();
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
        const verifiedLabel = screen.getAllByText(/^Verified$/).find((el) =>
          String((el as HTMLElement).className).includes("text-muted-foreground")
        );
        expect(verifiedLabel).toBeTruthy();
        const card = (verifiedLabel as HTMLElement).parentElement;
        expect(card).toBeTruthy();
        expect(within(card as HTMLElement).getByText("1")).toBeInTheDocument();
      });
    });

    it("displays count of pending accounts", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async () => ({
          ok: true,
          payout_accounts: mockPayoutAccounts,
          pagination: { total: 3, limit: 50, offset: 0, has_more: false },
        }))
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        const pendingLabel = screen.getAllByText(/^Pending$/).find((el) =>
          String((el as HTMLElement).className).includes("text-muted-foreground")
        );
        expect(pendingLabel).toBeTruthy();
        const card = (pendingLabel as HTMLElement).parentElement;
        expect(card).toBeTruthy();
        expect(within(card as HTMLElement).getByText("0")).toBeInTheDocument();
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
        const suspendedLabel = screen.getAllByText(/^Suspended$/).find((el) =>
          String((el as HTMLElement).className).includes("text-muted-foreground")
        );
        expect(suspendedLabel).toBeTruthy();
        const card = (suspendedLabel as HTMLElement).parentElement;
        expect(card).toBeTruthy();
        expect(within(card as HTMLElement).getByText("1")).toBeInTheDocument();
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
      expect(screen.getByText(/^uba$/i)).toBeInTheDocument();
    });

    it("displays status badges with appropriate styling", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      const alphaRow = screen.getByText(/business alpha llc/i).closest("tr");
      expect(alphaRow).toBeTruthy();
      expect(within(alphaRow as HTMLElement).getByText(/^Verified$/)).toBeInTheDocument();

      const betaRow = screen.getByText(/business beta inc/i).closest("tr");
      expect(betaRow).toBeTruthy();
      expect(within(betaRow as HTMLElement).getByText(/^Failed$/)).toBeInTheDocument();

      const gammaRow = screen.getByText(/business gamma ltd/i).closest("tr");
      expect(gammaRow).toBeTruthy();
      expect(within(gammaRow as HTMLElement).getByText(/^Suspended$/)).toBeInTheDocument();
    });
  });

  describe("Filtering", () => {
    it("filters accounts by status (verified)", async () => {
      let currentStatus: string | null = null;

      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ request }) => {
          const url = new URL(request.url);
          currentStatus = url.searchParams.get("status");

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
      const statusFilter = screen.getAllByRole("combobox")[0];
      fireEvent.click(statusFilter);

      const verifiedOption = await screen.findByRole("option", { name: /^Verified$/ });
      fireEvent.click(verifiedOption);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
        expect(screen.queryByText(/business beta inc/i)).not.toBeInTheDocument();
      });
    });

    it("filters accounts by provider (paystack)", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ request }) => {
          const url = new URL(request.url);
          const provider = url.searchParams.get("provider");

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
      const providerFilter = screen.getAllByRole("combobox")[1];
      fireEvent.click(providerFilter);

      const paystackOption = await screen.findByRole("option", { name: /^Paystack$/ });
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
        mockEdgeFunction("admin-list-payout-accounts", async ({ request }) => {
          const url = new URL(request.url);
          const search = url.searchParams.get("search") || "";

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
        expect(screen.getByPlaceholderText(/business name or vendor id/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/business name or vendor id/i);
      fireEvent.change(searchInput, { target: { value: "Alpha" } });

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
        expect(screen.queryByText(/business beta inc/i)).not.toBeInTheDocument();
      });
    });

    it("searches accounts by vendor ID", async () => {
      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ request }) => {
          const url = new URL(request.url);
          const search = url.searchParams.get("search") || "";

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
        expect(screen.getByPlaceholderText(/business name or vendor id/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/business name or vendor id/i);
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
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    });

    it("loads next page when clicking load more", async () => {
      let currentOffset = 0;

      server.use(
        mockEdgeFunction("admin-list-payout-accounts", async ({ request }) => {
          const url = new URL(request.url);
          currentOffset = Number(url.searchParams.get("offset") || 0);

          return {
            ok: true,
            payout_accounts: mockPayoutAccounts,
            pagination: { total: 100, limit: 50, offset: currentOffset, has_more: currentOffset < 50 },
          };
        })
      );

      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /load more/i }));

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

      expect(screen.getByPlaceholderText(/enter reason for suspension/i)).toBeInTheDocument();
    });

    it("requires suspension reason before submitting", async () => {
      renderWithRouter(<AdminPayoutAccounts />);

      await waitFor(() => {
        expect(screen.getByText(/business alpha llc/i)).toBeInTheDocument();
      });

      const suspendButtons = screen.getAllByRole("button", { name: /suspend/i });
      fireEvent.click(suspendButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /suspend account/i })).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /suspend account/i }) as HTMLButtonElement;
      expect(confirmButton.disabled).toBe(true);
    });

    it("successfully suspends account with reason", async () => {
      server.use(
        mockEdgeFunction("admin-suspend-payout-account", async ({ body }) => {
          const { payout_account_id, action, reason } = body;

          if (action === "suspend") {
            return {
              ok: true,
              message: "Account suspended",
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
        expect(screen.getByPlaceholderText(/enter reason for suspension/i)).toBeInTheDocument();
      });

      const reasonInput = screen.getByPlaceholderText(/enter reason for suspension/i);
      fireEvent.change(reasonInput, { target: { value: "Suspected fraud" } });

      const confirmButton = screen.getByRole("button", { name: /suspend account/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalled();
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
              message: "Account unsuspended",
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
        expect(mockToast.success).toHaveBeenCalled();
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
        const reasonInput = screen.getByPlaceholderText(/enter reason for suspension/i);
        fireEvent.change(reasonInput, { target: { value: "Test reason" } });
      });

      const confirmButton = screen.getByRole("button", { name: /suspend account/i });
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

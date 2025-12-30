import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import { renderWithProviders } from "@/test/render";
import VendorGamingBundleOrders from "@/pages/VendorGamingBundleOrders";

const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    getAccessToken: mockGetAccessToken,
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("VendorGamingBundleOrders", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockGetAccessToken.mockClear();
  });

  it("lists orders and reissues an offline claim receipt", async () => {
    server.use(
      mockEdgeFunction("list-gaming-bundle-orders", async ({ headers }) => {
        expect(headers.get("x-privy-authorization")).toMatch(/Bearer test-token/);
        return {
          ok: true,
          orders: [
            {
              id: "3c0d2c6b-9a1d-4b5a-9fef-40e2db5ffb3d",
              bundle_id: "bundle-1",
              created_at: new Date().toISOString(),
              status: "PAID",
              fulfillment_method: "EAS",
              payment_provider: "cash",
              payment_reference: "cash-123",
              amount_fiat: 1000,
              fiat_symbol: "NGN",
              amount_dg: null,
              chain_id: 8453,
              bundle_address: "0x1234567890abcdef1234567890abcdef12345678",
              buyer_address: null,
              buyer_display_name: "Guest Buyer",
              buyer_phone: "08012345678",
              eas_uid: "0xuid",
              nft_recipient_address: null,
              token_id: null,
              txn_hash: null,
              redeemed_at: null,
              can_reissue: true,
              gaming_bundles: {
                title: "1 Hour PS5",
                quantity_units: 60,
                unit_label: "minutes",
                bundle_type: "TIME",
              },
            },
          ],
        };
      }),
      mockEdgeFunction("rotate-gaming-bundle-claim-code", async ({ body, headers }) => {
        expect(headers.get("x-privy-authorization")).toMatch(/Bearer test-token/);
        expect(body.order_id).toBe("3c0d2c6b-9a1d-4b5a-9fef-40e2db5ffb3d");
        return { ok: true, order_id: body.order_id, claim_code: "ABCD1234" };
      })
    );

    renderWithProviders(<VendorGamingBundleOrders />);

    expect(await screen.findByText("1 Hour PS5")).toBeInTheDocument();
    expect(screen.getByText("Guest Buyer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reissue/i }));

    await waitFor(() => {
      expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    });

    expect(mockToast).toHaveBeenCalled();
  });

  it("disables reissue when order is not eligible", async () => {
    server.use(
      mockEdgeFunction("list-gaming-bundle-orders", async () => ({
        ok: true,
        orders: [
          {
            id: "3c0d2c6b-9a1d-4b5a-9fef-40e2db5ffb3d",
            bundle_id: "bundle-1",
            created_at: new Date().toISOString(),
            status: "PAID",
            fulfillment_method: "NFT",
            payment_provider: "paystack",
            payment_reference: "ref-123",
            amount_fiat: 1000,
            fiat_symbol: "NGN",
            amount_dg: null,
            chain_id: 8453,
            bundle_address: "0x1234567890abcdef1234567890abcdef12345678",
            buyer_address: "0x1111111111111111111111111111111111111111",
            buyer_display_name: "Online Buyer",
            buyer_phone: null,
            eas_uid: null,
            nft_recipient_address: "0x1111111111111111111111111111111111111111",
            token_id: "1",
            txn_hash: "0xhash",
            redeemed_at: null,
            can_reissue: false,
            gaming_bundles: {
              title: "3 Matches EAFC",
              quantity_units: 3,
              unit_label: "matches",
              bundle_type: "MATCHES",
            },
          },
        ],
      }))
    );

    renderWithProviders(<VendorGamingBundleOrders />);

    expect(await screen.findByText("3 Matches EAFC")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Reissue/i });
    expect(button).toBeDisabled();
  });
});

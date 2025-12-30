import * as React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import GamingBundlePOS from "@/pages/GamingBundlePOS";

const mockBundles = [
  {
    id: "bundle-1",
    title: "1 Hour PS5",
    description: "Playtime bundle",
    bundle_type: "TIME",
    quantity_units: 60,
    unit_label: "minutes",
    price_fiat: 5000,
    price_dg: 0,
    chain_id: 8453,
    bundle_address: "0xlock",
    vendor_id: "vendor-1",
    vendor_address: "0xvendor",
    key_expiration_duration_seconds: 2592000,
    fiat_symbol: "NGN",
    game_title: null,
    image_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    getAccessToken: mockGetAccessToken,
  }),
}));

vi.mock("@/hooks/useGamingBundles", () => ({
  useGamingBundles: () => ({
    data: mockBundles,
    isLoading: false,
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("GamingBundlePOS", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockGetAccessToken.mockClear();
  });

  it("records offline sale and shows claim code", async () => {
    server.use(
      mockEdgeFunction("record-gaming-bundle-sale", async ({ body, headers }) => {
        expect(body.bundle_id).toBe("bundle-1");
        expect(headers.get("x-privy-authorization")).toMatch(/Bearer test-token/);
        return {
          ok: true,
          order: { id: "order-1" },
          claim_code: "ABC123",
          eas_uid: "0xattest",
        };
      })
    );

    render(<GamingBundlePOS />);

    const recordButton = await screen.findByRole("button", { name: /record sale/i });
    fireEvent.click(recordButton);

    await waitFor(() => {
      expect(screen.getByText(/Claim Code:/i)).toBeInTheDocument();
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
  });
});

import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { GamingBundleProcessingDialog } from "@/components/gaming/GamingBundleProcessingDialog";

const SUPABASE_URL = "http://localhost:54321";

const createMockBundle = () => ({
  id: "bundle-1",
  vendor_id: "vendor-1",
  vendor_address: "0xvendor",
  title: "1 Hour PS5",
  description: "Playtime bundle",
  game_title: "EA FC",
  bundle_type: "TIME",
  quantity_units: 60,
  unit_label: "minutes",
  price_fiat: 5000,
  fiat_symbol: "NGN",
  price_dg: 0,
  chain_id: 8453,
  bundle_address: "0xlock",
  key_expiration_duration_seconds: 2592000,
  image_url: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const createMockPaymentData = () => ({
  reference: "ref-123",
  email: "user@example.com",
  walletAddress: "0xwallet",
  bundleId: "bundle-1",
  amount: 5000,
});

describe("GamingBundleProcessingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("calls onPurchaseSuccess when order is fulfilled", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/get-gaming-bundle-order-status`, () => {
        return HttpResponse.json({
          found: true,
          status: "PAID",
          fulfillment_method: "NFT",
          txn_hash: "0xabc123",
        });
      })
    );

    const onPurchaseSuccess = vi.fn();

    render(
      <GamingBundleProcessingDialog
        bundle={createMockBundle() as any}
        isOpen
        onClose={() => undefined}
        paymentData={createMockPaymentData()}
        onPurchaseSuccess={onPurchaseSuccess}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByText(/bundle issued successfully/i)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
  }, 15000);
});

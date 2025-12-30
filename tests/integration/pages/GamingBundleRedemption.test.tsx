import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import GamingBundleRedemption from "@/pages/GamingBundleRedemption";

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

describe("GamingBundleRedemption", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockGetAccessToken.mockClear();
  });

  it("prevents double redemption when API returns already_redeemed", async () => {
    let callCount = 0;
    server.use(
      mockEdgeFunction("redeem-gaming-bundle", async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            redemption: { order_id: "order-1", redeemed_at: new Date().toISOString() },
          };
        }
        return {
          ok: false,
          error: "already_redeemed",
        };
      })
    );

    render(<GamingBundleRedemption />);

    const orderInput = screen.getByLabelText(/order id/i);
    fireEvent.change(orderInput, { target: { value: "order-1" } });

    const redeemButton = screen.getByRole("button", { name: /redeem/i });
    fireEvent.click(redeemButton);

    await waitFor(() => {
      expect(screen.getByText(/Last Redemption/i)).toBeInTheDocument();
    });

    fireEvent.change(orderInput, { target: { value: "order-1" } });
    fireEvent.click(redeemButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
      const lastCall = mockToast.mock.calls[mockToast.mock.calls.length - 1]?.[0];
      expect(lastCall?.variant).toBe("destructive");
    });
  });
});

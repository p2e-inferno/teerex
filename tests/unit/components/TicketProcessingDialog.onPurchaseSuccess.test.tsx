import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { TicketProcessingDialog } from "@/components/events/TicketProcessingDialog";

const SUPABASE_URL = "http://localhost:54321";

const createMockEvent = () => ({
  id: "event-1",
  title: "Test Event",
  description: "desc",
  date: new Date(),
  time: "7:00 PM",
  location: "Virtual",
  capacity: 10,
  price: "0",
  currency: "FREE",
  ngn_price: 0,
  chain_id: 8453,
  lock_address: "0xlock",
  creator_id: "creator",
  payment_methods: ["fiat"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const createMockPaymentData = () => ({
  reference: "ref-123",
  email: "user@example.com",
  walletAddress: "0xwallet",
  phone: "123",
  eventId: "event-1",
  amount: 1000,
});

describe("TicketProcessingDialog (onPurchaseSuccess)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("calls onPurchaseSuccess when webhook reports ticket issued", async () => {
    // MSW handler returns success immediately
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/get-transaction-status`, () => {
        return HttpResponse.json({
          ok: true,
          found: true,
          status: "success",
          gateway_response: {
            key_granted: true,
            txHash: "0xabc123",
          },
        });
      })
    );

    const onPurchaseSuccess = vi.fn();

    render(
      <TicketProcessingDialog
        event={createMockEvent() as any}
        isOpen
        onClose={() => undefined}
        paymentData={createMockPaymentData()}
        onPurchaseSuccess={onPurchaseSuccess}
      />
    );

    // Wait for success state (real timer, MSW handles the request)
    await waitFor(
      () => {
        expect(screen.getByText(/ticket issued successfully/i)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
  }, 15000);

  it("does NOT call onPurchaseSuccess on timeout (not found)", async () => {
    let callCount = 0;
    // MSW handler always returns "not found"
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/get-transaction-status`, () => {
        callCount++;
        return HttpResponse.json({
          ok: true,
          found: false,
        });
      })
    );

    const onPurchaseSuccess = vi.fn();

    render(
      <TicketProcessingDialog
        event={createMockEvent() as any}
        isOpen
        onClose={() => undefined}
        paymentData={createMockPaymentData()}
        onPurchaseSuccess={onPurchaseSuccess}
      />
    );

    // Wait for a few polls to happen
    await waitFor(
      () => {
        expect(callCount).toBeGreaterThan(2);
      },
      { timeout: 15000 }
    );

    // Should NOT have called success
    expect(onPurchaseSuccess).not.toHaveBeenCalled();
  }, 20000);

  it("calls onPurchaseSuccess only once even after multiple polls", async () => {
    let callCount = 0;
    // First 2 calls return processing, then success
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/get-transaction-status`, () => {
        callCount++;
        if (callCount <= 2) {
          return HttpResponse.json({
            ok: true,
            found: true,
            status: "processing",
          });
        }
        return HttpResponse.json({
          ok: true,
          found: true,
          status: "success",
          gateway_response: { key_granted: true, txHash: "0xabc" },
        });
      })
    );

    const onPurchaseSuccess = vi.fn();

    render(
      <TicketProcessingDialog
        event={createMockEvent() as any}
        isOpen
        onClose={() => undefined}
        paymentData={createMockPaymentData()}
        onPurchaseSuccess={onPurchaseSuccess}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByText(/ticket issued successfully/i)).toBeInTheDocument();
      },
      { timeout: 15000 }
    );

    // Should only be called once despite multiple polls
    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);
    expect(callCount).toBeGreaterThanOrEqual(3);
  }, 20000);

  it("does NOT crash when onPurchaseSuccess is undefined", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/get-transaction-status`, () => {
        return HttpResponse.json({
          ok: true,
          found: true,
          status: "success",
          gateway_response: { key_granted: true, txHash: "0xabc" },
        });
      })
    );

    // Render without onPurchaseSuccess prop - should not throw
    expect(() => {
      render(
        <TicketProcessingDialog
          event={createMockEvent() as any}
          isOpen
          onClose={() => undefined}
          paymentData={createMockPaymentData()}
        />
      );
    }).not.toThrow();

    await waitFor(
      () => {
        expect(screen.getByText(/ticket issued successfully/i)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  }, 15000);
});

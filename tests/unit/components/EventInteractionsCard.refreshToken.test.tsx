import * as React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { EventInteractionsCard } from "@/components/interactions/core/EventInteractionsCard";

const refetchPosts = vi.fn();
const refetchTicket = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// NOTE: EventInteractionsCard imports hooks relatively, but these mocks target the same source
// file via alias (Vite resolves both to the same module id).
vi.mock("@/components/interactions/hooks/useEventPosts", () => ({
  useEventPosts: () => ({
    posts: [],
    isLoading: false,
    error: null,
    refetch: refetchPosts,
  }),
}));

vi.mock("@/components/interactions/hooks/useTicketVerification", () => ({
  useTicketVerification: () => ({
    hasTicket: true,
    isChecking: false,
    error: null,
    refetch: refetchTicket,
  }),
}));

vi.mock("@/components/interactions/hooks/useLockManagerVerification", () => ({
  useLockManagerVerification: () => ({
    isLockManager: false,
    isChecking: false,
    error: null,
  }),
}));

vi.mock("@/components/interactions/hooks/useCreatorPermissions", () => ({
  useCreatorPermissions: () => ({
    isCreator: false,
  }),
}));

describe("EventInteractionsCard (refreshToken)", () => {
  beforeEach(() => {
    refetchPosts.mockClear();
    refetchTicket.mockClear();
  });

  it("does NOT refetch on initial mount (refreshToken=0)", () => {
    // Initial render should NOT trigger refetch - only changes should
    render(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 0 } as any)}
      />
    );

    // Refetch should NOT be called on initial mount
    expect(refetchTicket).not.toHaveBeenCalled();
    expect(refetchPosts).not.toHaveBeenCalled();
  });

  it("refetches ticket verification and posts when refreshToken changes", () => {
    const { rerender } = render(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // refreshToken is introduced by the upcoming implementation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 0 } as any)}
      />
    );

    // Clear any potential initial calls before testing the change
    refetchPosts.mockClear();
    refetchTicket.mockClear();

    rerender(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 1 } as any)}
      />
    );

    expect(refetchTicket).toHaveBeenCalledTimes(1);
    expect(refetchPosts).toHaveBeenCalledTimes(1);
  });

  it("does NOT refetch when refreshToken stays the same value", () => {
    const { rerender } = render(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 1 } as any)}
      />
    );

    refetchPosts.mockClear();
    refetchTicket.mockClear();

    // Re-render with the SAME refreshToken value
    rerender(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 1 } as any)}
      />
    );

    // Should NOT trigger refetch since value didn't change
    expect(refetchTicket).not.toHaveBeenCalled();
    expect(refetchPosts).not.toHaveBeenCalled();
  });

  it("refetches correctly for multiple refreshToken increments", () => {
    const { rerender } = render(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 0 } as any)}
      />
    );

    refetchPosts.mockClear();
    refetchTicket.mockClear();

    // First increment: 0 -> 1
    rerender(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 1 } as any)}
      />
    );

    expect(refetchTicket).toHaveBeenCalledTimes(1);
    expect(refetchPosts).toHaveBeenCalledTimes(1);

    // Second increment: 1 -> 2
    rerender(
      <EventInteractionsCard
        eventId="event-1"
        lockAddress="0xlock"
        creatorAddress="0xcreator"
        creatorId="creator-id"
        chainId={8453}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ refreshToken: 2 } as any)}
      />
    );

    expect(refetchTicket).toHaveBeenCalledTimes(2);
    expect(refetchPosts).toHaveBeenCalledTimes(2);
  });
});


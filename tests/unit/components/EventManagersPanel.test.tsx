import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventManagersPanel } from "@/components/events/EventManagersPanel";
import type { PublishedEvent } from "@/types/event";

const { removeManagerMock } = vi.hoisted(() => ({
  removeManagerMock: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useEventManagers", () => ({
  useEventManagers: () => ({
    managers: [
      {
        id: "manager-1",
        event_id: "event-1",
        wallet_address: "0x1111111111111111111111111111111111111111",
        email: "manager@example.com",
        label: null,
        permissions: {
          manage_access: true,
          manage_waitlist: true,
          manage_discussions: false,
        },
        added_by: "creator",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "manager-2",
        event_id: "event-1",
        wallet_address: "0x2222222222222222222222222222222222222222",
        email: null,
        label: "Ops",
        permissions: {
          manage_access: false,
          manage_waitlist: true,
          manage_discussions: true,
        },
        added_by: "creator",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    loading: false,
    saving: false,
    error: null,
    refresh: vi.fn(),
    addManager: vi.fn(),
    updatePermissions: vi.fn(),
    removeManager: removeManagerMock,
    defaultPermissions: {
      manage_access: true,
      manage_waitlist: true,
      manage_discussions: true,
    },
  }),
}));

const event = {
  id: "event-1",
  title: "Test Event",
} as PublishedEvent;

describe("EventManagersPanel", () => {
  beforeEach(() => {
    removeManagerMock.mockReset();
  });

  it("shows email only for managers added with an email", () => {
    render(<EventManagersPanel event={event} enabled={true} />);

    expect(screen.getByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("Not provided")).toBeInTheDocument();
    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(screen.getByText("0x2222...2222")).toBeInTheDocument();
    expect(screen.getByText("Choose what this manager can do.")).toBeInTheDocument();
    expect(screen.getByLabelText("Wallet address or Teerex email")).toBeInTheDocument();
    expect(screen.getByLabelText("Manager name or note")).toBeInTheDocument();
    expect(screen.getAllByText("Add, remove, and approve people on the event allowlist.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("View the waitlist and notify people when spots open up.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create, edit, and moderate posts and comments in event discussions.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manage Allowlist").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manage Waitlist").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manage Event Discussions").length).toBeGreaterThan(0);
  });

  it("does not render when disabled", () => {
    render(<EventManagersPanel event={event} enabled={false} />);

    expect(screen.queryByText("Event managers")).not.toBeInTheDocument();
  });

  it("confirms before removing a manager", async () => {
    render(<EventManagersPanel event={event} enabled={true} />);

    fireEvent.click(screen.getAllByTitle("Remove manager")[0]);

    expect(removeManagerMock).not.toHaveBeenCalled();
    expect(screen.getByText("Remove manager?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove manager" }));

    await waitFor(() => {
      expect(removeManagerMock).toHaveBeenCalledWith("manager-1");
    });
  });
});

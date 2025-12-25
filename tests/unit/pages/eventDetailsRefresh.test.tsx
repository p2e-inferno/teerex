import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as React from "react";

import {
  EventDetailsRefreshProvider,
  useEventDetailsRefresh,
} from "@/pages/event-details/eventDetailsRefresh";

const Consumer = () => {
  const { refreshToken, triggerRefresh } = useEventDetailsRefresh();
  return (
    <div>
      <div data-testid="token">{refreshToken}</div>
      <button type="button" onClick={triggerRefresh}>
        refresh
      </button>
    </div>
  );
};

describe("EventDetailsRefreshProvider", () => {
  it("increments refreshToken when triggerRefresh is called", async () => {
    const user = userEvent.setup();
    render(
      <EventDetailsRefreshProvider>
        <Consumer />
      </EventDetailsRefreshProvider>
    );

    expect(screen.getByTestId("token")).toHaveTextContent("0");
    await user.click(screen.getByRole("button", { name: "refresh" }));
    expect(screen.getByTestId("token")).toHaveTextContent("1");
  });

  it("throws when used outside provider", () => {
    const Spy = () => {
      useEventDetailsRefresh();
      return null;
    };

    expect(() => render(<Spy />)).toThrow(
      "useEventDetailsRefresh must be used within EventDetailsRefreshProvider"
    );
  });
});


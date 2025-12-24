import "@testing-library/jest-dom";
import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { server } from "./msw/server";

// Polyfill for pointer capture (required for Radix UI components in JSDOM)
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {
    // noop
  };
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {
    // noop
  };
}

// Polyfill for scrollIntoView (required for Radix UI Select component)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {
    // noop
  };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => server.close());

vi.mock("@privy-io/react-auth", async () => {
  const React = await import("react");
  return {
    PrivyProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    usePrivy: vi.fn(() => ({
      authenticated: false,
      ready: true,
      user: null,
      login: vi.fn(),
      connectWallet: vi.fn(),
      getAccessToken: vi.fn(async () => null),
    })),
    useWallets: vi.fn(() => ({ wallets: [] })),
  };
});

vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const fetchProxy: typeof fetch = (...args) =>
    // Call through to the current global fetch (MSW patches this in beforeAll)
    globalThis.fetch(...args);

  const supabase = createClient("http://localhost:54321", "test-anon-key", {
    global: { fetch: fetchProxy },
  });
  return { supabase };
});

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

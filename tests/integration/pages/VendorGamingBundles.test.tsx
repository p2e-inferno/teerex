import * as React from "react";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";
import VendorGamingBundles from "@/pages/VendorGamingBundles";
import { renderWithProviders } from "@/test/render";

const mockGetAccessToken = vi.fn().mockResolvedValue("test-token");
const mockDeployLock = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: true,
    getAccessToken: mockGetAccessToken,
    user: { id: "did:privy:test-user" },
  }),
  useWallets: () => ({
    wallets: [{ address: "0xTestWallet1234567890abcdef12345678" }],
  }),
}));

vi.mock("@/hooks/useGamingBundles", () => ({
  useGamingBundles: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useNetworkConfigs", () => ({
  useNetworkConfigs: () => ({
    networks: [
      {
        id: "net-1",
        chain_id: 8453,
        chain_name: "Base",
        is_active: true,
      },
    ],
  }),
}));

vi.mock("@/utils/lockUtils", () => ({
  deployLock: (...args: any[]) => mockDeployLock(...args),
}));

vi.mock("@/utils/supabaseDraftStorage", () => ({
  uploadEventImage: vi.fn().mockResolvedValue("https://example.com/test-image.jpg"),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("VendorGamingBundles", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockGetAccessToken.mockClear();
    mockDeployLock.mockReset();
  });

  it("renders console dropdown and location input", async () => {
    renderWithProviders(<VendorGamingBundles />);

    // Console dropdown should exist
    expect(screen.getByText(/Select console/i)).toBeInTheDocument();

    // Location input should exist and be required
    expect(screen.getByLabelText(/Location/i)).toBeInTheDocument();
  });

  it("disables create button until lock is deployed", async () => {
    renderWithProviders(<VendorGamingBundles />);

    // Create button should be disabled initially
    const createButton = screen.getByRole("button", { name: /Create Bundle/i });
    expect(createButton).toBeDisabled();

    // Should show message about deploying first
    expect(screen.getByText(/Deploy a bundle contract first/i)).toBeInTheDocument();
  });

  it("disables deploy button without title and location", async () => {
    renderWithProviders(<VendorGamingBundles />);

    const deployButton = screen.getByRole("button", { name: /Deploy Bundle Contract/i });
    expect(deployButton).toBeDisabled();

    // Fill in title only
    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Test Bundle" } });
    expect(deployButton).toBeDisabled();

    // Fill in location
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: "Gaming Arena Lagos" } });
    expect(deployButton).not.toBeDisabled();
  });

  it("creates a bundle with console and location fields", async () => {
    mockDeployLock.mockResolvedValue({
      success: true,
      lockAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });

    server.use(
      mockEdgeFunction("create-gaming-bundle", async ({ body, headers }) => {
        expect(body.title).toBe("Test Bundle");
        expect(body.location).toBe("Gaming Arena Lagos");
        expect(body.console).toBe("PS5");
        expect(headers.get("x-privy-authorization")).toMatch(/Bearer test-token/);
        return { ok: true, bundle: { id: "bundle-1" } };
      })
    );

    renderWithProviders(<VendorGamingBundles />);

    // Fill in form fields
    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Test Bundle" } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: "Bundle description" } });
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: "Gaming Arena Lagos" } });

    // Select console
    fireEvent.click(screen.getByText(/Select console/i));
    await waitFor(() => {
      const option = screen.getByRole("option", { name: /PS5/i });
      fireEvent.click(option);
    });

    // Deploy lock
    const deployButton = screen.getByRole("button", { name: /Deploy Bundle Contract/i });
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(mockDeployLock).toHaveBeenCalled();
    });

    // After deploy, create button should be enabled
    await waitFor(() => {
      const createButton = screen.getByRole("button", { name: /Create Bundle/i });
      expect(createButton).not.toBeDisabled();
    });

    // Click create
    fireEvent.click(screen.getByRole("button", { name: /Create Bundle/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Bundle created" })
      );
    });
  });

  it("shows error when vendor access is denied", async () => {
    mockDeployLock.mockResolvedValue({
      success: true,
      lockAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });

    server.use(
      mockEdgeFunction("create-gaming-bundle", async () => ({
        ok: false,
        error: "vendor_access_denied",
      }))
    );

    renderWithProviders(<VendorGamingBundles />);

    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Denied Bundle" } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: "Bundle description" } });
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: "Gaming Arena Lagos" } });

    // Deploy first
    fireEvent.click(screen.getByRole("button", { name: /Deploy Bundle Contract/i }));
    await waitFor(() => expect(mockDeployLock).toHaveBeenCalled());

    // Try to create
    await waitFor(() => {
      const createButton = screen.getByRole("button", { name: /Create Bundle/i });
      expect(createButton).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Bundle/i }));

    await waitFor(() => {
      const lastCall = mockToast.mock.calls[mockToast.mock.calls.length - 1]?.[0];
      expect(lastCall?.variant).toBe("destructive");
    });
  });

  it("shows location field is required validation", async () => {
    mockDeployLock.mockResolvedValue({
      success: true,
      lockAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });

    renderWithProviders(<VendorGamingBundles />);

    // Fill only title
    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Test Bundle" } });

    // Deploy button should be disabled without location
    const deployButton = screen.getByRole("button", { name: /Deploy Bundle Contract/i });
    expect(deployButton).toBeDisabled();

    // Add location
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: "Test Location" } });
    expect(deployButton).not.toBeDisabled();
  });
});

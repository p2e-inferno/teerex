import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import { mockNetworkConfigs, mockUseNetworkConfigs } from '@/test/mocks/networkConfigs';
import type { EventFormData } from '@/pages/CreateEvent';
import { renderWithProviders } from '@/test/render';

// Mock the useNetworkConfigs hook
vi.mock('@/hooks/useNetworkConfigs');
vi.mock('@/hooks/useTokenMetadata', () => ({
  useMultipleTokenMetadata: () => ({ metadataMap: {} }),
}));

describe('TicketSettings - Currency Dropdown Integration', () => {
  let mockUpdateFormData: ReturnType<typeof vi.fn>;
  let mockOnNext: ReturnType<typeof vi.fn>;
  let baseFormData: EventFormData;

  beforeEach(() => {
    mockUpdateFormData = vi.fn();
    mockOnNext = vi.fn();

    baseFormData = {
      title: 'Test Event',
      description: 'Test Description',
      date: new Date(),
      endDate: null,
      time: '10:00',
      location: 'Test Location',
      eventType: 'physical' as const,
      capacity: 100,
      price: 0,
      currency: 'ETH',
      ngnPrice: 0,
      paystackPublicKey: null,
      category: 'conference',
      imageUrl: null,
      paymentMethod: 'crypto' as const,
      ticketDuration: 'event' as const,
      customDurationDays: undefined,
      chainId: 8453, // Base Mainnet
      transferable: true,
    };

    vi.clearAllMocks();
  });

  describe('Network-specific token availability', () => {
    it('should show ETH, USDC, DG, UP when Base (8453) is selected', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find the Currency label and get the combobox within the same parent
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Verify all Base tokens are available
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /eth/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'USDC' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'DG' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'UP' })).toBeInTheDocument();
      });
    });

    it('should show ETH, USDC, G when Celo (42220) is selected', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 42220 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find the Currency label and get the combobox
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Verify Celo tokens
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /celo/i })).toBeInTheDocument(); // Native currency
        expect(screen.getByRole('option', { name: 'USDC' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'G' })).toBeInTheDocument();
      });

      // Verify DG and UP are NOT available
      expect(screen.queryByRole('option', { name: 'DG' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'UP' })).not.toBeInTheDocument();
    });

    it('should show ETH, USDC, G when Ethereum (1) is selected', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 1 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find currency select
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Verify Ethereum tokens
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /eth/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'USDC' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'G' })).toBeInTheDocument();
      });

      // Verify DG and UP are NOT available
      expect(screen.queryByRole('option', { name: 'DG' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'UP' })).not.toBeInTheDocument();
    });

    it('should show ETH, USDC only for Base Sepolia (84532) - no DG/UP/G', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 84532 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find currency select
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Verify only ETH and USDC
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /eth/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'USDC' })).toBeInTheDocument();
      });

      // Verify no DG, G, UP
      expect(screen.queryByRole('option', { name: 'DG' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'G' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'UP' })).not.toBeInTheDocument();
    });
  });

  describe('Dynamic behavior on network switch', () => {
    it('should auto-reset currency from DG to ETH when switching from Base to Celo', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      const { rerender } = renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453, currency: 'DG' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Simulate network switch to Celo
      rerender(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 42220, currency: 'DG' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should call updateFormData to reset currency to ETH
      await waitFor(() => {
        expect(mockUpdateFormData).toHaveBeenCalledWith({ currency: 'ETH' });
      });
    });

    it('should auto-reset currency from G to ETH when switching from Celo to Base', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      const { rerender } = renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 42220, currency: 'G' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Switch to Base
      rerender(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453, currency: 'G' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should reset to ETH
      await waitFor(() => {
        expect(mockUpdateFormData).toHaveBeenCalledWith({ currency: 'ETH' });
      });
    });

    it('should NOT reset currency if it remains available after network switch', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      const { rerender } = renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 42220, currency: 'USDC' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Switch from Celo to Base (both have USDC)
      rerender(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453, currency: 'USDC' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should NOT call updateFormData for currency reset (USDC is available on both)
      expect(mockUpdateFormData).not.toHaveBeenCalledWith({ currency: 'ETH' });
    });
  });

  describe('User interactions', () => {
    it('should call updateFormData when currency is changed', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453, currency: 'ETH' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find currency select
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Select DG
      const dgOption = await screen.findByRole('option', { name: 'DG' });
      await userEvent.click(dgOption);

      // Verify updateFormData was called
      expect(mockUpdateFormData).toHaveBeenCalledWith({ currency: 'DG' });
    });

    it('should display native currency symbol correctly (CELO vs ETH)', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 42220 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find currency select
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(currencySelect);

      // Verify CELO (not ETH) is shown
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /celo/i })).toBeInTheDocument();
      });
    });
  });

  describe('Loading and error states', () => {
    it('should show loading state when networks are loading', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(
        mockUseNetworkConfigs({ isLoading: true })
      );

      renderWithProviders(
        <TicketSettings
          formData={baseFormData}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should show loading spinner
      expect(screen.getByText('Loading networks...')).toBeInTheDocument();
    });

    it('should show error alert when network loading fails', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(
        mockUseNetworkConfigs({ error: 'Failed to load network configurations' })
      );

      renderWithProviders(
        <TicketSettings
          formData={baseFormData}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should show error message
      expect(screen.getByText('Failed to load network configurations')).toBeInTheDocument();
    });

    it('should show error alert when no networks are available', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(
        mockUseNetworkConfigs({ networks: [] })
      );

      renderWithProviders(
        <TicketSettings
          formData={baseFormData}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should show no networks error
      expect(screen.getByText('No active networks available. Please contact administrator.')).toBeInTheDocument();
    });
  });

  describe('Payment method interactions', () => {
    it('should only show currency dropdown when crypto payment is selected', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, paymentMethod: 'free' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Currency dropdown should NOT be visible for free payment
      const currencyLabel = screen.queryByText('Currency');
      expect(currencyLabel).not.toBeInTheDocument();
    });

    it('should show currency dropdown when crypto payment is selected', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, paymentMethod: 'crypto' }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Currency dropdown SHOULD be visible for crypto payment
      const currencyLabel = screen.getByText('Currency');
      const currencySection = currencyLabel.closest('.space-y-2');
      const currencySelect = currencySection?.querySelector('[role="combobox"]');
      expect(currencySelect).toBeInTheDocument();
    });
  });

  describe('Form data updates', () => {
    it('should call updateFormData when network is changed', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: 8453 }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading networks...')).not.toBeInTheDocument();
      });

      // Find network select
      const networkLabel = screen.getByText('Network');
      const networkSection = networkLabel.closest('.space-y-2');
      const networkSelect = networkSection?.querySelector('[role="combobox"]') as HTMLElement;
      await userEvent.click(networkSelect);

      // Select Ethereum (Celo is disabled in mock data due to missing Unlock factory)
      const ethereumOption = await screen.findByRole('option', { name: /ethereum/i });
      await userEvent.click(ethereumOption);

      // Verify updateFormData was called with new chain ID
      expect(mockUpdateFormData).toHaveBeenCalledWith({ chainId: 1 });
    });

    it('should initialize chainId from first available network if not set', async () => {
      const { useNetworkConfigs } = await import('@/hooks/useNetworkConfigs');
      vi.mocked(useNetworkConfigs).mockReturnValue(mockUseNetworkConfigs());

      renderWithProviders(
        <TicketSettings
          formData={{ ...baseFormData, chainId: undefined as any }}
          updateFormData={mockUpdateFormData}
          onNext={mockOnNext}
        />
      );

      // Should set chainId to first network (Base: 8453)
      await waitFor(() => {
        expect(mockUpdateFormData).toHaveBeenCalledWith({ chainId: 8453 });
      });
    });
  });
});

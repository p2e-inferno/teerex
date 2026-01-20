/**
 * Tests for TicketSettingsDisplay component with on-chain sync UI
 *
 * Tests the enhanced TicketSettingsDisplay that detects and displays
 * pricing mismatches with sync actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketSettingsDisplay } from '../TicketSettingsDisplay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as useEventLockState from '@/hooks/useEventLockState';
import { supabase } from '@/integrations/supabase/client';
import type { EventFormData } from '@/pages/CreateEvent';

// Mock dependencies
vi.mock('@/hooks/useEventLockState');
vi.mock('@/integrations/supabase/client');
vi.mock('@/hooks/use-toast');

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('TicketSettingsDisplay', () => {
  let queryClient: QueryClient;

  const mockFormData: EventFormData = {
    title: 'Test Event',
    description: 'Test description',
    date: new Date('2026-02-20'),
    endDate: new Date('2026-02-21'),
    time: '14:00',
    location: 'Test Location',
    eventType: 'physical',
    capacity: 100,
    price: 500,
    currency: 'DG',
    ngnPrice: 0,
    paymentMethod: 'crypto',
    category: 'tech',
    imageUrl: 'https://example.com/image.jpg',
    chainId: 8453,
    ticketDuration: 'event',
    isPublic: true,
    allowWaitlist: false,
    hasAllowList: false,
    transferable: true,
  };

  const mockEventId = 'event-123';
  const mockLockAddress = '0xLOCK123';

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('No Mismatch State', () => {
    it('should display green checkmark when pricing matches', async () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        error: null,
        hasMismatch: false,
        onChainPrice: 500,
        onChainCurrency: 'DG',
        onChainTokenAddress: '0xDG',
        mismatchType: 'none',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      // Check for success indicator
      expect(screen.getByText(/Database and on-chain pricing match/i)).toBeInTheDocument();
      expect(screen.queryByText(/Pricing Mismatch Detected/i)).not.toBeInTheDocument();
    });

    it('should display all form values correctly', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: false,
        onChainData: { price: 500, currency: 'DG', tokenAddress: '0xDG' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: null,
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText('crypto')).toBeInTheDocument();
      expect(screen.getByText('DG')).toBeInTheDocument();
      expect(screen.getByText('500 DG')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should show refresh button', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: false,
        onChainData: { price: 500, currency: 'DG', tokenAddress: '0xDG' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: null,
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Refresh Status/i)).toBeInTheDocument();
    });
  });

  describe('Mismatch Detection State', () => {
    it('should display red alert when mismatch detected', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Pricing Mismatch Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/prevents ticket purchases/i)).toBeInTheDocument();
    });

    it('should display both database and on-chain values', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      // Check comparison display
      expect(screen.getByText(/Database:/i)).toBeInTheDocument();
      expect(screen.getByText(/500 DG/i)).toBeInTheDocument();
      expect(screen.getByText(/On-Chain:/i)).toBeInTheDocument();
      expect(screen.getByText(/0 ETH/i)).toBeInTheDocument();
    });

    it('should show sync button when mismatch exists', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Update Database \(Match Lock\)/i)).toBeInTheDocument();
    });

    it('should display price mismatch type correctly', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 5, currency: 'USDC', tokenAddress: '0xUSDC' },
        databaseData: { price: 10, currency: 'USDC' },
        mismatchType: 'price',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={{ ...mockFormData, currency: 'USDC', price: 10 }}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      // Both should show USDC but different amounts
      expect(screen.getByText(/10 USDC/i)).toBeInTheDocument();
      expect(screen.getByText(/5 USDC/i)).toBeInTheDocument();
    });

    it('should display currency mismatch type correctly', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        error: null,
        hasMismatch: true,
        onChainPrice: 10,
        onChainCurrency: 'DG',
        onChainTokenAddress: '0xDG',
        mismatchType: 'currency',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={{ ...mockFormData, currency: 'USDC', price: 10 }}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      // Same price but different currencies
      expect(screen.getByText(/10 USDC/i)).toBeInTheDocument();
      expect(screen.getByText(/10 DG/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should display loading indicator while querying', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: true,
        hasMismatch: false,
        onChainData: null,
        databaseData: null,
        mismatchType: null,
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Checking on-chain configuration/i)).toBeInTheDocument();
    });

    it('should disable buttons during loading', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: true,
        hasMismatch: false,
        onChainData: null,
        databaseData: null,
        mismatchType: null,
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const refreshButton = screen.getByText(/Refresh Status/i).closest('button');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Error State', () => {
    it('should display error message on RPC failure', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        isError: true,
        error: new Error('RPC request failed'),
        hasMismatch: false,
        onChainData: null,
        databaseData: null,
        mismatchType: null,
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/failed to check on-chain status/i)).toBeInTheDocument();
    });

    it('should allow retry on error', () => {
      const mockRefetch = vi.fn();

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        isError: true,
        error: new Error('Network error'),
        hasMismatch: false,
        onChainData: null,
        databaseData: null,
        mismatchType: null,
        refetch: mockRefetch,
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const retryButton = screen.getByText(/Retry/i);
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call refetch when Refresh button clicked', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: false,
        onChainData: { price: 500, currency: 'DG', tokenAddress: '0xDG' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: null,
        refetch: mockRefetch,
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const refreshButton = screen.getByText(/Refresh Status/i);
      await user.click(refreshButton);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('should call edge function when Update Database clicked', async () => {
      const user = userEvent.setup();
      const mockInvoke = vi.fn().mockResolvedValue({
        data: { ok: true, event: { ...mockFormData, price: 0, currency: 'ETH' } },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const syncButton = screen.getByText(/Update Database \(Match Lock\)/i);
      await user.click(syncButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync-event-pricing-from-chain', {
          body: { event_id: mockEventId },
          headers: expect.objectContaining({
            Authorization: expect.any(String),
            'X-Privy-Authorization': expect.any(String),
          }),
        });
      });
    });

    it('should show loading state during sync', async () => {
      const user = userEvent.setup();
      const mockInvoke = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const syncButton = screen.getByText(/Update Database \(Match Lock\)/i);
      await user.click(syncButton);

      // Should show spinner during sync
      expect(screen.getByRole('button', { name: /Update Database/i })).toBeDisabled();
    });

    it('should show success toast after sync', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { ok: true, event: { price: 0, currency: 'ETH' } },
        error: null,
      });

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: mockRefetch,
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const syncButton = screen.getByText(/Update Database \(Match Lock\)/i);
      await user.click(syncButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: expect.stringContaining('Database updated'),
        });
        expect(mockRefetch).toHaveBeenCalled();
      });
    });

    it('should show error toast on sync failure', async () => {
      const user = userEvent.setup();

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Sync failed' },
      });

      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        hasMismatch: true,
        onChainData: { price: 0, currency: 'ETH', tokenAddress: '0x0' },
        databaseData: { price: 500, currency: 'DG' },
        mismatchType: 'both',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      const syncButton = screen.getByText(/Update Database \(Match Lock\)/i);
      await user.click(syncButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: expect.stringContaining('Failed'),
          variant: 'destructive',
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing eventId gracefully', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        error: null,
        hasMismatch: false,
        onChainPrice: null,
        onChainCurrency: null,
        onChainTokenAddress: null,
        mismatchType: 'none',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={mockFormData}
          eventId=""
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      // Should not query on-chain
      expect(useEventLockState.useEventLockState).toHaveBeenCalledWith({
        lockAddress: mockLockAddress,
        chainId: mockFormData.chainId,
        dbPrice: 500,
        dbCurrency: 'DG'
      });
    });

    it('should handle USDC currency display', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        error: null,
        hasMismatch: true,
        onChainPrice: 100,
        onChainCurrency: 'USDC',
        onChainTokenAddress: '0xUSDC',
        mismatchType: 'none',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={{ ...mockFormData, currency: 'USDC', price: 100 }}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/100 USDC/i)).toBeInTheDocument();
    });

    it('should handle free events correctly', () => {
      vi.mocked(useEventLockState.useEventLockState).mockReturnValue({
        isLoading: false,
        error: null,
        hasMismatch: false,
        onChainPrice: 0,
        onChainCurrency: 'ETH',
        onChainTokenAddress: '0x0',
        mismatchType: 'none',
        refetch: vi.fn(),
      } as any);

      render(
        <TicketSettingsDisplay
          formData={{ ...mockFormData, paymentMethod: 'free', price: 0, currency: 'ETH' }}
          eventId={mockEventId}
          lockAddress={mockLockAddress}
        />,
        { wrapper }
      );

      expect(screen.getByText(/0 ETH/i)).toBeInTheDocument();
    });
  });
});

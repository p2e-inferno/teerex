import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import type { EventFormData } from '@/pages/CreateEvent';

const { mockPreviewProtectedEventReserveBond } = vi.hoisted(() => ({
  mockPreviewProtectedEventReserveBond: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    authenticated: false,
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('@/hooks/useNetworkConfigs', () => ({
  useNetworkConfigs: () => ({
    networks: [
      {
        chain_id: 11155111,
        chain_name: 'Ethereum Sepolia',
        native_currency_symbol: 'ETH',
        native_currency_name: 'Ethereum',
        unlock_factory_address: '0xunlock',
        refundable_event_manager_address: '0xmanager',
        is_mainnet: false,
      },
    ],
    isLoading: false,
    error: null,
    getNetworkByChainId: () => ({
      chain_id: 11155111,
      chain_name: 'Ethereum Sepolia',
      native_currency_symbol: 'ETH',
      native_currency_name: 'Ethereum',
      unlock_factory_address: '0xunlock',
      refundable_event_manager_address: '0xmanager',
      is_mainnet: false,
    }),
    getAvailableTokens: () => ['ETH'],
    getTokenAddress: () => null,
  }),
}));

vi.mock('@/hooks/useTokenMetadata', () => ({
  useMultipleTokenMetadata: () => ({ metadataMap: {} }),
  tokenMetadataQueryKeys: {
    byToken: vi.fn(() => ['token-metadata']),
  },
  fetchTokenMetadata: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/utils/lockUtils', () => ({
  previewProtectedEventReserveBond: mockPreviewProtectedEventReserveBond,
}));

const baseFormData: EventFormData = {
  title: 'Protected Event',
  description: 'Desc',
  date: new Date('2026-04-26T10:00:00Z'),
  endDate: null,
  time: '14:00',
  endTime: '16:00',
  location: 'Genesis',
  eventType: 'physical',
  capacity: 10,
  price: 0.0002,
  currency: 'ETH',
  ngnPrice: 0,
  paymentMethod: 'crypto',
  category: 'Other',
  imageUrl: '',
  chainId: 11155111,
  ticketDuration: 'event',
  customDurationDays: undefined,
  isPublic: true,
  allowWaitlist: false,
  hasAllowList: false,
  transferable: false,
  refundProtectionEnabled: true,
  refundMinAttendees: 1,
  refundTriggerAt: '2026-04-26T13:50:00.000Z',
  refundEventEndAt: '2026-04-26T16:00:00.000Z',
  refundReserveBond: null,
  refundStatus: null,
};

function TicketSettingsHarness({ initialFormData = baseFormData }: { initialFormData?: EventFormData }) {
  const [formData, setFormData] = React.useState(initialFormData);
  const updateFormData = React.useCallback((updates: Partial<EventFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <TicketSettings
      formData={formData}
      updateFormData={updateFormData}
      onNext={() => {}}
    />
  );
}

describe('TicketSettings reserve bond preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewProtectedEventReserveBond.mockResolvedValue({
      currentProtocolFeeBps: '500',
      effectiveFeeBps: '750',
      reserveBond: '100000000000000',
      decimals: 18,
      symbol: 'ETH',
    });
  });

  it('does not refetch the reserve-bond preview on each price keystroke', async () => {
    renderWithProviders(<TicketSettingsHarness />);

    await waitFor(() => {
      expect(mockPreviewProtectedEventReserveBond).toHaveBeenCalledTimes(1);
    });

    const priceInput = screen.getByLabelText(/price/i);

    fireEvent.change(priceInput, { target: { value: '0.00035' } });

    expect(mockPreviewProtectedEventReserveBond).toHaveBeenCalledTimes(1);

    fireEvent.blur(priceInput);

    await waitFor(() => {
      expect(mockPreviewProtectedEventReserveBond).toHaveBeenCalledTimes(2);
    });
  });
});

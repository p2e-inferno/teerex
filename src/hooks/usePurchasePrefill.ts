import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { PurchaseFormResponseValues, PurchaseFormSchema } from '@/types/purchaseForm';

interface PurchasePrefillResponse {
  email?: string | null;
  prefill?: PurchaseFormResponseValues | null;
  prefill_source?: string | null;
  purchase_form_schema?: PurchaseFormSchema | null;
}

interface PurchasePrefillState {
  email: string | null;
  prefill: PurchaseFormResponseValues;
  prefillSource: string | null;
  purchaseFormSchema: PurchaseFormSchema | null;
}

const EMPTY_PREFILL: PurchasePrefillState = {
  email: null,
  prefill: {},
  prefillSource: null,
  purchaseFormSchema: null,
};

export function usePurchasePrefill(
  walletAddress: string | null | undefined,
  eventId: string | null | undefined,
  enabled = true,
): PurchasePrefillState {
  const { getAccessToken } = usePrivy();
  const [state, setState] = useState<PurchasePrefillState>(EMPTY_PREFILL);

  const normalizedWallet = useMemo(() => {
    const trimmed = walletAddress?.trim().toLowerCase();
    return trimmed && /^0x[a-f0-9]{40}$/.test(trimmed) ? trimmed : null;
  }, [walletAddress]);

  const normalizedEventId = useMemo(() => {
    const trimmed = eventId?.trim();
    return trimmed || null;
  }, [eventId]);

  useEffect(() => {
    if (!enabled || (!normalizedWallet && !normalizedEventId)) {
      setState(EMPTY_PREFILL);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY_PREFILL, prefillSource: normalizedWallet });

    (async () => {
      try {
        const token = await getAccessToken?.();
        const canFetchWalletPrefill = Boolean(token && normalizedWallet);

        const data = await callEdgeFunction<PurchasePrefillResponse>(
          'get-purchase-form-prefill',
          {
            ...(canFetchWalletPrefill ? { wallet_address: normalizedWallet } : {}),
            ...(normalizedEventId ? { event_id: normalizedEventId } : {}),
          },
          { privyToken: token ?? null },
        );

        if (cancelled) return;
        setState({
          email: data?.email || null,
          prefill: data?.prefill ?? {},
          prefillSource: normalizedWallet || data?.prefill_source || null,
          purchaseFormSchema: data?.purchase_form_schema ?? null,
        });
      } catch {
        if (!cancelled) setState(EMPTY_PREFILL);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, getAccessToken, normalizedEventId, normalizedWallet]);

  return state;
}

export function useApplyPurchaseEmailPrefill(
  prefillEmail: string | null,
  prefillSource: string | null,
  setEmail: Dispatch<SetStateAction<string>>,
) {
  const lastAutoPrefillRef = useRef<{ email: string; source: string | null } | null>(null);

  useEffect(() => {
    setEmail((current) => {
      const previous = lastAutoPrefillRef.current;
      if (!prefillEmail) {
        if (previous && current === previous.email && previous.source !== prefillSource) {
          lastAutoPrefillRef.current = null;
          return '';
        }
        return current;
      }

      const shouldApply = !current.trim() || Boolean(previous && current === previous.email);
      if (!shouldApply) return current;

      lastAutoPrefillRef.current = { email: prefillEmail, source: prefillSource };
      return prefillEmail;
    });
  }, [prefillEmail, prefillSource, setEmail]);
}

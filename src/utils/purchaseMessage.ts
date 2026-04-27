import { isEmptyHtml } from '@/utils/textUtils';

const MAX_PURCHASE_MESSAGE_HTML_LENGTH = 10000;

export const normalizePurchaseMessage = (
  value: string | null | undefined
): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || isEmptyHtml(trimmed)) return null;
  if (trimmed.length > MAX_PURCHASE_MESSAGE_HTML_LENGTH) {
    throw new Error(
      `Purchase message exceeds the ${MAX_PURCHASE_MESSAGE_HTML_LENGTH.toLocaleString()} character limit.`
    );
  }
  return trimmed;
};

export const PURCHASE_MESSAGE_MAX_LENGTH = MAX_PURCHASE_MESSAGE_HTML_LENGTH;

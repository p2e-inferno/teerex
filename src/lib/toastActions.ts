import { createElement } from 'react';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';

export const TOAST_DURATIONS = {
  cta: 15000,
} as const;

interface ToastActionConfig {
  label: string;
  altText: string;
  onClick: () => void;
}

export function createToastAction({ label, altText, onClick }: ToastActionConfig): ToastActionElement {
  return createElement(
    ToastAction,
    { altText, onClick },
    label,
  ) as unknown as ToastActionElement;
}

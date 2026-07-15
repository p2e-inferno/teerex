export interface FiatCheckoutEnvironment {
  VITE_ENABLE_FIAT?: string;
  VITE_PAYSTACK_PUBLIC_KEY?: string;
}

export function getFiatCheckoutConfig(
  env: FiatCheckoutEnvironment = import.meta.env
) {
  const enabled = String(env.VITE_ENABLE_FIAT).toLowerCase() === 'true';
  const publicKey = env.VITE_PAYSTACK_PUBLIC_KEY?.trim() || null;

  return {
    enabled,
    publicKey,
    configured: Boolean(publicKey),
    available: enabled && Boolean(publicKey),
  };
}

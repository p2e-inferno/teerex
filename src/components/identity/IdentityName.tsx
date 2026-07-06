import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';

interface IdentityNameProps extends HTMLAttributes<HTMLSpanElement> {
  address?: string | null;
  displayName?: string | null;
  ensName?: string | null;
  fallback?: string;
  preferEns?: boolean;
}

export function IdentityName({
  address,
  displayName,
  ensName,
  fallback,
  preferEns = true,
  className,
  ...props
}: IdentityNameProps) {
  const identity = useIdentityLabel({
    address,
    displayName,
    ensName,
    fallback,
    enabled: preferEns,
  });

  return (
    <span
      className={cn(identity.source === 'address' && 'font-mono', className)}
      {...props}
    >
      {identity.label}
    </span>
  );
}

import { Wallet, Building2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PayoutDestination = 'seller' | 'platform';

const DEFAULT_COMMISSION_PERCENT = 5;

interface PayoutDestinationFieldProps {
  value: PayoutDestination;
  onChange: (value: PayoutDestination) => void;
  /** Platform commission % applied on seller payouts (for the explainer copy). */
  commissionPercent?: number | null;
  /** Noun for the thing being sold, e.g. "pass", "bundle", "event". */
  noun?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Lets a creator/vendor/organizer choose where fiat proceeds settle:
 *  - "seller": their verified bank payout account (split, platform takes a commission).
 *  - "platform": directly to the platform account — for platform-run, sponsored, or free
 *    community listings where the creator isn't collecting the money themselves.
 *
 * The explainer copy is intentionally plain and reassuring so non-crypto creators understand the
 * trade-off without reading docs.
 */
export const PayoutDestinationField = ({
  value,
  onChange,
  commissionPercent,
  noun = 'listing',
  disabled,
  className,
}: PayoutDestinationFieldProps) => {
  const pct = commissionPercent ?? DEFAULT_COMMISSION_PERCENT;

  const options: Array<{
    key: PayoutDestination;
    icon: typeof Wallet;
    title: string;
    blurb: string;
  }> = [
    {
      key: 'seller',
      icon: Wallet,
      title: 'My payout account',
      blurb: `Naira sales land in your bank automatically. A ${pct}% platform fee applies — you keep ${100 - pct}%. Best for anything you're selling for yourself.`,
    },
    {
      key: 'platform',
      icon: Building2,
      title: 'Platform account',
      blurb: `Proceeds go straight to TeeRex. Use this for platform-run, sponsored, or free community ${noun}s where you're not collecting the money yourself — no payout account needed.`,
    },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-sm font-medium">Where should the money go?</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as PayoutDestination)}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.key;
          return (
            <label
              key={opt.key}
              htmlFor={`payout-dest-${opt.key}`}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-muted hover:border-primary/40',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <RadioGroupItem value={opt.key} id={`payout-dest-${opt.key}`} className="mt-1" />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <Icon className="h-4 w-4 shrink-0" />
                  {opt.title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{opt.blurb}</p>
              </div>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
};

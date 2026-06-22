import { Link, useLocation } from 'react-router-dom';
import { Wallet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEFAULT_COMMISSION_PERCENT = 5;

/**
 * The "set up your payout account first" card. Explains the platform commission (mirrors the vendor
 * payout flow's 5% / you-keep-95% copy) and routes to the setup page.
 */
export const PayoutAccountRequiredCard = ({
  percentage = DEFAULT_COMMISSION_PERCENT,
  context = 'selling',
}: {
  percentage?: number | null;
  context?: string;
}) => {
  const pct = percentage ?? DEFAULT_COMMISSION_PERCENT;
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
      <div className="flex gap-2">
        <Wallet className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Set up a payout account before {context}</p>
          <p className="text-xs mt-1 leading-relaxed">
            Fiat sales settle to your bank through a verified payout account. A{' '}
            <span className="font-semibold">{pct}% platform commission</span> applies to each sale —
            you keep <span className="font-semibold">{100 - pct}%</span>. This is required up front so
            you can always receive your Naira; you can't list until it's set up.
          </p>
          <p className="text-xs mt-2 leading-relaxed">
            Already added a bank account for DG redemption? That's a separate account for cashing out
            rewards — selling passes needs this one set up too.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/vendor/payout-account" state={{ returnTo }}>
              Set up payout account <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

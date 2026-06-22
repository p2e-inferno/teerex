import { ExternalLink, WalletCards } from 'lucide-react';

interface PassDeliveryDetailsProps {
  txHash?: string | null;
  explorerUrl?: string | null;
  profileHref?: string;
  showMessage?: boolean;
}

function shortenHash(hash: string): string {
  if (hash.length <= 22) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function PassDeliveryDetails({
  txHash,
  explorerUrl,
  profileHref = '/profile',
  showMessage = true,
}: PassDeliveryDetailsProps) {
  const displayHash = txHash ? shortenHash(txHash) : null;

  return (
    <div className="mt-2 min-w-0 space-y-3">
      {showMessage && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your pass value has been delivered to your wallet.
        </p>
      )}

      {displayHash && (
        <div className="min-w-0 rounded-md border bg-muted/40 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Transaction hash
          </div>
          <div className="mt-1.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code
              title={txHash ?? undefined}
              className="min-w-0 truncate rounded bg-background px-2 py-1 font-mono text-xs text-foreground ring-1 ring-border"
            >
              {displayHash}
            </code>

            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Explorer
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs leading-relaxed text-muted-foreground">
          Balances may take a moment to refresh.
        </span>
        <a
          href={profileHref}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
          View in profile
        </a>
      </div>
    </div>
  );
}

export const PassDeliveryToast = PassDeliveryDetails;

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

interface TransferSuccessToastProps {
  amount: string;
  tokenSymbol: string;
  recipient: string;
  txHash: string;
  explorerUrl: string;
}

export function TransferSuccessToast({
  amount,
  tokenSymbol,
  recipient,
  txHash,
  explorerUrl,
}: TransferSuccessToastProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy tx hash:', err);
    }
  };

  const shortTx = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
  const shortRecipient = `${recipient.slice(0, 6)}...${recipient.slice(-4)}`;

  return (
    <div className="flex flex-col gap-2 mt-1 min-w-0">
      <p className="text-sm text-muted-foreground">
        Sent {amount} {tokenSymbol} to {shortRecipient}.
      </p>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Tx:</span>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-600 hover:text-violet-700 dark:text-violet-400 underline font-mono font-medium flex items-center gap-1"
        >
          {shortTx}
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1 rounded border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          title="Copy transaction hash"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

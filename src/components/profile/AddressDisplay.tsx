import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, ExternalLink, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import { cn } from '@/lib/utils';

interface AddressDisplayProps {
  address: string;
  chainId?: number;
  label?: string;
  showCopy?: boolean;
  showExplorer?: boolean;
  className?: string;
}

/**
 * Truncates an Ethereum address for display
 * @param address - Full address
 * @returns Truncated address (0x1234...5678)
 */
const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Address display component with copy and explorer link functionality
 *
 * @param address - The Ethereum address to display
 * @param chainId - Optional chain ID for block explorer link
 * @param label - Optional label to show before address
 * @param showCopy - Show copy button (default: true)
 * @param showExplorer - Show explorer link button (default: true if chainId provided)
 * @param className - Additional CSS classes
 */
export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  chainId,
  label,
  showCopy = true,
  showExplorer = !!chainId,
  className = '',
}) => {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Address copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      toast({
        title: 'Copy Failed',
        description: 'Could not copy address',
        variant: 'destructive',
      });
    }
  };

  const getExplorerUrl = async (): Promise<string | null> => {
    if (!chainId) return null;

    try {
      // Use the address explorer URL pattern (not transaction URL)
      // The getExplorerTxUrl is for transactions, we need to construct address URL
      const txUrl = await getExplorerTxUrl(chainId, 'dummy');
      // Replace /tx/dummy with /address/{address}
      return txUrl.replace('/tx/dummy', `/address/${address}`);
    } catch (error) {
      console.error('Failed to get explorer URL:', error);
      return null;
    }
  };

  const handleExplorerClick = async () => {
    const url = await getExplorerUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}:</span>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-slate-700 dark:text-slate-200 cursor-help tracking-tight">
            {formatAddress(address)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 text-white border-0">
          <p className="font-mono text-xs break-all max-w-xs">{address}</p>
        </TooltipContent>
      </Tooltip>

      {showCopy && (
        <button
          onClick={handleCopy}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700',
            'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
            copied && 'text-emerald-500 hover:text-emerald-500'
          )}
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {showExplorer && chainId && (
        <button
          onClick={handleExplorerClick}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700',
            'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          )}
          title="View on block explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins } from 'lucide-react';

interface BalanceRowProps {
  symbol: string;
  balance: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

/**
 * Balance row component for displaying a single token balance in a table
 *
 * @param symbol - The token symbol (e.g., 'ETH', 'USDC')
 * @param balance - The formatted balance string (e.g., '1.5 ETH')
 * @param icon - Optional icon component to display before symbol
 * @param isLoading - Show skeleton loader instead of data
 */
export const BalanceRow: React.FC<BalanceRowProps> = ({
  symbol,
  balance,
  icon,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        </TableCell>
        <TableCell className="text-right">
          <Skeleton className="h-4 w-24 ml-auto" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          {icon || <Coins className="h-5 w-5 text-muted-foreground" />}
          <span className="font-medium">{symbol}</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        {balance}
      </TableCell>
    </TableRow>
  );
};

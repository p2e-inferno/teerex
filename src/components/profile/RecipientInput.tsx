import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useENSResolution } from '@/hooks/useENSResolution';
import { validateRecipient } from '@/utils/transferValidation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  onResolvedAddress?: (address: string | null) => void;
  chainId?: number;
  disabled?: boolean;
}

/**
 * Recipient input component with ENS resolution
 *
 * Features:
 * - Real-time ENS name resolution (debounced 500ms)
 * - Address validation
 * - Visual feedback (checkmark/X/spinner)
 * - Shows resolved address for ENS names
 *
 * @param value - Current input value
 * @param onChange - Callback when input changes
 * @param onResolvedAddress - Callback with resolved address (for ENS) or validated address
 * @param chainId - Chain ID (currently unused, ENS only on mainnet)
 * @param disabled - Disable input
 */
export const RecipientInput: React.FC<RecipientInputProps> = ({
  value,
  onChange,
  onResolvedAddress,
  chainId: _chainId, // Currently unused - ENS only resolves on Ethereum mainnet
  disabled = false,
}) => {
  // Validate recipient format
  const validation = validateRecipient(value);

  // Resolve ENS if needed
  const { address: resolvedAddress, isResolving, isValidENS } = useENSResolution(
    validation.requiresENSResolution ? value : undefined
  );

  // Notify parent of resolved address
  React.useEffect(() => {
    if (!onResolvedAddress) return;

    if (validation.valid && !validation.requiresENSResolution && validation.address) {
      // Direct address - already validated
      onResolvedAddress(validation.address);
    } else if (validation.requiresENSResolution && resolvedAddress) {
      // ENS resolved successfully
      onResolvedAddress(resolvedAddress);
    } else if (validation.requiresENSResolution && !isResolving && !resolvedAddress) {
      // ENS failed to resolve
      onResolvedAddress(null);
    } else if (!validation.valid) {
      // Invalid input
      onResolvedAddress(null);
    }
  }, [validation, resolvedAddress, isResolving, onResolvedAddress]);

  // Determine validation state
  const getValidationState = () => {
    if (!value) return null;

    if (isResolving) {
      return 'resolving';
    }

    if (validation.requiresENSResolution) {
      if (resolvedAddress) {
        return 'valid';
      } else if (!isResolving) {
        return 'invalid';
      }
    }

    if (validation.valid && validation.address) {
      return 'valid';
    }

    if (!validation.valid) {
      return 'invalid';
    }

    return null;
  };

  const validationState = getValidationState();

  return (
    <div className="space-y-2">
      <Label htmlFor="recipient">Recipient Address or ENS Name</Label>
      <div className="relative">
        <Input
          id="recipient"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x... or vitalik.eth"
          disabled={disabled}
          className={`pr-10 ${
            validationState === 'valid'
              ? 'border-green-500 focus-visible:ring-green-500'
              : validationState === 'invalid'
              ? 'border-red-500 focus-visible:ring-red-500'
              : ''
          }`}
        />

        {/* Validation indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validationState === 'resolving' && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {validationState === 'valid' && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {validationState === 'invalid' && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>

      {/* Show resolved address for ENS */}
      {isValidENS && resolvedAddress && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Resolves to: {resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}
        </p>
      )}

      {/* Show error for ENS that doesn't resolve */}
      {isValidENS && !isResolving && !resolvedAddress && value.length > 0 && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          ENS name not found
        </p>
      )}

      {/* Show error for invalid input */}
      {!isValidENS && validation.error && value.length > 0 && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          {validation.error}
        </p>
      )}
    </div>
  );
};

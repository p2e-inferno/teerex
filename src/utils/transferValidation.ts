import { ethers } from 'ethers';
import { isValidENSName } from './ensUtils';

/**
 * Result of recipient validation
 */
export interface RecipientValidationResult {
  valid: boolean;
  address?: string;
  error?: string;
  requiresENSResolution?: boolean;
}

/**
 * Result of amount validation
 */
export interface AmountValidationResult {
  valid: boolean;
  parsed?: bigint;
  error?: string;
}

/**
 * Validates a recipient input (address or ENS name)
 *
 * Note: For ENS names, this only validates format - actual resolution
 * must be done separately using the useENSResolution hook
 *
 * @param input - The recipient string (address or ENS name)
 * @returns Validation result with address (if valid) or error message
 *
 * @example
 * validateRecipient('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')
 * // { valid: true, address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' }
 *
 * validateRecipient('vitalik.eth')
 * // { valid: true, requiresENSResolution: true }
 *
 * validateRecipient('invalid')
 * // { valid: false, error: 'Invalid address or ENS name' }
 */
export function validateRecipient(input: string): RecipientValidationResult {
  if (!input || !input.trim()) {
    return {
      valid: false,
      error: 'Recipient address is required',
    };
  }

  const trimmed = input.trim();

  // Check if it's a valid Ethereum address
  if (ethers.isAddress(trimmed)) {
    // Return checksummed address
    return {
      valid: true,
      address: ethers.getAddress(trimmed),
    };
  }

  // Check if it's a valid ENS name format
  if (isValidENSName(trimmed)) {
    return {
      valid: true,
      requiresENSResolution: true,
    };
  }

  // Neither valid address nor ENS name
  return {
    valid: false,
    error: 'Invalid address or ENS name',
  };
}

/**
 * Validates a transfer amount against balance and constraints
 *
 * @param amount - The amount string to validate (human-readable, e.g., "1.5")
 * @param balance - The available balance in smallest unit (wei/atoms)
 * @param decimals - The token decimals
 * @param isNative - Whether this is a native token transfer (requires gas buffer)
 * @param gasEstimate - Optional custom gas estimate (default: 21000 for native, 65000 for ERC-20)
 * @returns Validation result with parsed bigint amount or error message
 *
 * @example
 * validateTransferAmount('1.5', parseEther('2'), 18, true)
 * // { valid: true, parsed: 1500000000000000000n }
 *
 * validateTransferAmount('10', parseEther('2'), 18, false)
 * // { valid: false, error: 'Insufficient balance' }
 *
 * validateTransferAmount('0', parseEther('2'), 18, false)
 * // { valid: false, error: 'Amount must be greater than 0' }
 */
export function validateTransferAmount(
  amount: string,
  balance: bigint,
  decimals: number,
  isNative: boolean,
  gasEstimate?: bigint
): AmountValidationResult {
  if (!amount || !amount.trim()) {
    return {
      valid: false,
      error: 'Amount is required',
    };
  }

  const trimmed = amount.trim();

  // Validate numeric format
  if (!/^\d+\.?\d*$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid amount format',
    };
  }

  // Parse to bigint
  let parsed: bigint;
  try {
    parsed = ethers.parseUnits(trimmed, decimals);
  } catch (error) {
    return {
      valid: false,
      error: 'Amount has too many decimal places',
    };
  }

  // Check amount > 0
  if (parsed <= 0n) {
    return {
      valid: false,
      error: 'Amount must be greater than 0',
    };
  }

  // For native transfers, check if amount + gas <= balance
  if (isNative) {
    const estimatedGas = gasEstimate || estimateTransferGas(true);
    const totalRequired = parsed + estimatedGas;

    if (totalRequired > balance) {
      return {
        valid: false,
        error: 'Insufficient balance (including gas)',
      };
    }
  } else {
    // For ERC-20 transfers, just check amount <= balance
    // (gas is paid in native token separately)
    if (parsed > balance) {
      return {
        valid: false,
        error: 'Insufficient balance',
      };
    }
  }

  return {
    valid: true,
    parsed,
  };
}

/**
 * Estimates gas cost for a token transfer
 *
 * Returns conservative gas estimates with 10% buffer
 *
 * @param isNative - Whether this is a native token transfer
 * @returns Estimated gas cost in wei
 *
 * @example
 * estimateTransferGas(true)  // 23100n (21000 * 1.1)
 * estimateTransferGas(false) // 71500n (65000 * 1.1)
 */
export function estimateTransferGas(isNative: boolean): bigint {
  // Conservative estimates with 10% buffer
  const BASE_NATIVE_GAS = 21000n;
  const BASE_ERC20_GAS = 65000n;
  const BUFFER_MULTIPLIER = 110n; // 110% = 10% buffer
  const DIVISOR = 100n;

  if (isNative) {
    return (BASE_NATIVE_GAS * BUFFER_MULTIPLIER) / DIVISOR;
  } else {
    return (BASE_ERC20_GAS * BUFFER_MULTIPLIER) / DIVISOR;
  }
}

/**
 * Calculates the maximum amount that can be transferred
 *
 * For native transfers, subtracts estimated gas from balance
 * For ERC-20 transfers, returns full balance
 *
 * @param balance - The available balance in smallest unit
 * @param isNative - Whether this is a native token transfer
 * @param gasEstimate - Optional custom gas estimate
 * @returns Maximum transferable amount in smallest unit
 *
 * @example
 * const maxNative = getMaxTransferAmount(parseEther('2'), true);
 * // Returns balance - gas estimate (e.g., ~1.999977 ETH)
 *
 * const maxERC20 = getMaxTransferAmount(parseUnits('100', 6), false);
 * // Returns full balance (100 USDC)
 */
export function getMaxTransferAmount(
  balance: bigint,
  isNative: boolean,
  gasEstimate?: bigint
): bigint {
  if (!isNative) {
    // For ERC-20, return full balance (gas paid in native separately)
    return balance;
  }

  // For native, subtract estimated gas
  const estimatedGas = gasEstimate || estimateTransferGas(true);
  const max = balance - estimatedGas;

  // Return 0 if balance can't cover gas
  return max > 0n ? max : 0n;
}

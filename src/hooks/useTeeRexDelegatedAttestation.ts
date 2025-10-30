import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { getBatchAttestationAddress } from '@/lib/config/contract-config';

/**
 * Hook for signing delegated attestations specifically for the TeeRex EIP712Proxy contract.
 *
 * This uses the TeeRex domain (not EAS domain) and the correct EIP-712 type structure
 * matching the ATTEST_PROXY_TYPEHASH from EIP712Proxy.sol:
 *
 * Attest(address attester,bytes32 schema,address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value,uint64 deadline)
 */

export interface TeeRexDelegatedAttestationSignature {
  signature: string; // 0x rsv
  deadline: bigint;
  attester: string; // user's address
}

export const useTeeRexDelegatedAttestation = () => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  const signTeeRexAttestation = async (params: {
    schemaUid: string;
    recipient: string;
    data: string; // 0x encoded EAS data
    deadlineSecondsFromNow?: number;
    chainId?: number; // default to Base Sepolia
    expirationTime?: bigint;
    revocable?: boolean;
    refUID?: string;
  }): Promise<TeeRexDelegatedAttestationSignature> => {
    if (!wallet) throw new Error('No wallet connected');
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const chainId = params.chainId ?? 84532; // Base Sepolia
    const contractAddress = getBatchAttestationAddress(chainId);
    if (!contractAddress) {
      throw new Error(`TeeRex contract not configured for chain ${chainId}`);
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600));
    const attester = await signer.getAddress();

    // EIP-712 domain for TeeRex proxy contract
    // This MUST match the domain used when TeeRex was deployed
    const domain = {
      name: 'TeeRex',
      version: '1.4.0', // EIP712Proxy version
      chainId,
      verifyingContract: contractAddress,
    };

    // EIP-712 type structure matching ATTEST_PROXY_TYPEHASH from EIP712Proxy.sol
    // CRITICAL: Field order must match exactly!
    const types = {
      Attest: [
        { name: 'attester', type: 'address' },
        { name: 'schema', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'expirationTime', type: 'uint64' },
        { name: 'revocable', type: 'bool' },
        { name: 'refUID', type: 'bytes32' },
        { name: 'data', type: 'bytes' },
        { name: 'value', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
      ],
    };

    const value = {
      attester,
      schema: params.schemaUid,
      recipient: params.recipient,
      expirationTime: params.expirationTime ?? 0n,
      revocable: params.revocable ?? false,
      refUID: params.refUID ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      data: params.data,
      value: 0n,
      deadline,
    };

    // Sign using EIP-712
    const signature = await signer.signTypedData(domain, types, value);

    return {
      signature,
      deadline,
      attester,
    };
  };

  return { signTeeRexAttestation };
};

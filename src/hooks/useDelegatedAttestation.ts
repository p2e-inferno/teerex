import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';

// EAS contract on Base Sepolia/Mainnet share same address in our config
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';

export interface DelegatedAttestationSignature {
  signature: string; // 0x rsv
  deadline: bigint;
  attester: string; // user's address
}

export const useDelegatedAttestation = () => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  const signDelegatedAttestation = async (params: {
    schemaUid: string;
    recipient: string;
    data: string; // 0x encoded EAS data
    deadlineSecondsFromNow?: number;
    chainId?: number; // default to Base Sepolia
  }): Promise<DelegatedAttestationSignature> => {
    if (!wallet) throw new Error('No wallet connected');
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const chainId = params.chainId ?? 84532;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600));

    // EAS delegated typed data structure
    const domain = {
      name: 'EAS',
      version: '1.0.0',
      chainId,
      verifyingContract: EAS_CONTRACT_ADDRESS,
    } as const;
    const types = {
      Attest: [
        { name: 'schema', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'expirationTime', type: 'uint64' },
        { name: 'revocable', type: 'bool' },
        { name: 'refUID', type: 'bytes32' },
        { name: 'data', type: 'bytes' },
        { name: 'value', type: 'uint256' },
      ],
      DelegatedAttestation: [
        { name: 'schema', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'expirationTime', type: 'uint64' },
        { name: 'revocable', type: 'bool' },
        { name: 'refUID', type: 'bytes32' },
        { name: 'data', type: 'bytes' },
        { name: 'value', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
      ],
    } as const;

    // EAS delegated attestation value
    const value = {
      schema: params.schemaUid,
      recipient: params.recipient,
      expirationTime: 0,
      revocable: false,
      refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
      data: params.data,
      value: 0,
      deadline,
    } as const;

    // Some wallets expect primary type matching the type list; try both
    let signature: string;
    try {
      signature = await (signer as any).signTypedData(domain, { DelegatedAttestation: types.DelegatedAttestation }, value);
    } catch (e) {
      signature = await (signer as any)._signTypedData(domain, { DelegatedAttestation: types.DelegatedAttestation }, value);
    }

    return { signature, deadline, attester: (await signer.getAddress()) };
  };

  return { signDelegatedAttestation };
};


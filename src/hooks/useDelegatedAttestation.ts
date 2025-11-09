import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { EAS } from '@ethereum-attestation-service/eas-sdk';

// EAS contract on Base Sepolia/Mainnet share same address in our config
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';

export interface DelegatedAttestationSignature {
  // Support either 0x-rsv string or EAS tuple-like signature
  signature: string | { v: number; r: string; s: string };
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
    expirationTime?: bigint;
    revocable?: boolean;
    refUID?: string;
  }): Promise<DelegatedAttestationSignature> => {
    if (!wallet) throw new Error('No wallet connected');
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600));
    const attester = await signer.getAddress();

    // Initialize EAS SDK
    const eas = new EAS(EAS_CONTRACT_ADDRESS);
    eas.connect(signer);

    // Get delegated interface
    const delegated = await eas.getDelegated();

    // Sign delegated attestation using EAS SDK
    const response = await delegated.signDelegatedAttestation(
      {
        schema: params.schemaUid,
        recipient: params.recipient,
        expirationTime: params.expirationTime ?? 0n,
        revocable: params.revocable ?? false,
        refUID: params.refUID ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
        data: params.data,
        deadline,
        value: 0n,
      },
      signer
    );

    return {
      signature: response.signature as any,
      deadline,
      attester
    };
  };

  return { signDelegatedAttestation };
};

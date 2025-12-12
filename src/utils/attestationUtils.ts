
import { ethers } from 'ethers';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { supabase } from '@/integrations/supabase/client';
import { getDivviBrowserProvider } from '@/lib/wallet/provider';

// EAS Contract addresses on Base Sepolia
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021'; // Base Sepolia EAS
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020'; // Base Sepolia Schema Registry

// EAS Contract ABI (correct standard EAS format)
const EAS_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "bytes32", "name": "schema", "type": "bytes32" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint64", "name": "expirationTime", "type": "uint64" },
          { "internalType": "bool", "name": "revocable", "type": "bool" },
          { "internalType": "bytes32", "name": "refUID", "type": "bytes32" },
          { "internalType": "bytes", "name": "data", "type": "bytes" }
        ],
        "internalType": "struct AttestationRequest",
        "name": "request",
        "type": "tuple"
      }
    ],
    "name": "attest",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          { "internalType": "bytes32", "name": "schema", "type": "bytes32" },
          { "internalType": "bytes32", "name": "uid", "type": "bytes32" }
        ],
        "internalType": "struct RevocationRequest",
        "name": "request",
        "type": "tuple"
      }
    ],
    "name": "revoke",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Schema Registry ABI (for registering new schemas)
const SCHEMA_REGISTRY_ABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "schema", "type": "string" },
      { "internalType": "address", "name": "resolver", "type": "address" },
      { "internalType": "bool", "name": "revocable", "type": "bool" }
    ],
    "name": "register",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export interface AttestationData {
  eventId: string;
  lockAddress: string;
  eventTitle: string;
  timestamp?: number;
  location?: string;
  rating?: number;
  review?: string;
  verificationType?: string;
  tokenId?: string;
  price?: number;
  expirationTime?: number;
  [key: string]: any; // Add index signature for compatibility with Json type
}

export interface CreateAttestationParams {
  schemaUid: string;
  recipient: string;
  data: AttestationData;
  expirationTime?: number;
  revocable?: boolean;
  wallet: any;
}

export interface AttestationResult {
  success: boolean;
  attestationUid?: string;
  transactionHash?: string;
  error?: string;
}

export const isValidAttestationUid = (uid?: string | null): boolean => {
  return typeof uid === 'string' && ethers.isHexString(uid, 32);
};

// Helpers for chain selection
const EAS_ADDRESS_BY_CHAIN: Record<number, string> = {
  8453: '0x4200000000000000000000000000000000000021',
  84532: '0x4200000000000000000000000000000000000021',
};
const RPC_URL_BY_CHAIN: Record<number, string> = {
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
};

export const isAttestationRevocableOnChain = async (
  uid: string,
  chainId: number = 84532
): Promise<boolean | null> => {
  try {
    if (!isValidAttestationUid(uid)) return null;
    const easAddr = EAS_ADDRESS_BY_CHAIN[chainId] || EAS_ADDRESS_BY_CHAIN[84532];
    const rpc = RPC_URL_BY_CHAIN[chainId] || RPC_URL_BY_CHAIN[84532];
    const provider = new ethers.JsonRpcProvider(rpc);
    const eas = new EAS(easAddr);
    eas.connect(provider as any);
    const rec: any = await eas.getAttestation(uid);
    if (!rec) return null;
    // EAS SDK returns an object with `revocable` boolean
    return Boolean((rec as any).revocable);
  } catch (e) {
    console.warn('isAttestationRevocableOnChain failed:', e);
    return null;
  }
};

/**
 * Encodes attestation data according to the schema definition
 */
export const encodeAttestationData = (schemaDefinition: string, data: AttestationData): string => {
  try {
    // Parse schema definition and order fields correctly
    console.log('Schema definition:', schemaDefinition);
    const fields = schemaDefinition.split(',').map(field => field.trim());
    console.log('Parsed fields:', fields);
    const types: string[] = [];
    const values: any[] = [];

    fields.forEach((field, index) => {
      const [type, name] = field.split(' ');
      types.push(type);
      console.log(`Field ${index}: ${type} ${name}`);

      // Map data to schema fields in exact order
      switch (name) {
        case 'eventId':
          values.push(data.eventId);
          console.log('Added eventId:', data.eventId);
          break;
        case 'lockAddress':
          values.push(data.lockAddress);
          console.log('Added lockAddress:', data.lockAddress);
          break;
        case 'eventTitle':
          values.push(data.eventTitle);
          console.log('Added eventTitle:', data.eventTitle);
          break;
        case 'timestamp': {
          const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
          values.push(timestamp);
          console.log('Added timestamp:', timestamp);
          break;
        }
        case 'location': {
          const location = data.location || 'Metaverse';
          values.push(location);
          console.log('Added location:', location);
          break;
        }
        case 'platform':
          values.push('TeeRex');
          console.log('Added platform: TeeRex');
          break;
        case 'rating':
          values.push(data.rating || 0);
          break;
        case 'review':
          values.push(data.review || '');
          break;
        case 'verificationType':
          values.push(data.verificationType || '');
          break;
        case 'tokenId':
          values.push(data.tokenId || '0');
          break;
        case 'price':
          values.push(data.price || 0);
          break;
        case 'expirationTime':
          values.push(data.expirationTime || 0);
          break;
        case 'ticketHolder':
        case 'purchaser':
        case 'keyHolder':
        case 'creatorAddress':
          values.push(ethers.ZeroAddress);
          break;
        default:
          // For unknown fields, provide appropriate defaults based on type
          if (type === 'address') {
            values.push(ethers.ZeroAddress);
          } else if (type.startsWith('uint')) {
            values.push(0);
          } else {
            values.push('');
          }
      }
    });

    console.log('Types for encoding:', types);
    console.log('Values for encoding:', values);
    
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, values);
    console.log('Encoded data:', encoded);
    console.log('Encoded data hex length:', encoded.length);
    
    return encoded;
  } catch (error) {
    console.error('Error encoding attestation data:', error);
    throw new Error('Failed to encode attestation data: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

/**
 * Creates an attestation on-chain using EAS SDK
 */
export const createAttestation = async (params: CreateAttestationParams): Promise<AttestationResult> => {
  try {
    const { schemaUid, recipient, data, expirationTime, revocable = true, wallet } = params;

    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get schema definition from database
    const { data: schema, error: schemaError } = await supabase
      .from('attestation_schemas')
      .select('schema_definition, revocable')
      .eq('schema_uid', schemaUid)
      .single();

    if (schemaError || !schema) {
      throw new Error('Schema not found');
    }

    const ethersProvider = await getDivviBrowserProvider(wallet);
    const signer = await ethersProvider.getSigner();

    // Initialize EAS with the Base Sepolia contract address
    const eas = new EAS(EAS_CONTRACT_ADDRESS);
    eas.connect(signer);

    // Initialize SchemaEncoder with the exact schema definition
    const schemaEncoder = new SchemaEncoder(schema.schema_definition);
    
    // Prepare data entries dynamically from the schema definition
    const defaultTimestamp = BigInt(data.timestamp || Math.floor(Date.now() / 1000));
    const defaultLocation = data.location || 'Metaverse';
    const defaultPlatform = 'TeeRex';

    // Helper to coerce values to expected types
    const toTypedValue = (type: string, val: any): any => {
      if (type.startsWith('uint')) {
        try {
          if (typeof val === 'bigint') return val;
          if (typeof val === 'number') return BigInt(Math.trunc(val));
          if (typeof val === 'string') return BigInt(val);
        } catch (_) {
          return 0n;
        }
        return 0n;
      }
      if (type === 'address') {
        return typeof val === 'string' && val ? val : ethers.ZeroAddress;
      }
      if (type === 'bool' || type === 'boolean') {
        return Boolean(val);
      }
      if (type === 'bytes32') {
        const zero = '0x0000000000000000000000000000000000000000000000000000000000000000';
        return typeof val === 'string' && val.startsWith('0x') && val.length === 66 ? val : zero;
      }
      // default string/bytes
      return val ?? '';
    };

    const fields = schema.schema_definition.split(',').map(f => f.trim()).filter(Boolean);
    const encoderItems: { name: string; value: any; type: string }[] = [];

    for (const field of fields) {
      const parts = field.split(/\s+/);
      if (parts.length < 2) continue;
      const [type, name] = [parts[0], parts[1]];

      // First try to use provided data
      let value: any = (data as any)[name];

      // Then apply smart defaults for known names
      if (value === undefined) {
        switch (name) {
          case 'eventId':
            value = data.eventId ?? '';
            break;
          case 'lockAddress':
            value = data.lockAddress ?? ethers.ZeroAddress;
            break;
          case 'eventTitle':
            value = data.eventTitle ?? '';
            break;
          case 'timestamp':
            value = defaultTimestamp;
            break;
          case 'location':
            value = defaultLocation;
            break;
          case 'platform':
            value = defaultPlatform;
            break;
          case 'attendee':
          case 'declarer':
          case 'ticketHolder':
          case 'purchaser':
          case 'keyHolder':
          case 'creatorAddress':
            value = recipient;
            break;
          case 'tokenId':
          case 'expirationTime':
          case 'rating':
            value = 0n;
            break;
          case 'review':
            value = '';
            break;
          default:
            // Leave undefined; will be coerced to a sensible default below
            break;
        }
      }

      // Coerce to correct type
      const typedValue = toTypedValue(type, value);
      encoderItems.push({ name, value: typedValue, type });
    }

    // Encode data using EAS SDK - dynamic fields
    const encodedData = schemaEncoder.encodeData(encoderItems);

    console.log('EAS SDK encoded data:', encodedData);

    // Create attestation using EAS SDK - this should trigger MetaMask
    const tx = await eas.attest({
      schema: schemaUid,
      data: {
        recipient: recipient,
        expirationTime: BigInt(expirationTime || 0),
        revocable: revocable && schema.revocable,
        refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
        data: encodedData,
      }
    });
    
    console.log('EAS SDK transaction sent:', tx);
    // Wait for chain receipt and get the actual UID
    const newUid: string = await (tx as any).wait();
    if (!isValidAttestationUid(newUid)) {
      throw new Error('Failed to obtain attestation UID from EAS');
    }
    // Try to capture tx hash for logging (not used as UID)
    let transactionHash: string | undefined;
    try {
      transactionHash = (tx as any).hash || (tx as any).data?.hash || undefined;
    } catch (_) {
      transactionHash = undefined;
    }

    // Check if user already has an attestation for this event
    const { data: existingAttestation } = await supabase
      .from('attestations')
      .select('id')
      .eq('event_id', data.eventId)
      .eq('recipient', recipient)
      .eq('schema_uid', schemaUid)
      .eq('is_revoked', false)
      .single();

    if (existingAttestation) {
      return {
        success: false,
        error: 'You have already created an attestation for this event'
      };
    }

    // Save attestation to our database using the real UID
    const { error: saveError } = await supabase
      .from('attestations')
      .insert({
        attestation_uid: newUid,
        schema_uid: schemaUid,
        attester: wallet.address,
        recipient: recipient,
        event_id: data.eventId,
        data: data as any,
        expiration_time: expirationTime ? new Date(expirationTime * 1000).toISOString() : null,
        // The trigger will populate lock_address and creator_address from the event
      });

    if (saveError) {
      console.error('Error saving attestation to database:', saveError);
      // Don't fail the transaction if database save fails, the blockchain transaction succeeded
    }

    return {
      success: true,
      attestationUid: newUid,
      transactionHash,
    };

  } catch (error) {
    console.error('Error creating attestation:', error);
    
    let errorMessage = 'Failed to create attestation';
    if (error instanceof Error) {
      if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
        errorMessage = 'Transaction was cancelled by user';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Revokes an attestation on-chain
 */
export const revokeAttestation = async (
  schemaUid: string,
  attestationUid: string,
  wallet: any,
  chainId?: number
): Promise<AttestationResult> => {
  try {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    if (!isValidAttestationUid(attestationUid)) {
      throw new Error('Invalid attestation UID. Please reload and try again.');
    }

    const ethersProvider = await getDivviBrowserProvider(wallet);
    const signer = await ethersProvider.getSigner();

    const easAddress = (chainId && EAS_ADDRESS_BY_CHAIN[chainId]) ? EAS_ADDRESS_BY_CHAIN[chainId] : EAS_CONTRACT_ADDRESS;
    const easContract = new ethers.Contract(easAddress, EAS_ABI, signer);

    const revocationRequest = {
      schema: schemaUid,
      uid: attestationUid
    };

    const tx = await easContract.revoke(revocationRequest);
    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    // Update attestation in database
    const { error } = await supabase
      .from('attestations')
      .update({
        is_revoked: true,
        revocation_time: new Date().toISOString()
      })
      .eq('attestation_uid', attestationUid);

    if (error) {
      console.error('Error updating attestation in database:', error);
    }

    return {
      success: true,
      transactionHash: tx.hash
    };

  } catch (error) {
    console.error('Error revoking attestation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revoke attestation'
    };
  }
};

/**
 * Gets attestations for an event from the database
 */
export const getEventAttestations = async (eventId: string) => {
  try {
    const { data, error } = await supabase
      .from('attestations')
      .select(`
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `)
      .eq('event_id', eventId)
      .eq('is_revoked', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching event attestations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching event attestations:', error);
    return [];
  }
};

/**
 * Gets attestations for a specific user
 */
export const getUserAttestations = async (userAddress: string) => {
  try {
    const { data, error } = await supabase
      .from('attestations')
      .select(`
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `)
      .eq('recipient', userAddress)
      .eq('is_revoked', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user attestations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching user attestations:', error);
    return [];
  }
};

/**
 * Gets available attestation schemas
 */
export const getAttestationSchemas = async (category?: string) => {
  try {
    let query = supabase
      .from('attestation_schemas')
      .select('*')
      .order('name');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching attestation schemas:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching attestation schemas:', error);
    return [];
  }
};


import { ethers } from 'ethers';
import { supabase } from '@/integrations/supabase/client';

// EAS Contract addresses on Base Sepolia
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021'; // Base Sepolia EAS
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020'; // Base Sepolia Schema Registry

// EAS Contract ABI (simplified for attestation creation)
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

/**
 * Encodes attestation data according to the schema definition
 */
export const encodeAttestationData = (schemaDefinition: string, data: AttestationData): string => {
  try {
    // Parse schema definition to understand the data structure
    const fields = schemaDefinition.split(',').map(field => field.trim());
    const types: string[] = [];
    const values: any[] = [];

      fields.forEach(field => {
        const [type, name] = field.split(' ');
        types.push(type);

        // Map data to schema fields based on the exact schema definition
        switch (name) {
          case 'eventId':
            values.push(data.eventId);
            break;
          case 'lockAddress':
            // Ensure this is treated as an address type
            values.push(data.lockAddress);
            break;
          case 'eventTitle':
            values.push(data.eventTitle);
            break;
          case 'timestamp':
            values.push(data.timestamp || Math.floor(Date.now() / 1000));
            break;
          case 'location':
            values.push(data.location || 'Metaverse');
            break;
          case 'platform':
            values.push('TeeRex');
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

    return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
  } catch (error) {
    console.error('Error encoding attestation data:', error);
    throw new Error('Failed to encode attestation data');
  }
};

/**
 * Creates an attestation on-chain using EAS
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

    // Get Ethereum provider
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Create EAS contract instance
    const easContract = new ethers.Contract(EAS_CONTRACT_ADDRESS, EAS_ABI, signer);

    // Encode the attestation data
    const encodedData = encodeAttestationData(schema.schema_definition, data);

    // Prepare attestation request
    const attestationRequest = {
      schema: schemaUid,
      recipient: recipient,
      expirationTime: expirationTime || 0,
      revocable: revocable && schema.revocable,
      refUID: ethers.ZeroHash,
      data: encodedData
    };

    console.log('Creating attestation with request:', attestationRequest);

    // Submit attestation to EAS
    const tx = await easContract.attest(attestationRequest);
    console.log('Attestation transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Attestation transaction confirmed:', receipt);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    // Extract attestation UID from transaction logs
    let attestationUid = '';
    if (receipt.logs && receipt.logs.length > 0) {
      // Look for Attested event in logs
      for (const log of receipt.logs) {
        try {
          // Attested event signature: Attested(address,address,bytes32,bytes32)
          if (log.topics && log.topics[0] === '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f7de2c888dbf0e4e1bb4c69e9bcb7') {
            attestationUid = log.topics[3]; // UID is the 4th topic
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    // Save attestation to our database with proper type casting
    const { error: saveError } = await supabase
      .from('attestations')
      .insert({
        attestation_uid: attestationUid,
        schema_uid: schemaUid,
        attester: wallet.address,
        recipient: recipient,
        event_id: data.eventId,
        data: data as any, // Cast to any for Json compatibility
        expiration_time: expirationTime ? new Date(expirationTime * 1000).toISOString() : null
      });

    if (saveError) {
      console.error('Error saving attestation to database:', saveError);
      // Don't fail the entire operation if database save fails
    }

    return {
      success: true,
      attestationUid,
      transactionHash: tx.hash
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
  wallet: any
): Promise<AttestationResult> => {
  try {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const easContract = new ethers.Contract(EAS_CONTRACT_ADDRESS, EAS_ABI, signer);

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

import { ethers } from 'ethers';
import { supabase } from '@/integrations/supabase/client';

// Schema Registry Contract on Base Sepolia
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';

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

export interface RegisterSchemaParams {
  name: string;
  description: string;
  category: string;
  schemaDefinition: string;
  revocable: boolean;
  wallet: any;
}

export interface SchemaRegistrationResult {
  success: boolean;
  schemaUid?: string;
  transactionHash?: string;
  error?: string;
}

/**
 * Registers a new schema on EAS Schema Registry
 */
export const registerSchema = async (params: RegisterSchemaParams): Promise<SchemaRegistrationResult> => {
  try {
    const { name, description, category, schemaDefinition, revocable, wallet } = params;

    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get Ethereum provider
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Create Schema Registry contract instance
    const schemaRegistry = new ethers.Contract(SCHEMA_REGISTRY_ADDRESS, SCHEMA_REGISTRY_ABI, signer);

    console.log('Registering schema:', schemaDefinition);

    // Register the schema on-chain
    const tx = await schemaRegistry.register(
      schemaDefinition,
      ethers.ZeroAddress, // No resolver
      revocable
    );

    console.log('Schema registration transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('Schema registration confirmed:', receipt);

    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    // Extract schema UID from transaction logs
    let schemaUid = '';
    if (receipt.logs && receipt.logs.length > 0) {
      // Look for Registered event in logs
      for (const log of receipt.logs) {
        try {
          // Registered event signature: Registered(bytes32,address,bool,string)
          if (log.topics && log.topics[0] === '0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98d60a2c8d34f3e1b40ba5c38e8b73') {
            schemaUid = log.topics[1]; // UID is the 2nd topic
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }

    if (!schemaUid) {
      throw new Error('Failed to extract schema UID from transaction');
    }

    // Save schema to our database
    const { error: saveError } = await supabase
      .from('attestation_schemas')
      .insert({
        schema_uid: schemaUid,
        name,
        description,
        category,
        schema_definition: schemaDefinition,
        revocable
      });

    if (saveError) {
      console.error('Error saving schema to database:', saveError);
      // Don't fail the entire operation if database save fails
    }

    return {
      success: true,
      schemaUid,
      transactionHash: tx.hash
    };

  } catch (error) {
    console.error('Error registering schema:', error);
    
    let errorMessage = 'Failed to register schema';
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
 * Gets all attestation schemas from the database
 */
export const getAttestationSchemas = async (category?: string) => {
  try {
    let query = supabase
      .from('attestation_schemas')
      .select('*')
      .order('created_at', { ascending: false });

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

/**
 * Gets a specific schema by UID
 */
export const getSchemaByUid = async (schemaUid: string) => {
  try {
    const { data, error } = await supabase
      .from('attestation_schemas')
      .select('*')
      .eq('schema_uid', schemaUid)
      .single();

    if (error) {
      console.error('Error fetching schema:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching schema:', error);
    return null;
  }
};
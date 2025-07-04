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
      console.log('Transaction logs:', receipt.logs);
      
      // Calculate the correct event signature hash
      // Event: Registered(bytes32,address,(bytes32,address,bool,string))
      const eventSignature = 'Registered(bytes32,address,(bytes32,address,bool,string))';
      const eventTopic = ethers.id(eventSignature);
      console.log('Expected event topic:', eventTopic);
      
      for (const log of receipt.logs) {
        console.log('Log topics:', log.topics);
        try {
          if (log.topics && log.topics.length >= 2 && log.topics[0] === eventTopic) {
            schemaUid = log.topics[1]; // UID is the first indexed parameter
            console.log('Found schema UID:', schemaUid);
            break;
          }
        } catch (e) {
          console.error('Error parsing log:', e);
          continue;
        }
      }
      
      // If we didn't find it with the struct signature, try the simplified one
      if (!schemaUid) {
        const simpleEventSignature = 'Registered(bytes32,address)';
        const simpleEventTopic = ethers.id(simpleEventSignature);
        console.log('Trying simple event topic:', simpleEventTopic);
        
        for (const log of receipt.logs) {
          try {
            if (log.topics && log.topics.length >= 2 && log.topics[0] === simpleEventTopic) {
              schemaUid = log.topics[1];
              console.log('Found schema UID with simple signature:', schemaUid);
              break;
            }
          } catch (e) {
            continue;
          }
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
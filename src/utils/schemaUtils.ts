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
      } else if (error.message.includes('0x23369fa6') || error.message.includes('AlreadyExists')) {
        errorMessage = 'Schema already exists - this exact schema definition has been registered before. Try modifying the schema or check existing schemas.';
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

/**
 * Checks if a schema already exists on EAS registry by querying our database first,
 * then checking the registry if not found locally
 */
export const checkSchemaExists = async (schemaDefinition: string, wallet: any): Promise<{ exists: boolean; schemaUid?: string }> => {
  try {
    // First check our database for existing schemas with this definition
    const { data: existingSchemas, error } = await supabase
      .from('attestation_schemas')
      .select('schema_uid')
      .eq('schema_definition', schemaDefinition);

    if (error) {
      console.error('Error checking database for existing schema:', error);
    }

    // If we found it in our database, it exists
    if (existingSchemas && existingSchemas.length > 0) {
      return { 
        exists: true, 
        schemaUid: existingSchemas[0].schema_uid 
      };
    }

    // If not in our database, check the registry directly
    if (!wallet) {
      return { exists: false };
    }

    // Get Ethereum provider
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);

    // Create a contract instance to call the registry
    const schemaRegistryContract = new ethers.Contract(SCHEMA_REGISTRY_ADDRESS, [
      {
        "inputs": [{ "internalType": "bytes32", "name": "uid", "type": "bytes32" }],
        "name": "getSchema",
        "outputs": [
          {
            "components": [
              { "internalType": "bytes32", "name": "uid", "type": "bytes32" },
              { "internalType": "address", "name": "resolver", "type": "address" },
              { "internalType": "bool", "name": "revocable", "type": "bool" },
              { "internalType": "string", "name": "schema", "type": "string" }
            ],
            "internalType": "struct SchemaRecord",
            "name": "",
            "type": "tuple"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ], ethersProvider);

    // Try multiple potential schema UIDs since EAS might use different hashing methods
    const potentialUids = [
      ethers.keccak256(ethers.toUtf8Bytes(schemaDefinition)),
      ethers.solidityPackedKeccak256(['string'], [schemaDefinition])
    ];

    for (const schemaUid of potentialUids) {
      try {
        const schemaRecord = await schemaRegistryContract.getSchema(schemaUid);
        
        // If we get a result and the schema string matches, it exists
        if (schemaRecord && schemaRecord.schema === schemaDefinition && schemaRecord.schema !== '') {
          return { exists: true, schemaUid };
        }
      } catch (error) {
        // Continue to next potential UID
        continue;
      }
    }
    
    return { exists: false };

  } catch (error) {
    console.error('Error checking schema existence:', error);
    return { exists: false };
  }
};

/**
 * Imports an existing schema into our database
 */
export const importExistingSchema = async (params: {
  schemaUid: string;
  name: string;
  description: string;
  category: string;
  schemaDefinition: string;
  revocable: boolean;
}): Promise<SchemaRegistrationResult> => {
  try {
    const { schemaUid, name, description, category, schemaDefinition, revocable } = params;

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
      throw new Error('Failed to import schema: ' + saveError.message);
    }

    return {
      success: true,
      schemaUid
    };

  } catch (error) {
    console.error('Error importing schema:', error);
    
    let errorMessage = 'Failed to import schema';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};
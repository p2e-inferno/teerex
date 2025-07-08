import { supabase } from '@/integrations/supabase/client';

export async function grantKeysManually(transactionReference: string) {
  try {
    const { data, error } = await supabase.functions.invoke('grant-keys-manual', {
      body: { transactionReference }
    });

    if (error) {
      console.error('Error calling grant-keys-manual function:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to grant keys manually:', error);
    throw error;
  }
}
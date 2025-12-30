import type { Database } from '@/integrations/supabase/types';

export type GamingBundle = Database['public']['Tables']['gaming_bundles']['Row'] & {
  sold_count?: number;
};

export type GamingBundleOrder = Database['public']['Tables']['gaming_bundle_orders']['Row'];

export type GamingBundleRedemption = Database['public']['Tables']['gaming_bundle_redemptions']['Row'];

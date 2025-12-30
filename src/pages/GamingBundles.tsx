import { GamingBundleCard } from '@/components/gaming/GamingBundleCard';
import { useGamingBundles } from '@/hooks/useGamingBundles';
import { Loader2 } from 'lucide-react';

const GamingBundles = () => {
  const { data: bundles = [], isLoading } = useGamingBundles();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gaming Bundles</h1>
          <p className="text-gray-600">Purchase time and match bundles from partnered gaming centers.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : bundles.length === 0 ? (
          <div className="text-sm text-gray-500">No bundles available yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {bundles.map(bundle => (
              <GamingBundleCard key={bundle.id} bundle={bundle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamingBundles;

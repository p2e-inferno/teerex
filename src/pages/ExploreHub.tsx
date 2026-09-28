import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Explore from '@/pages/Explore';
import { CollectiblesExplorePanel } from '@/components/collectibles/CollectiblesExplorePanel';

export default function ExploreHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'collectibles' ? 'collectibles' : 'events';

  if (tab === 'events') {
    return (
      <div>
        <div className="container mx-auto max-w-6xl px-6 pt-8">
          <div className="inline-flex rounded-lg border bg-white p-1">
            <Button size="sm" variant="default">Events</Button>
            <Button size="sm" variant="ghost" onClick={() => setParams({ tab: 'collectibles' })}>Collectibles</Button>
          </div>
        </div>
        <Explore />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-6xl px-6">
        <div className="mb-7 inline-flex rounded-lg border bg-white p-1">
          <Button size="sm" variant="ghost" onClick={() => setParams({ tab: 'events' })}>Events</Button>
          <Button size="sm" variant="default">Collectibles</Button>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Explore Collectibles</h1>
          <p className="mt-2 text-gray-600">Discover limited digital editions from creators and support work you care about.</p>
        </div>
        <CollectiblesExplorePanel />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TicketPassCard } from '@/components/ticket-pass/TicketPassCard';
import { TicketPassCreationDialog } from '@/components/ticket-pass/TicketPassCreationDialog';
import { useTicketPasses } from '@/hooks/useTicketPasses';

const TicketPasses = () => {
  const { authenticated } = usePrivy();
  const { data: passes = [], isLoading, refetch } = useTicketPasses();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ticket Passes</h1>
            <p className="text-gray-600">Buy a pass with Naira and get the on-chain value to enter token-gated events.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to="/my-pass-orders">My passes</Link></Button>
            {authenticated && (
              <>
                <Button asChild variant="outline"><Link to="/my-ticket-passes">Manage</Link></Button>
                <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create pass</Button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
        ) : passes.length === 0 ? (
          <div className="text-sm text-gray-500">No ticket passes available yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {passes.map((pass) => <TicketPassCard key={pass.id} pass={pass} />)}
          </div>
        )}
      </div>

      <TicketPassCreationDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); refetch(); }}
      />
    </div>
  );
};

export default TicketPasses;

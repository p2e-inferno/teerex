import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TicketPassCard } from '@/components/ticket-pass/TicketPassCard';
import { TicketPassCreationDialog } from '@/components/ticket-pass/TicketPassCreationDialog';
import { useTicketPasses } from '@/hooks/useTicketPasses';

const MyTicketPasses = () => {
  const { authenticated } = usePrivy();
  const navigate = useNavigate();
  const { data: passes = [], isLoading, refetch } = useTicketPasses({ mine: true }, { enabled: authenticated });
  const [createOpen, setCreateOpen] = useState(false);

  if (!authenticated) {
    return <div className="container mx-auto px-6 max-w-3xl py-16 text-sm text-gray-500">Sign in to manage your passes.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Ticket Passes</h1>
            <p className="text-gray-600">Passes you've created and funded.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create pass</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
        ) : passes.length === 0 ? (
          <div className="text-sm text-gray-500">You haven't created any passes yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {passes.map((pass) => (
              <TicketPassCard key={pass.id} pass={pass} manage onManage={(p) => navigate(`/ticket-passes/${p.id}`)} />
            ))}
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

export default MyTicketPasses;

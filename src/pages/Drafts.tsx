
import React, { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useNavigate, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileText, ExternalLink } from 'lucide-react';
import { EventDraft } from '@/types/event';
import { getDrafts, deleteDraft } from '@/utils/supabaseDraftStorage';
import { savePublishedEvent } from '@/utils/eventUtils';
import { DraftCard } from '@/components/create-event/DraftCard';
import { useToast } from '@/hooks/use-toast';
import { deployLock, getBlockExplorerUrl } from '@/utils/lockUtils';
import { baseSepolia } from 'wagmi/chains';

const Drafts = () => {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<EventDraft[]>([]);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDrafts = async () => {
      try {
        if (user?.id) {
          const fetchedDrafts = await getDrafts(user.id);
          setDrafts(fetchedDrafts);
        }
      } catch (error) {
        console.error('Error loading drafts:', error);
        toast({
          title: "Error Loading Drafts",
          description: "There was an error loading your drafts.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDrafts();
  }, [toast, user?.id]);

  const handleEdit = (draft: EventDraft) => {
    navigate(`/create?draft=${draft.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      if (user?.id) {
        await deleteDraft(id, user.id);
        const updatedDrafts = await getDrafts(user.id);
        setDrafts(updatedDrafts);
        toast({
          title: "Draft Deleted",
          description: "Your event draft has been deleted.",
        });
      }
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast({
        title: "Error Deleting Draft",
        description: "There was an error deleting your draft.",
        variant: "destructive"
      });
    }
  };

  const handlePublish = async (draft: EventDraft) => {
    setIsPublishing(draft.id);
    
    try {
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('Please connect a wallet to publish your event.');
      }

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('Using wallet for publishing:', wallet);

      const lockConfig = {
        name: draft.title,
        symbol: `${draft.title.slice(0, 3).toUpperCase()}TIX`,
        keyPrice: draft.currency === 'FREE' ? '0' : draft.price.toString(),
        maxNumberOfKeys: draft.capacity,
        expirationDuration: 86400,
        currency: draft.currency,
        price: draft.price
      };

      const deploymentResult = await deployLock(lockConfig, wallet, draft.chain_id ?? baseSepolia.id);
      
      if (deploymentResult.success && deploymentResult.transactionHash && deploymentResult.lockAddress) {
        // Convert draft to EventFormData format
        const formData = {
          title: draft.title,
          description: draft.description,
          date: draft.date,
          time: draft.time,
          location: draft.location,
          capacity: draft.capacity,
          // derive payment model
          paymentMethod: (draft.payment_methods && draft.payment_methods[0])
            ? (draft.payment_methods[0] as 'free' | 'crypto' | 'fiat')
            : (draft.currency && draft.currency !== 'FREE' ? 'crypto' : 'free'),
          price: draft.currency !== 'FREE' ? draft.price : 0,
          currency: (draft.currency && draft.currency !== 'FREE' ? (draft.currency as 'ETH' | 'USDC') : 'ETH'),
          ngnPrice: draft.ngn_price || 0,
          category: draft.category,
          imageUrl: draft.image_url || '',
          chainId: draft.chain_id ?? baseSepolia.id,
        } as any;

        // Save to published events
        await savePublishedEvent(formData, deploymentResult.lockAddress, deploymentResult.transactionHash, user.id);

        const explorerUrl = getBlockExplorerUrl(deploymentResult.transactionHash, baseSepolia.id);
        
        toast({
          title: "Event Published Successfully!",
          description: (
            <div className="space-y-2">
              <p>Your event has been published and the lock has been deployed.</p>
              <div className="text-sm text-gray-600">
                <p>Lock Address: {deploymentResult.lockAddress}</p>
              </div>
              <a 
                href={explorerUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
              >
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ),
        });
        
        // Remove from drafts after successful publish
        await deleteDraft(draft.id, user.id);
        const updatedDrafts = await getDrafts(user.id);
        setDrafts(updatedDrafts);
        
        // Navigate to my events page
        navigate('/my-events');
      } else {
        throw new Error(deploymentResult.error || 'Failed to deploy smart contract');
      }
    } catch (error) {
      console.error('Error publishing event:', error);
      
      let errorMessage = 'There was an error publishing your event. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transaction was cancelled. Please try again when ready.';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds to deploy the smart contract. Please add more ETH to your wallet.';
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Error Publishing Event",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsPublishing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Event Drafts</h1>
            <p className="text-gray-600">Loading your drafts...</p>
          </div>
        </div>
      </div>
    );
  }

    if (!authenticated) {
    return <Navigate to="/" replace />;
  }return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Event Drafts</h1>
            <p className="text-gray-600">Manage your saved event drafts</p>
          </div>
          <Button 
            onClick={() => navigate('/create')}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Event
          </Button>
        </div>

        {drafts.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <CardTitle className="text-gray-900">No drafts yet</CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <p className="text-gray-600 mb-6">
                Save events as drafts to continue working on them later.
              </p>
              <Button 
                onClick={() => navigate('/create')}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Event
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onPublish={handlePublish}
                isPublishing={isPublishing === draft.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Drafts;

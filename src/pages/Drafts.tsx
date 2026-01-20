
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useNavigate, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, FileText, ExternalLink } from 'lucide-react';
import { EventDraft } from '@/types/event';
import { getDraftsViaEdge } from '@/utils/edgeFunctionStorage';
import { DraftCard } from '@/components/create-event/DraftCard';
import { useToast } from '@/hooks/use-toast';
import { getBlockExplorerUrl } from '@/utils/lockUtils';
import { baseSepolia } from 'wagmi/chains';
import { useEventPublisher } from '@/hooks/useEventPublisher';
import type { EventFormData } from '@/pages/CreateEvent';

const Drafts = () => {
  const { authenticated, user, getAccessToken } = usePrivy();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<EventDraft[]>([]);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Shared event publisher hook
  const { publishEvent, isPublishing } = useEventPublisher();

  useEffect(() => {
    const loadDrafts = async () => {
      try {
        if (user?.id) {
          const accessToken = await getAccessToken();
          if (!accessToken) {
            console.error('No access token available for loading drafts');
            setIsLoading(false);
            return;
          }
          const fetchedDrafts = await getDraftsViaEdge(user.id, accessToken);
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
  }, [toast, user?.id, getAccessToken]);

  const handleEdit = (draft: EventDraft) => {
    navigate(`/create?draft=${draft.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      if (user?.id) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Authentication session expired. Please refresh the page.');
        }
        const { deleteDraftViaEdge } = await import('@/utils/edgeFunctionStorage');
        await deleteDraftViaEdge(id, user.id, accessToken);
        const updatedDrafts = await getDraftsViaEdge(user.id, accessToken);
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
    setPublishingDraftId(draft.id);

    // Determine payment method
    const paymentMethod = (draft.payment_methods && draft.payment_methods[0])
      ? (draft.payment_methods[0] as 'free' | 'crypto' | 'fiat')
      : 'free';

    // Convert draft to EventFormData format
    const formData: EventFormData = {
      title: draft.title,
      description: draft.description,
      date: draft.date,
      endDate: draft.end_date,
      time: draft.time,
      location: draft.location,
      eventType: (draft as any).event_type || 'physical',
      capacity: draft.capacity,
      paymentMethod,
      price: paymentMethod === 'crypto' ? (draft.price || 0) : 0,
      currency: paymentMethod === 'crypto' ? (draft.currency as any) : 'ETH',
      ngnPrice: draft.ngn_price || 0,
      category: draft.category,
      imageUrl: draft.image_url || '',
      chainId: draft.chain_id ?? baseSepolia.id,
      ticketDuration: (draft.ticket_duration as any) || 'event',
      customDurationDays: draft.custom_duration_days,
      isPublic: (draft as any).is_public ?? true,
      allowWaitlist: (draft as any).allow_waitlist ?? false,
      hasAllowList: (draft as any).has_allow_list ?? false,
      transferable: draft.transferable ?? false,
    };

    const result = await publishEvent(formData, {
      currentDraftId: draft.id,
      autoSaveOnError: false, // Don't auto-save drafts when publishing from drafts page
      onSuccess: async (savedEvent) => {
        const explorerUrl = await getBlockExplorerUrl(
          savedEvent.transaction_hash,
          draft.chain_id ?? baseSepolia.id
        );

        toast({
          title: "Event Published Successfully!",
          description: (
            <div className="space-y-2">
              <p>Your event has been published and the lock has been deployed.</p>
              <div className="text-sm text-gray-600">
                <p>Lock Address: {savedEvent.lock_address}</p>
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

        // Refresh drafts list
        const accessToken = await getAccessToken();
        if (accessToken && user?.id) {
          const updatedDrafts = await getDraftsViaEdge(user.id, accessToken);
          setDrafts(updatedDrafts);
        }

        // Navigate to my events page
        navigate('/my-events');
      }
    });

    // Handle duplicate event detection
    if (!result.success && result.error === 'DUPLICATE_EVENT' && result.duplicateEvent) {
      const { lockAddress, eventTitle } = result.duplicateEvent;

      const toastInstance = toast({
        title: "Event Already Exists",
        description: (
          <div className="space-y-2">
            <p className="text-sm">An event with these core details already exists:</p>
            <p className="font-medium text-sm">"{eventTitle}"</p>
            <p className="text-xs text-gray-600 mt-2">
              The event was already published from this draft. You can view it in your events.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => {
                  toastInstance.dismiss();
                  navigate(`/event/${lockAddress}`);
                }}
              >
                View Event
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  toastInstance.dismiss();
                  navigate('/my-events');
                }}
              >
                My Events
              </Button>
            </div>
          </div>
        ),
        duration: 15000,
      });
    }

    setPublishingDraftId(null);
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
                isPublishing={publishingDraftId === draft.id || isPublishing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Drafts;

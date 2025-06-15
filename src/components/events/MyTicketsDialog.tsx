
import React, { useState, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getEventsWithUserTickets, PublishedEvent } from '@/utils/eventUtils';
import { EventCard } from './EventCard';
import { Loader2, Ticket } from 'lucide-react';

interface MyTicketsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyTicketsDialog: React.FC<MyTicketsDialogProps> = ({ isOpen, onClose }) => {
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [tickets, setTickets] = useState<PublishedEvent[]>([]);

  useEffect(() => {
    const fetchTickets = async () => {
      const wallet = wallets[0];
      if (!isOpen || !wallet?.address) {
        setTickets([]);
        return;
      }

      setIsLoading(true);
      try {
        const userTickets = await getEventsWithUserTickets(wallet.address);
        setTickets(userTickets);
      } catch (error) {
        console.error("Failed to fetch tickets:", error);
        toast({
          title: "Error",
          description: "Could not load your tickets. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTickets();
  }, [isOpen, wallets, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>My Tickets</DialogTitle>
          <DialogDescription>
            A collection of all your blockchain-verified event tickets.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : tickets.length > 0 ? (
            <div className="space-y-4">
              {tickets.map((event) => (
                <EventCard 
                  key={event.id}
                  event={event}
                  showActions={false}
                  isTicketView={true}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 px-6 bg-gray-50 rounded-lg">
                <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                    <Ticket className="w-6 h-6 text-gray-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">No Tickets Yet</h3>
                <p className="text-gray-600 mt-1">
                    When you purchase a ticket for an event, it will appear here.
                </p>
                <Button onClick={onClose} className="mt-4 bg-purple-600 hover:bg-purple-700">
                    Explore Events
                </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

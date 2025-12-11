
import React, { useState, useEffect } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import { getEventsWithUserTickets } from '@/utils/eventUtils';
import type { PublishedEvent } from '@/types/event';
import { EventCard } from '@/components/events/EventCard';
import { Loader2, Ticket, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const MyTickets = () => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [tickets, setTickets] = useState<PublishedEvent[]>([]);
  
  useEffect(() => {
    const fetchTickets = async () => {
      const wallet = wallets[0];
      if (!authenticated || !wallet?.address) {
        setTickets([]);
        if (authenticated) setIsLoading(true);
        else setIsLoading(false);
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

    if (authenticated) {
        fetchTickets();
    } else {
        setIsLoading(false);
        setTickets([]);
    }
  }, [authenticated, wallets, toast]);
  
  if (!authenticated && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl text-center">
            <div className="py-20 px-6 bg-white rounded-lg shadow-sm border">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <User className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-800">Please Connect Your Wallet</h3>
                <p className="text-gray-600 mt-2 max-w-md mx-auto">
                    Connect your wallet to see your ticket collection.
                </p>
            </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Ticket Gallery</h1>
          <p className="text-gray-600">A collection of your blockchain-verified event tickets.</p>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
          </div>
        ) : tickets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
          <div className="text-center py-20 px-6 bg-white rounded-lg shadow-sm border">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <Ticket className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-800">No Tickets Yet</h3>
              <p className="text-gray-600 mt-2 max-w-md mx-auto">
                  When you purchase a ticket for an event, it will appear here as a unique collectible.
              </p>
              <Button asChild className="mt-6 bg-purple-600 hover:bg-purple-700">
                  <Link to="/explore">Explore Events</Link>
              </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTickets;


import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Calendar } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { getPublishedEvents, PublishedEvent } from '@/utils/eventUtils';
import { useToast } from '@/hooks/use-toast';
import { EventPurchaseDialog } from '@/components/events/EventPurchaseDialog';

const Explore = () => {
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<PublishedEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<PublishedEvent | null>(null);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const publishedEvents = await getPublishedEvents();
        setEvents(publishedEvents);
        setFilteredEvents(publishedEvents);
      } catch (error) {
        console.error('Error loading events:', error);
        toast({
          title: "Error Loading Events",
          description: "There was an error loading events. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [toast]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredEvents(events);
    } else {
      const filtered = events.filter(event =>
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredEvents(filtered);
    }
  }, [searchQuery, events]);

  const handleEventDetails = (event: PublishedEvent) => {
    setSelectedEvent(event);
    setIsPurchaseDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsPurchaseDialogOpen(false);
    setSelectedEvent(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Explore Events</h1>
            <p className="text-gray-600">Loading amazing Web3 events...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Explore Events</h1>
          <p className="text-gray-600">Discover amazing Web3 events with blockchain-verified tickets</p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search events, locations, categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-gray-300">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Button variant="outline" className="border-gray-300">
              <Calendar className="w-4 h-4 mr-2" />
              Date
            </Button>
          </div>
        </div>

        {/* Events Grid */}
        {filteredEvents.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <CardTitle className="text-gray-900">
                {events.length === 0 ? 'No events yet' : 'No matching events'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <p className="text-gray-600 mb-6">
                {events.length === 0 
                  ? 'Be the first to create an amazing Web3 event!'
                  : 'Try adjusting your search terms to find more events.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onViewDetails={handleEventDetails}
              />
            ))}
          </div>
        )}

        {/* Stats */}
        {events.length > 0 && (
          <div className="mt-8 text-center text-gray-600">
            <p>
              Showing {filteredEvents.length} of {events.length} events
            </p>
          </div>
        )}
      </div>
      <EventPurchaseDialog
        event={selectedEvent}
        isOpen={isPurchaseDialogOpen}
        onClose={handleCloseDialog}
      />
    </div>
  );
};

export default Explore;

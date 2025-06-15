
import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useNavigate, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, TrendingUp, Users, DollarSign } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { getUserEvents, PublishedEvent } from '@/utils/eventUtils';
import { useToast } from '@/hooks/use-toast';

const MyEvents = () => {
  const { authenticated, user } = usePrivy();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  const loadUserEvents = async () => {
    try {
      if (user?.id) {
        console.log('Loading events for user:', user.id);
        const userEvents = await getUserEvents(user.id);
        console.log('Loaded events:', userEvents);
        setEvents(userEvents);
      }
    } catch (error) {
      console.error('Error loading user events:', error);
      toast({
        title: "Error Loading Events",
        description: "There was an error loading your events. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUserEvents();
  }, [user?.id]);

  const handleEventDetails = (event: PublishedEvent) => {
    toast({
      title: "Coming Soon",
      description: "Event management features will be available soon!",
    });
  };

  const handleEditEvent = (event: PublishedEvent) => {
    console.log('Editing event:', event.id, 'Current image_url:', event.image_url);
    navigate(`/create?eventId=${event.id}`);
  };

  // Calculate stats
  const totalEvents = events.length;
  const totalCapacity = events.reduce((sum, event) => sum + event.capacity, 0);
  const freeEvents = events.filter(event => event.currency === 'FREE').length;
  const paidEvents = events.filter(event => event.currency !== 'FREE').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Events</h1>
            <p className="text-gray-600">Loading your events...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Events</h1>
            <p className="text-gray-600">Manage your Web3 events and track performance</p>
          </div>
          <Button 
            onClick={() => navigate('/create')}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Event
          </Button>
        </div>

        {/* Stats Cards */}
        {events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Events</p>
                    <p className="text-2xl font-bold text-gray-900">{events.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Capacity</p>
                    <p className="text-2xl font-bold text-gray-900">{events.reduce((sum, event) => sum + event.capacity, 0)}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Free Events</p>
                    <p className="text-2xl font-bold text-gray-900">{events.filter(event => event.currency === 'FREE').length}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Paid Events</p>
                    <p className="text-2xl font-bold text-gray-900">{events.filter(event => event.currency !== 'FREE').length}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Events Grid */}
        {events.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <CardTitle className="text-gray-900">No events yet</CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <p className="text-gray-600 mb-6">
                Create your first Web3 event with blockchain-verified tickets.
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
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Events</h2>
              <p className="text-gray-600">Events you've created and published</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => {
                console.log('Rendering event card for:', event.id, 'with image_url:', event.image_url);
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={handleEditEvent}
                    actionType="edit"
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyEvents;

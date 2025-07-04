import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Share2, 
  Heart,
  ArrowLeft,
  Ticket,
  ExternalLink,
  CalendarPlus,
  Copy,
  Facebook,
  Twitter,
  Linkedin
} from 'lucide-react';
import { getPublishedEvents, PublishedEvent } from '@/utils/eventUtils';
import { getTotalKeys, getUserKeyBalance, getMaxKeysPerAddress, checkKeyOwnership } from '@/utils/lockUtils';
import { EventPurchaseDialog } from '@/components/events/EventPurchaseDialog';
import { AttestationButton } from '@/components/attestations/AttestationButton';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  
  const [event, setEvent] = useState<PublishedEvent | null>(null);
  const [keysSold, setKeysSold] = useState<number>(0);
  const [userTicketCount, setUserTicketCount] = useState<number>(0);
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    const loadEvent = async () => {
      if (!id) return;
      
      setIsLoading(true);
      try {
        const events = await getPublishedEvents();
        const foundEvent = events.find(e => e.id === id);
        
        if (!foundEvent) {
          toast({
            title: "Event not found",
            description: "The event you're looking for doesn't exist.",
            variant: "destructive"
          });
          navigate('/explore');
          return;
        }
        
        setEvent(foundEvent);
        
        // Get tickets sold
        const sold = await getTotalKeys(foundEvent.lock_address);
        setKeysSold(sold);
        
        // Get max tickets per user for this event
        const maxKeys = await getMaxKeysPerAddress(foundEvent.lock_address);
        setMaxTicketsPerUser(maxKeys);
      } catch (error) {
        console.error('Error loading event:', error);
        toast({
          title: "Error loading event",
          description: "There was an error loading the event details.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadEvent();
  }, [id, navigate, toast]);

  // Load user ticket data when authenticated
  useEffect(() => {
    const loadUserTicketData = async () => {
      if (!authenticated || !wallet?.address || !event?.lock_address) return;
      
      try {
        const userBalance = await getUserKeyBalance(event.lock_address, wallet.address);
        setUserTicketCount(userBalance);
      } catch (error) {
        console.error('Error loading user ticket data:', error);
      }
    };

    loadUserTicketData();
  }, [authenticated, wallet?.address, event?.lock_address]);

  const handleShare = (platform?: string) => {
    const url = window.location.href;
    const title = event?.title || '';
    const description = event?.description || '';
    
    switch (platform) {
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
        break;
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'copy':
        navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          description: "Event link copied to clipboard",
        });
        break;
      default:
        if (navigator.share) {
          navigator.share({
            title,
            text: description,
            url,
          });
        } else {
          navigator.clipboard.writeText(url);
          toast({
            title: "Link copied",
            description: "Event link copied to clipboard",
          });
        }
    }
  };

  const handleAddToCalendar = () => {
    if (!event || !event.date || !event.time) return;

    // Parse the event time (assuming format like "7:00 PM" or "19:00")
    const parseEventTime = (timeString: string, eventDate: Date) => {
      const timeParts = timeString.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!timeParts) {
        // Fallback to current parsing if format doesn't match
        console.warn('Could not parse time format:', timeString);
        return eventDate;
      }

      const hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3]?.toUpperCase();

      let hour24 = hours;
      if (period === 'PM' && hours !== 12) {
        hour24 += 12;
      } else if (period === 'AM' && hours === 12) {
        hour24 = 0;
      }

      const startDate = new Date(eventDate);
      startDate.setHours(hour24, minutes, 0, 0);
      return startDate;
    };

    const startDate = parseEventTime(event.time, new Date(event.date));
    // Default to 2 hours duration if no specific duration is available
    const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const calendarData = {
      title: event.title,
      start: formatDate(startDate),
      end: formatDate(endDate),
      description: event.description,
      location: event.location
    };

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarData.title)}&dates=${calendarData.start}/${calendarData.end}&details=${encodeURIComponent(calendarData.description)}&location=${encodeURIComponent(calendarData.location)}`;
    
    window.open(googleCalendarUrl, '_blank');
  };

  const handleGetTicket = () => {
    setIsPurchaseDialogOpen(true);
  };

  const spotsLeft = event ? event.capacity - keysSold : 0;
  const isSoldOut = spotsLeft <= 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="h-64 bg-gray-200 rounded-lg mb-6"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-6 max-w-4xl py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/explore')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to events
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-6 max-w-4xl py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Image */}
            {event.image_url && (
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Event Info */}
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Badge variant="secondary" className="mb-3">
                    {event.category}
                  </Badge>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {event.title}
                  </h1>
                  <div className="flex items-center space-x-4 text-gray-600">
                    {event.date && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{format(event.date, 'EEEE, MMMM do, yyyy')}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{event.time}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsLiked(!isLiked)}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddToCalendar}
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleShare('facebook')}>
                        <Facebook className="w-4 h-4 mr-2" />
                        Facebook
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare('twitter')}>
                        <Twitter className="w-4 h-4 mr-2" />
                        Twitter
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare('linkedin')}>
                        <Linkedin className="w-4 h-4 mr-2" />
                        LinkedIn
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare('copy')}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-center space-x-1 text-gray-600 mb-6">
                <MapPin className="w-4 h-4" />
                <span>{event.location}</span>
              </div>

              <Separator className="my-6" />

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  About this event
                </h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {event.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {authenticated && userTicketCount > 0 ? 'Your Tickets' : 'Get tickets'}
                  </h3>
                  <Ticket className="w-5 h-5 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* User Ticket Status */}
                {authenticated && userTicketCount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-800">
                          You own {userTicketCount} ticket{userTicketCount > 1 ? 's' : ''}
                        </span>
                      </div>
                      {maxTicketsPerUser > 1 && (
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          {userTicketCount}/{maxTicketsPerUser} max
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">
                    {event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
                  </span>
                  {!isSoldOut && (
                    <Badge variant="outline" className="text-green-600 border-green-200">
                      {spotsLeft} spots left
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Capacity</span>
                    <span>{event.capacity} people</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Registered</span>
                    <span>{keysSold} people</span>
                  </div>
                  {maxTicketsPerUser > 1 && (
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Max per person</span>
                      <span>{maxTicketsPerUser} tickets</span>
                    </div>
                  )}
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((keysSold / event.capacity) * 100, 100)}%` }}
                  />
                </div>

                {authenticated && userTicketCount > 0 ? (
                  <div className="space-y-2">
                    {/* Attestation Button for ticket holders */}
                    <AttestationButton
                      schemaUid="0x" // TODO: Get from event or config
                      recipient={wallet?.address || ''}
                      eventId={event.id}
                      lockAddress={event.lock_address}
                      eventTitle={event.title}
                      attestationType="attendance"
                    />
                    
                    {/* Additional ticket purchase if allowed */}
                    {userTicketCount < maxTicketsPerUser && !isSoldOut && (
                      <Button 
                        variant="outline"
                        className="w-full" 
                        onClick={handleGetTicket}
                      >
                        Get Additional Ticket
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button 
                    className="w-full" 
                    onClick={handleGetTicket}
                    disabled={isSoldOut || (!authenticated && userTicketCount >= maxTicketsPerUser)}
                  >
                    {isSoldOut ? 'Sold Out' : 
                     !authenticated ? 'Connect Wallet to Get Ticket' :
                     userTicketCount >= maxTicketsPerUser ? 'Ticket Limit Reached' :
                     'Get Ticket'}
                  </Button>
                )}

                <div className="text-xs text-gray-500 text-center">
                  Powered by blockchain technology
                </div>
              </CardContent>
            </Card>

            {/* Event Details Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <h3 className="font-semibold text-gray-900">Event details</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {event.date && (
                    <div className="flex items-start space-x-3">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">
                          {format(event.date, 'EEEE, MMMM do, yyyy')}
                        </div>
                        <div className="text-sm text-gray-600">{event.time}</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-900">Location</div>
                      <div className="text-sm text-gray-600">{event.location}</div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Users className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-900">Capacity</div>
                      <div className="text-sm text-gray-600">{event.capacity} attendees</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">
                    Blockchain Info
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Contract</span>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-blue-600">
                      <span className="font-mono text-xs">
                        {event.lock_address.slice(0, 6)}...{event.lock_address.slice(-4)}
                      </span>
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Purchase Dialog */}
      <EventPurchaseDialog
        event={event}
        isOpen={isPurchaseDialogOpen}
        onClose={() => setIsPurchaseDialogOpen(false)}
      />
    </div>
  );
};

export default EventDetails;

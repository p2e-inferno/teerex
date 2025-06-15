
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users, Ticket, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { PublishedEvent } from '@/utils/eventUtils';
import { getBlockExplorerUrl } from '@/utils/lockUtils';

interface EventCardProps {
  event: PublishedEvent;
  showActions?: boolean;
  onViewDetails?: (event: PublishedEvent) => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  showActions = true,
  onViewDetails
}) => {
  const handleViewTransaction = () => {
    const explorerUrl = getBlockExplorerUrl(event.transaction_hash, 'baseSepolia');
    window.open(explorerUrl, '_blank');
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
      {/* Event Image */}
      <div className="aspect-[2/1] relative">
        {event.image_url ? (
          <img 
            src={event.image_url} 
            alt={event.title} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500"></div>
        )}
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="absolute top-4 left-4">
          <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
            {event.category}
          </Badge>
        </div>
        <div className="absolute bottom-4 left-4 text-white">
          <h3 className="text-xl font-bold mb-2">{event.title}</h3>
          <div className="flex items-center gap-4 text-white/90 text-sm">
            {event.date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(event.date, "MMM d, yyyy")}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{event.time}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{event.location}</span>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Description */}
          <p className="text-gray-600 leading-relaxed line-clamp-3">
            {event.description}
          </p>

          {/* Event Details */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4" />
              <span>{event.capacity} spots</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Ticket className="w-4 h-4" />
              <span>
                {event.currency === 'FREE' 
                  ? 'Free' 
                  : `${event.price} ${event.currency}`
                }
              </span>
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex gap-3 pt-4">
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => onViewDetails?.(event)}
              >
                {event.currency === 'FREE' ? 'Register for Free' : 'Get Tickets'}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleViewTransaction}
                className="px-3"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

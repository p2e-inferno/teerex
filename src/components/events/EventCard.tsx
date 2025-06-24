
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { PublishedEvent } from '@/utils/eventUtils';
import { format } from 'date-fns';

interface EventCardProps {
  event: PublishedEvent;
  onViewDetails: (event: PublishedEvent) => void;
  keysSold?: number;
}

export const EventCard: React.FC<EventCardProps> = ({ 
  event, 
  onViewDetails, 
  keysSold = 0 
}) => {
  const navigate = useNavigate();
  const spotsLeft = event.capacity - keysSold;
  const isSoldOut = spotsLeft <= 0;

  const handleCardClick = () => {
    navigate(`/event/${event.id}`);
  };

  const handleViewDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewDetails(event);
  };

  return (
    <Card 
      className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
      onClick={handleCardClick}
    >
      <CardHeader className="p-0">
        {event.image_url ? (
          <div className="aspect-video rounded-t-lg overflow-hidden bg-gray-100">
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </div>
        ) : (
          <div className="aspect-video rounded-t-lg bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
            <Calendar className="w-12 h-12 text-gray-400" />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="mb-3">
          <Badge variant="secondary" className="text-xs">
            {event.category}
          </Badge>
        </div>
        
        <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {event.title}
        </h3>
        
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {event.description}
        </p>
        
        <div className="space-y-2 mb-4">
          {event.date && (
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{format(event.date, 'MMM d, yyyy')}</span>
              <Clock className="w-4 h-4 ml-4 mr-2" />
              <span>{event.time}</span>
            </div>
          )}
          
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2" />
            <span className="truncate">{event.location}</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-gray-600">
              <Users className="w-4 h-4 mr-2" />
              <span>{keysSold}/{event.capacity} registered</span>
            </div>
            {isSoldOut ? (
              <Badge variant="destructive" className="text-xs">
                Sold Out
              </Badge>
            ) : spotsLeft <= 10 ? (
              <Badge variant="outline" className="text-xs text-orange-600 border-orange-200">
                {spotsLeft} left
              </Badge>
            ) : null}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="font-semibold text-lg text-gray-900">
            {event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
          </div>
          <Button 
            size="sm" 
            onClick={handleViewDetailsClick}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Get Ticket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

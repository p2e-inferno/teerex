import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ImageModal } from '@/components/ui/image-modal';
import { Calendar, Clock, MapPin, Users, Globe } from 'lucide-react';
import type { PublishedEvent } from '@/types/event';
import { ShareButton } from '@/components/interactions/ShareButton';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { stripHtml } from '@/utils/textUtils';
import { WaitlistDialog } from './WaitlistDialog';
import { formatEventDateRange } from '@/utils/dateUtils';
import { hasMethod, isFreeEvent } from '@/lib/events/paymentMethods';

interface EventCardProps {
  event: PublishedEvent;
  onViewDetails?: (event: PublishedEvent) => void;
  onEdit?: (event: PublishedEvent) => void;
  onManage?: (event: PublishedEvent) => void;
  keysSold?: number;
  actionType?: string;
  showActions?: boolean;
  showShareButton?: boolean;
  isTicketView?: boolean;
  authenticated?: boolean;
  onConnectWallet?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onViewDetails,
  onEdit,
  onManage,
  keysSold = 0,
  actionType,
  showActions = true,
  showShareButton = false,
  isTicketView = false,
  authenticated = false,
  onConnectWallet
}) => {
  const [imgError, setImgError] = useState(false);
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false);
  const imageSrc = useMemo(() => {
    if (!event.image_url) return '';
    const ts = (event as any).updated_at instanceof Date
      ? (event as any).updated_at.getTime()
      : Date.now();
    const sep = event.image_url.includes('?') ? '&' : '?';
    return `${event.image_url}${sep}t=${ts}`;
  }, [event.image_url, (event as any).updated_at]);
  const navigate = useNavigate();
  const spotsLeft = event.capacity - keysSold;
  const isSoldOut = spotsLeft <= 0;

  // Check if event has expired
  const isEventExpired = event.date && new Date(event.date) < new Date();

  const handleCardClick = () => {
    if (!isTicketView) {
      navigate(`/event/${event.lock_address}`);
    }
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/event/${event.lock_address}`);
  };

  const handleEditClick = (e: React.MouseEvent) => { e.stopPropagation(); onEdit?.(event); };
  const handleManageClick = (e: React.MouseEvent) => { e.stopPropagation(); onManage?.(event); };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!authenticated) {
      onConnectWallet?.();
      return;
    }
    // If sold out and waitlist enabled, open waitlist dialog
    if (isSoldOut && event.allow_waitlist) {
      setWaitlistDialogOpen(true);
      return;
    }
    // Normal ticket purchase flow for authenticated users
    onViewDetails?.(event);
  };

  // Determine button text based on context
  const getButtonText = () => {
    if (!authenticated) return 'Connect Wallet';
    if (isTicketView) return 'View Ticket';
    if (actionType === 'edit') return 'Edit';
    if (actionType === 'manage') return 'Manage';
    if (isEventExpired) return 'Event Ended';
    if (isSoldOut && event.allow_waitlist) return 'Join Waitlist';
    if (isSoldOut) return 'Sold Out';
    return 'Get Ticket';
  };

  const getButtonVariant = () => {
    if (actionType === 'manage') return 'default' as const;
    return undefined;
  };

  return (
    <Card 
      className={`border-0 shadow-sm hover:shadow-md transition-all duration-200 group ${!isTicketView ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
    >
      <CardHeader className="p-0">
        {event.image_url && !imgError ? (
          isTicketView ? (
            <ImageModal src={imageSrc} alt={event.title}>
              <div className="aspect-square rounded-t-lg overflow-hidden bg-gray-100 cursor-pointer">
                <img
                  src={imageSrc}
                  alt={event.title}
                  onError={(e) => {
                    console.warn('Event image failed to load:', {
                      eventId: event.id,
                      src: (e.currentTarget as HTMLImageElement).src,
                    });
                    setImgError(true);
                  }}
                  style={{
                    objectFit: 'cover',
                    objectPosition: `${event.image_crop_x || 50}% ${event.image_crop_y || 50}%`
                  }}
                  className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            </ImageModal>
          ) : (
            <div className="aspect-square rounded-t-lg overflow-hidden bg-gray-100">
              <img
                src={imageSrc}
                alt={event.title}
                onError={(e) => {
                  console.warn('Event image failed to load:', {
                    eventId: event.id,
                    src: (e.currentTarget as HTMLImageElement).src,
                  });
                    setImgError(true);
                }}
                style={{
                  objectFit: 'cover',
                  objectPosition: `${event.image_crop_x || 50}% ${event.image_crop_y || 50}%`
                }}
                className="w-full h-full group-hover:scale-105 transition-transform duration-200"
              />
            </div>
          )
        ) : (
          <div className="aspect-square rounded-t-lg bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
            <Calendar className="w-12 h-12 text-gray-400" />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {event.category}
          </Badge>
          {((event as any).isAllowList ?? event.has_allow_list) && (
            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
              Allow List
            </Badge>
          )}
        </div>
        
        <h3 
          className={`font-semibold text-lg text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors ${isTicketView ? 'cursor-pointer hover:underline' : ''}`}
          onClick={isTicketView ? handleTitleClick : undefined}
        >
          {event.title}
        </h3>
        
        <div className="text-gray-600 text-sm mb-4">
          <RichTextDisplay
            content={event.description}
            className="prose-sm prose-gray max-w-none line-clamp-2 prose-card"
          />
        </div>
        
        <div className="space-y-3 mb-4">
          {(event.date || event.time || event.location) && (
            <div className="flex flex-col gap-2 text-sm text-gray-600">
              {event.date && (
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">{formatEventDateRange({ startDate: event.date, endDate: event.end_date })}</span>
                </div>
              )}
              {(event.time || event.location) && (
                <div className="flex flex-wrap items-center gap-4">
                  {event.time && (
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span className="whitespace-nowrap">{event.time}</span>
                    </div>
                  )}
                  <div className="flex items-center min-w-0">
                    {event.event_type === 'virtual' ? (
                      <>
                        <Globe className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Virtual Event</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate">{event.location || 'Metaverse'}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
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
            {event.payment_methods?.includes('fiat') && event.ngn_price > 0 ? (
              <div className="space-y-1">
                <div>₦{event.ngn_price.toLocaleString()}</div>
                {hasMethod(event, 'crypto') && (
                  <div className="text-sm text-gray-600">or {event.price} {event.currency}</div>
                )}
              </div>
            ) : isFreeEvent(event) ? 'Free' : `${event.price} ${event.currency}`}
          </div>
          {showActions && (
            <div className="flex items-center gap-2">
              {(onEdit || onManage) ? (
                <>
                  {onEdit && (
                    <Button size="sm" onClick={handleEditClick} className="bg-blue-600 hover:bg-blue-700">Edit</Button>
                  )}
                  {onManage && (
                    <Button size="sm" variant="outline" onClick={handleManageClick}>Manage</Button>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={handleButtonClick}
                  disabled={isEventExpired || (isSoldOut && !event.allow_waitlist) || (!authenticated && !onConnectWallet)}
                  variant={getButtonVariant()}
                  className={!authenticated ? "bg-purple-600 hover:bg-purple-700" : actionType === 'manage' ? '' : "bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"}
                >
                  {getButtonText()}
                </Button>
              )}
              {showShareButton && (
                <ShareButton
                  url={`${window.location.origin}/event/${event.lock_address}`}
                  title={event.title}
                  description={stripHtml(event.description)}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Waitlist Dialog */}
      <WaitlistDialog
        event={event}
        isOpen={waitlistDialogOpen}
        onClose={() => setWaitlistDialogOpen(false)}
      />
    </Card>
  );
};

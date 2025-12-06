import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  ExternalLink,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { PublishedEvent } from "@/utils/eventUtils";
import { formatEventDateRange } from "@/utils/dateUtils";
import { ShareButton } from "@/components/interactions/ShareButton";
import { RichTextDisplay } from "@/components/ui/rich-text/RichTextDisplay";
import { stripHtml } from "@/utils/textUtils";

interface EventCreationSuccessModalProps {
  event: PublishedEvent;
  isOpen: boolean;
  onClose: () => void;
  onViewEvent: () => void;
  onCreateAnother: () => void;
}

export const EventCreationSuccessModal: React.FC<EventCreationSuccessModalProps> = ({
  event,
  isOpen,
  onClose,
  onViewEvent,
  onCreateAnother,
}) => {
  const eventUrl = `${window.location.origin}/event/${event.lock_address}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <DialogTitle className="text-xl">Event Created Successfully!</DialogTitle>
          </div>
          <DialogDescription>
            Your event has been deployed to the blockchain and is now live.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Event Preview Card */}
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Event Image */}
                {event.image_url && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={`${event.image_url}${
                        event.image_url.includes("?") ? "&" : "?"
                      }t=${event.updated_at?.getTime?.() ?? Date.now()}`}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Event Details */}
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <Badge variant="secondary" className="mb-2">
                        {event.category}
                      </Badge>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {event.title}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-600">
                    {event.date && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {formatEventDateRange({
                              startDate: event.date,
                              endDate: event.end_date,
                              formatStyle: "long",
                            })}
                          </span>
                        </div>
                        {(event.time || event.location) && (
                          <div className="flex flex-wrap items-center gap-4">
                            {event.time && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{event.time}</span>
                              </div>
                            )}
                            {event.location && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span>{event.location}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!event.date && event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{event.location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Capacity: {event.capacity} attendees</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-gray-700 text-sm">
                      <RichTextDisplay
                        content={event.description}
                        className="prose-sm prose-gray max-w-none line-clamp-3 prose-card"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Info */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-semibold text-gray-900 mb-3">Ticket Pricing</h4>
              <div className="text-lg font-bold text-gray-900">
                {event.payment_methods?.includes('fiat') && event.ngn_price > 0 ? (
                  <div className="space-y-1">
                    <div>₦{event.ngn_price.toLocaleString()}</div>
                    {event.payment_methods?.includes('crypto') && event.currency !== 'FREE' && (
                      <div className="text-sm text-gray-600">or {event.price} {event.currency}</div>
                    )}
                  </div>
                ) : event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}`}
              </div>
            </CardContent>
          </Card>

          {/* Share Section */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-semibold text-gray-900 mb-3">Share Your Event</h4>
              <p className="text-sm text-gray-600 mb-4">
                Let people know about your event! Share it on social media or copy the link.
              </p>
              <div className="flex items-center gap-3">
                <ShareButton
                  url={eventUrl}
                  title={event.title}
                  description={stripHtml(event.description)}
                  variant="default"
                />
                <span className="text-sm text-gray-600">Share via:</span>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onViewEvent}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Event
            </Button>
            <Button
              onClick={onCreateAnother}
              variant="outline"
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Another Event
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

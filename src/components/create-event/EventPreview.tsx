
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { EventFormData } from '@/pages/CreateEvent';

interface EventPreviewProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
}

export const EventPreview: React.FC<EventPreviewProps> = ({
  formData,
  updateFormData,
  onNext
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Event Preview</h2>
        <p className="text-gray-600">Review your event details before publishing</p>
      </div>

      {/* Event Preview Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        {/* Event Image */}
        <div className="aspect-[2/1] bg-gradient-to-br from-purple-500 to-pink-500 relative">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute bottom-6 left-6 text-white">
            {formData.category && (
              <Badge className="bg-white/20 text-white border-white/30 mb-3">
                {formData.category}
              </Badge>
            )}
            <h3 className="text-2xl font-bold mb-2">{formData.title || 'Event Title'}</h3>
            <div className="flex items-center gap-4 text-white/90">
              {formData.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{format(formData.date, "MMM d, yyyy")}</span>
                </div>
              )}
              {formData.time && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{formData.time}</span>
                </div>
              )}
              {formData.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{formData.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Description */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">About this event</h4>
              <p className="text-gray-600 leading-relaxed">
                {formData.description || 'Event description will appear here...'}
              </p>
            </div>

            {/* Event Details */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-gray-600">
                <Users className="w-4 h-4" />
                <span>{formData.capacity} spots</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Ticket className="w-4 h-4" />
                <span>
                  {formData.currency === 'FREE' 
                    ? 'Free' 
                    : `${formData.price} ${formData.currency}`
                  }
                </span>
              </div>
            </div>

            {/* CTA Button Preview */}
            <div className="pt-4">
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
                disabled
              >
                {formData.currency === 'FREE' ? 'Register for Free' : 'Get Tickets'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <CardTitle className="text-green-900">Ready to Publish</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-green-700">
            <p>✓ Event details completed</p>
            <p>✓ Unlock Protocol lock will be created</p>
            <p>✓ NFT tickets will be available for purchase</p>
            <p>✓ Event page will be live immediately</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

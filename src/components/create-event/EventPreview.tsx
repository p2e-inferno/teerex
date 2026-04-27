
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users, Ticket, Save, Loader2, Shield, MessageSquareText } from 'lucide-react';
import { EventFormData } from '@/pages/CreateEvent';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { formatEventDateRange } from '@/utils/dateUtils';
import { isEmptyHtml } from '@/utils/textUtils';

interface EventPreviewProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
  onSaveAsDraft?: () => void;
  isSavingDraft?: boolean;
  isPublishing?: boolean;
}

export const EventPreview: React.FC<EventPreviewProps> = ({
  formData,
  onSaveAsDraft,
  isSavingDraft = false,
  isPublishing = false
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Event Preview</h2>
        <p className="text-gray-600">Review your event details before publishing or saving as draft</p>
      </div>

      {/* Event Preview Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        {/* Event Image */}
        <div className="aspect-square relative">
          {formData.imageUrl ? (
            <img
              src={formData.imageUrl}
              alt={formData.title || 'Event preview'}
              style={{
                objectFit: 'cover',
                objectPosition: `${formData.imageCropX || 50}% ${formData.imageCropY || 50}%`
              }}
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500"></div>
          )}
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute bottom-6 left-6 text-white">
            {formData.category && (
              <Badge className="bg-white/20 text-white border-white/30 mb-3">
                {formData.category}
              </Badge>
            )}
            <h3 className="text-2xl font-bold mb-2">{formData.title || 'Event Title'}</h3>
            <div className="flex flex-col gap-2 text-white/90 sm:flex-row sm:items-center sm:gap-4">
              {formData.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatEventDateRange({ startDate: formData.date, endDate: formData.endDate })}</span>
                </div>
              )}
              {(formData.time || formData.location) && (
                <div className="flex flex-wrap items-center gap-4">
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
              )}
            </div>
          </div>
        </div>

        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Description */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">About this event</h4>
              <div className="text-gray-600">
                <RichTextDisplay
                  content={formData.description || ''}
                  className="prose prose-sm leading-relaxed"
                />
              </div>
            </div>

            {/* Event Details */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-gray-600">
                <Users className="w-4 h-4" />
                <span>{formData.capacity} spots</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Ticket className="w-4 h-4" />
                <div className="flex flex-col gap-1">
                  {/* Pricing */}
                  {formData.paymentMethod === 'free' && (
                    <span>Free</span>
                  )}
                  {formData.paymentMethod === 'crypto' && (
                    <span>{`${formData.price} ${formData.currency}`}</span>
                  )}
                  {formData.paymentMethod === 'fiat' && formData.ngnPrice > 0 && (
                    <span>₦{formData.ngnPrice.toLocaleString()} (Card/Bank)</span>
                  )}
                </div>
              </div>
            </div>

            {/* CTA Button Preview */}
            {formData.refundProtectionEnabled && (
              <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <div className="text-sm font-semibold text-purple-950">Minimum Attendance Protection</div>
                </div>
                
                <div className="space-y-2 text-sm text-purple-900">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-700/70 font-medium">Required Attendees</span>
                    <span className="font-bold">{formData.refundMinAttendees || 0} people</span>
                  </div>
                  
                  {formData.refundTriggerAt && (
                    <div className="flex flex-col gap-0.5 border-l-2 border-purple-200 pl-3 mt-2">
                      <span className="text-[11px] uppercase tracking-tight text-purple-500 font-bold">Protection Deadline</span>
                      <span className="text-purple-900 font-medium leading-tight">
                        {new Date(formData.refundTriggerAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        <span className="text-purple-400 mx-1">at</span>
                        {new Date(formData.refundTriggerAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Post-purchase message preview */}
            {formData.purchaseConfirmationMessage && !isEmptyHtml(formData.purchaseConfirmationMessage) && (
              <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-purple-600" />
                  <div className="text-sm font-semibold text-purple-950">Message after purchase</div>
                </div>
                <p className="text-xs text-purple-700">
                  Attendees will see this after their ticket is issued and in their confirmation email.
                </p>
                <div className="rounded-md bg-white/80 border border-purple-100 p-3 text-sm text-gray-800">
                  <RichTextDisplay
                    content={formData.purchaseConfirmationMessage}
                    className="prose prose-sm leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* CTA Button Preview */}
            <div className="pt-4">
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
                disabled
              >
                {formData.paymentMethod === 'free' ? 'Register for Free' : 'Get Tickets'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Options */}
      <div className={`grid grid-cols-1 ${onSaveAsDraft ? 'md:grid-cols-2' : ''} gap-4`}>
        {/* Save as Draft */}
        {onSaveAsDraft && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-orange-900 flex items-center gap-2">
                <Save className="w-5 h-5" />
                Save as Draft
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-orange-700 mb-4">
                <p>✓ Save your progress</p>
                <p>✓ Continue editing later</p>
                <p>✓ Publish when ready</p>
              </div>
              <Button
                onClick={onSaveAsDraft}
                variant="outline"
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                disabled={isSavingDraft || isPublishing}
              >
                {isSavingDraft ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isSavingDraft ? 'Saving...' : 'Save as Draft'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Publish */}
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-900">Ready to Publish</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-green-700 mb-4">
              <p>✓ Event details completed</p>
              <p>✓ Unlock Protocol lock will be created</p>
              <p>✓ NFT tickets will be available for purchase</p>
              <p>✓ Event page will be live immediately</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

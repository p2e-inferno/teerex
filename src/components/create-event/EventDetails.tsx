
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { EventFormData } from '@/pages/CreateEvent';
import { MapPin, Globe } from 'lucide-react';

interface EventDetailsProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
  editingEventId?: string;
}

export const EventDetails: React.FC<EventDetailsProps> = ({
  formData,
  updateFormData,
  onNext,
  editingEventId
}) => {
  const categories = [
    'Conference',
    'Workshop',
    'Networking',
    'Meetup',
    'Hackathon',
    'Panel',
    'Social',
    'Other'
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Event Details</h2>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={formData.category} onValueChange={(value) => updateFormData({ category: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!formData.category && (
          <p className="text-sm text-red-600">Category is required</p>
        )}
      </div>

      {/* Event Type */}
      <div className="space-y-2">
        <Label>Event Type *</Label>
        <RadioGroup
          value={formData.eventType}
          onValueChange={(value: 'physical' | 'virtual') => updateFormData({ eventType: value })}
          className="flex gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="physical" id="physical" />
            <Label htmlFor="physical" className="flex items-center gap-2 cursor-pointer">
              <MapPin className="h-4 w-4" />
              In-person
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="virtual" id="virtual" />
            <Label htmlFor="virtual" className="flex items-center gap-2 cursor-pointer">
              <Globe className="h-4 w-4" />
              Virtual
            </Label>
          </div>
        </RadioGroup>
        <p className="text-sm text-gray-600">
          Choose whether your event will be held in person or online
        </p>
      </div>

      {/* Location */}
      {formData.eventType === 'physical' && (
        <div className="space-y-2">
          <Label htmlFor="location">Location *</Label>
          <Input
            id="location"
            placeholder="Enter the event location"
            value={formData.location}
            onChange={(e) => updateFormData({ location: e.target.value })}
          />
          {!formData.location && (
            <p className="text-sm text-red-600">Location is required for in-person events</p>
          )}
        </div>
      )}

      {formData.eventType === 'virtual' && (
        <div className="space-y-2">
          <Label htmlFor="location">Virtual Link *</Label>
          <Input
            id="location"
            type="url"
            placeholder="https://zoom.us/meeting/..."
            value={formData.location}
            onChange={(e) => updateFormData({ location: e.target.value })}
          />
          {!formData.location && (
            <p className="text-sm text-red-600">Virtual meeting link is required</p>
          )}
        </div>
      )}

      {/* Capacity */}
      <div className="space-y-2">
        <Label>Event Capacity{!editingEventId && ' *'}</Label>
        {editingEventId ? (
          // Read-only display for editing existing events
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-900 font-medium">
            {formData.capacity} attendees
          </div>
        ) : (
          // Editable input for creating new events
          <Input
            id="capacity"
            type="number"
            placeholder="How many people can attend?"
            value={formData.capacity}
            onChange={(e) => updateFormData({ capacity: parseInt(e.target.value) || 0 })}
            min="1"
          />
        )}
        <p className="text-sm text-gray-600">
          {editingEventId
            ? "Capacity is set during event creation and cannot be changed."
            : "Set the maximum number of attendees"
          }
        </p>
        {!editingEventId && formData.capacity <= 0 && (
          <p className="text-sm text-red-600">Capacity must be greater than 0</p>
        )}
      </div>

      {/* Additional Settings */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">Event Settings</h3>

        {/* Info banner for creation vs editing */}
        {editingEventId ? (
          <div className="flex gap-2 p-3 mb-4 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-4 h-4 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Public Event and Allow List settings are locked after creation to maintain blockchain integrity. Only Waitlist can be changed from the Manage section.
            </p>
          </div>
        ) : (
          <div className="flex gap-2 p-3 mb-4 bg-amber-50 border border-amber-100 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-4 h-4 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> Public Event and Allow List settings <strong>cannot be changed</strong> after event creation. You can change Waitlist setting later from the Manage section of My Events page.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Public Event</p>
                {editingEventId && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Locked
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">Anyone can find and attend this event</p>
            </div>
            <Checkbox
              checked={formData.isPublic}
              onCheckedChange={(checked) => updateFormData({ isPublic: checked === true })}
              disabled={editingEventId !== undefined && editingEventId !== null}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Allow Waitlist</p>
                {editingEventId && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Editable
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">Let people join a waitlist when sold out</p>
            </div>
            <Checkbox
              checked={formData.allowWaitlist}
              onCheckedChange={(checked) => updateFormData({ allowWaitlist: checked === true })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Private Event (Allow List)</p>
                {editingEventId && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Locked
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">Only wallet addresses on the allow list can purchase tickets</p>
            </div>
            <Checkbox
              checked={formData.hasAllowList}
              onCheckedChange={(checked) => updateFormData({ hasAllowList: checked === true })}
              disabled={editingEventId !== undefined && editingEventId !== null}
            />
          </div>
        </div>
        {!formData.isPublic && !formData.hasAllowList && (
          <p className="text-xs text-amber-600 mt-2">
            Note: If your event is not public, consider enabling the allow list to control who can purchase tickets.
          </p>
        )}
      </div>
    </div>
  );
};

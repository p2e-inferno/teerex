
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Public Event</p>
              <p className="text-sm text-gray-600">Anyone can find and attend this event</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Allow Waitlist</p>
              <p className="text-sm text-gray-600">Let people join a waitlist when sold out</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
        </div>
      </div>
    </div>
  );
};


import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventFormData } from '@/pages/CreateEvent';

interface EventDetailsProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
}

export const EventDetails: React.FC<EventDetailsProps> = ({
  formData,
  updateFormData,
  onNext
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
        <Label>Category</Label>
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
      </div>

      {/* Capacity */}
      <div className="space-y-2">
        <Label htmlFor="capacity">Event Capacity</Label>
        <Input
          id="capacity"
          type="number"
          placeholder="How many people can attend?"
          value={formData.capacity}
          onChange={(e) => updateFormData({ capacity: parseInt(e.target.value) || 0 })}
          min="1"
        />
        <p className="text-sm text-gray-600">Set the maximum number of attendees</p>
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

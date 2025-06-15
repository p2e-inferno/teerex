
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { EventFormData } from '@/pages/CreateEvent';

interface EventBasicInfoProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
}

export const EventBasicInfo: React.FC<EventBasicInfoProps> = ({
  formData,
  updateFormData,
  onNext
}) => {
  const isValid = formData.title && formData.description && formData.date;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Event Basics</h2>
      </div>

      {/* Event Image Upload */}
      <div className="space-y-2">
        <Label htmlFor="image">Event Image</Label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">Upload an image for your event</p>
          <Button variant="outline" size="sm">
            Choose File
          </Button>
        </div>
      </div>

      {/* Event Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Event Name *</Label>
        <Input
          id="title"
          placeholder="Give your event a clear, descriptive name"
          value={formData.title}
          onChange={(e) => updateFormData({ title: e.target.value })}
          className="text-lg"
        />
      </div>

      {/* Event Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Tell people what your event is about..."
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          rows={4}
        />
      </div>

      {/* Date and Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.date ? format(formData.date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={formData.date || undefined}
                onSelect={(date) => updateFormData({ date: date || null })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="time">Time</Label>
          <Input
            id="time"
            type="time"
            value={formData.time}
            onChange={(e) => updateFormData({ time: e.target.value })}
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="Where is your event?"
          value={formData.location}
          onChange={(e) => updateFormData({ location: e.target.value })}
        />
      </div>
    </div>
  );
};

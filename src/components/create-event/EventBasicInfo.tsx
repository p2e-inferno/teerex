
import React, { useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Upload, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { EventFormData } from '@/pages/CreateEvent';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';
import { useToast } from '@/hooks/use-toast';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';

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
  const { user, authenticated } = usePrivy();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isValid = formData.title.trim() && (formData.description && formData.description.trim() !== '<p></p>' && formData.description.trim() !== '') && formData.date && formData.time;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!authenticated || !user?.id) {
      toast({
        title: "Authentication Required",
        description: "Please make sure you're logged in to upload images.",
        variant: "destructive"
      });
      return;
    }
    
    if (file) {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive"
        });
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive"
        });
        return;
      }

      setIsUploading(true);
      try {
        console.log('Starting image upload for user:', user.id);
        console.log('File details:', {
          name: file.name,
          size: file.size,
          type: file.type
        });
        
        const imageUrl = await uploadEventImage(file, user.id);
        if (imageUrl) {
          updateFormData({ imageUrl });
          toast({
            title: "Image Uploaded",
            description: "Your event image has been uploaded successfully.",
          });
        } else {
          toast({
            title: "Upload Failed",
            description: "There was an error uploading your image. Please check your connection and try again.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        toast({
          title: "Upload Error",
          description: "There was an error uploading your image. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const removeImage = () => {
    updateFormData({ imageUrl: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleContinue = () => {
    if (isValid) {
      console.log('Basic info is valid, proceeding to next step');
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Event Basics</h2>
      </div>

      {/* Event Image Upload */}
      <div className="space-y-2">
        <Label htmlFor="image">Event Image</Label>
        {formData.imageUrl ? (
          <div className="relative">
            <img 
              src={formData.imageUrl} 
              alt="Event preview" 
              className="w-full h-48 object-cover rounded-lg border-2 border-gray-300"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={removeImage}
              className="absolute top-2 right-2 bg-white hover:bg-gray-100"
              disabled={isUploading}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
            onClick={triggerFileInput}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600 mb-2">Uploading image...</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Upload an image for your event</p>
                <Button variant="outline" size="sm" type="button" disabled={isUploading}>
                  Choose File
                </Button>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploading}
        />
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
        {!formData.title.trim() && (
          <p className="text-sm text-red-600">Event name is required</p>
        )}
      </div>

      {/* Event Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <RichTextEditor
          value={formData.description}
          onChange={(value) => updateFormData({ description: value })}
          placeholder="Tell people what your event is about..."
          disabled={isUploading}
        />
        {(!formData.description || formData.description.trim() === '<p></p>' || formData.description.trim() === '') && (
          <p className="text-sm text-red-600">Event description is required</p>
        )}
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
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {!formData.date && (
            <p className="text-sm text-red-600">Event date is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="time">Time *</Label>
          <Input
            id="time"
            type="time"
            value={formData.time}
            onChange={(e) => updateFormData({ time: e.target.value })}
          />
          {!formData.time && (
            <p className="text-sm text-red-600">Event time is required</p>
          )}
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

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleContinue}
          disabled={!isValid || isUploading}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

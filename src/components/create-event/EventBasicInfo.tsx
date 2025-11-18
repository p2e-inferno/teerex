
import React, { useRef, useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon, Upload, X, Loader2, Crop } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { EventFormData } from '@/pages/CreateEvent';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';
import { useToast } from '@/hooks/use-toast';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import { ImageCropper } from '@/components/ui/ImageCropper';

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [displayImageUrl, setDisplayImageUrl] = useState<string>(''); // What user sees (optimistic)
  const [showCropper, setShowCropper] = useState(false);
  const isValid = formData.title.trim() && (formData.description && formData.description.trim() !== '<p></p>' && formData.description.trim() !== '') && formData.date && formData.time;

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

      // Create preview URL and show cropper
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setSelectedFile(file);
      setShowCropper(true);
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (!user?.id) return;

    setShowCropper(false);
    setIsUploading(true);

    // Create blob URL for immediate preview
    const croppedBlobUrl = URL.createObjectURL(croppedFile);
    setDisplayImageUrl(croppedBlobUrl);

    try {
      console.log('Starting cropped image upload for user:', user.id);
      console.log('Cropped file details:', {
        name: croppedFile.name,
        size: croppedFile.size,
        type: croppedFile.type
      });

      const imageUrl = await uploadEventImage(croppedFile, user.id);

      if (imageUrl) {
        // Update form data for persistence (no crop coordinates needed!)
        updateFormData({
          imageUrl
        });

        console.log('Cropped image uploaded successfully, preloading remote URL:', imageUrl);

        // Preload remote URL before switching display
        const img = new Image();
        img.onload = () => {
          console.log('Remote URL loaded successfully, switching from blob to remote');
          setDisplayImageUrl(imageUrl); // Switch to remote

          // Now safe to clean up blob URLs
          URL.revokeObjectURL(croppedBlobUrl);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
          }
        };
        img.onerror = () => {
          console.warn('Remote URL failed to load, keeping local blob preview');
          toast({
            title: "Image Upload Warning",
            description: "Image uploaded but preview may be delayed. It will appear after saving.",
            variant: "default"
          });
          // Keep blob preview visible since remote failed
        };
        img.src = imageUrl;

        toast({
          title: "Image Uploaded",
          description: "Your event image has been cropped and uploaded successfully.",
        });
      } else {
        // Upload returned null/empty
        console.error('Upload failed: no URL returned');
        toast({
          title: "Upload Failed",
          description: "Could not upload image to storage. Please check your connection and try again.",
          variant: "destructive"
        });

        // Revert to no image
        setDisplayImageUrl('');
        URL.revokeObjectURL(croppedBlobUrl);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl('');
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : "An unknown error occurred";

      toast({
        title: "Upload Error",
        description: `Failed to upload image: ${errorMessage}. Please try again.`,
        variant: "destructive"
      });

      // Revert to no image on error
      setDisplayImageUrl('');
      URL.revokeObjectURL(croppedBlobUrl);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
      }
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
    }
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    // Clean up preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setSelectedFile(null);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    updateFormData({
      imageUrl: ''
    });
    setDisplayImageUrl('');

    // Clean up any blob URLs
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (displayImageUrl && displayImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(displayImageUrl);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAdjustCrop = () => {
    if (formData.imageUrl) {
      setPreviewUrl(formData.imageUrl);
      setSelectedFile(new File([], 'existing-image.jpg')); // Dummy file to indicate we're re-cropping
      setShowCropper(true);
    }
  };

  const handleAdjustCropComplete = async (croppedFile: File) => {
    if (!user?.id) return;

    setShowCropper(false);
    setIsUploading(true);

    // Create blob URL for immediate preview
    const croppedBlobUrl = URL.createObjectURL(croppedFile);
    setDisplayImageUrl(croppedBlobUrl);

    try {
      console.log('Re-uploading adjusted crop for user:', user.id);

      const imageUrl = await uploadEventImage(croppedFile, user.id);

      if (imageUrl) {
        updateFormData({
          imageUrl
        });

        // Preload remote URL before switching
        const img = new Image();
        img.onload = () => {
          setDisplayImageUrl(imageUrl);
          URL.revokeObjectURL(croppedBlobUrl);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
          }
        };
        img.onerror = () => {
          toast({
            title: "Image Load Warning",
            description: "Image uploaded but preview may be delayed.",
            variant: "default"
          });
        };
        img.src = imageUrl;

        toast({
          title: "Crop Adjusted",
          description: "Your image has been re-cropped and uploaded successfully.",
        });
      } else {
        throw new Error('Failed to upload re-cropped image');
      }
    } catch (error) {
      console.error('Error re-uploading cropped image:', error);
      toast({
        title: "Upload Error",
        description: "Failed to upload adjusted crop. Please try again.",
        variant: "destructive"
      });

      // Revert to previous image
      setDisplayImageUrl(formData.imageUrl);
      URL.revokeObjectURL(croppedBlobUrl);
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setPreviewUrl('');
    }
  };

  const handleAdjustCropCancel = () => {
    setShowCropper(false);
    setPreviewUrl('');
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
        {(displayImageUrl || formData.imageUrl) ? (
          <div className="space-y-2">
            <div className="relative">
              <img
                src={displayImageUrl || formData.imageUrl}
                alt="Event preview"
                className="w-full h-48 rounded-lg border-2 border-gray-300 object-cover"
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleAdjustCrop}
              disabled={isUploading}
              className="w-full"
            >
              <Crop className="w-4 h-4 mr-2" />
              Adjust Crop
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
          <Label>Start Date *</Label>
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

      {/* End Date (Optional for multi-day events) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>End Date (Optional)</Label>
          {formData.endDate && formData.date && !isSameDay(formData.date, formData.endDate) && (
            <Badge variant="secondary" className="text-xs">Multi-day Event</Badge>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.endDate ? format(formData.endDate, "PPP") : "Same as start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={formData.endDate || undefined}
              onSelect={(date) => updateFormData({ endDate: date || null })}
              disabled={(date) =>
                formData.date ? date < formData.date : date < new Date()
              }
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-gray-500">
          Leave blank for single-day events. Select a later date for multi-day events.
        </p>
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

      {/* Transferability Setting */}
      <div className="space-y-2 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="transferable" className="text-base font-medium cursor-pointer">
                Allow Ticket Transfers
              </Label>
              {formData.transferable && (
                <Badge variant="secondary" className="text-xs">Transferable</Badge>
              )}
              {!formData.transferable && (
                <Badge variant="outline" className="text-xs">Soul-bound</Badge>
              )}
            </div>
            <p className="text-sm text-gray-600">
              {formData.transferable
                ? "Ticket holders can transfer or resell their tickets to others."
                : "Tickets are soul-bound (non-transferable) and cannot be resold. Recommended for most events to prevent scalping."}
            </p>
          </div>
          <Switch
            id="transferable"
            checked={formData.transferable ?? false}
            onCheckedChange={(checked) => updateFormData({ transferable: checked })}
          />
        </div>
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

      {/* Image Cropper Dialog */}
      {showCropper && previewUrl && (
        <ImageCropper
          imageUrl={previewUrl}
          isOpen={showCropper}
          onClose={selectedFile ? handleCropCancel : handleAdjustCropCancel}
          onCropComplete={selectedFile ? handleCropComplete : handleAdjustCropComplete}
          fileName={selectedFile?.name || 'event-image.jpg'}
        />
      )}
    </div>
  );
};

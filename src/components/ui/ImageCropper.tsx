import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { getCroppedImg, type Area } from '@/utils/cropUtils';
import { useToast } from '@/hooks/use-toast';

interface ImageCropperProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onCropComplete: (croppedFile: File) => void;
  fileName?: string;
  aspectRatio?: number;
}

/**
 * ImageCropper component using react-easy-crop
 * Allows users to position their image within a square (1:1) aspect ratio container
 * Returns an actual cropped File object using canvas extraction
 */
export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageUrl,
  isOpen,
  onClose,
  onCropComplete,
  fileName = 'cropped-image.jpg',
  aspectRatio = 1, // Square (1:1) for NFT compatibility
}) => {
  const { toast } = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropCompleteCallback = useCallback(
    (_croppedArea: any, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      toast({
        title: 'Crop Error',
        description: 'No crop area selected. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      console.log('Creating cropped image with pixels:', croppedAreaPixels);

      // Use canvas to extract the exact cropped area
      const croppedFile = await getCroppedImg(
        imageUrl,
        croppedAreaPixels,
        rotation,
        fileName
      );

      if (!croppedFile) {
        throw new Error('Failed to create cropped image');
      }

      console.log('Cropped file created:', {
        name: croppedFile.name,
        size: croppedFile.size,
        type: croppedFile.type,
      });

      onCropComplete(croppedFile);
    } catch (error) {
      console.error('Error creating cropped image:', error);
      toast({
        title: 'Crop Error',
        description: error instanceof Error ? error.message : 'Failed to crop image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Adjust Image Position</DialogTitle>
          <DialogDescription>
            Drag to reposition your image and use the zoom slider to adjust the framing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cropper Container */}
          <div className="relative w-full h-[400px] bg-gray-900 rounded-lg overflow-hidden">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropCompleteCallback}
              objectFit="contain"
              showGrid={false}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#1a1a1a',
                },
              }}
            />
          </div>

          {/* Zoom Control */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ZoomOut className="w-4 h-4" />
              <span>Zoom</span>
              <ZoomIn className="w-4 h-4" />
            </Label>
            <Slider
              value={[zoom]}
              onValueChange={(values) => setZoom(values[0])}
              min={1}
              max={3}
              step={0.1}
              className="w-full"
            />
          </div>

          <p className="text-sm text-gray-500">
            Tip: Drag the image to position it within the frame. The final image will be square (1:1) and used as your NFT ticket metadata.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-purple-600 hover:bg-purple-700"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Apply Crop'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, X, Crop } from 'lucide-react';

interface ImageUploadFieldProps {
  imageUrl: string;
  isUploading: boolean;
  authenticated: boolean;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onAdjustCrop: () => void;
  label?: string;
  helperText?: string;
  previewAlt?: string;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  imageUrl,
  isUploading,
  authenticated,
  onFileSelect,
  onRemove,
  onAdjustCrop,
  label,
  helperText,
  previewAlt = 'Image preview',
}) => {
  return (
    <div>
      {label && <Label>{label}</Label>}
      {helperText && (
        <p className="text-sm text-gray-600 mb-2">
          {helperText}
        </p>
      )}
      {imageUrl ? (
        <div className="space-y-2 w-[70%]">
          <div className="relative">
            <img
              src={imageUrl}
              alt={previewAlt}
              className="w-full aspect-square rounded-lg border-2 border-gray-300 object-cover"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              className="absolute top-2 right-2 bg-white hover:bg-gray-100"
              disabled={isUploading}
              type="button"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onAdjustCrop}
            disabled={isUploading}
            className="w-full"
            type="button"
          >
            <Crop className="w-4 h-4 mr-2" />
            Adjust Crop
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {isUploading ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600">Uploading image...</p>
            </div>
          ) : (
            <>
              <Input
                type="file"
                accept="image/*"
                onChange={onFileSelect}
                disabled={!authenticated}
              />
              <p className="text-xs text-gray-500">Max file size: 5MB</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

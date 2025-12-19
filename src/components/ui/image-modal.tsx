import React from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

interface ImageModalProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, alt, children }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-black/90 border-0">
        <div className="relative flex items-center justify-center">
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[85vh] object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
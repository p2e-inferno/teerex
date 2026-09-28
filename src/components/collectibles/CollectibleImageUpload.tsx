import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Crop, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropper } from '@/components/ui/ImageCropper';
import { useToast } from '@/hooks/use-toast';
import { uploadEventImage } from '@/utils/supabaseDraftStorage';

interface Props {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

export function CollectibleImageUpload({ value, onChange, disabled }: Props) {
  const { authenticated, user } = usePrivy();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = (file?: File) => {
    if (!file) return;
    if (!authenticated || !user?.id) {
      toast({ title: 'Connect first', description: 'Sign in before uploading artwork.', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Choose an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image is too large', description: 'Use an image smaller than 5MB.', variant: 'destructive' });
      return;
    }
    const next = URL.createObjectURL(file);
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(next);
    setCropOpen(true);
  };

  const upload = async (file: File) => {
    if (!user?.id) return;
    setCropOpen(false);
    setUploading(true);
    try {
      const url = await uploadEventImage(file, user.id);
      if (!url) throw new Error('Image upload failed.');
      onChange(url);
      setPreview('');
      toast({ title: 'Artwork uploaded' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const display = preview || value;
  return (
    <div className="space-y-3">
      {display ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <img src={display} alt="Collectible artwork preview" className="aspect-square w-full object-cover" />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-2 top-2"
              disabled={disabled || uploading}
              onClick={() => { onChange(''); setPreview(''); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled || uploading}
            onClick={() => { setPreview(value); setCropOpen(true); }}
          >
            <Crop className="mr-2 h-4 w-4" /> Adjust crop
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/30 p-8 text-center hover:border-primary/40 disabled:opacity-60"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="mb-3 h-8 w-8 animate-spin" /> : <Upload className="mb-3 h-8 w-8" />}
          <span className="font-medium">{uploading ? 'Uploading artwork…' : 'Upload collectible artwork'}</span>
          <span className="mt-1 text-sm text-muted-foreground">Square image, up to 5MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*"
        disabled={disabled || uploading}
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {display && !preview && (
        <Button type="button" variant="outline" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
          Replace image
        </Button>
      )}
      <ImageCropper
        imageUrl={preview || value}
        isOpen={cropOpen}
        onClose={() => { setCropOpen(false); if (preview.startsWith('blob:')) setPreview(''); }}
        onCropComplete={upload}
        fileName="collectible-artwork.jpg"
        aspectRatio={1}
      />
    </div>
  );
}

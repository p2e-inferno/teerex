import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Edit,
  Unlink,
  Copy,
  ExternalLink
} from 'lucide-react';

interface LinkPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  url: string;
  text: string;
  onEdit: () => void;
  onUnlink: () => void;
  onCopy: () => void;
  onOpenLink: () => void;
}

export const LinkPopover: React.FC<LinkPopoverProps> = ({
  isOpen,
  onClose,
  position,
  url,
  onEdit,
  onUnlink,
  onCopy,
  onOpenLink
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Popover open={isOpen} onOpenChange={onClose}>
      <PopoverTrigger asChild>
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: position.x,
            top: position.y,
            width: 1,
            height: 1
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        side="bottom"
        align="start"
        sideOffset={8}
        onInteractOutside={onClose}
        onEscapeKeyDown={onClose}
      >
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-full">
            {url}
          </div>
          <Separator />

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 px-2"
            onClick={() => handleAction(onEdit)}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Link
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 px-2"
            onClick={() => handleAction(onUnlink)}
          >
            <Unlink className="w-4 h-4 mr-2" />
            Remove Link
          </Button>

          <Separator />

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 px-2"
            onClick={() => handleAction(onCopy)}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-8 px-2"
            onClick={() => handleAction(onOpenLink)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

import * as React from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FieldHelpProps {
  text: string;
  className?: string;
}

export const FieldHelp = ({ text, className }: FieldHelpProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('h-5 w-5 shrink-0 rounded-full text-muted-foreground hover:text-foreground', className)}
        aria-label="More information"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="max-w-xs text-sm leading-relaxed" align="start">
      {text}
    </PopoverContent>
  </Popover>
);

interface FieldLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {
  help: string;
}

export const FieldLabel = ({ children, help, className, ...labelProps }: FieldLabelProps) => (
  <div className="flex items-center gap-1.5">
    <Label className={className} {...labelProps}>{children}</Label>
    <FieldHelp text={help} />
  </div>
);

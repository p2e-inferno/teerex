import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Bank } from '@/hooks/useBanks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface BankSelectProps {
  id?: string;
  banks: Bank[];
  value: string;
  onValueChange: (bankCode: string) => void;
  disabled?: boolean;
  placeholder?: string;
  disabledPlaceholder?: string;
  loading?: boolean;
}

export const BankSelect: React.FC<BankSelectProps> = ({
  id,
  banks,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Search and select your bank...',
  disabledPlaceholder = placeholder,
  loading = false,
}) => {
  const [open, setOpen] = useState(false);
  const selectedBank = banks.find((bank) => bank.code === value);
  const isDisabled = disabled || loading;
  const label = loading ? 'Loading banks...' : selectedBank?.name || (disabled ? disabledPlaceholder : placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={isDisabled}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search banks..." />
          <CommandList>
            <CommandEmpty>No bank found.</CommandEmpty>
            <CommandGroup>
              {banks.map((bank) => (
                <CommandItem
                  key={bank.code}
                  value={`${bank.name} ${bank.code} ${bank.slug}`}
                  onSelect={() => {
                    onValueChange(bank.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === bank.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{bank.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

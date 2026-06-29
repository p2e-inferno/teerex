import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronsUpDown, Loader2, MapPin, Search, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLinkableEvents, type LinkableEvent } from '@/hooks/useLinkableEvents';

const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type EventLinkPickerProps = {
  inputValue: string;
  selectedEvent: LinkableEvent | null;
  onInputChange: (value: string) => void;
  onSelect: (event: LinkableEvent) => void;
  onClear: () => void;
  disabled?: boolean;
};

export function EventLinkPicker({
  inputValue,
  selectedEvent,
  onInputChange,
  onSelect,
  onClear,
  disabled,
}: EventLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    data,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useLinkableEvents({
    query: inputValue,
    chainId: null,
    enabled: open || isAddress(inputValue),
  });

  const events = useMemo(() => data?.pages.flatMap((page) => page.events) ?? [], [data]);
  const normalizedInput = inputValue.trim().toLowerCase();
  const exactAddressMatch = useMemo(() => {
    if (!isAddress(inputValue)) return null;
    return events.find((event) => event.lock_address.toLowerCase() === normalizedInput) ?? null;
  }, [events, inputValue, normalizedInput]);

  useEffect(() => {
    if (!exactAddressMatch) return;
    if (selectedEvent?.lock_address.toLowerCase() === exactAddressMatch.lock_address.toLowerCase()) return;
    onSelect(exactAddressMatch);
  }, [exactAddressMatch, onSelect, selectedEvent?.lock_address]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '80px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const showAddressNotFound = isAddress(inputValue) && !isFetching && events.length === 0;
  const showNeedsSelection = inputValue.trim() && !selectedEvent && !isAddress(inputValue);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left font-normal"
          >
            <span className="min-w-0 flex-1 truncate">
              {selectedEvent ? selectedEvent.title : inputValue.trim() || 'Search event name or paste address'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={inputValue}
              onValueChange={(value) => {
                onInputChange(value);
                if (!open) setOpen(true);
              }}
              placeholder="Search event name or paste event address"
            />
            <CommandList
              className="h-72 max-h-[min(18rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain"
              onWheelCapture={(event) => event.stopPropagation()}
              onTouchMoveCapture={(event) => event.stopPropagation()}
            >
              <CommandEmpty>
                {isFetching ? 'Searching...' : showAddressNotFound ? 'No event found for this address.' : 'No events found.'}
              </CommandEmpty>
              <CommandGroup>
                {events.map((event) => {
                  const dateLabel = formatDate(event.date);
                  const isSelected = selectedEvent?.lock_address.toLowerCase() === event.lock_address.toLowerCase();
                  return (
                    <CommandItem
                      key={event.id}
                      value={`${event.title} ${event.lock_address}`}
                      onSelect={() => {
                        onSelect(event);
                        setOpen(false);
                      }}
                      className="items-start gap-3 py-2"
                    >
                      {event.image_url ? (
                        <img src={event.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{event.title}</p>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{shortAddress(event.lock_address)}</span>
                          {dateLabel && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {dateLabel}
                            </span>
                          )}
                          {event.location && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{event.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedEvent && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">Linked</Badge>
              <p className="truncate text-sm font-medium">{selectedEvent.title}</p>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{shortAddress(selectedEvent.lock_address)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!selectedEvent && showNeedsSelection && (
        <p className="text-xs text-muted-foreground">Select an event from the list to link it.</p>
      )}
      {showAddressNotFound && (
        <p className={cn('text-xs', 'text-destructive')}>No matching event exists for this address.</p>
      )}
    </div>
  );
}

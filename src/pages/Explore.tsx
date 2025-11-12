import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Filter, Calendar } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { PublishedEvent } from '@/utils/eventUtils';
import { useToast } from '@/hooks/use-toast';
import { EventPurchaseDialog } from '@/components/events/EventPurchaseDialog';
import { PaystackPaymentDialog } from '@/components/events/PaystackPaymentDialog';
import { TicketProcessingDialog } from '@/components/events/TicketProcessingDialog';
import { PaymentMethodDialog } from '@/components/events/PaymentMethodDialog';
import { fetchEventsPage, fetchKeysForPage, ExploreFilters } from '@/lib/explore/exploreData';

const Explore = () => {
  const PAGE_SIZE = 12;
  const { authenticated, login } = usePrivy();
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<PublishedEvent | null>(null);
  const [activeModal, setActiveModal] = useState<'none' | 'payment-method' | 'crypto-purchase' | 'paystack-payment' | 'ticket-processing'>('none');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [keysSoldMap, setKeysSoldMap] = useState<Record<string, number>>({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [filters, setFilters] = useState<ExploreFilters>({ sortBy: 'date-desc', isFree: null });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });

  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setPage(1);
    setHasMore(true);
    setEvents([]);
    setKeysSoldMap({});
    try {
      const result = await fetchEventsPage(1, PAGE_SIZE, {
        ...filters,
        query: debouncedQuery || undefined,
        dateFrom: dateRange.from || null,
        dateTo: dateRange.to || null,
      });
      setEvents(result.events);
      setHasMore(result.hasMore);
      const keys = await fetchKeysForPage(result.events);
      setKeysSoldMap(keys);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: "Error Loading Events",
        description: "There was an error loading events. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters, debouncedQuery, dateRange.from, dateRange.to, toast]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadNextPage = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await fetchEventsPage(nextPage, PAGE_SIZE, {
        ...filters,
        query: debouncedQuery || undefined,
        dateFrom: dateRange.from || null,
        dateTo: dateRange.to || null,
      });
      setEvents(prev => [...prev, ...result.events]);
      setPage(nextPage);
      setHasMore(result.hasMore);
      const keys = await fetchKeysForPage(result.events);
      setKeysSoldMap(prev => ({ ...prev, ...keys }));
    } catch (error) {
      console.error('Error loading more events:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, filters, debouncedQuery, dateRange.from, dateRange.to, isLoading, isLoadingMore, hasMore]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadNextPage();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadNextPage]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => { if (e.category) set.add(e.category); });
    return Array.from(set);
  }, [events]);

  const handleEventDetails = (event: PublishedEvent) => {
    setSelectedEvent(event);
    
    console.log('=== HANDLE GET TICKET CALLED FROM EXPLORE ===');
    console.log('Event data:', event);
    console.log('Payment methods:', event.payment_methods);
    console.log('Paystack key:', event.paystack_public_key);
    console.log('NGN price:', event.ngn_price);
    
    const hasCrypto = event.payment_methods?.includes('crypto') || event.currency !== 'FREE';
    const hasPaystack = event.payment_methods?.includes('fiat') && event.paystack_public_key && event.ngn_price;
    
    console.log('Has crypto:', hasCrypto);
    console.log('Has paystack:', hasPaystack);
    
    // If both payment methods available, show selection dialog
    if (hasCrypto && hasPaystack) {
      console.log('Opening payment method dialog');
      setActiveModal('payment-method');
    } else if (hasPaystack) {
      // Only Paystack available
      console.log('Opening paystack dialog');
      setActiveModal('paystack-payment');
    } else {
      // Only crypto available (default)
      console.log('Opening crypto dialog');
      setActiveModal('crypto-purchase');
    }
  };

  const handleSelectCrypto = () => {
    setActiveModal('crypto-purchase');
  };

  const handleSelectPaystack = () => {
    setActiveModal('paystack-payment');
  };

  const closeAllModals = () => {
    setActiveModal('none');
    setSelectedEvent(null);
    // Refresh event data to show updated spot count
    loadFirstPage();
  };

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border-0 shadow-sm">
          <div className="aspect-video rounded-t-lg overflow-hidden">
            <Skeleton className="w-full h-full" />
          </div>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Explore Events</h1>
          <p className="text-gray-600">Discover amazing events with blockchain-verified tickets</p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search events, locations, categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200"
            />
          </div>
          <div className="flex gap-2">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-gray-300">
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Price</Label>
                    <RadioGroup
                      className="mt-2 grid grid-cols-3 gap-2"
                      value={filters.isFree === null ? 'all' : filters.isFree ? 'free' : 'paid'}
                      onValueChange={(v) => setFilters(prev => ({ ...prev, isFree: v === 'all' ? null : v === 'free' }))}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem id="price-all" value="all" />
                        <Label htmlFor="price-all">All</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem id="price-free" value="free" />
                        <Label htmlFor="price-free">Free</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem id="price-paid" value="paid" />
                        <Label htmlFor="price-paid">Paid</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Category</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categories.length === 0 ? (
                        <span className="text-sm text-gray-500">No categories yet</span>
                      ) : (
                        categories.slice(0, 10).map(cat => (
                          <Button
                            key={cat}
                            size="sm"
                            variant={filters.category === cat ? 'default' : 'outline'}
                            onClick={() => setFilters(prev => ({ ...prev, category: prev.category === cat ? undefined : cat }))}
                          >
                            {cat}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFilters(prev => ({ ...prev, isFree: null, category: undefined }));
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-gray-300">
                  <Calendar className="w-4 h-4 mr-2" />
                  Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="end">
                <div className="p-2">
                  <CalendarUI
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(r: any) => setDateRange({ from: r?.from, to: r?.to })}
                    numberOfMonths={2}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setDateRange({ from: undefined, to: undefined }); setDateOpen(false); loadFirstPage(); }}>Clear</Button>
                    <Button onClick={() => { setDateOpen(false); loadFirstPage(); }}>Apply</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Events Grid */}
        {isLoading ? (
          renderSkeleton()
        ) : events.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <CardTitle className="text-gray-900">
                No events yet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <p className="text-gray-600 mb-6">
                Be the first to create an amazing Web3 event!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onViewDetails={handleEventDetails}
                keysSold={keysSoldMap[event.id]}
                authenticated={authenticated}
                onConnectWallet={login}
              />
            ))}
            {isLoadingMore && Array.from({ length: 3 }).map((_, i) => (
              <Card key={`sk-${i}`} className="border-0 shadow-sm">
                <div className="aspect-video rounded-t-lg overflow-hidden">
                  <Skeleton className="w-full h-full" />
                </div>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div ref={loadMoreRef} className="h-1" />
      </div>
      {/* Payment Method Selection Dialog */}
      <PaymentMethodDialog
        event={selectedEvent}
        isOpen={activeModal === 'payment-method'}
        onClose={closeAllModals}
        onSelectCrypto={handleSelectCrypto}
        onSelectPaystack={handleSelectPaystack}
      />

      {/* Crypto Purchase Dialog */}
      <EventPurchaseDialog
        event={selectedEvent}
        isOpen={activeModal === 'crypto-purchase'}
        onClose={closeAllModals}
      />

      {/* Paystack Payment Dialog */}
      <PaystackPaymentDialog
        event={selectedEvent}
        isOpen={activeModal === 'paystack-payment'}
        onClose={closeAllModals}
        onSuccess={(data) => { setPaymentData(data); setActiveModal('ticket-processing'); }}
      />

      {/* Ticket Processing Dialog */}
      <TicketProcessingDialog
        event={selectedEvent}
        isOpen={activeModal === 'ticket-processing'}
        onClose={closeAllModals}
        paymentData={paymentData}
      />
    </div>
  );
};

export default Explore;

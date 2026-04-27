
import React, { useState, useEffect, useCallback } from 'react';
import { EventCreateSchema } from '@/types/event.schema';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EventBasicInfo } from '@/components/create-event/EventBasicInfo';
import { EventDetails } from '@/components/create-event/EventDetails';
import { TicketSettings } from '@/components/create-event/TicketSettings';
import { TicketSettingsDisplay } from '@/components/create-event/TicketSettingsDisplay';
import { EventPreview } from '@/components/create-event/EventPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateLockTransferability } from '@/utils/lockUtils';
import { getPublishedEvent } from '@/utils/supabaseDraftStorage';
import {
  saveDraftViaEdge,
  updateDraftViaEdge,
  getDraftViaEdge,
} from '@/utils/edgeFunctionStorage';
import { supabase } from '@/integrations/supabase/client';
import { EventCreationSuccessModal } from '@/components/events/EventCreationSuccessModal';
import { WalletConnectionGate } from '@/components/WalletConnectionGate';
import { isCryptoPriceValid, isFiatPriceValid } from '@/utils/priceUtils';
import type { CryptoCurrency } from '@/types/currency';
import { useEventPublisher } from '@/hooks/useEventPublisher';
import { getDefaultChainId } from '@/lib/config/network-config';
import { getEventEndIso, getEventStartIso } from '@/utils/eventTime';

const timeFromIso = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const dateToIsoOrNull = (value?: Date | null): string | null => {
  if (!value) return null;
  const time = value.getTime();
  return Number.isFinite(time) ? value.toISOString() : null;
};

const getDefaultFormData = (): EventFormData => ({
  title: '',
  description: '',
  date: null,
  time: '',
  endTime: '',
  location: '',
  eventType: 'physical',
  capacity: 100,
  price: 0,
  currency: 'ETH',
  ngnPrice: 0,
  paymentMethod: 'free',
  category: '',
  imageUrl: '',
  chainId: getDefaultChainId(),
  ticketDuration: 'event',
  customDurationDays: undefined,
  isPublic: true,
  allowWaitlist: false,
  hasAllowList: false,
  transferable: false,
  refundProtectionEnabled: false,
  refundMinAttendees: undefined,
  refundTriggerAt: null,
  refundEventEndAt: null,
  refundReserveBond: null,
  refundStatus: null,
  purchaseConfirmationMessage: null
});

const buildEventUpdatePatch = (
  initial: EventFormData,
  current: EventFormData
): Partial<EventFormData> => {
  const patch: Partial<EventFormData> = {};

  const assignIfChanged = <K extends keyof EventFormData>(
    key: K,
    normalize?: (value: EventFormData[K]) => unknown
  ) => {
    const normalizeValue = normalize ?? ((value: EventFormData[K]) => value);
    if (normalizeValue(current[key]) !== normalizeValue(initial[key])) {
      patch[key] = current[key];
    }
  };

  assignIfChanged("title");
  assignIfChanged("description");
  assignIfChanged("date", value => dateToIsoOrNull(value as Date | null | undefined));
  assignIfChanged("endDate", value => dateToIsoOrNull(value as Date | null | undefined));
  assignIfChanged("time");
  assignIfChanged("endTime");
  assignIfChanged("location");
  assignIfChanged("eventType");
  assignIfChanged("category");
  assignIfChanged("imageUrl");
  assignIfChanged("imageCropX", value => value ?? null);
  assignIfChanged("imageCropY", value => value ?? null);
  assignIfChanged("transferable", value => value ?? false);
  assignIfChanged("allowWaitlist", value => value ?? false);
  assignIfChanged("isPublic", value => value ?? true);

  return patch;
};

export interface EventFormData {
  title: string;
  description: string;
  date: Date | null;
  endDate?: Date | null;
  time: string;
  endTime: string;
  location: string;
  eventType: 'physical' | 'virtual';
  capacity: number;
  // Crypto pricing (used only when paymentMethod === 'crypto')
  price: number;
  currency: CryptoCurrency;
  // Fiat pricing (used only when paymentMethod === 'fiat')
  ngnPrice: number;
  // Single, mutually exclusive payment method
  paymentMethod: 'free' | 'crypto' | 'fiat';
  category: string;
  imageUrl: string;
  imageCropX?: number;
  imageCropY?: number;
  chainId: number;
  // Ticket validity duration
  ticketDuration: 'event' | '30' | '365' | 'unlimited' | 'custom';
  customDurationDays?: number;
  // Visibility and access control
  isPublic: boolean;
  allowWaitlist: boolean;
  hasAllowList: boolean;
  // Transferability setting
  transferable?: boolean;
  refundProtectionEnabled?: boolean;
  refundMinAttendees?: number;
  refundTriggerAt?: string | null;
  refundEventEndAt?: string | null;
  refundReserveBond?: string | null;
  refundStatus?: string | null;
  // Optional rich-text message shown after a successful purchase / claim and
  // included in the ticket confirmation email. Editable later from Manage Event.
  purchaseConfirmationMessage?: string | null;
}

const CreateEvent = () => {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft');
  const eventId = searchParams.get('eventId');
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId);
  const [editingEventId, setEditingEventId] = useState<string | null>(eventId);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<any>(null);
  const [editingMeta, setEditingMeta] = useState<{ lockAddress: string; chainId: number; initialTransferable: boolean } | null>(null);
  const [initialEditFormData, setInitialEditFormData] = useState<EventFormData | null>(null);
  const [formData, setFormData] = useState<EventFormData>(getDefaultFormData);

  // Shared event publisher hook
  const { publishEvent, isPublishing: isPublishingEvent } = useEventPublisher();

  useEffect(() => {
    if (!draftId && !eventId) {
      setFormData(getDefaultFormData());
      setCurrentStep(1);
      setCurrentDraftId(null);
      setEditingEventId(null);
      setEditingMeta(null);
      setInitialEditFormData(null);
      return;
    }

    if (draftId && user?.id) {
      const loadDraft = async () => {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.error('No access token available for loading draft');
          return;
        }
        const draft = await getDraftViaEdge(draftId, user.id, accessToken);
        if (draft) {
          setFormData({
            title: draft.title,
            // Preserve the network selected when the draft was saved
            chainId: (draft as any).chain_id,
            description: draft.description,
            date: draft.date,
            endDate: draft.end_date,
            time: draft.time,
            endTime: timeFromIso((draft as any).ends_at) || draft.time,
            location: draft.location,
            eventType: (draft as any).event_type || 'physical',
            capacity: draft.capacity,
            // derive payment model
            paymentMethod: (draft.payment_methods && draft.payment_methods[0])
              ? (draft.payment_methods[0] as 'free' | 'crypto' | 'fiat')
              : 'free',
            price: (draft.payment_methods && draft.payment_methods[0] === 'crypto') ? draft.price : 0,
            currency: (draft.payment_methods && draft.payment_methods[0] === 'crypto')
              ? (draft.currency as CryptoCurrency)
              : 'ETH',
            ngnPrice: draft.ngn_price || 0,
            category: draft.category,
            imageUrl: draft.image_url || '',
            ticketDuration: (draft.ticket_duration as 'event' | '30' | '365' | 'unlimited' | 'custom') || 'event',
            customDurationDays: draft.custom_duration_days,
            isPublic: (draft as any).is_public ?? true,
            allowWaitlist: (draft as any).allow_waitlist ?? false,
            hasAllowList: (draft as any).has_allow_list ?? false,
            transferable: draft.transferable ?? false,
            refundProtectionEnabled: (draft as any).refund_protection_enabled ?? false,
            refundMinAttendees: (draft as any).refund_min_attendees ?? undefined,
            refundTriggerAt: (draft as any).refund_trigger_at ?? null,
            refundEventEndAt: (draft as any).refund_event_end_at ?? (draft as any).ends_at ?? null,
            refundReserveBond: (draft as any).refund_reserve_bond ?? null,
            refundStatus: (draft as any).refund_status ?? null,
            purchaseConfirmationMessage: (draft as any).purchase_confirmation_message ?? null
          });
          setCurrentDraftId(draftId);
          setEditingEventId(null);
        }
      };
      loadDraft();
    } else if (eventId && user?.id) {
      const loadEvent = async () => {
        const event = await getPublishedEvent(eventId, user.id);
        if (event) {
          const loadedFormData: EventFormData = {
            title: event.title,
            description: event.description,
            date: event.date,
            endDate: event.end_date,
            time: event.time,
            endTime: timeFromIso((event as any).ends_at) || event.time,
            location: event.location,
            eventType: (event as any).event_type || 'physical',
            capacity: event.capacity,
            paymentMethod: (event.payment_methods && event.payment_methods[0])
              ? (event.payment_methods[0] as 'free' | 'crypto' | 'fiat')
              : 'free',
            price: (event.payment_methods && event.payment_methods[0] === 'crypto') ? event.price : 0,
            currency: (event.payment_methods && event.payment_methods[0] === 'crypto')
              ? (event.currency as CryptoCurrency)
              : 'ETH',
            ngnPrice: event.ngn_price || 0,
            category: event.category,
            imageUrl: event.image_url || '',
            chainId: event.chain_id || getDefaultChainId(),
            ticketDuration: (event.ticket_duration as 'event' | '30' | '365' | 'unlimited' | 'custom') || 'event',
            customDurationDays: event.custom_duration_days,
            isPublic: (event as any).is_public ?? true,
            allowWaitlist: (event as any).allow_waitlist ?? false,
            hasAllowList: (event as any).has_allow_list ?? false,
            transferable: (event as any).transferable ?? false,
            refundProtectionEnabled: (event as any).refund_protection_enabled ?? false,
            refundMinAttendees: (event as any).refund_min_attendees ?? undefined,
            refundTriggerAt: (event as any).refund_trigger_at ?? null,
            refundEventEndAt: (event as any).refund_event_end_at ?? (event as any).ends_at ?? null,
            refundReserveBond: (event as any).refund_reserve_bond ?? null,
            refundStatus: (event as any).refund_status ?? null,
            purchaseConfirmationMessage: (event as any).purchase_confirmation_message ?? null
          };
          setFormData(loadedFormData);
          setInitialEditFormData(loadedFormData);
          setEditingEventId(eventId);
          setCurrentDraftId(null);
          setEditingMeta({
            lockAddress: (event as any).lockAddress || (event as any).lock_address,
            chainId: event.chain_id || 0,
            initialTransferable: (event as any).transferable ?? false,
          });
      } else {
        toast({
            title: "Event not found",
            description: "Could not load the event to edit.",
            variant: "destructive"
          });
          navigate('/my-events');
        }
      };
      loadEvent();
    }
  }, [draftId, eventId, user?.id, navigate, toast, getAccessToken]);

  const steps = [
    { number: 1, title: 'Basic Info', component: EventBasicInfo },
    { number: 2, title: 'Details', component: EventDetails },
    { number: 3, title: 'Tickets', component: TicketSettings },
    { number: 4, title: 'Preview', component: EventPreview }
  ];

  const nextStep = () => {
    console.log('Moving to next step, current step:', currentStep);
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateFormData = useCallback((updates: Partial<EventFormData>) => {
    console.log('Updating form data:', updates);
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(
          formData.title.trim() &&
          formData.description.trim() &&
          formData.date &&
          formData.time &&
          formData.endTime &&
          getEventStartIso(formData) &&
          getEventEndIso(formData) &&
          new Date(getEventEndIso(formData)!).getTime() > new Date(getEventStartIso(formData)!).getTime()
        );
      case 2: {
        // Validate basic details
        const hasBasicDetails = !!(formData.category && (editingEventId || formData.capacity > 0));

        // Validate location based on event type
        const hasValidLocation = formData.eventType === 'physical'
          ? !!formData.location.trim()
          : !!formData.location.trim(); // Virtual events also need a link

        return hasBasicDetails && hasValidLocation;
      }
      case 3:
        // Skip ticket validation when editing - settings are read-only
        if (editingEventId) {
          return true;
        }
        // Validate ticket settings based on payment method for new events
        if (formData.paymentMethod === 'crypto') {
          if (!formData.currency) {
            return false;
          }
          if (!isCryptoPriceValid(formData.price, formData.currency)) {
            return false;
          }
          if (formData.refundProtectionEnabled) {
            const min = formData.refundMinAttendees || 0;
            const trigger = formData.refundTriggerAt ? new Date(formData.refundTriggerAt) : null;
            const start = getEventStartIso(formData);
            const end = getEventEndIso(formData);
            if (min <= 0 || min > formData.capacity || !trigger || !start || !end) return false;
            return trigger.getTime() <= new Date(start).getTime() && trigger.getTime() < new Date(end).getTime();
          }
          return true;
        }
        if (formData.paymentMethod === 'fiat') {
          // Fiat is only available if VITE_ENABLE_FIAT is true (checked by TicketSettings)
          // Validate price meets minimum requirement
          return isFiatPriceValid(formData.ngnPrice);
        }
        // free
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  // Simple validation helpers for updateEvent (not needed for createEvent - handled by shared hook)
  const validateRequiredFields = (): boolean => {
    const parsed = EventCreateSchema.safeParse({
      title: formData.title,
      date: formData.date,
      time: formData.time,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: 'Missing or invalid fields',
        description: first?.message || 'Please check your inputs',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const validateDates = (): boolean => {
    if (!formData.date) {
      return false;
    }
    if (formData.endDate && formData.endDate < formData.date) {
      toast({
        title: 'Invalid Date Range',
        description: 'End date must be on or after start date',
        variant: 'destructive',
      });
      return false;
    }
    const startsAt = getEventStartIso(formData);
    const endsAt = getEventEndIso(formData);
    if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast({
        title: 'Invalid Event End Time',
        description: 'End time must be after the event start time.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const saveAsDraft = async () => {
    setIsSavingDraft(true);
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('Saving draft for user:', user.id);
      console.log('Current draft ID:', currentDraftId);
      console.log('Form data:', formData);

      // Refresh access token to prevent expiration issues
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication session expired. Please refresh the page.');
      }
      console.log('Access token refreshed successfully');

      if (currentDraftId) {
        console.log('Updating existing draft:', currentDraftId);
        await updateDraftViaEdge(currentDraftId, formData, user.id, accessToken);
        toast({
          title: "Draft Updated",
          description: "Your event draft has been updated successfully.",
        });
      } else {
        console.log('Creating new draft');
        const newDraftId = await saveDraftViaEdge(formData, user.id, accessToken);
        if (newDraftId) {
          setCurrentDraftId(newDraftId);
          console.log('Draft created successfully:', newDraftId);
          toast({
            title: "Draft Saved",
            description: "Your event has been saved as a draft.",
          });
        } else {
          throw new Error('Failed to save draft - no draft ID returned');
        }
      }
      navigate('/drafts');
    } catch (error) {
      console.error('Error saving draft:', error);

      // Provide detailed error messages
      let errorMessage = "There was an error saving your draft. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('Authentication') || error.message.includes('session')) {
          errorMessage = error.message;
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = `Failed to save draft: ${error.message}`;
        }
      }

      toast({
        title: "Error Saving Draft",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const createEvent = async () => {
    console.log('Creating event with data:', formData);

    const result = await publishEvent(formData, {
      currentDraftId,
      autoSaveOnError: true,
      onSuccess: (savedEvent) => {
        // Show success modal instead of navigating immediately
        setCreatedEvent(savedEvent);
        setShowSuccessModal(true);
      }
    });

    // Handle auto-saved draft ID
    if (!result.success && result.autoSavedDraftId) {
      setCurrentDraftId(result.autoSavedDraftId);
    }

    // Handle duplicate event detection
    if (!result.success && result.error === 'DUPLICATE_EVENT' && result.duplicateEvent) {
      const { lockAddress, eventTitle } = result.duplicateEvent;

      const { dismiss } = toast({
        title: "Event Already Exists",
        description: (
          <div className="space-y-2">
            <p className="text-sm">An event with these core details already exists:</p>
            <p className="font-medium text-sm">"{eventTitle}"</p>
            <p className="text-xs text-gray-600 mt-2">
              If you want to update the description, image, or other details, please view the existing event.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => {
                  dismiss();
                  navigate(`/event/${lockAddress}`);
                }}
              >
                View Event
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss();
                  navigate('/my-events');
                }}
              >
                My Events
              </Button>
            </div>
          </div>
        ),
        duration: 15000,
      });
    }
  };

  const updateEvent = async () => {
    if (!editingEventId || !user?.id || !initialEditFormData) return;
    setIsCreating(true);

    try {
      // Validate required fields before proceeding
      if (!validateRequiredFields()) {
        setIsCreating(false);
        return;
      }
      if (!validateDates()) {
        setIsCreating(false);
        return;
      }

      // If transferability has changed, update it on-chain first
      const hasEditingMeta = Boolean(editingMeta && editingMeta.lockAddress && editingMeta.chainId);
      const nextTransferable = formData.transferable ?? false;
      const transferabilityChanged =
        hasEditingMeta && editingMeta!.initialTransferable !== nextTransferable;

      if (transferabilityChanged) {
        const wallet = wallets[0];
        if (!wallet) {
          throw new Error("Please connect a wallet to update transferability.");
        }

        const result = await updateLockTransferability(
          editingMeta!.lockAddress,
          editingMeta!.chainId,
          wallet,
          nextTransferable
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to update ticket transferability on-chain.");
        }
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authentication token not available. Please log in again.");
      }

      const formPatch = buildEventUpdatePatch(initialEditFormData, formData);
      if (Object.keys(formPatch).length === 0) {
        toast({
          title: "No Changes",
          description: "There are no updates to save.",
        });
        setIsCreating(false);
        return;
      }

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data, error } = await supabase.functions.invoke('update-event', {
        body: {
          eventId: editingEventId,
          formData: { ...formPatch, timezone_offset_minutes: new Date().getTimezoneOffset() },
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
      });

      if (error) {
        // Network or function invocation error
        throw new Error(error.message);
      }
      
      // Check for application-level errors returned from the function
      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Event Updated",
        description: "Your event details have been updated successfully.",
      });
      setInitialEditFormData(formData);
      navigate('/my-events');
    } catch (error) {
      console.error('Error updating event:', error);
      toast({
        title: "Error Updating Event",
        description: error instanceof Error ? error.message : "There was an error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const canContinue = isStepValid(currentStep);

  const handleViewEvent = () => {
    setShowSuccessModal(false);
    if (createdEvent) {
      navigate(`/event/${createdEvent.lock_address}`);
    }
  };

  const handleCreateAnother = () => {
    setShowSuccessModal(false);
    setCreatedEvent(null);
    // Reset form to initial state
    setFormData(getDefaultFormData());
    setCurrentStep(1);
    setCurrentDraftId(null);
    setEditingEventId(null);
    setEditingMeta(null);
    setInitialEditFormData(null);
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setCreatedEvent(null);
    navigate('/my-events');
  };

  const renderStepComponent = () => {
    const commonProps = {
      formData,
      updateFormData,
      onNext: nextStep,
      editingEventId: editingEventId || undefined
    };

    switch (currentStep) {
      case 1:
        return <EventBasicInfo {...commonProps} />;
      case 2:
        return <EventDetails {...commonProps} />;
      case 3:
        if (editingEventId) {
          return (
            <TicketSettingsDisplay
              formData={formData}
              lockAddress={editingMeta?.lockAddress}
              eventId={editingEventId}
            />
          );
        }
        return <TicketSettings {...commonProps} />;
      case 4:
        return <EventPreview {...commonProps} onSaveAsDraft={editingEventId ? undefined : saveAsDraft} isSavingDraft={isSavingDraft} isPublishing={isCreating || isPublishingEvent} />;
      default:
        return <EventBasicInfo {...commonProps} />;
    }
  };

  if (!authenticated) {
    return (
      <WalletConnectionGate
        title="Connect to the App to Create Events"
        description="You need to connect using email or wallet and manage Web3 events"
        fullPage={true}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {editingEventId ? 'Edit Event' : (currentDraftId ? 'Edit Event Draft' : 'Create Event')}
          </h1>
          <p className="text-gray-600">Set up your Web3 event with blockchain-verified tickets</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex items-center md:flex-1">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                    ${currentStep >= step.number 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-gray-200 text-gray-600'
                    }
                  `}>
                    {step.number}
                  </div>
                  <div className={`ml-3 text-sm font-medium ${currentStep === step.number ? 'text-purple-600' : 'text-gray-700'}`}>
                    {step.title}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`
                    hidden md:block flex-1 h-0.5 mx-6
                    ${currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200'}
                  `} />
                )}
                {index < steps.length - 1 && (
                  <div className={`
                    md:hidden h-px w-full
                    ${currentStep > step.number ? 'bg-purple-600' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-0 shadow-sm bg-white mb-8">
          <div className="p-8">
            {renderStepComponent()}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          {currentStep === 1 ? (
            <Button
              variant="outline"
              onClick={() => navigate('/my-events')}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={prevStep}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          
          {currentStep < steps.length ? (
            <Button
              onClick={nextStep}
              disabled={!canContinue}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={editingEventId ? updateEvent : createEvent}
              disabled={!canContinue || isCreating || isPublishingEvent}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {(isCreating || isPublishingEvent) ? (editingEventId ? 'Updating Event...' : 'Deploying Smart Contract...') : (editingEventId ? 'Update Event' : 'Publish Event')}
            </Button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {createdEvent && (
        <EventCreationSuccessModal
          event={createdEvent}
          isOpen={showSuccessModal}
          onClose={handleCloseSuccessModal}
          onViewEvent={handleViewEvent}
          onCreateAnother={handleCreateAnother}
        />
      )}
    </div>
  );
};

export default CreateEvent;

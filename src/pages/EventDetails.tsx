import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Calendar,
  Globe,
  MapPin,
  ExternalLink,
  Users,
  Share2,
  Heart,
  ArrowLeft,
  Ticket,
  CalendarPlus,
  Copy,
  Facebook,
  Twitter,
  Linkedin,
  Shield,
  Loader2,
  AlertCircle,
  Zap,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { getPublishedEventById } from "@/utils/eventUtils";
import type { PublishedEvent } from "@/types/event";
import MetaTags from "@/components/MetaTags";
import {
  getMaxKeysPerAddress,
  getTransferabilityStatus,
} from "@/utils/lockUtils";
import { isEventRegistrationClosed } from "@/lib/events/registration";
import { EventPurchaseDialog } from "@/components/events/EventPurchaseDialog";
import { EventPassOnramp } from "@/components/ticket-pass/EventPassOnramp";
import { EventRewardPools } from "@/components/rewards/EventRewardPools";
import { EventStandings } from "@/components/leaderboards/EventStandings";
import { PaystackPaymentDialog } from "@/components/events/PaystackPaymentDialog";
import { TicketProcessingDialog } from "@/components/events/TicketProcessingDialog";
import { PaymentMethodDialog } from "@/components/events/PaymentMethodDialog";
import { WaitlistDialog } from "@/components/events/WaitlistDialog";
// import { AttestationButton } from "@/components/attestations/AttestationButton";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction, EdgeFunctionError } from "@/lib/edgeFunctions";
import { base, baseSepolia } from "wagmi/chains";
import { EventAttestationCard } from "@/components/attestations/EventAttestationCard";
import { AttendeesList } from "@/components/attestations/AttendeesList";
import { EventHostCard } from "@/components/events/EventHostCard";
import { EventGoingStrip } from "@/components/events/EventGoingStrip";
import { EventLocationMap } from "@/components/events/EventLocationMap";
import { MoreFromHost } from "@/components/events/MoreFromHost";
import { EventInteractionsCard } from "@/components/interactions/core/EventInteractionsCard";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useToast } from "@/hooks/use-toast";
import { isValidAttestationUid, isAttestationRevocableOnChain } from "@/utils/attestationUtils";
import { useEventAttestationState } from "@/hooks/useEventAttestationState";
import { getDisableMessage } from "@/utils/attestationMessages";
import { getBatchAttestationAddress } from "@/lib/config/contract-config";
import { useAttestations } from "@/hooks/useAttestations";
import { useTeeRexDelegatedAttestation } from "@/hooks/useTeeRexDelegatedAttestation";
import { useAttestationEncoding } from "@/hooks/useAttestationEncoding";
import { formatEventCompactDateRange, formatEventDateRange } from "@/utils/dateUtils";
import { formatEventLocalTimeRange } from "@/utils/eventTime";
import { useEventTicketRealtime } from "@/hooks/useEventTicketRealtime";
import { useNetworkConfigs } from "@/hooks/useNetworkConfigs";
import { useRewardPools } from "@/hooks/useRewardPools";
import { useTicketBalance } from "@/hooks/useTicketBalance";
import { useUserAddresses } from "@/hooks/useUserAddresses";
import { useRefundableEventStatus } from "@/hooks/useRefundableEventStatus";
import { useRefundableEventActions } from "@/hooks/useRefundableEventActions";
import { useTelegramNotifications } from "@/hooks/useTelegramNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RichTextDisplay } from "@/components/ui/rich-text/RichTextDisplay";
import { hasMethod, isFreeEvent } from "@/lib/events/paymentMethods";
import { EventDetailsRefreshProvider, useEventDetailsRefresh } from "@/pages/event-details/eventDetailsRefresh";
import {
  getRefundProtectionBadges,
  getRefundProtectionPurchaseStateLabel,
  getRewardPoolCreationGate,
} from "@/lib/events/refundStatus";
import { getEventRewardPoolBadgeMeta } from "@/lib/rewards/rewardPoolStatus";
import { formatCountdownLabel } from "@/utils/dateUtils";

const EventDetailsContent = () => {
  const { id } = useParams<{ id: string }>();
  const { refreshToken, triggerRefresh } = useEventDetailsRefresh();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { authenticated, getAccessToken, login, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = authenticated ? wallets[0] : undefined;
  const userAddresses = useUserAddresses();
  const { revokeEventAttestation } = useAttestations();
  const { signTeeRexAttestation } = useTeeRexDelegatedAttestation();
  const { encodeEventAttendanceData, encodeEventLikeData } = useAttestationEncoding();
  const { networks } = useNetworkConfigs();

  const [event, setEvent] = useState<PublishedEvent | null>(null);
  const [userTicketCount, setUserTicketCount] = useState<number>(0);
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferableOnChain, setIsTransferableOnChain] = useState<boolean | null>(null);
  const [transferFeeBps, setTransferFeeBps] = useState<number | null>(null);
  const [vendorHasPayoutAccount, setVendorHasPayoutAccount] = useState<boolean>(true); // Default to true for backwards compatibility
  const [nowMs, setNowMs] = useState(() => Date.now());
  const telegramNotifications = useTelegramNotifications(event?.creator_id);

  // Real-time ticket count subscription
  const { ticketsSold: keysSold } = useEventTicketRealtime({
    eventId: event?.id || '',
    lockAddress: event?.lock_address || '',
    chainId: event?.chain_id || baseSepolia.id,
    enabled: !!event, // Only enable when event is loaded
  });
  // Modal state management - only one modal can be open at a time
  const [activeModal, setActiveModal] = useState<
    | "none"
    | "payment-method"
    | "crypto-purchase"
    | "paystack-payment"
    | "ticket-processing"
    | "waitlist"
  >("none");
  const [paymentData, setPaymentData] = useState<any>(null);
  const [attendanceSchemaUid, setAttendanceSchemaUid] = useState<string | null>(
    null
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleOrganizerSubscription = useCallback(async () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!event?.creator_id) return;

    if (!telegramNotifications.status?.linked || !telegramNotifications.status?.enabled) {
      toast({
        title: 'Link Telegram first',
        description: 'Enable Telegram notifications from your profile before following organizers.',
      });
      navigate('/profile');
      return;
    }

    try {
      if (telegramNotifications.status?.subscribed) {
        await telegramNotifications.unsubscribeOrganizer.mutateAsync(event.creator_id);
        toast({ title: 'Organizer notifications stopped' });
      } else {
        await telegramNotifications.subscribeOrganizer.mutateAsync(event.creator_id);
        toast({ title: 'Organizer notifications enabled' });
      }
    } catch (error) {
      toast({
        title: 'Could not update organizer notifications',
        description: error instanceof EdgeFunctionError ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [authenticated, event?.creator_id, login, navigate, telegramNotifications, toast]);

  // On-chain transferability status
  useEffect(() => {
    const loadTransferability = async () => {
      if (!event?.lock_address || !event?.chain_id) {
        setIsTransferableOnChain(null);
        setTransferFeeBps(null);
        return;
      }

      try {
        const { isTransferable, feeBasisPoints } = await getTransferabilityStatus(
          event.lock_address,
          event.chain_id
        );
        setIsTransferableOnChain(isTransferable);
        setTransferFeeBps(feeBasisPoints);
      } catch (e) {
        console.error('Failed to load transferability status:', e);
        setIsTransferableOnChain(null);
        setTransferFeeBps(null);
      }
    };

    loadTransferability();
  }, [event?.lock_address, event?.chain_id]);

  useEffect(() => {
    const loadEvent = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const foundEvent = await getPublishedEventById(id);

        if (!foundEvent) {
          toast({
            title: "Event not found",
            description: "The event you're looking for doesn't exist.",
            variant: "destructive",
          });
          navigate("/explore");
          return;
        }

        setEvent(foundEvent);

        // Get max tickets per user for this event
        const maxKeys = await getMaxKeysPerAddress(foundEvent.lock_address, undefined, foundEvent.chain_id);
        setMaxTicketsPerUser(maxKeys);
      } catch (error) {
        console.error("Error loading event:", error);
        toast({
          title: "Error loading event",
          description: "There was an error loading the event details.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadEvent();
  }, [id, navigate, toast]);

  // Check if vendor has verified payout account (for fiat payment blocking)
  useEffect(() => {
    const checkVendorPayoutAccount = async () => {
      if (!event?.creator_id) {
        setVendorHasPayoutAccount(true); // Default to true if no creator
        return;
      }

      // Only check if event has fiat payment method
      if (!hasMethod(event, 'fiat')) {
        setVendorHasPayoutAccount(true);
        return;
      }

      try {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const accessToken = await getAccessToken?.();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

        const functionUrl = `${supabaseUrl}/functions/v1/get-vendor-payout-account?vendor_id=${encodeURIComponent(event.creator_id)}`;
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
          },
        });

        const data = await response.json();
        setVendorHasPayoutAccount(data?.can_receive_fiat_payments === true);
      } catch (error) {
        console.error('Error checking vendor payout account:', error);
        setVendorHasPayoutAccount(false); // Fail closed - don't allow fiat if check fails
      }
    };

    checkVendorPayoutAccount();
  }, [event, getAccessToken]);

  // Centralized attestation state (schemas, UIDs, on-chain instance revocability)
  const { state } = useEventAttestationState({
    eventId: event?.id || '',
    chainId: event?.chain_id || baseSepolia.id,
    lockAddress: event?.lock_address || '',
    userAddress: wallet?.address,
    preferredAttendanceSchemaUid: event?.attendance_schema_uid || null,
  });

  // Like schema + counts
  const [likeSchemaUid, setLikeSchemaUid] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [userLikeUid, setUserLikeUid] = useState<string | null>(null);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  // Attendance (for top ticket card toggle)
  const [myAttendanceUidTop, setMyAttendanceUidTop] = useState<string | null>(null);
  const [isTopAttendanceBusy, setIsTopAttendanceBusy] = useState(false);
  const [eventHasEnded, setEventHasEnded] = useState(false);
  const [attendanceSchemaRevocable, setAttendanceSchemaRevocable] = useState<boolean | null>(null);

  const isRegistrationClosed = event ? isEventRegistrationClosed(event) : false;
  const refundableStatus = useRefundableEventStatus(event, userAddresses);
  const protectedActionEvent = event
    ? { ...event, refund_controller_address: refundableStatus.controllerAddress || event.refund_controller_address || null }
    : null;
  const refundActions = useRefundableEventActions(
    protectedActionEvent,
    wallet,
    refundableStatus.authorizedRefundAddress,
    refundableStatus.refresh,
    refundableStatus.creatorAddress
  );
  const isProtectedRefundEvent = Boolean(event?.refund_protection_enabled);
  const refundTriggerMillis = event?.refund_trigger_at ? new Date(event.refund_trigger_at).getTime() : null;
  const protectionTriggered = Boolean(refundTriggerMillis && Date.now() >= refundTriggerMillis);
  const isProtectedPurchaseClosed = Boolean(
    isProtectedRefundEvent &&
    protectionTriggered
  );
  const spotsLeft = event ? event.capacity - keysSold : 0;
  const isSoldOut = spotsLeft <= 0;
  const primaryTicketCtaDisabled =
    isSoldOut ||
    isRegistrationClosed ||
    isProtectedPurchaseClosed ||
    (authenticated && userTicketCount >= maxTicketsPerUser);
  const primaryTicketCtaLabel = isSoldOut
    ? "Sold Out"
    : isRegistrationClosed
      ? "Registration Closed"
      : isProtectedPurchaseClosed
        ? getRefundProtectionPurchaseStateLabel(refundableStatus.status || event?.refund_status)
        : !authenticated
          ? "Connect Wallet to Get Ticket"
          : userTicketCount >= maxTicketsPerUser
            ? "Ticket Limit Reached"
            : authenticated && userTicketCount > 0
              ? "Get Additional Ticket"
              : "Get Ticket";
  const showWaitlistButton = Boolean(event?.allow_waitlist && isSoldOut);
  const showMobileHeaderTicketCta =
    !authenticated ||
    userTicketCount < maxTicketsPerUser ||
    isSoldOut ||
    isRegistrationClosed ||
    isProtectedPurchaseClosed;
  const managerReleased = Boolean(
    refundableStatus.managerReleased ||
    event?.refund_manager_released ||
    refundableStatus.status === 'released' ||
    event?.refund_status === 'released'
  );
  const refundBadges = getRefundProtectionBadges(
    refundableStatus.status || event?.refund_status,
    'public',
    managerReleased
  );
  const signerMatchesAuthorizedRefundCaller = Boolean(
    wallet?.address &&
    refundableStatus.authorizedRefundAddress &&
    wallet.address.toLowerCase() === refundableStatus.authorizedRefundAddress.toLowerCase()
  );
  const signerMatchesCreator = refundActions.signerIsCreator;
  // The creator must release lock management back to their wallet after a protected
  // event resolves — both when refunds finish (failure path) and when the attendance
  // threshold is met (success path). Surface it here as the discoverable fallback to
  // the buried Advanced-tab control in the management modal.
  const canReleaseProtected = Boolean(
    isProtectedRefundEvent &&
    signerMatchesCreator &&
    !refundableStatus.managerReleased &&
    (refundableStatus.refundComplete || refundableStatus.status === 'threshold_met')
  );
  const rewardPoolCreationGate = getRewardPoolCreationGate({
    isProtectedEvent: isProtectedRefundEvent,
    status: refundableStatus.status || event?.refund_status,
    refundComplete: refundableStatus.refundComplete,
    managerReleased,
    signerIsCreator: signerMatchesCreator,
    authorizedRefundCaller: refundableStatus.authorizedRefundCaller,
    signerMatchesAuthorizedRefundCaller,
  });
  const protectedEventSucceeded = Boolean(
    managerReleased ||
    refundableStatus.status === 'threshold_met' ||
    event?.refund_status === 'threshold_met'
  );
  const refundTriggerLabel = protectedEventSucceeded ? 'Protection Release Opens' : 'Refund Window Opens';
  const refundWindowEndLabel = protectedEventSucceeded ? 'Event Ends' : 'Public Refund Window Closes';
  const refundWindowCountdown = formatCountdownLabel(event?.refund_trigger_at, nowMs);
  const refundWindowClosesCountdown = formatCountdownLabel(event?.refund_event_end_at || event?.ends_at, nowMs);
  const eventDisplayTime = formatEventLocalTimeRange(event?.starts_at, event?.ends_at, event?.time || '');
  const compactEventDateLabel = event?.date
    ? formatEventCompactDateRange({ startDate: event.date, endDate: event.end_date })
    : '';
  const fullEventDateLabel = event?.date
    ? formatEventDateRange({ startDate: event.date, endDate: event.end_date, formatStyle: 'long' })
    : undefined;

  const networkConfig = event ? networks.find(n => n.chain_id === event.chain_id) : undefined;
  const networkLabel = networkConfig?.chain_name
    || (event?.chain_id === base.id ? 'Base' : event?.chain_id === baseSepolia.id ? 'Base Sepolia' : '');
  const explorerBase =
    networkConfig?.block_explorer_url
    || (event?.chain_id === base.id ? 'https://basescan.org' : event?.chain_id === baseSepolia.id ? 'https://sepolia.basescan.org' : undefined);
  const explorerUrl = event && explorerBase
    ? `${explorerBase.replace(/\/$/, '')}/address/${event.lock_address}`
    : '#';

  const isValidSchemaUid = useCallback(
    (uid?: string | null) => !!uid && uid.startsWith('0x') && uid.length === 66 && /^0x[0-9a-f]{64}$/i.test(uid),
    []
  );
  const eventAttendanceSchemaUid =
    event?.attendance_schema_uid && isValidSchemaUid(event.attendance_schema_uid)
      ? event.attendance_schema_uid
      : null;
  const showAttestationSections = Boolean(eventAttendanceSchemaUid);
  const attestationSectionSchemaUid = attendanceSchemaUid || eventAttendanceSchemaUid || undefined;

  const refreshLikes = useCallback(async (ev: PublishedEvent) => {
    try {
      const { data: schema } = await supabase
        .from('attestation_schemas')
        .select('schema_uid,name,revocable')
        .eq('name', 'TeeRex EventLike')
        .maybeSingle();
      if (!schema?.schema_uid || !isValidSchemaUid(schema.schema_uid)) {
        setLikeSchemaUid(null);
        setLikeCount(0);
        setUserLikeUid(null);
        return;
      }
      setLikeSchemaUid(schema.schema_uid);
      const { data: likes } = await supabase
        .from('attestations')
        .select('attestation_uid, recipient, created_at')
        .eq('event_id', ev.id)
        .eq('schema_uid', schema.schema_uid)
        .eq('is_revoked', false);
      const uniq = new Map<string, any>();
      (likes || []).forEach((a) => {
        const prev = uniq.get(a.recipient);
        if (!prev || new Date(a.created_at) > new Date(prev.created_at)) uniq.set(a.recipient, a);
      });
      setLikeCount(uniq.size);
      if (wallet?.address) {
        const mine = uniq.get(wallet.address);
        const uid: string | null = mine?.attestation_uid || null;
        if (isValidAttestationUid(uid)) {
          setUserLikeUid(uid);
        } else {
          setUserLikeUid(null);
        }
      }
    } catch (e) {
      console.error('Error loading likes:', e);
    }
  }, [isValidSchemaUid, wallet?.address]);

  useEffect(() => {
    if (event) refreshLikes(event);
  }, [event, refreshLikes]);

  // Going schema + my UID + instance revocability
  const [goingSchemaUid, setGoingSchemaUid] = useState<string | null>(null);
  const [goingSchemaRevocable, setGoingSchemaRevocable] = useState<boolean | null>(null);
  const [myGoingUid, setMyGoingUid] = useState<string | null>(null);
  const [goingInstanceRevocable, setGoingInstanceRevocable] = useState<boolean | null>(null);

  useEffect(() => {
    const loadGoingSchema = async () => {
      try {
        const { data: schema } = await supabase
          .from('attestation_schemas')
          .select('schema_uid,name,revocable')
          .eq('name', 'TeeRex EventGoing')
          .maybeSingle();
        if (schema?.schema_uid && isValidSchemaUid(schema.schema_uid)) {
          setGoingSchemaUid(schema.schema_uid);
          setGoingSchemaRevocable(Boolean(schema.revocable));
        } else {
          setGoingSchemaUid(null);
          setGoingSchemaRevocable(null);
        }
      } catch (_) {
        setGoingSchemaUid(null);
        setGoingSchemaRevocable(null);
      }
    };
    loadGoingSchema();
  }, [isValidSchemaUid]);

  useEffect(() => {
    const loadMyGoing = async () => {
      try {
        if (!event?.id || !wallet?.address || !goingSchemaUid) {
          setMyGoingUid(null);
          setGoingInstanceRevocable(null);
          return;
        }
        const { data: myGoing } = await supabase
          .from('attestations')
          .select('attestation_uid, created_at')
          .eq('event_id', event.id)
          .eq('schema_uid', goingSchemaUid)
          .eq('recipient', wallet.address)
          .eq('is_revoked', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const uid = myGoing?.attestation_uid || null;
        setMyGoingUid(isValidAttestationUid(uid) ? uid : null);
        if (isValidAttestationUid(uid)) {
          const r = await isAttestationRevocableOnChain(uid!, event!.chain_id);
          setGoingInstanceRevocable(r);
        } else {
          setGoingInstanceRevocable(null);
        }
      } catch (_) {
        setMyGoingUid(null);
        setGoingInstanceRevocable(null);
      }
    };
    loadMyGoing();
  }, [event, goingSchemaUid, isValidSchemaUid, wallet?.address]);

  const handleToggleLike = async () => {
    if (!event) return;
    if (!likeSchemaUid) {
      toast({ title: 'Likes unavailable', description: 'Like schema not configured', variant: 'default' });
      return;
    }
    if (!wallet) {
      toast({ title: 'Connect wallet', variant: 'destructive' });
      return;
    }
    try {
      setIsLikeLoading(true);
      // Unlike (revoke)
      if (userLikeUid) {
        if (state.like.flags && !state.like.flags.canRevoke) {
          toast({
            title: 'Action unavailable',
            description: getDisableMessage('like', state.like.flags.reason) || "Removing your like isn't available for this event.",
            variant: 'destructive'
          });
          return;
        }
        if (!isValidAttestationUid(userLikeUid)) {
          throw new Error('Invalid attestation UID for like. Please refresh and try again.');
        }
        const res = await revokeEventAttestation(likeSchemaUid, userLikeUid, event?.chain_id);
        if (res.success) {
          setUserLikeUid(null);
          setLikeCount((c) => Math.max(0, c - 1));
          toast({ title: 'Like removed' });
        } else {
          throw new Error(res.error || 'Failed to unlike');
        }
        return;
      }
      // Like via gasless flow
      const dataEncoded = encodeEventLikeData(event.id, event.lock_address, event.title, 1, wallet.address);
      const sa = await signTeeRexAttestation({
        schemaUid: likeSchemaUid,
        recipient: wallet.address,
        data: dataEncoded,
        chainId: event.chain_id,
        deadlineSecondsFromNow: 3600,
        revocable: true,
      });
      //
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('attest-by-delegation', {
        eventId: event.id,
        chainId: event.chain_id,
        schemaUid: likeSchemaUid,
        recipient: wallet.address,
        data: dataEncoded,
        deadline: Number(sa.deadline),
        signature: sa.signature,
        revocable: true,
        lockAddress: event.lock_address,
        contractAddress: getBatchAttestationAddress(event.chain_id || 84532),
      }, { privyToken: token });
      setUserLikeUid(data.uid || null);
      setLikeCount((c) => c + 1);
      toast({ title: 'Liked' });
    } catch (e: any) {
      toast({ title: 'Like failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLikeLoading(false);
    }
  };

  // Load user ticket data when authenticated
  const { data: ticketBalance = 0, refetch: refetchTicketBalance } = useTicketBalance({
    lockAddress: event?.lock_address || '',
    userAddresses,
    chainId: event?.chain_id || 0,
  });
  const { data: rewardPools = [] } = useRewardPools(event?.lock_address, event?.chain_id);
  const eventRewardPoolBadge = getEventRewardPoolBadgeMeta(rewardPools);

  useEffect(() => {
    setUserTicketCount(ticketBalance);
  }, [ticketBalance]);

  const handlePurchaseSuccess = useCallback((opts?: { increment?: boolean }) => {
    if (opts?.increment === false) {
      setUserTicketCount((prev) => Math.max(prev, 1));
    } else {
      setUserTicketCount((prev) => prev + 1);
    }
    void refetchTicketBalance();
    // Trigger refresh for all gated children (discussions, attestations, attendees)
    triggerRefresh();
  }, [refetchTicketBalance, triggerRefresh]);

  // Compute if event has ended
  useEffect(() => {
    if (!event?.date || !event?.time) {
      setEventHasEnded(false);
      return;
    }
    if (event.ends_at) {
      setEventHasEnded(Date.now() > new Date(event.ends_at).getTime());
      return;
    }
    const timeParts = event.time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    const baseDate = new Date(event.date);
    const start = new Date(baseDate);
    if (timeParts) {
      const hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3]?.toUpperCase();
      let hour24 = hours;
      if (period === "PM" && hours !== 12) hour24 += 12;
      else if (period === "AM" && hours === 12) hour24 = 0;
      start.setHours(hour24, minutes, 0, 0);
    }
    const ended = Date.now() > start.getTime() + 2 * 60 * 60 * 1000;
    setEventHasEnded(ended);
  }, [event?.date, event?.time, event?.ends_at]);

  // Load my attendance UID for top ticket card toggle
  useEffect(() => {
    const loadMyAttendance = async () => {
      try {
        if (!event?.id || !attendanceSchemaUid || !wallet?.address) {
          setMyAttendanceUidTop(null);
          return;
        }
        const { data: myAttendance } = await supabase
          .from('attestations')
          .select('attestation_uid, created_at')
          .eq('event_id', event.id)
          .eq('schema_uid', attendanceSchemaUid)
          .eq('recipient', wallet.address)
          .eq('is_revoked', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const uid: string | null = myAttendance?.attestation_uid || null;
        setMyAttendanceUidTop(isValidAttestationUid(uid) ? uid : null);
      } catch (e) {
        console.warn('Failed to load my attendance UID (top):', e);
        setMyAttendanceUidTop(null);
      }
    };
    loadMyAttendance();
  }, [event?.id, attendanceSchemaUid, wallet?.address]);

  const handleAttestAttendanceTop = async () => {
    if (!event || !attendanceSchemaUid || !wallet?.address) return;
    try {
      setIsTopAttendanceBusy(true);
      const encoded = encodeEventAttendanceData(
        event.id,
        event.lock_address,
        event.title,
        Math.floor(Date.now() / 1000),
        'Event Location',
        'TeeRex'
      );
      const sa = await signTeeRexAttestation({
        schemaUid: attendanceSchemaUid,
        recipient: wallet.address,
        data: encoded,
        chainId: event.chain_id,
        deadlineSecondsFromNow: 3600,
        revocable: false,
      });
      //
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<any>('attest-by-delegation', {
        eventId: event.id,
        chainId: event.chain_id,
        schemaUid: attendanceSchemaUid,
        recipient: wallet.address,
        data: encoded,
        deadline: Number(sa.deadline),
        signature: sa.signature,
        lockAddress: event.lock_address,
        contractAddress: getBatchAttestationAddress(event.chain_id || 84532),
      }, { privyToken: token });
      setMyAttendanceUidTop(data.uid || null);
      toast({ title: '🎉 Attendance Verified!' });
    } catch (e: any) {
      toast({ title: 'Attestation failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsTopAttendanceBusy(false);
    }
  };

  const handleRevokeAttendanceTop = async () => {
    if (!attendanceSchemaUid || !myAttendanceUidTop || !isValidAttestationUid(myAttendanceUidTop)) return;
    if (attendanceSchemaRevocable === false) {
      toast({ title: 'Not revocable', description: 'This schema does not allow revocation.', variant: 'destructive' });
      return;
    }
    try {
      setIsTopAttendanceBusy(true);
      const res = await revokeEventAttestation(attendanceSchemaUid, myAttendanceUidTop, event?.chain_id);
      if (!res.success) throw new Error(res.error || 'Failed to revoke');
      setMyAttendanceUidTop(null);
      toast({ title: 'Attendance revoked' });
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsTopAttendanceBusy(false);
    }
  };

  // Load attendance schema UID
  useEffect(() => {
    const loadAttendanceSchema = async () => {
      if (!event) return;

      try {
        // First check if event has an attendance schema UID set and valid
        if (event.attendance_schema_uid && isValidSchemaUid(event.attendance_schema_uid)) {
          setAttendanceSchemaUid(event.attendance_schema_uid);
          try {
            const { data: schema } = await supabase
              .from('attestation_schemas')
              .select('revocable, name, schema_definition')
              .eq('schema_uid', event.attendance_schema_uid)
              .maybeSingle();
            setAttendanceSchemaRevocable(schema ? Boolean(schema.revocable) : null);
          } catch (_) {
            setAttendanceSchemaRevocable(null);
          }
          return;
        }

        setAttendanceSchemaUid(null);
        setAttendanceSchemaRevocable(null);
      } catch (error) {
        console.error("Error loading attendance schema:", error);
      }
    };

    loadAttendanceSchema();
  }, [event, isValidSchemaUid]);

  const handleShare = (platform?: string) => {
    // Use lock_address for Web3-native shareable URLs
    const url = event?.lock_address
      ? `${window.location.origin}/event/${event.lock_address}`
      : window.location.href;
    const title = event?.title || "";
    const description = event?.description || "";

    switch (platform) {
      case "facebook":
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            url
          )}`,
          "_blank"
        );
        break;
      case "twitter":
        window.open(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(
            url
          )}&text=${encodeURIComponent(title)}`,
          "_blank"
        );
        break;
      case "linkedin":
        window.open(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
            url
          )}`,
          "_blank"
        );
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          description: "Event link copied to clipboard",
        });
        break;
      default:
        if (navigator.share) {
          navigator.share({
            title,
            text: description,
            url,
          });
        } else {
          navigator.clipboard.writeText(url);
          toast({
            title: "Link copied",
            description: "Event link copied to clipboard",
          });
        }
    }
  };

  const handleAddToCalendar = () => {
    if (!event || !event.date || !event.time) return;

    // Parse the event time (supports formats like "7:00 PM" or "19:00")
    const parseEventTime = (timeString: string, eventDate: Date) => {
      const timeParts = timeString
        .trim()
        .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!timeParts) {
        console.warn("Could not parse time format:", timeString);
        return eventDate;
      }

      const hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3]?.toUpperCase();

      let hour24 = hours;
      if (period === "PM" && hours !== 12) {
        hour24 += 12;
      } else if (period === "AM" && hours === 12) {
        hour24 = 0;
      }

      const startDate = new Date(eventDate);
      startDate.setHours(hour24, minutes, 0, 0);
      return startDate;
    };

    const startDate = parseEventTime(event.time, new Date(event.date));

    let endDate: Date;
    if (event.ends_at) {
      endDate = new Date(event.ends_at);
    } else if (event.end_date) {
      // Multi-day: end at the same time on the end date
      endDate = parseEventTime(event.time, new Date(event.end_date));
    } else {
      // Single day: default to 2 hours duration
      endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
    }

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const calendarData = {
      title: event.title,
      start: formatDate(startDate),
      end: formatDate(endDate),
      description: event.description,
      location: event.location,
    };

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      calendarData.title
    )}&dates=${calendarData.start}/${calendarData.end
      }&details=${encodeURIComponent(
        calendarData.description
      )}&location=${encodeURIComponent(calendarData.location)}`;

    window.open(googleCalendarUrl, "_blank");
  };

  const handleGetTicket = () => {
    if (!event) return;

    // Check if user is authenticated
    if (!authenticated) {
      login(); // Trigger wallet connection
      return;
    }

    if (isProtectedPurchaseClosed) {
      const protectedPurchaseStateLabel = getRefundProtectionPurchaseStateLabel(refundableStatus.status || event.refund_status);
      const protectedPurchaseStateDescription =
        protectedPurchaseStateLabel === 'Threshold Missed'
          ? 'This protected event missed its attendance threshold and is waiting for cancellation or refunds.'
          : protectedPurchaseStateLabel === 'Cancelled'
            ? 'This event has been cancelled and refunds are being processed.'
            : protectedPurchaseStateLabel === 'Event Successful'
              ? 'This protected event met its attendance threshold and ticket sales are closed.'
              : protectedPurchaseStateLabel === 'Protection Released'
                ? 'This protected event has resolved and lock control has been released to the creator.'
              : 'This protected event is still resolving.';

      toast({
        title: 'Ticket sales paused',
        description: protectedPurchaseStateDescription,
        variant: 'destructive',
      });
      return;
    }

    const hasCrypto = hasMethod(event, "crypto") || hasMethod(event, "free");
    const hasPaystack =
      hasMethod(event, "fiat") &&
      event.paystack_public_key &&
      event.ngn_price;

    // If both payment methods available, show selection dialog
    if (hasCrypto && hasPaystack) {
      setActiveModal("payment-method");
    } else if (hasPaystack) {
      // Only Paystack available
      setActiveModal("paystack-payment");
    } else {
      // Only crypto available (default)
      setActiveModal("crypto-purchase");
    }
  };

  const handleSelectCrypto = () => {
    setActiveModal("crypto-purchase");
  };

  const handleSelectPaystack = () => {
    setActiveModal("paystack-payment");
  };

  const closeAllModals = () => {
    setActiveModal("none");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="h-64 bg-gray-200 rounded-lg mb-6"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <>
      <MetaTags
        title={`${event.title} - TeeRex Event`}
        description={event.description || `Join us for ${event.title} on TeeRex. ${event.location ? `Location: ${event.location}. ` : ''}${event.price ? `Price: ${event.price} ${event.currency}. ` : ''}Limited tickets available!`}
        image={event.image_url || undefined}
        url={window.location.href}
        type="event"
      />
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/explore")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to events
            </Button>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:items-start">
            {/* Main Content */}
            <div className="lg:col-start-1 lg:col-span-2 space-y-6">
              {/* Responsive Sub-grid for Event Header info */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

                {/* Left Column: Event Image + Host Card (Desktop) */}
                <div className="md:col-span-5 space-y-6">
                  {/* Event Image */}
                  {event.image_url && (
                    <div className="w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 shadow-sm border border-slate-100">
                      <img
                        src={`${event.image_url}${event.image_url.includes("?") ? "&" : "?"
                          }t=${event.updated_at?.getTime?.() ?? Date.now()}`}
                        alt={event.title}
                        onError={(e) => {
                          console.warn("EventDetails image failed to load:", {
                            eventId: event.id,
                            src: (e.currentTarget as HTMLImageElement).src,
                          });
                        }}
                        style={{
                          objectFit: 'cover',
                          objectPosition: `${event.image_crop_x || 50}% ${event.image_crop_y || 50}%`
                        }}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                      />
                    </div>
                  )}
                  {/* Desktop Host Card */}
                  <div className="hidden md:block border border-slate-100 rounded-2xl bg-white p-4 shadow-sm">
                    <EventHostCard event={event} layout="vertical" />
                  </div>
                </div>

                {/* Right Column: Title, Metadata, Description + Host Card (Mobile) */}
                <div className="md:col-span-7 space-y-6 flex flex-col">

                  {/* Category Badges, Likes and Share Buttons */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-800 border-none px-2.5 py-1 text-xs font-semibold rounded-full">
                        {event.category}
                      </Badge>
                      {isProtectedRefundEvent && (
                        refundBadges.map((badge) => (
                          <Badge key={badge.label} variant="outline" className={`text-xs font-medium rounded-full px-2.5 py-1 ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        ))
                      )}
                      {eventRewardPoolBadge && (
                        <Badge variant="outline" className={`text-xs font-medium rounded-full px-2.5 py-1 ${eventRewardPoolBadge.className}`}>
                          {eventRewardPoolBadge.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center space-x-1.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button variant="outline" size="sm" className="h-9 w-14 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 rounded-full transition-all duration-200" onClick={handleToggleLike} disabled={isLikeLoading || (!likeSchemaUid) || (Boolean(userLikeUid) && state.like.flags && !state.like.flags.canRevoke)}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <Heart className={`w-3.5 h-3.5 ${userLikeUid ? 'fill-red-500 text-red-500' : 'text-slate-500'}`} />
                                  <span className="text-xs font-semibold text-slate-600">{likeCount}</span>
                                </div>
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {((!likeSchemaUid) || (Boolean(userLikeUid) && state.like.flags && !state.like.flags.canRevoke)) && (
                            <TooltipContent>
                              {!likeSchemaUid
                                ? 'Likes unavailable: schema not configured or invalid.'
                                : (getDisableMessage('like', state.like.flags?.reason) || "Removing your like isn't available for this event.")}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-all duration-200"
                        onClick={handleAddToCalendar}
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-all duration-200">
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl border border-slate-100 shadow-lg">
                          <DropdownMenuItem onClick={() => handleShare("facebook")} className="rounded-lg">
                            <Facebook className="w-4 h-4 mr-2 text-slate-500" />
                            Facebook
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShare("twitter")} className="rounded-lg">
                            <Twitter className="w-4 h-4 mr-2 text-slate-500" />
                            Twitter
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShare("linkedin")} className="rounded-lg">
                            <Linkedin className="w-4 h-4 mr-2 text-slate-500" />
                            LinkedIn
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShare("copy")} className="rounded-lg">
                            <Copy className="w-4 h-4 mr-2 text-slate-500" />
                            Copy Link
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Title and Network Badges */}
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3 leading-tight">
                      {event.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      {networkLabel && (
                        <Badge variant="outline" className="text-xs bg-blue-50/80 text-blue-700 border-blue-100 font-semibold rounded-full px-2.5 py-0.5">{networkLabel}</Badge>
                      )}
                      {isTransferableOnChain !== null && (
                        isTransferableOnChain ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-100 font-semibold rounded-full px-2.5 py-0.5">
                            {transferFeeBps && transferFeeBps > 0
                              ? `Transferable (fee ${transferFeeBps / 100}% )`
                              : 'Transferable'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-100 font-semibold rounded-full px-2.5 py-0.5">
                            Soul-bound (non-transferable)
                          </Badge>
                        )
                      )}
                    </div>
                  </div>

                  {/* Metadata Grid Container */}
                  <div className="bg-slate-50/50 border border-slate-100/85 rounded-2xl p-5 md:p-6 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      {/* Date and Time block */}
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/50 shadow-sm shrink-0">
                          <Calendar className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 leading-none mb-1">Date & Time</div>
                          <div className="text-xs text-slate-500 leading-relaxed">
                            {compactEventDateLabel && (
                              <div className="truncate whitespace-nowrap font-medium text-slate-700" title={fullEventDateLabel}>
                                {compactEventDateLabel}
                              </div>
                            )}
                            <div className="mt-0.5 truncate whitespace-nowrap text-slate-500" title={eventDisplayTime}>
                              {eventDisplayTime}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Location block */}
                      {event.location && (
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200/50 shadow-sm shrink-0">
                            {event.event_type === 'virtual' ? (
                              <Globe className="w-4 h-4 text-slate-600" />
                            ) : (
                              <MapPin className="w-4 h-4 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 leading-none mb-1">Location</div>
                            {event.event_type === 'virtual' ? (
                              <a
                                href={event.location}
                                target="_blank"
                                  rel="noopener noreferrer"
                                className="inline-flex max-w-full items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors font-medium hover:underline"
                              >
                                <span className="truncate">Virtual Event Link</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <div className="text-xs text-slate-600 leading-relaxed break-words font-medium">
                                {event.location}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Capacity block */}
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/50 shadow-sm shrink-0">
                          <Users className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 leading-none mb-1">Capacity</div>
                          <div className="whitespace-nowrap text-xs text-slate-600 font-medium">
                            {event.capacity} attendees max
                          </div>
                        </div>
                      </div>

                      {/* Contract block */}
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200/50 shadow-sm shrink-0">
                          <Globe className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 leading-none mb-1">Contract</div>
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 transition-colors font-mono font-medium"
                          >
                            <span>
                              {event.lock_address.slice(0, 6)}...{event.lock_address.slice(-4)}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        </div>
                      </div>

                    </div>

                    {/* Going Strip */}
                    <div className="pt-4 border-t border-slate-200/60">
                      <EventGoingStrip eventId={event.id} ticketsSold={keysSold} />
                    </div>

                    {/* Map display for physical events */}
                    {event.location && event.event_type !== 'virtual' && (
                      <div className="pt-2">
                        <EventLocationMap location={event.location} />
                      </div>
                    )}

                  </div>

                  {/* Mobile Host Card (inline, only shown on mobile) */}
                  <div className="block md:hidden border border-slate-100 rounded-2xl bg-white p-4 shadow-sm">
                    <EventHostCard event={event} layout="horizontal" />
                  </div>

                  {/* Mobile CTA (only shown on mobile) */}
                  {showMobileHeaderTicketCta && (
                    <div className="space-y-2 lg:hidden">
                      <Button
                        className="w-full"
                        onClick={handleGetTicket}
                        disabled={primaryTicketCtaDisabled}
                      >
                        {primaryTicketCtaLabel}
                      </Button>
                      {showWaitlistButton && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setActiveModal("waitlist")}
                        >
                          Join Waitlist
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  <div className="pt-6 border-t border-slate-100 mt-2">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">
                      About this event
                    </h2>
                    <RichTextDisplay content={event.description} />
                  </div>

                </div>
              </div>

              <EventRewardPools
                event={event}
                creationGate={rewardPoolCreationGate}
                protectedActionBusy={refundActions.isReleasing || refundActions.isRefunding}
                onReleaseProtectedEvent={refundActions.releaseEvent}
                onRefundProtectedEvent={() => refundActions.cancelAndRefundThenMaybeRelease(50)}
              />

              <EventStandings event={event} />

              {showAttestationSections && (
                <>
                  {/* Attendees List */}
                  <AttendeesList
                    eventId={event.id}
                    eventTitle={event.title}
                    attendanceSchemaUid={attestationSectionSchemaUid}
                    refreshToken={refreshToken}
                  />

                  {/* Enhanced Attestation Card */}
                  <EventAttestationCard
                    eventId={event.id}
                    eventTitle={event.title}
                    eventDate={(event.date ? event.date : new Date()).toISOString()}
                    eventTime={event.time}
                    startsAt={event.starts_at}
                    endsAt={event.ends_at}
                    lockAddress={event.lock_address}
                    userHasTicket={authenticated && userTicketCount > 0}
                    attendanceSchemaUid={attestationSectionSchemaUid}
                    chainId={event.chain_id}
                    canRevokeAttendanceOverride={myAttendanceUidTop ? !((attendanceSchemaRevocable === false)) : undefined}
                    attendanceDisableReason={myAttendanceUidTop && attendanceSchemaRevocable === false ? 'Attendance records for this event are permanent.' : undefined}
                    canRevokeGoingOverride={myGoingUid ? !((goingSchemaRevocable === false || goingInstanceRevocable === false)) : undefined}
                    goingDisableReason={myGoingUid && (goingSchemaRevocable === false || goingInstanceRevocable === false) ? "This going status cannot be revoked." : undefined}
                    refreshToken={refreshToken}
                  />
                </>
              )}

            </div>

            {/* Sidebar: sticky action column (tickets and discussions) */}
            <div className="lg:col-start-3 lg:self-start lg:sticky lg:top-24 space-y-6">
              {/* Ticket Card */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      {authenticated && userTicketCount > 0
                        ? "Your Tickets"
                        : "Get tickets"}
                    </h3>
                    <Ticket className="w-5 h-5 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* User Ticket Status */}
                  {authenticated && userTicketCount > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                      <div className="flex flex-col gap-2">
                        {maxTicketsPerUser > 1 && (
                          <Badge
                            variant="secondary"
                            className="text-green-700 bg-green-100 border-green-200/50 text-[10px] w-fit"
                          >
                            {userTicketCount}/{maxTicketsPerUser} max
                          </Badge>
                        )}
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                          <span className="text-sm font-semibold text-green-800 leading-none">
                            You own {userTicketCount} ticket
                            {userTicketCount > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {!isSoldOut && (
                      <Badge
                        variant="secondary"
                        className="bg-green-50 text-green-700 border-green-200/50 text-[10px] uppercase tracking-wider font-bold w-fit"
                      >
                        {spotsLeft} spots left
                      </Badge>
                    )}
                    <div className="text-3xl font-bold text-gray-900 tracking-tight">
                      {event.payment_methods?.includes('fiat') && event.ngn_price > 0
                        ? `₦${event.ngn_price.toLocaleString()}`
                        : isFreeEvent(event)
                          ? 'Free'
                          : `${event.price} ${event.currency}`}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Capacity</span>
                      <span>{event.capacity} people</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Registered</span>
                      <span>{keysSold} people</span>
                    </div>
                    {maxTicketsPerUser > 1 && (
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span>Max per person</span>
                        <span>{maxTicketsPerUser} tickets</span>
                      </div>
                    )}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min((keysSold / event.capacity) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {isProtectedRefundEvent && (
                    <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 space-y-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {refundBadges.map((badge) => (
                            <Badge key={badge.label} variant="outline" className={`text-[10px] uppercase tracking-wider font-bold w-fit ${badge.className}`}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-purple-600" />
                          <div className="text-sm font-bold text-purple-950">Protected Event</div>
                        </div>
                      </div>

                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center text-purple-900">
                          <span className="text-purple-700/70 font-medium">Progress to Release</span>
                          <span className="font-mono font-bold">
                            {refundableStatus.attendeeCount || keysSold}/{refundableStatus.minAttendees || event.refund_min_attendees || 0}
                          </span>
                        </div>

                        <div className="w-full bg-purple-200/50 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${Math.min(
                                ((refundableStatus.attendeeCount || keysSold) / Math.max(refundableStatus.minAttendees || event.refund_min_attendees || 1, 1)) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 pt-2">
                          {event.refund_trigger_at && (
                            <div className="flex flex-col gap-0.5 border-l-2 border-purple-200 pl-3">
                              <span className="text-[11px] uppercase tracking-tight text-purple-500 font-bold">{refundTriggerLabel}</span>
                              <span className="text-purple-900 font-medium leading-tight">
                                {refundWindowCountdown}
                              </span>
                              <span className="text-xs text-purple-500/80 leading-tight">
                                {new Date(event.refund_trigger_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span className="text-purple-300 mx-1">at</span>
                                {new Date(event.refund_trigger_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          {(event.refund_event_end_at || event.ends_at) && (
                            <div className="flex flex-col gap-0.5 border-l-2 border-purple-200 pl-3">
                              <span className="text-[11px] uppercase tracking-tight text-purple-500 font-bold">{refundWindowEndLabel}</span>
                              <span className="text-purple-900 font-medium leading-tight">
                                {refundWindowClosesCountdown}
                              </span>
                              <span className="text-xs text-purple-500/80 leading-tight">
                                {new Date(event.refund_event_end_at || event.ends_at!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span className="text-purple-300 mx-1">at</span>
                                {new Date(event.refund_event_end_at || event.ends_at!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {(refundableStatus.status === 'refund_available' || refundableStatus.status === 'refund_in_progress' || refundableStatus.status === 'creator_only_refund_window') && (
                        <Button
                          variant="destructive"
                          className="w-full shadow-sm"
                          onClick={() => refundActions.cancelAndRefundThenMaybeRelease(50)}
                          disabled={
                            refundActions.isRefunding ||
                            refundActions.isReleasing ||
                            !refundableStatus.authorizedRefundCaller ||
                            !signerMatchesAuthorizedRefundCaller
                          }
                        >
                          {refundActions.isRefunding ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <AlertCircle className="w-4 h-4 mr-2" />
                          )}
                          {refundableStatus.status === 'refund_in_progress'
                            ? 'Continue refunds'
                            : 'Cancel and refund'}
                        </Button>
                      )}

                      {canReleaseProtected && (
                        <Button
                          className="w-full bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                          onClick={() => refundActions.releaseEvent()}
                          disabled={refundActions.isReleasing || refundActions.isRefunding}
                        >
                          {refundActions.isReleasing ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4 mr-2" />
                          )}
                          {refundActions.isReleasing ? 'Collecting…' : 'Collect ticket funds'}
                        </Button>
                      )}

                      {isProtectedRefundEvent && refundableStatus.managerReleased && (
                        <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
                          <CheckCircle2 className="w-4 h-4 text-purple-600" />
                          Ticket funds collected
                        </div>
                      )}
                    </div>
                  )}

                  {authenticated && userTicketCount > 0 ? (
                    <div className="space-y-2">
                      {/* Attendance toggle for ticket holders — only when an attendance schema is configured */}
                      {attendanceSchemaUid && isValidSchemaUid(attendanceSchemaUid) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              {myAttendanceUidTop ? (
                                <Button
                                  variant="outline"
                                  className="w-full"
                                  disabled={isTopAttendanceBusy || !attendanceSchemaUid || !isValidSchemaUid(attendanceSchemaUid) || (state.attendance.flags && !state.attendance.flags.canRevoke) || !isValidAttestationUid(myAttendanceUidTop)}
                                  onClick={handleRevokeAttendanceTop}
                                >
                                  {isTopAttendanceBusy ? 'Processing...' : 'Revoke Attendance'}
                                </Button>
                              ) : (
                                <Button
                                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                                  disabled={isTopAttendanceBusy || !eventHasEnded || !attendanceSchemaUid || !isValidSchemaUid(attendanceSchemaUid)}
                                  onClick={handleAttestAttendanceTop}
                                >
                                  {isTopAttendanceBusy ? 'Processing...' : (eventHasEnded ? 'I Attended This Event' : 'Available after event ends')}
                                </Button>
                              )}
                            </span>
                          </TooltipTrigger>
                          {(!attendanceSchemaUid || !isValidSchemaUid(attendanceSchemaUid) || (state.attendance.flags && !state.attendance.flags.canRevoke)) && (
                            <TooltipContent>
                              {state.attendance.flags && !state.attendance.flags.canRevoke
                                ? (getDisableMessage('attendance', state.attendance.flags.reason) || 'Attendance records for this event are permanent.')
                                : 'Attendance unavailable: schema not configured or invalid.'}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      )}

                      {/* Additional ticket purchase if allowed */}
                      {userTicketCount < maxTicketsPerUser && !isSoldOut && !isRegistrationClosed && !isProtectedPurchaseClosed && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={handleGetTicket}
                        >
                          Get Additional Ticket
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <Button
                        className="w-full"
                        onClick={handleGetTicket}
                        disabled={primaryTicketCtaDisabled}
                      >
                        {primaryTicketCtaLabel}
                      </Button>
                      {/* Waitlist button when event is sold out */}
                      {showWaitlistButton && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setActiveModal("waitlist")}
                        >
                          Join Waitlist
                        </Button>
                      )}
                    </>
                  )}

                  {/* Fiat→crypto onramp: shown only when an active Ticket Pass is linked to this event. */}
                  <EventPassOnramp event={event} />
                  {event.creator_id && user?.id !== event.creator_id && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleOrganizerSubscription}
                      disabled={
                        telegramNotifications.subscribeOrganizer.isPending ||
                        telegramNotifications.unsubscribeOrganizer.isPending
                      }
                    >
                      {(telegramNotifications.subscribeOrganizer.isPending ||
                        telegramNotifications.unsubscribeOrganizer.isPending) ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="mr-2 h-4 w-4" />
                      )}
                      {telegramNotifications.status?.subscribed ? 'Unsubscribe from organizer alerts' : 'Subscribe for organizer alerts'}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Event Interactions Card */}
              <EventInteractionsCard
                eventId={event.id}
                lockAddress={event.lock_address}
                creatorAddress={event.creator_address || ''}
                creatorId={event.creator_id}
                chainId={event.chain_id}
                refreshToken={refreshToken}
              />
            </div>

          </div>

          {/* More from this host — placed after the grid so it appears below the ticket sidebar on mobile */}
          <MoreFromHost eventId={event.id} />
        </div>

        {/* Payment Method Selection Dialog */}
        <PaymentMethodDialog
          event={event}
          isOpen={activeModal === "payment-method"}
          onClose={closeAllModals}
          onSelectCrypto={handleSelectCrypto}
          onSelectPaystack={handleSelectPaystack}
          vendorHasPayoutAccount={vendorHasPayoutAccount}
        />

        {/* Crypto Purchase Dialog */}
        <EventPurchaseDialog
          event={event}
          isOpen={activeModal === "crypto-purchase"}
          onClose={closeAllModals}
          onPurchaseSuccess={handlePurchaseSuccess}
        />

        {/* Paystack Payment Dialog */}
        <PaystackPaymentDialog
          event={event}
          isOpen={activeModal === "paystack-payment"}
          onClose={closeAllModals}
          onSuccess={(paymentData) => {
            setPaymentData(paymentData);
            setActiveModal("ticket-processing");
          }}
        />

        {/* Ticket Processing Dialog */}
        <TicketProcessingDialog
          event={event}
          isOpen={activeModal === "ticket-processing"}
          onClose={closeAllModals}
          paymentData={paymentData}
          onPurchaseSuccess={handlePurchaseSuccess}
        />

        {/* Waitlist Dialog */}
        <WaitlistDialog
          event={event}
          isOpen={activeModal === "waitlist"}
          onClose={closeAllModals}
        />
      </div>
    </>
  );
};

/** Wrapper component that provides the refresh context */
const EventDetails = () => {
  return (
    <EventDetailsRefreshProvider>
      <EventDetailsContent />
    </EventDetailsRefreshProvider>
  );
};

export default EventDetails;

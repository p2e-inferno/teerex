import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  MapPin,
  Globe,
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
} from "lucide-react";
import { getPublishedEventById, PublishedEvent } from "@/utils/eventUtils";
import MetaTags from "@/components/MetaTags";
import {
  getTotalKeys,
  getUserKeyBalance,
  getMaxKeysPerAddress,
  checkKeyOwnership,
  getTransferabilityStatus,
} from "@/utils/lockUtils";
import { EventPurchaseDialog } from "@/components/events/EventPurchaseDialog";
import { PaystackPaymentDialog } from "@/components/events/PaystackPaymentDialog";
import { TicketProcessingDialog } from "@/components/events/TicketProcessingDialog";
import { PaymentMethodDialog } from "@/components/events/PaymentMethodDialog";
import { WaitlistDialog } from "@/components/events/WaitlistDialog";
// import { AttestationButton } from "@/components/attestations/AttestationButton";
import { useAttestations } from "@/hooks/useAttestations";
import { useTeeRexDelegatedAttestation } from "@/hooks/useTeeRexDelegatedAttestation";
import { useAttestationEncoding } from "@/hooks/useAttestationEncoding";
import { supabase } from "@/integrations/supabase/client";
import { base, baseSepolia } from "wagmi/chains";
import { EventAttestationCard } from "@/components/attestations/EventAttestationCard";
import { AttendeesList } from "@/components/attestations/AttendeesList";
import { EventInteractionsCard } from "@/components/interactions/core/EventInteractionsCard";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useToast } from "@/hooks/use-toast";
import { getAttestationSchemas, isValidAttestationUid, isAttestationRevocableOnChain } from "@/utils/attestationUtils";
import { useEventAttestationState } from "@/hooks/useEventAttestationState";
import { getDisableMessage } from "@/utils/attestationMessages";
import { getBatchAttestationAddress } from "@/lib/config/contract-config";
import { format } from "date-fns";
import { formatEventDateRange } from "@/utils/dateUtils";
import { useEventTicketRealtime } from "@/hooks/useEventTicketRealtime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RichTextDisplay } from "@/components/ui/rich-text/RichTextDisplay";

const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { authenticated, getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { revokeEventAttestation } = useAttestations();
  const { signTeeRexAttestation } = useTeeRexDelegatedAttestation();
  const { encodeEventLikeData, encodeEventAttendanceData } = useAttestationEncoding();

  const [event, setEvent] = useState<PublishedEvent | null>(null);
  const [userTicketCount, setUserTicketCount] = useState<number>(0);
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferableOnChain, setIsTransferableOnChain] = useState<boolean | null>(null);
  const [transferFeeBps, setTransferFeeBps] = useState<number | null>(null);

  // Real-time ticket count subscription
  const { ticketsSold: keysSold, isLoading: isLoadingTickets } = useEventTicketRealtime({
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
  const [isLiked, setIsLiked] = useState(false);
  const [attendanceSchemaUid, setAttendanceSchemaUid] = useState<string | null>(
    null
  );
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
  const [likeSchemaRevocable, setLikeSchemaRevocable] = useState<boolean | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [userLikeUid, setUserLikeUid] = useState<string | null>(null);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [likeInstanceRevocable, setLikeInstanceRevocable] = useState<boolean | null>(null);
  // Attendance (for top ticket card toggle)
  const [myAttendanceUidTop, setMyAttendanceUidTop] = useState<string | null>(null);
  const [isTopAttendanceBusy, setIsTopAttendanceBusy] = useState(false);
  const [eventHasEnded, setEventHasEnded] = useState(false);
  const [attendanceSchemaRevocable, setAttendanceSchemaRevocable] = useState<boolean | null>(null);

  const networkLabel = event?.chain_id === base.id ? 'Base' : event?.chain_id === baseSepolia.id ? 'Base Sepolia' : '';
  const explorerUrl = event
    ? (event.chain_id === base.id
        ? `https://basescan.org/address/${event.lock_address}`
        : event.chain_id === baseSepolia.id
        ? `https://sepolia.basescan.org/address/${event.lock_address}`
        : `https://etherscan.io/address/${event.lock_address}`)
    : '#';

  const isValidSchemaUid = (uid?: string | null) => !!uid && uid.startsWith('0x') && uid.length === 66 && /^0x[0-9a-f]{64}$/i.test(uid);

  const refreshLikes = async (ev: PublishedEvent) => {
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
        setLikeSchemaRevocable(null);
        return;
      }
      setLikeSchemaUid(schema.schema_uid);
      setLikeSchemaRevocable(Boolean((schema as any).revocable));
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
          try {
            const r = await isAttestationRevocableOnChain(uid!, ev.chain_id);
            setLikeInstanceRevocable(r);
          } catch (_) {
            setLikeInstanceRevocable(null);
          }
        } else {
          setUserLikeUid(null);
          setLikeInstanceRevocable(null);
        }
      }
    } catch (e) {
      console.error('Error loading likes:', e);
    }
  };

  useEffect(() => {
    if (event) refreshLikes(event);
  }, [event?.id, wallet?.address]);

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
  }, []);

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
  }, [event?.id, wallet?.address, goingSchemaUid, event?.chain_id]);

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
          toast({ title: 'Action unavailable', description: getDisableMessage('like', state.like.flags.reason) || 'Removing your like isn’t available for this event.', variant: 'destructive' });
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
      const { data, error } = await supabase.functions.invoke('attest-by-delegation', {
        body: {
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
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Failed');
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
  useEffect(() => {
    const loadUserTicketData = async () => {
      if (!authenticated || !wallet?.address || !event?.lock_address) return;

      try {
        const userBalance = await getUserKeyBalance(
          event.lock_address,
          wallet.address,
          event.chain_id
        );
        setUserTicketCount(userBalance);
      } catch (error) {
        console.error("Error loading user ticket data:", error);
      }
    };

    loadUserTicketData();
  }, [authenticated, wallet?.address, event?.lock_address]);

  // Compute if event has ended (same 2h duration assumption)
  useEffect(() => {
    if (!event?.date || !event?.time) {
      setEventHasEnded(false);
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
  }, [event?.date, event?.time]);

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
      const { data, error } = await supabase.functions.invoke('attest-by-delegation', {
        body: {
          eventId: event.id,
          chainId: event.chain_id,
          schemaUid: attendanceSchemaUid,
          recipient: wallet.address,
          data: encoded,
          deadline: Number(sa.deadline),
          signature: sa.signature,
          lockAddress: event.lock_address,
          contractAddress: getBatchAttestationAddress(event.chain_id || 84532),
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Failed');
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

      console.log("Loading attendance schema for event:", event.id);
      console.log("Event attendance_schema_uid:", event.attendance_schema_uid);

      try {
        // First check if event has an attendance schema UID set and valid
        if (event.attendance_schema_uid && isValidSchemaUid(event.attendance_schema_uid)) {
          console.log(
            "Using event attendance schema UID:",
            event.attendance_schema_uid
          );
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

        // Otherwise, fetch attendance schemas from database
        console.log("Fetching attendance schemas from database...");
        const schemas = await getAttestationSchemas("attendance");
        console.log("Found attendance schemas:", schemas);

        // Filter out invalid schema UIDs (must be 66 characters and valid hex)
        const validSchemas = schemas.filter((schema) => {
          const isValid =
            schema.schema_uid.startsWith("0x") &&
            schema.schema_uid.length === 66 &&
            /^0x[0-9a-f]{64}$/i.test(schema.schema_uid);
          console.log(
            `Schema ${schema.name} (${schema.schema_uid}) is ${
              isValid ? "valid" : "invalid"
            }`
          );
          return isValid;
        });

        if (validSchemas.length > 0) {
          console.log("Using valid schema UID:", validSchemas[0].schema_uid);
          setAttendanceSchemaUid(validSchemas[0].schema_uid);
          setAttendanceSchemaRevocable(Boolean((validSchemas[0] as any).revocable));
        } else {
          console.log("No valid attendance schemas found");
          setAttendanceSchemaRevocable(null);
        }
      } catch (error) {
        console.error("Error loading attendance schema:", error);
      }
    };

    loadAttendanceSchema();
  }, [event]);

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
    if (event.end_date) {
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
    )}&dates=${calendarData.start}/${
      calendarData.end
    }&details=${encodeURIComponent(
      calendarData.description
    )}&location=${encodeURIComponent(calendarData.location)}`;

    window.open(googleCalendarUrl, "_blank");
  };

  const handleGetTicket = () => {
    console.log("=== HANDLE GET TICKET CALLED ===");
    if (!event) return;

    // Check if user is authenticated
    if (!authenticated) {
      login(); // Trigger wallet connection
      return;
    }

    console.log("Event data:", event);
    console.log("Payment methods:", event.payment_methods);
    console.log("Paystack key:", event.paystack_public_key);
    console.log("NGN price:", event.ngn_price);

    const hasCrypto =
      event.payment_methods?.includes("crypto") || event.currency !== "FREE";
    const hasPaystack =
      event.payment_methods?.includes("fiat") &&
      event.paystack_public_key &&
      event.ngn_price;

    console.log("Has crypto:", hasCrypto);
    console.log("Has paystack:", hasPaystack);

    // If both payment methods available, show selection dialog
    if (hasCrypto && hasPaystack) {
      console.log("Opening payment method dialog");
      setActiveModal("payment-method");
    } else if (hasPaystack) {
      // Only Paystack available
      console.log("Opening paystack dialog");
      setActiveModal("paystack-payment");
    } else {
      // Only crypto available (default)
      console.log("Opening crypto dialog");
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

  const spotsLeft = event ? event.capacity - keysSold : 0;
  const isSoldOut = spotsLeft <= 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-4xl">
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

  // Temporary detailed debug log for image diagnostics
  const __ts =
    (event as any)?.updated_at instanceof Date
      ? (event as any).updated_at.getTime()
      : Date.now();
  const __imageSrc = event.image_url
    ? `${event.image_url}${event.image_url.includes("?") ? "&" : "?"}t=${__ts}`
    : "";
  console.log("EventDetails debug event", {
    id: event.id,
    event,
    image_url: event.image_url,
    computedImageSrc: __imageSrc,
  });

  return (
    <>
      <MetaTags
        title={`${event.title} - TeeRex Event`}
        description={event.description || `Join us for ${event.title} on TeeRex. ${event.location ? `Location: ${event.location}. ` : ''}${event.price ? `Price: ${event.price} ${event.currency}. ` : ''}Limited tickets available!`}
        image={event.image_url}
        url={window.location.href}
        type="event"
      />
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-6 max-w-4xl py-4">
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

      <div className="container mx-auto px-6 max-w-4xl py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Image */}
            {event.image_url && (
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={`${event.image_url}${
                    event.image_url.includes("?") ? "&" : "?"
                  }t=${event.updated_at?.getTime?.() ?? Date.now()}`}
                  alt={event.title}
                  onLoad={(e) => {
                    console.log("EventDetails image loaded", {
                      eventId: event.id,
                      src: (e.currentTarget as HTMLImageElement).src,
                    });
                  }}
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
                  className="w-full h-full"
                />
              </div>
            )}

            {/* Event Info */}
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Badge variant="secondary" className="mb-3">
                    {event.category}
                  </Badge>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {event.title}
                  </h1>
                  {networkLabel && (
                    <Badge variant="outline" className="text-xs mb-2">{networkLabel}</Badge>
                  )}
                  <div className="flex items-center space-x-4 text-gray-600">
                    {event.date && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatEventDateRange({ startDate: event.date, endDate: event.end_date, formatStyle: 'long' })}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{event.time}</span>
                    </div>
                  </div>
                  {isTransferableOnChain !== null && (
                    <div className="mt-2">
                      {isTransferableOnChain ? (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-200">
                          {transferFeeBps && transferFeeBps > 0
                            ? `Transferable (fee ${transferFeeBps / 100}% )`
                            : 'Transferable'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-purple-700 border-purple-200">
                          Soul-bound (non-transferable)
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" onClick={handleToggleLike} disabled={isLikeLoading || (!likeSchemaUid) || (Boolean(userLikeUid) && state.like.flags && !state.like.flags.canRevoke)}>
                            <div className="flex items-center gap-1">
                              <Heart className={`w-4 h-4 ${userLikeUid ? 'fill-red-500 text-red-500' : ''}`} />
                              <span className="text-xs">{likeCount}</span>
                            </div>
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {((!likeSchemaUid) || (Boolean(userLikeUid) && state.like.flags && !state.like.flags.canRevoke)) && (
                        <TooltipContent>
                          {!likeSchemaUid
                            ? 'Likes unavailable: schema not configured or invalid.'
                            : (getDisableMessage('like', state.like.flags?.reason) || 'Removing your like isn’t available for this event.')}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddToCalendar}
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleShare("facebook")}>
                        <Facebook className="w-4 h-4 mr-2" />
                        Facebook
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare("twitter")}>
                        <Twitter className="w-4 h-4 mr-2" />
                        Twitter
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare("linkedin")}>
                        <Linkedin className="w-4 h-4 mr-2" />
                        LinkedIn
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare("copy")}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {event.location && (
                <div className="flex items-center space-x-1 text-gray-600 mb-6">
                  {event.event_type === 'virtual' ? (
                    <>
                      <Globe className="w-4 h-4" />
                      <a
                        href={event.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                      >
                        Virtual Event Link
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      <span>{event.location}</span>
                    </>
                  )}
                </div>
              )}

              <Separator className="my-6" />

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  About this event
                </h2>
                <RichTextDisplay content={event.description} />
              </div>
            </div>

            {/* Attendees List */}
            <AttendeesList
              eventId={event.id}
              eventTitle={event.title}
              attendanceSchemaUid={attendanceSchemaUid || undefined}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-800">
                          You own {userTicketCount} ticket
                          {userTicketCount > 1 ? "s" : ""}
                        </span>
                      </div>
                      {maxTicketsPerUser > 1 && (
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-200"
                        >
                          {userTicketCount}/{maxTicketsPerUser} max
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">
                    {event.payment_methods?.includes('fiat') && event.ngn_price > 0
                      ? `₦${event.ngn_price.toLocaleString()}`
                      : event.currency === 'FREE'
                      ? 'Free'
                      : `${event.price} ${event.currency}`}
                  </span>
                  {!isSoldOut && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-200"
                    >
                      {spotsLeft} spots left
                    </Badge>
                  )}
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
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        (keysSold / event.capacity) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>

                {authenticated && userTicketCount > 0 ? (
                  <div className="space-y-2">
                    {/* Attendance toggle for ticket holders */}
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

                    {/* Additional ticket purchase if allowed */}
                    {userTicketCount < maxTicketsPerUser && !isSoldOut && (
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
                      disabled={
                        isSoldOut ||
                        (event.date && new Date(event.date) < new Date()) ||
                        (authenticated && userTicketCount >= maxTicketsPerUser)
                      }
                    >
                      {isSoldOut
                        ? "Sold Out"
                        : event.date && new Date(event.date) < new Date()
                        ? "Event has ended"
                        : !authenticated
                        ? "Connect Wallet to Get Ticket"
                        : userTicketCount >= maxTicketsPerUser
                        ? "Ticket Limit Reached"
                        : "Get Ticket"}
                    </Button>
                    {/* Waitlist button when event is sold out */}
                    {isSoldOut && event.allow_waitlist && (
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

                <div className="text-xs text-gray-500 text-center">
                  Powered by blockchain technology
                </div>
              </CardContent>
            </Card>

            {/* Event Details Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <h3 className="font-semibold text-gray-900">Event details</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {event.date && (
                    <div className="flex items-start space-x-3">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">
                          {formatEventDateRange({ startDate: event.date, endDate: event.end_date, formatStyle: 'long' })}
                        </div>
                        <div className="text-sm text-gray-600">
                          {event.time}
                        </div>
                      </div>
                    </div>
                  )}

                  {event.location && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-gray-900">Location</div>
                        <div className="text-sm text-gray-600">
                          {event.location}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start space-x-3">
                    <Users className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-900">Capacity</div>
                      <div className="text-sm text-gray-600">
                        {event.capacity} attendees
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">
                    Blockchain Info
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Contract</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-blue-600"
                      asChild
                    >
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                        <span className="font-mono text-xs">
                          {event.lock_address.slice(0, 6)}...
                          {event.lock_address.slice(-4)}
                        </span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Event Interactions Card */}
            <EventInteractionsCard
              eventId={event.id}
              lockAddress={event.lock_address}
              creatorAddress={event.creator_id}
            />

            {/* Enhanced Attestation Card */}
            <EventAttestationCard
              eventId={event.id}
              eventTitle={event.title}
              eventDate={(event.date ? event.date : new Date()).toISOString()}
              eventTime={event.time}
              lockAddress={event.lock_address}
              userHasTicket={userTicketCount > 0}
              attendanceSchemaUid={attendanceSchemaUid || undefined}
              chainId={event.chain_id}
              canRevokeAttendanceOverride={myAttendanceUidTop ? !((attendanceSchemaRevocable === false)) : undefined}
              attendanceDisableReason={myAttendanceUidTop && attendanceSchemaRevocable === false ? 'Attendance records for this event are permanent.' : undefined}
              canRevokeGoingOverride={myGoingUid ? !((goingSchemaRevocable === false || goingInstanceRevocable === false)) : undefined}
              goingDisableReason={myGoingUid && (goingSchemaRevocable === false || goingInstanceRevocable === false) ? 'This going status can’t be revoked.' : undefined}
            />
          </div>
        </div>
      </div>

      {/* Payment Method Selection Dialog */}
      <PaymentMethodDialog
        event={event}
        isOpen={activeModal === "payment-method"}
        onClose={closeAllModals}
        onSelectCrypto={handleSelectCrypto}
        onSelectPaystack={handleSelectPaystack}
      />

      {/* Crypto Purchase Dialog */}
      <EventPurchaseDialog
        event={event}
        isOpen={activeModal === "crypto-purchase"}
        onClose={closeAllModals}
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

// Temporary debug function - can be called from browser console
(window as any).grantKeysManually = async () => {
  const supabase = (await import("@/integrations/supabase/client")).supabase;
  try {
    const { data, error } = await supabase.functions.invoke(
      "paystack-grant-keys",
      {
        body: {
          transactionReference:
            "TeeRex-d7928d4b-02f0-47b5-b9f0-dcff259b086a-1751938091432",
        },
      }
    );

    if (error) {
      console.error("Error:", error);
      return;
    }

    console.log("Success:", data);
  } catch (err) {
    console.error("Failed:", err);
  }
};

export default EventDetails;

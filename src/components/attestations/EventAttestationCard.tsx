import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAttestations } from '@/hooks/useAttestations';
import { supabase } from '@/integrations/supabase/client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTeeRexDelegatedAttestation } from '@/hooks/useTeeRexDelegatedAttestation';
import { useAttestationEncoding } from '@/hooks/useAttestationEncoding';
import { encodeAttestationData, isValidAttestationUid, isAttestationRevocableOnChain } from '@/utils/attestationUtils';
import { getBatchAttestationAddress } from '@/lib/config/contract-config';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CalendarCheck,
  Calendar,
  Users,
  Award,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { format, isAfter, isBefore, addHours, parseISO } from 'date-fns';

interface EventAttestationCardProps {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  lockAddress: string;
  userHasTicket: boolean;
  attendanceSchemaUid?: string;
  chainId?: number;
}

interface AttestationStats {
  goingCount: number;
  attendedCount: number;
  userGoingStatus: boolean;
  userAttendedStatus: boolean;
  totalChallenges: number;
  userReputation: number;
}

const isValidSchemaUid = (uid?: string | null) => !!uid && uid.startsWith('0x') && uid.length === 66 && /^0x[0-9a-f]{64}$/i.test(uid);

export const EventAttestationCard: React.FC<EventAttestationCardProps & {
  canRevokeGoingOverride?: boolean;
  goingDisableReason?: string;
  canRevokeAttendanceOverride?: boolean;
  attendanceDisableReason?: string;
}> = ({
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  lockAddress,
  userHasTicket,
  attendanceSchemaUid,
  chainId,
  canRevokeGoingOverride,
  goingDisableReason,
  canRevokeAttendanceOverride,
  attendanceDisableReason
}) => {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { createEventAttestation, revokeEventAttestation, isLoading } = useAttestations();
  const { signTeeRexAttestation } = useTeeRexDelegatedAttestation();
  const { encodeEventAttendanceData } = useAttestationEncoding();
  const { toast } = useToast();

  const [stats, setStats] = useState<AttestationStats>({
    goingCount: 0,
    attendedCount: 0,
    userGoingStatus: false,
    userAttendedStatus: false,
    totalChallenges: 0,
    userReputation: 100
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [myAttendanceUid, setMyAttendanceUid] = useState<string | null>(null);
  const [goingSchemaUid, setGoingSchemaUid] = useState<string | null>(null);
  const [goingSchemaDef, setGoingSchemaDef] = useState<string | null>(null);
  const [goingSchemaRevocable, setGoingSchemaRevocable] = useState<boolean | null>(null);
  const [myGoingUid, setMyGoingUid] = useState<string | null>(null);
  const [isGoingBusy, setIsGoingBusy] = useState(false);
  const [attendanceSchemaRevocable, setAttendanceSchemaRevocable] = useState<boolean | null>(null);
  const [goingInstanceRevocable, setGoingInstanceRevocable] = useState<boolean | null>(null);
  const [attendanceInstanceRevocable, setAttendanceInstanceRevocable] = useState<boolean | null>(null);

  // Calculate event timing - handle both ISO and regular date formats
  const eventDateTime = new Date(`${eventDate.split('T')[0]}T${eventTime}`);
  const now = new Date();
  const eventHasStarted = isAfter(now, eventDateTime);
  const eventHasEnded = isAfter(now, addHours(eventDateTime, 2)); // Assume 2-hour event duration
  const canDeclareGoing = !eventHasStarted && authenticated && userHasTicket;
  const canAttestAttendance = eventHasEnded && authenticated && userHasTicket;

  // Load Going schema by name from DB (validate UID)
  useEffect(() => {
    const loadGoingSchema = async () => {
      try {
        const { data: schema } = await supabase
          .from('attestation_schemas')
          .select('schema_uid, schema_definition, name, revocable')
          .eq('name', 'TeeRex EventGoing')
          .maybeSingle();

        if (schema?.schema_uid && isValidSchemaUid(schema.schema_uid)) {
          setGoingSchemaUid(schema.schema_uid);
          setGoingSchemaDef(schema.schema_definition || null);
          setGoingSchemaRevocable(Boolean(schema.revocable));
        } else {
          setGoingSchemaUid(null);
          setGoingSchemaDef(null);
          setGoingSchemaRevocable(null);
        }
      } catch (e) {
        console.warn('Failed to load going schema:', e);
        setGoingSchemaUid(null);
        setGoingSchemaDef(null);
      }
    };
    loadGoingSchema();
  }, []);

  // Track revocable flag for attendance schema (by UID)
  useEffect(() => {
    const loadAttendanceRevocable = async () => {
      try {
        if (!attendanceSchemaUid || !isValidSchemaUid(attendanceSchemaUid)) {
          return;
        }
        const { data: schema } = await supabase
          .from('attestation_schemas')
          .select('revocable')
          .eq('schema_uid', attendanceSchemaUid)
          .maybeSingle();
        if (schema) {
          setAttendanceSchemaRevocable(Boolean(schema.revocable));
        } else {
          setAttendanceSchemaRevocable(null);
        }
      } catch (_) {
        // ignore
      }
    };
    loadAttendanceRevocable();
  }, [attendanceSchemaUid]);

  // Load attestation statistics
  const loadStats = async () => {
    if (!eventId) return;
    
    setIsLoadingStats(true);
    try {
      // Fetch attendance attestations (for attended metrics)
      const { data: attendedData } = await supabase
        .from('attestations')
        .select('recipient')
        .eq('event_id', eventId)
        .eq('schema_uid', attendanceSchemaUid || '')
        .eq('is_revoked', false);

      // Check user's attestation status
      let userGoing = false;
      let userAttended = false;
      let userAttendanceUid: string | null = null;
      let userGoingAttUid: string | null = null;
      
      if (wallet?.address) {
        // Fetch latest attendance attestation (to enable revoke)
        const { data: myAttendance } = await supabase
          .from('attestations')
          .select('attestation_uid, created_at')
          .eq('event_id', eventId)
          .eq('schema_uid', attendanceSchemaUid || '')
          .eq('recipient', wallet.address)
          .eq('is_revoked', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        userAttended = Boolean(myAttendance?.attestation_uid) && isValidAttestationUid(myAttendance?.attestation_uid);
        // Fetch latest going attestation for user
        if (isValidSchemaUid(goingSchemaUid)) {
          const { data: myGoing } = await supabase
            .from('attestations')
            .select('attestation_uid, created_at')
            .eq('event_id', eventId)
            .eq('schema_uid', goingSchemaUid)
            .eq('recipient', wallet.address)
            .eq('is_revoked', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          userGoingAttUid = isValidAttestationUid(myGoing?.attestation_uid) ? (myGoing?.attestation_uid as string) : null;
        }
        userGoing = Boolean(userGoingAttUid) && !eventHasEnded;
        userAttendanceUid = isValidAttestationUid(myAttendance?.attestation_uid) ? (myAttendance?.attestation_uid as string) : null;
        setMyAttendanceUid(userAttendanceUid);
        setMyGoingUid(userGoingAttUid);

        // Check instance-level revocable flags on-chain
        try {
          if (userAttendanceUid) {
            const r = await isAttestationRevocableOnChain(userAttendanceUid, chainId || 84532);
            setAttendanceInstanceRevocable(r);
          } else {
            setAttendanceInstanceRevocable(null);
          }
        } catch (_) {
          // ignore
        }
        try {
          if (userGoingAttUid) {
            const r2 = await isAttestationRevocableOnChain(userGoingAttUid, chainId || 84532);
            setGoingInstanceRevocable(r2);
          } else {
            setGoingInstanceRevocable(null);
          }
        } catch (_) {
          // ignore
        }

        // Get user reputation
        const { data: reputationData, error: reputationError } = await supabase
          .from('user_reputation')
          .select('reputation_score, updated_at')
          .eq('user_address', wallet.address)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reputationError) {
          console.warn('Reputation fetch error:', reputationError.message);
        }
        setStats(prev => ({
          ...prev,
          userReputation: reputationData?.reputation_score ?? prev.userReputation,
        }));
      }

      // Get challenges count for this event
      const { data: eventAttestations } = await supabase
        .from('attestations')
        .select('id')
        .eq('event_id', eventId)
        .eq('schema_uid', attendanceSchemaUid || '')
        .eq('is_revoked', false);

      let challengesCount = 0;
      if (eventAttestations && eventAttestations.length > 0) {
        const attestationIds = eventAttestations.map(a => a.id);
        const { data: challengesData } = await supabase
          .from('attestation_challenges')
          .select('id')
          .in('attestation_id', attestationIds);
        challengesCount = challengesData?.length || 0;
      }

      // Going attestations list (for going metrics)
      let goingCount = 0;
      if (isValidSchemaUid(goingSchemaUid)) {
        const { data: goingData } = await supabase
          .from('attestations')
          .select('recipient')
          .eq('event_id', eventId)
          .eq('schema_uid', goingSchemaUid)
          .eq('is_revoked', false);
        goingCount = new Set((goingData || []).map((g: any) => g.recipient)).size;
      }

      const uniqueAttended = new Set((attendedData || []).map((a: any) => a.recipient)).size;
      const attendedCount = uniqueAttended;

      setStats({
        goingCount: eventHasEnded ? 0 : goingCount,
        attendedCount: eventHasEnded ? attendedCount : 0,
        userGoingStatus: userGoing,
        userAttendedStatus: userAttended,
        totalChallenges: challengesCount,
        userReputation: stats.userReputation
      });

    } catch (error) {
      console.error('Error loading attestation stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [eventId, wallet?.address, attendanceSchemaUid, goingSchemaUid, eventHasEnded]);

  const handleDeclareGoing = async () => {
    if (!wallet?.address || !isValidSchemaUid(goingSchemaUid) || !goingSchemaDef) return;
    try {
      setIsGoingBusy(true);
      // Encode against going schema definition from DB
      const encoded = encodeAttestationData(goingSchemaDef, {
        eventId,
        lockAddress,
        eventTitle,
        timestamp: Math.floor(Date.now() / 1000),
        location: 'Event Location',
        declarer: wallet.address,
        platform: 'TeeRex'
      });
      
      const sa = await signTeeRexAttestation({
        schemaUid: goingSchemaUid!,
        recipient: wallet.address,
        data: encoded,
        deadlineSecondsFromNow: 3600,
        chainId,
        revocable: true,
      });
      
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('attest-by-delegation', {
        body: {
          eventId,
          chainId,
          schemaUid: goingSchemaUid,
          recipient: wallet.address,
          data: encoded,
          deadline: Number(sa.deadline),
          signature: sa.signature,
          lockAddress,
          contractAddress: getBatchAttestationAddress(chainId || 84532),
          revocable: true,
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });
      
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Failed');
      setMyGoingUid(data.uid || null);
      setStats(prev => ({ ...prev, goingCount: prev.goingCount + 1, userGoingStatus: true }));
      toast({ title: '✅ Going Status Updated!', description: `You are going to ${eventTitle}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Unknown error occurred', variant: 'destructive' });
    } finally {
      setIsGoingBusy(false);
    }
  };

  const handleRevokeGoing = async () => {
    if (!isValidSchemaUid(goingSchemaUid) || !myGoingUid || !isValidAttestationUid(myGoingUid)) return;
    if (goingSchemaRevocable === false) {
      toast({ title: 'Action unavailable', description: 'This going status can’t be revoked.', variant: 'destructive' });
      return;
    }
    try {
      setIsGoingBusy(true);
      const res = await revokeEventAttestation(goingSchemaUid!, myGoingUid, chainId);
      if (!res.success) throw new Error(res.error || 'Failed to revoke going');
      setMyGoingUid(null);
      setStats(prev => ({ ...prev, goingCount: Math.max(0, prev.goingCount - 1), userGoingStatus: false }));
      toast({ title: 'Going revoked' });
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsGoingBusy(false);
    }
  };

  const handleAttestAttendance = async () => {
    if (!wallet?.address || !attendanceSchemaUid) return;
    if (!chainId) {
      toast({ title: 'Missing chain', description: 'Event chain unavailable', variant: 'destructive' });
      return;
    }

    try {
      // Encode data against attendance schema
      const dataEncoded = encodeEventAttendanceData(
        eventId,
        lockAddress,
        eventTitle,
        Math.floor(Date.now() / 1000),
        'Event Location',
        'TeeRex'
      );
      

      // Sign delegated attestation using TeeRex EIP712 domain
      const sa = await signTeeRexAttestation({
        schemaUid: attendanceSchemaUid,
        recipient: wallet.address,
        data: dataEncoded,
        chainId,
        deadlineSecondsFromNow: 3600,
        revocable: false,
      });
      

      // Call TeeRex proxy edge function to submit attestation
      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('attest-by-delegation', {
        body: {
          eventId,
          chainId,
          schemaUid: attendanceSchemaUid,
          recipient: wallet.address,
          data: dataEncoded,
          deadline: Number(sa.deadline),
          signature: sa.signature,
          lockAddress,
          contractAddress: getBatchAttestationAddress(chainId || 84532),
        },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });
      

      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Failed to attest');

      setMyAttendanceUid(data.uid || null);
      setStats(prev => ({
        ...prev,
        attendedCount: prev.attendedCount + 1,
        userAttendedStatus: true
      }));
      toast({
        title: '🎉 Attendance Verified!',
        description: `You've attested attendance at ${eventTitle}`,
      });

      // Update user reputation (optional non-blocking)
      try {
        await supabase.rpc('update_reputation_score', {
          user_addr: wallet.address,
          score_change: 5,
          attestation_type: 'attendance'
        });
      } catch (e) {
        console.warn('Reputation update failed (non-blocking):', e);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeAttendance = async () => {
    if (!attendanceSchemaUid || !myAttendanceUid || !isValidAttestationUid(myAttendanceUid)) return;
    if (attendanceSchemaRevocable === false) {
      toast({ title: 'Permanent record', description: 'Attendance records for this event are permanent.', variant: 'destructive' });
      return;
    }
    try {
      const res = await revokeEventAttestation(attendanceSchemaUid, myAttendanceUid, chainId);
      if (!res.success) throw new Error(res.error || 'Failed to revoke');
      setMyAttendanceUid(null);
      setStats(prev => ({
        ...prev,
        attendedCount: Math.max(0, prev.attendedCount - 1),
        userAttendedStatus: false,
      }));
      toast({ title: 'Attendance revoked' });
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  if (isLoadingStats) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-background to-muted/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Event Attestations</h3>
          </div>
          {authenticated && (
            <Badge variant="outline" className="text-xs">
              Reputation: {stats.userReputation}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Event Status */}
        <div className="flex items-center space-x-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {!eventHasStarted && "Event hasn't started yet"}
            {eventHasStarted && !eventHasEnded && "Event in progress"}
            {eventHasEnded && "Event has ended"}
          </span>
          {eventHasEnded && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
        </div>

        {/* Social Proof Stats */}
        {(() => {
          const showGoing = !eventHasEnded;
          const showAttended = eventHasEnded;
          const gridCols = showGoing && showAttended ? 'grid-cols-2' : 'grid-cols-1';
          return (
            <div className={`grid ${gridCols} gap-4`}>
              {showGoing && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/40">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="font-medium text-sm">{stats.goingCount}</div>
                    <div className="text-xs text-muted-foreground">Going</div>
                  </div>
                </div>
              )}
              {showAttended && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/40">
                  <CalendarCheck className="w-4 h-4 text-green-500" />
                  <div>
                    <div className="font-medium text-sm">{stats.attendedCount}</div>
                    <div className="text-xs text-muted-foreground">Attended</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* User Actions */}
        {authenticated && userHasTicket && (
          <>
            <Separator />
            <div className="space-y-3">
              {/* Going Declaration */}
              {canDeclareGoing && !stats.userGoingStatus && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          onClick={handleDeclareGoing}
                          disabled={isLoading || !isValidSchemaUid(goingSchemaUid)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          size="sm"
                        >
                          {isLoading || isGoingBusy ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Calendar className="w-4 h-4 mr-2" />
                          )}
                          I'm Going to This Event
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!isValidSchemaUid(goingSchemaUid) && (
                      <TooltipContent>
                        Going unavailable: schema not configured or invalid. Please contact support/admin.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}

              {stats.userGoingStatus && !eventHasStarted && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                    <CheckCircle className="w-4 h-4 mr-2 text-blue-600" />
                    <span className="text-sm text-blue-600 font-medium">You're going to this event!</span>
                  </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                            disabled={!isValidSchemaUid(goingSchemaUid) || !isValidAttestationUid(myGoingUid) || isGoingBusy || goingSchemaRevocable === false || goingInstanceRevocable === false || canRevokeGoingOverride === false}
                          onClick={handleRevokeGoing}
                        >
                        {isGoingBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                        Revoke Going
                      </Button>
                    </span>
                  </TooltipTrigger>
                      {(!isValidSchemaUid(goingSchemaUid) || !isValidAttestationUid(myGoingUid) || goingSchemaRevocable === false || goingInstanceRevocable === false || canRevokeGoingOverride === false) && (
                        <TooltipContent>
                          {!isValidSchemaUid(goingSchemaUid)
                            ? 'Going unavailable: schema not configured or invalid.'
                            : (goingSchemaRevocable === false || goingInstanceRevocable === false || canRevokeGoingOverride === false)
                              ? (goingDisableReason || 'This going status can’t be revoked.')
                              : 'Revoke unavailable: attestation UID not available yet. Please refresh.'}
                        </TooltipContent>
                      )}
                </Tooltip>
              </TooltipProvider>
                </div>
              )}

              {/* Attendance Attestation */}
              {canAttestAttendance && !stats.userAttendedStatus && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          onClick={handleAttestAttendance}
                          disabled={isLoading || !isValidSchemaUid(attendanceSchemaUid)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CalendarCheck className="w-4 h-4 mr-2" />
                          )}
                          I Attended This Event
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!isValidSchemaUid(attendanceSchemaUid) && (
                      <TooltipContent>
                        Attendance unavailable: schema not configured or invalid. Please contact support/admin.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}

              {stats.userAttendedStatus && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          onClick={handleRevokeAttendance}
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={!myAttendanceUid || !isValidAttestationUid(myAttendanceUid) || !isValidSchemaUid(attendanceSchemaUid) || attendanceSchemaRevocable === false || attendanceInstanceRevocable === false || canRevokeAttendanceOverride === false}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Award className="w-4 h-4 mr-2" />
                          )}
                          Revoke Attendance
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {(!isValidSchemaUid(attendanceSchemaUid) || !isValidAttestationUid(myAttendanceUid) || attendanceSchemaRevocable === false || attendanceInstanceRevocable === false || canRevokeAttendanceOverride === false) && (
                      <TooltipContent>
                        {!isValidSchemaUid(attendanceSchemaUid)
                          ? 'Attendance unavailable: schema not configured or invalid.'
                          : (attendanceSchemaRevocable === false || attendanceInstanceRevocable === false || canRevokeAttendanceOverride === false)
                            ? (attendanceDisableReason || 'Attendance records for this event are permanent.')
                            : 'Revoke unavailable: attestation UID not available yet. Please refresh.'}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </>
        )}

        {/* Challenge Information */}
        {stats.totalChallenges > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span className="text-sm text-orange-600">
                  {stats.totalChallenges} active challenge(s)
                </span>
              </div>
              <Button variant="outline" size="sm">
                View Challenges
              </Button>
            </div>
          </>
        )}

        {/* Not authenticated or no ticket message */}
        {(!authenticated || !userHasTicket) && (
          <>
            <Separator />
            <div className="text-center p-4 rounded-lg bg-muted/40">
              <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {!authenticated && "Connect your wallet to participate in attestations"}
                {authenticated && !userHasTicket && "Get a ticket to participate in attestations"}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

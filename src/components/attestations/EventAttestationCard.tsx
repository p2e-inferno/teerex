import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAttestations } from '@/hooks/useAttestations';
import { supabase } from '@/integrations/supabase/client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
}

interface AttestationStats {
  goingCount: number;
  attendedCount: number;
  userGoingStatus: boolean;
  userAttendedStatus: boolean;
  totalChallenges: number;
  userReputation: number;
}

const GOING_SCHEMA_UID = '0x7234567890abcdef1234567890abcdef12345678';
const ATTENDED_SCHEMA_UID = '0x8234567890abcdef1234567890abcdef12345678';

export const EventAttestationCard: React.FC<EventAttestationCardProps> = ({
  eventId,
  eventTitle,
  eventDate,
  eventTime,
  lockAddress,
  userHasTicket
}) => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { createEventAttestation, isLoading } = useAttestations();
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

  // Calculate event timing - handle both ISO and regular date formats
  const eventDateTime = new Date(`${eventDate.split('T')[0]}T${eventTime}`);
  const now = new Date();
  const eventHasStarted = isAfter(now, eventDateTime);
  const eventHasEnded = isAfter(now, addHours(eventDateTime, 2)); // Assume 2-hour event duration
  const canDeclareGoing = !eventHasStarted && authenticated && userHasTicket;
  const canAttestAttendance = eventHasEnded && authenticated && userHasTicket;

  // Load attestation statistics
  const loadStats = async () => {
    if (!eventId) return;
    
    setIsLoadingStats(true);
    try {
      // Get going attestations count
      const { data: goingData } = await supabase
        .from('attestations')
        .select('recipient')
        .eq('event_id', eventId)
        .eq('schema_uid', GOING_SCHEMA_UID)
        .eq('is_revoked', false);

      // Get attended attestations count
      const { data: attendedData } = await supabase
        .from('attestations')
        .select('recipient')
        .eq('event_id', eventId)
        .eq('schema_uid', ATTENDED_SCHEMA_UID)
        .eq('is_revoked', false);

      // Check user's attestation status
      let userGoing = false;
      let userAttended = false;
      
      if (wallet?.address) {
        const { count: goingCountHead, error: goingHeadError } = await supabase
          .from('attestations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('schema_uid', GOING_SCHEMA_UID)
          .eq('recipient', wallet.address)
          .eq('is_revoked', false);

        const { count: attendedCountHead, error: attendedHeadError } = await supabase
          .from('attestations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('schema_uid', ATTENDED_SCHEMA_UID)
          .eq('recipient', wallet.address)
          .eq('is_revoked', false);

        if (goingHeadError) {
          console.warn('HEAD count for going attestations failed:', goingHeadError.message);
        }
        if (attendedHeadError) {
          console.warn('HEAD count for attended attestations failed:', attendedHeadError.message);
        }

        userGoing = (goingCountHead ?? 0) > 0;
        userAttended = (attendedCountHead ?? 0) > 0;

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
        .eq('schema_uid', ATTENDED_SCHEMA_UID)
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

      setStats({
        goingCount: goingData?.length || 0,
        attendedCount: attendedData?.length || 0,
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
  }, [eventId, wallet?.address]);

  const handleDeclareGoing = async () => {
    if (!wallet?.address) return;

    try {
      const result = await createEventAttestation({
        schemaUid: GOING_SCHEMA_UID,
        recipient: wallet.address,
        data: {
          eventId,
          lockAddress,
          eventTitle,
          timestamp: Math.floor(Date.now() / 1000),
          location: 'Event Location',
          declarer: wallet.address
        },
        revocable: true
      });

      if (result.success) {
        setStats(prev => ({
          ...prev,
          goingCount: prev.goingCount + 1,
          userGoingStatus: true
        }));
        toast({
          title: '✅ Going Status Updated!',
          description: `You've declared you're going to ${eventTitle}`,
        });
      } else {
        throw new Error(result.error || 'Failed to declare going status');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleAttestAttendance = async () => {
    if (!wallet?.address) return;

    try {
      const result = await createEventAttestation({
        schemaUid: ATTENDED_SCHEMA_UID,
        recipient: wallet.address,
        data: {
          eventId,
          lockAddress,
          eventTitle,
          timestamp: Math.floor(Date.now() / 1000),
          location: 'Event Location',
          attendee: wallet.address,
          verificationMethod: 1 // Self-attestation
        },
        revocable: false
      });

      if (result.success) {
        setStats(prev => ({
          ...prev,
          attendedCount: prev.attendedCount + 1,
          userAttendedStatus: true
        }));
        toast({
          title: '🎉 Attendance Verified!',
          description: `You've attested attendance at ${eventTitle}`,
        });
        
        // Update user reputation for honest attestation
        await supabase.rpc('update_reputation_score', {
          user_addr: wallet.address,
          score_change: 5,
          attestation_type: 'attendance'
        });
      } else {
        throw new Error(result.error || 'Failed to attest attendance');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
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
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/40">
            <Calendar className="w-4 h-4 text-blue-500" />
            <div>
              <div className="font-medium text-sm">{stats.goingCount}</div>
              <div className="text-xs text-muted-foreground">Going</div>
            </div>
          </div>
          <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/40">
            <CalendarCheck className="w-4 h-4 text-green-500" />
            <div>
              <div className="font-medium text-sm">{stats.attendedCount}</div>
              <div className="text-xs text-muted-foreground">Attended</div>
            </div>
          </div>
        </div>

        {/* User Actions */}
        {authenticated && userHasTicket && (
          <>
            <Separator />
            <div className="space-y-3">
              {/* Going Declaration */}
              {canDeclareGoing && !stats.userGoingStatus && (
                <Button
                  onClick={handleDeclareGoing}
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Calendar className="w-4 h-4 mr-2" />
                  )}
                  I'm Going to This Event
                </Button>
              )}

              {stats.userGoingStatus && !eventHasStarted && (
                <div className="flex items-center justify-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                  <CheckCircle className="w-4 h-4 mr-2 text-blue-600" />
                  <span className="text-sm text-blue-600 font-medium">You're going to this event!</span>
                </div>
              )}

              {/* Attendance Attestation */}
              {canAttestAttendance && !stats.userAttendedStatus && (
                <Button
                  onClick={handleAttestAttendance}
                  disabled={isLoading}
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
              )}

              {stats.userAttendedStatus && (
                <div className="flex items-center justify-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <Award className="w-4 h-4 mr-2 text-green-600" />
                  <span className="text-sm text-green-600 font-medium">Attendance verified!</span>
                </div>
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

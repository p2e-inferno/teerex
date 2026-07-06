import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { AttestationChallengeDialog } from './AttestationChallengeDialog';
import { ReputationBadge } from './ReputationBadge';
import {
  Users,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Award
} from 'lucide-react';
import { IdentityName } from '@/components/identity/IdentityName';

interface Attendee {
  id: string;
  recipient: string;
  created_at: string;
  data: any;
  reputation_score: number;
  total_attestations: number;
  challenges_count: number;
  votes_support: number;
  votes_challenge: number;
}

interface AttendeesListProps {
  eventId: string;
  eventTitle: string;
  attendanceSchemaUid?: string;
  /** When this value changes, the component reloads attendees */
  refreshToken?: number;
}


export const AttendeesList: React.FC<AttendeesListProps> = ({
  eventId,
  eventTitle,
  attendanceSchemaUid,
  refreshToken,
}) => {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const wallet = wallets[0];

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Track if this is the initial mount to avoid refetching on first render
  const isInitialMountRef = useRef(true);

  const loadAttendees = useCallback(async () => {
    if (!eventId || !attendanceSchemaUid) {
      setAttendees([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await callEdgeFunction<{ attendees: Attendee[] }>(
        'get-event-attendees',
        { event_id: eventId, schema_uid: attendanceSchemaUid },
        {},
      );
      setAttendees(data.attendees ?? []);
    } catch (error) {
      console.error('Error loading attendees:', error);
    } finally {
      setIsLoading(false);
    }
  }, [attendanceSchemaUid, eventId]);
  const loadAttendeesRef = useRef(loadAttendees);

  useEffect(() => {
    loadAttendeesRef.current = loadAttendees;
  }, [loadAttendees]);

  // Reload attendees when refreshToken changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    loadAttendeesRef.current();
  }, [refreshToken]);

  useEffect(() => {
    loadAttendees();
  }, [loadAttendees]);

  const handleVote = async (attestationId: string, voteType: 'support' | 'challenge') => {
    if (!wallet?.address) return;

    try {
      const accessToken = await getAccessToken();
      await callEdgeFunction('create-attestation-vote', {
        attestation_id: attestationId,
        vote_type: voteType,
        voter_address: wallet.address,
      }, { privyToken: accessToken, withAnonKey: true });

      loadAttendees();
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-32 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (attendees.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <h3 className="font-semibold text-foreground">Verified Attendees</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No verified attendees yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <Badge variant="outline" className="text-[10px] w-fit uppercase tracking-tight font-bold bg-primary/5 text-primary border-primary/20">
            Community Verified
          </Badge>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-primary flex-shrink-0" />
            <h3 className="font-semibold text-foreground">
              Verified Attendees ({attendees.length})
            </h3>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {attendees.map((attendee) => (
          <div
            key={attendee.id}
            className="p-4 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors space-y-3"
          >
            {/* Top section: Avatar and User Info */}
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {attendee.recipient.slice(2, 4).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-sm">
                    <IdentityName address={attendee.recipient} />
                  </span>
                  <ReputationBadge score={attendee.reputation_score} size="sm" />
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(attendee.created_at).toLocaleDateString()}
                    </span>
                  </span>

                  {attendee.total_attestations > 0 && (
                    <span className="flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      <span>{attendee.total_attestations} attestations</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom section: Actions - stacks on mobile, inline on desktop */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Vote buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleVote(attendee.id, 'support')}
                  className="h-8 px-2"
                  disabled={!wallet?.address || wallet.address === attendee.recipient}
                >
                  <ThumbsUp className="w-3 h-3 mr-1" />
                  <span className="text-xs">{attendee.votes_support}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleVote(attendee.id, 'challenge')}
                  className="h-8 px-2"
                  disabled={!wallet?.address || wallet.address === attendee.recipient}
                >
                  <ThumbsDown className="w-3 h-3 mr-1" />
                  <span className="text-xs">{attendee.votes_challenge}</span>
                </Button>
              </div>

              {/* Challenge button */}
              {wallet?.address && wallet.address !== attendee.recipient && (
                <AttestationChallengeDialog
                  attestationId={attendee.id}
                  challengedUserAddress={attendee.recipient}
                  eventTitle={eventTitle}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-orange-600 border-orange-200 hover:bg-orange-50"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Challenge
                  </Button>
                </AttestationChallengeDialog>
              )}

              {/* Challenge indicator */}
              {attendee.challenges_count > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {attendee.challenges_count} challenge{attendee.challenges_count > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

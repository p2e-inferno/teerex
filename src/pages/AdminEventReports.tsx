import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { IdentityName } from '@/components/identity/IdentityName';
import {
  useEventReports,
  useResolveReport,
  type EventReport,
  type ReportStatus,
} from '@/hooks/useEventReports';

const STATUS_FILTERS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const STATUS_VARIANT: Record<ReportStatus, string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  reviewing: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  dismissed: 'bg-gray-100 text-gray-700 border-gray-200',
};

function ReportRow({ report }: { report: EventReport }) {
  const resolve = useResolveReport();
  const [note, setNote] = useState('');

  const act = async (status: 'reviewing' | 'resolved' | 'dismissed') => {
    try {
      await resolve.mutateAsync({ reportId: report.id, status, resolutionNote: note.trim() || undefined });
      toast.success(`Report marked ${status}`);
    } catch (err) {
      toast.error(err instanceof EdgeFunctionError ? err.message : 'Action failed');
    }
  };

  const closed = report.status === 'resolved' || report.status === 'dismissed';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {report.event ? (
              <Link to={`/event/${report.event.id}`} className="hover:underline">
                {report.event.title}
              </Link>
            ) : (
              <span className="text-muted-foreground">Event removed</span>
            )}
          </CardTitle>
          <Badge variant="outline" className={STATUS_VARIANT[report.status]}>
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span>
            Reason: <span className="font-medium text-foreground">{report.reason}</span>
          </span>
          <span>Reported {new Date(report.created_at).toLocaleString()}</span>
          {report.reporter_wallet && (
            <span>
              By <IdentityName address={report.reporter_wallet} />
            </span>
          )}
        </div>
        {report.details && (
          <p className="rounded-md bg-muted/40 p-3 text-foreground">{report.details}</p>
        )}
        {report.resolution_note && (
          <p className="text-xs text-muted-foreground">Resolution: {report.resolution_note}</p>
        )}

        {!closed && (
          <div className="space-y-2 border-t pt-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Resolution note (optional)"
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              {report.status === 'open' && (
                <Button size="sm" variant="outline" onClick={() => act('reviewing')} disabled={resolve.isPending}>
                  Mark reviewing
                </Button>
              )}
              <Button size="sm" onClick={() => act('resolved')} disabled={resolve.isPending}>
                {resolve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resolve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act('dismissed')} disabled={resolve.isPending}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminEventReports() {
  const [status, setStatus] = useState<ReportStatus | 'all'>('open');
  const { data: reports, isLoading, isError, error } = useEventReports(status);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Flag className="h-5 w-5 text-primary" />
            Event Reports
          </h1>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            {error instanceof EdgeFunctionError ? error.message : 'Failed to load reports.'}
          </CardContent>
        </Card>
      ) : !reports || reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No {status === 'all' ? '' : status} reports.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

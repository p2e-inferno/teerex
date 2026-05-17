import React, { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Inbox, Copy, Check, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PublishedEvent } from '@/types/event';
import {
  isPurchaseFormSchemaEmpty,
  PurchaseFormSchema,
  PurchaseFormResponseValues,
} from '@/types/purchaseForm';

interface EventPurchaseResponsesSectionProps {
  event: PublishedEvent;
}

interface ResponseRow {
  ticket_id: string;
  owner_wallet: string;
  user_email: string | null;
  created_at: string;
  granted_at: string | null;
  schema_version_at: string | null;
  values: PurchaseFormResponseValues;
  labels: Record<string, string>;
}

const PAGE_SIZE = 25;

const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
};

export const EventPurchaseResponsesSection: React.FC<EventPurchaseResponsesSectionProps> = ({
  event,
}) => {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [schema, setSchema] = useState<PurchaseFormSchema | null>(null);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const loadPage = async (nextOffset: number, append: boolean) => {
    setIsLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      const data = await callEdgeFunction<any>('list-event-purchase-responses', {
        event_id: event.id,
        format: 'json',
        limit: PAGE_SIZE,
        offset: nextOffset,
      }, { privyToken: accessToken, withAnonKey: true });
      setSchema((data.schema as PurchaseFormSchema | null) ?? null);
      setRows((prev) => (append ? [...prev, ...(data.rows ?? [])] : data.rows ?? []));
      setTotal(data.total ?? 0);
      setOffset(nextOffset);
    } catch (err) {
      toast({
        title: 'Could not load responses',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!event.id) return;
    void loadPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const handleDownloadCsv = async () => {
    setIsDownloading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');

      const url = new URL(
        `/functions/v1/list-event-purchase-responses`,
        supabaseUrl,
      );
      url.searchParams.set('event_id', event.id);
      url.searchParams.set('format', 'csv');
      url.searchParams.set('limit', '1000');

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Download failed');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${(event.title || 'event').replace(/[^a-z0-9-_]+/gi, '_')}-responses.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isPurchaseFormSchemaEmpty(schema) && rows.length === 0 && !isLoading) {
    return null;
  }

  const fields = schema?.fields ?? [];

  return (
    <div className="rounded-xl border p-5 bg-white space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-purple-100 p-2.5 rounded-xl flex-shrink-0">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-gray-900">Buyer answers</h3>
            <p className="text-sm text-muted-foreground">
              {total > 0
                ? `${total} ${total === 1 ? 'response' : 'responses'} so far.`
                : 'No responses yet.'}
            </p>
          </div>
        </div>
        <Button
          onClick={handleDownloadCsv}
          disabled={isDownloading || total === 0}
          size="sm"
          variant="outline"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Download CSV
        </Button>
      </div>

        {isLoading && rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
            <Inbox className="w-4 h-4" />
            Once people start buying tickets and answering, their responses will show up here.
          </div>
        ) : (
          <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-white">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Wallet</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  {fields.map((f) => (
                    <TableHead key={f.id} className="whitespace-nowrap">
                      {f.label}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap">Bought</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.ticket_id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {formatAddress(row.owner_wallet)}
                      <CopyButton text={row.owner_wallet} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.user_email ?? '—'}
                      {row.user_email && <CopyButton text={row.user_email} />}
                    </TableCell>
                    {fields.map((f) => {
                      const value = String(row.values[f.id] ?? '—');
                      return (
                        <TableCell key={f.id} className="text-sm whitespace-nowrap">
                          {value}
                          {value !== '—' && <CopyButton text={value} />}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        )}

        {rows.length < total && (
          <Button
            onClick={() => loadPage(offset + PAGE_SIZE, true)}
            size="sm"
            variant="outline"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Load more
          </Button>
        )}
    </div>
  );
};

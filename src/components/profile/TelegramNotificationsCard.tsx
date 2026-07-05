import { useState } from 'react';
import { Bell, Copy, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useTelegramNotifications } from '@/hooks/useTelegramNotifications';

export function TelegramNotificationsCard() {
  const { toast } = useToast();
  const telegram = useTelegramNotifications();
  const [blockedDeepLink, setBlockedDeepLink] = useState<string | null>(null);
  const linked = telegram.status?.linked === true;
  const enabled = telegram.status?.enabled === true;
  const busy = telegram.startLink.isPending || telegram.disable.isPending || telegram.isLoading;

  const handleLink = async () => {
    try {
      const response = await telegram.startLink.mutateAsync();
      const opened = window.open(response.deep_link, '_blank', 'noopener,noreferrer');
      if (opened) {
        setBlockedDeepLink(null);
        toast({
          title: 'Open Telegram',
          description: 'Tap Start in Telegram to finish linking notifications.',
        });
      } else {
        setBlockedDeepLink(response.deep_link);
        toast({
          title: 'Open Telegram manually',
          description: 'Your browser blocked the popup. Use the link shown below.',
        });
      }
    } catch (error) {
      toast({
        title: 'Could not start Telegram link',
        description: error instanceof EdgeFunctionError ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyBlockedLink = async () => {
    if (!blockedDeepLink) return;
    try {
      await navigator.clipboard.writeText(blockedDeepLink);
      toast({ title: 'Telegram link copied' });
    } catch {
      toast({
        title: 'Could not copy link',
        description: 'Select the link manually and copy it.',
        variant: 'destructive',
      });
    }
  };

  const handleRetryBlockedLink = () => {
    if (!blockedDeepLink) return;
    const opened = window.open(blockedDeepLink, '_blank', 'noopener,noreferrer');
    if (opened) {
      setBlockedDeepLink(null);
    } else {
      toast({ title: 'Popup still blocked', description: 'Copy the Telegram link and open it manually.' });
    }
  };

  const handleDisable = async () => {
    try {
      await telegram.disable.mutateAsync();
      toast({
        title: 'Telegram notifications disabled',
        description: 'This Telegram identity remains reserved for account safety.',
      });
    } catch (error) {
      toast({
        title: 'Could not disable Telegram',
        description: error instanceof EdgeFunctionError ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" /> Telegram notifications
        </CardTitle>
        <CardDescription>
          Receive optional Telegram alerts for tickets, event posts, results, refunds, and organizers you follow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={enabled ? 'default' : 'secondary'} className="gap-1">
            {telegram.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
            {enabled ? 'Enabled' : linked ? 'Linked, disabled' : 'Not linked'}
          </Badge>
          {linked && (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Reserved identity
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Disabling stops Telegram alerts but keeps the Telegram account reserved to this profile.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={handleLink} disabled={busy}>
            {telegram.startLink.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            {linked ? 'Relink Telegram' : 'Link Telegram'}
          </Button>
          {enabled && (
            <Button size="sm" variant="outline" onClick={handleDisable} disabled={busy}>
              {telegram.disable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable
            </Button>
          )}
        </div>

        {blockedDeepLink && (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <p className="break-all text-xs text-muted-foreground">{blockedDeepLink}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="sm" variant="outline" onClick={handleCopyBlockedLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
              <Button size="sm" onClick={handleRetryBlockedLink}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Try opening again
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

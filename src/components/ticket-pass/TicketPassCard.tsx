import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Ticket, Coins } from 'lucide-react';
import type { TicketPass } from '@/types/ticketPass';
import { formatFiatPrice, formatPayoutSummary, TICKET_PASS_STATUS_BADGE } from '@/lib/ticketPass/display';

type TicketPassCardProps = {
  pass: TicketPass;
  manage?: boolean;
  onManage?: (pass: TicketPass) => void;
};

export const TicketPassCard = ({ pass, manage = false, onManage }: TicketPassCardProps) => {
  const statusBadge = TICKET_PASS_STATUS_BADGE[pass.status] ?? TICKET_PASS_STATUS_BADGE.ACTIVE;

  return (
    <Card className="border border-gray-200 shadow-sm overflow-hidden">
      {pass.image_url && (
        <div className="w-full h-40 overflow-hidden">
          <img src={pass.image_url} alt={pass.title} className="w-full h-full object-cover" />
        </div>
      )}
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Ticket className="w-3 h-3" /> Ticket Pass
          </Badge>
          <Badge variant={statusBadge.variant} className="text-xs">{statusBadge.label}</Badge>
        </div>
        <CardTitle className="text-lg">{pass.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p className="line-clamp-2">{pass.description}</p>
        <div className="flex items-center gap-1 text-xs text-gray-700">
          <Coins className="w-3 h-3" />
          <span className="font-medium">{formatPayoutSummary(pass)}</span>
          <span>per pass</span>
        </div>
        <div className="flex items-center justify-between text-sm pt-1">
          <span className="font-semibold text-gray-900">{formatFiatPrice(pass)}</span>
          <span className="text-xs">{pass.max_copies} max · {pass.max_per_buyer}/buyer</span>
        </div>
      </CardContent>
      <CardFooter>
        {manage ? (
          <div className="flex w-full gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onManage?.(pass)}>
              Manage
            </Button>
            <Button asChild className="flex-1">
              <Link to={`/ticket-passes/${pass.id}`}>View</Link>
            </Button>
          </div>
        ) : (
          <Button asChild className="w-full">
            <Link to={`/ticket-passes/${pass.id}`}>View Pass</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

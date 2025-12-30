import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { GamingBundle } from '@/types/gaming';

type GamingBundleCardProps = {
  bundle: GamingBundle;
  showActions?: boolean;
};

export const GamingBundleCard = ({ bundle, showActions = true }: GamingBundleCardProps) => {
  return (
    <Card className="border border-gray-200 shadow-sm overflow-hidden">
      {/* Bundle Image */}
      {bundle.image_url && (
        <div className="w-full h-40 overflow-hidden">
          <img
            src={bundle.image_url}
            alt={bundle.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {bundle.bundle_type}
            </Badge>
            {bundle.console && (
              <Badge variant="secondary" className="text-xs">
                {bundle.console}
              </Badge>
            )}
            {bundle.game_title && (
              <Badge variant="outline" className="text-xs bg-purple-50">
                {bundle.game_title}
              </Badge>
            )}
          </div>
          {!bundle.is_active && (
            <Badge variant="destructive" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg">{bundle.title}</CardTitle>
        {/* Location */}
        {bundle.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {bundle.location}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p className="line-clamp-2">{bundle.description}</p>
        <div className="flex items-center justify-between text-xs">
          <span>
            {bundle.quantity_units} {bundle.unit_label}
          </span>
          <span>{bundle.sold_count ?? 0} sold</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">
            NGN {Number(bundle.price_fiat || 0).toLocaleString()}
          </span>
          {bundle.price_dg ? (
            <span className="text-xs text-muted-foreground">{bundle.price_dg} DG</span>
          ) : null}
        </div>
      </CardContent>
      {showActions ? (
        <CardFooter>
          <Button asChild className="w-full">
            <Link to={`/gaming-bundles/${bundle.id}`}>View Bundle</Link>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
};

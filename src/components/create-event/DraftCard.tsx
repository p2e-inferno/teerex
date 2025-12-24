
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Edit, Trash2, Upload, Loader2 } from 'lucide-react';
import { EventDraft } from '@/types/event';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { formatEventDateRange } from '@/utils/dateUtils';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';

interface DraftCardProps {
  draft: EventDraft;
  onEdit: (draft: EventDraft) => void;
  onDelete: (id: string) => void;
  onPublish: (draft: EventDraft) => void;
  isPublishing?: boolean;
}

export const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  onEdit,
  onDelete,
  onPublish,
  isPublishing = false
}) => {
  const { networks } = useNetworkConfigs();
  const network = networks.find(n => n.chain_id === draft.chain_id);
  const networkLabel = network?.chain_name || 'Network';
  return (
    <Card className="border-0 shadow-sm">
      <div className="aspect-square relative">
        {draft.image_url ? (
          <img
            src={draft.image_url}
            alt={draft.title}
            style={{
              objectFit: 'cover',
              objectPosition: `${draft.image_crop_x || 50}% ${draft.image_crop_y || 50}%`
            }}
            className="w-full h-full rounded-t-lg"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 rounded-t-lg"></div>
        )}
        <div className="absolute top-3 left-3">
          <Badge className="bg-orange-500 text-white">Draft</Badge>
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="outline" className="bg-white/90 text-gray-900 border-gray-200">
            {networkLabel}
          </Badge>
        </div>
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{draft.title}</CardTitle>
        <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:gap-4">
          {draft.date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{formatEventDateRange({ startDate: draft.date, endDate: draft.end_date })}</span>
            </div>
          )}
          {(draft.time || draft.location) && (
            <div className="flex flex-wrap items-center gap-4">
              {draft.time && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{draft.time}</span>
                </div>
              )}
              {draft.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate max-w-[160px] sm:max-w-[120px]">{draft.location}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="mb-4">
          <RichTextDisplay
            content={draft.description}
            className="prose-sm text-gray-600 line-clamp-2"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(draft)}
            className="flex-1"
            disabled={isPublishing}
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(draft.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={isPublishing}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => onPublish(draft)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1" />
            )}
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

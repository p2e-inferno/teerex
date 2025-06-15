
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Edit, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { EventDraft } from '@/types/event';

interface DraftCardProps {
  draft: EventDraft;
  onEdit: (draft: EventDraft) => void;
  onDelete: (id: string) => void;
  onPublish: (draft: EventDraft) => void;
}

export const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  onEdit,
  onDelete,
  onPublish
}) => {
  return (
    <Card className="border-0 shadow-sm">
      <div className="aspect-[2/1] relative">
        {draft.imageUrl ? (
          <img 
            src={draft.imageUrl} 
            alt={draft.title} 
            className="w-full h-full object-cover rounded-t-lg"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 rounded-t-lg"></div>
        )}
        <div className="absolute top-3 left-3">
          <Badge className="bg-orange-500 text-white">Draft</Badge>
        </div>
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{draft.title}</CardTitle>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {draft.date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{format(draft.date, "MMM d, yyyy")}</span>
            </div>
          )}
          {draft.time && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{draft.time}</span>
            </div>
          )}
          {draft.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span className="truncate max-w-[100px]">{draft.location}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {draft.description}
        </p>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(draft)}
            className="flex-1"
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(draft.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => onPublish(draft)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Upload className="w-4 h-4 mr-1" />
            Publish
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

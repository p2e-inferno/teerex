import React, { useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  isPurchaseFormSchemaEmpty,
  isSensitiveLabel,
  makeEmptyPurchaseFormSchema,
  PURCHASE_FORM_MAX_FIELDS,
  PURCHASE_FORM_MAX_LABEL_LENGTH,
  PURCHASE_FORM_MAX_HELP_LENGTH,
  PURCHASE_FORM_MAX_OPTION_LENGTH,
  PURCHASE_FORM_MAX_SELECT_OPTIONS,
  PurchaseFormField,
  PurchaseFormFieldType,
  PurchaseFormSchema,
  slugifyFieldId,
} from '@/types/purchaseForm';

interface PurchaseFormBuilderProps {
  schema: PurchaseFormSchema | null | undefined;
  onChange: (next: PurchaseFormSchema | null) => void;
  /** True when editing a previously published event. Switches into additive-only mode. */
  isPublishedEvent?: boolean;
  /** Whether at least one ticket has been issued (controls additive-only enforcement). */
  hasTickets?: boolean;
}

// Plain-language type options shown to creators. Internally maps to the
// canonical PurchaseFormFieldType values used everywhere else.
const SIMPLE_TYPE_OPTIONS: { value: PurchaseFormFieldType; label: string; description: string }[] = [
  { value: 'short_text', label: 'Short answer', description: 'A single line of text' },
  { value: 'long_text', label: 'Paragraph', description: 'Multiple lines of text' },
  { value: 'select', label: 'Multiple choice', description: 'Pick one from a list' },
  { value: 'phone', label: 'Phone number', description: 'A phone number' },
  { value: 'url', label: 'Website link', description: 'An http(s) URL' },
  { value: 'number', label: 'Number', description: 'Any number' },
  { value: 'checkbox', label: 'Yes / No', description: 'A checkbox they tick' },
];

// Defaults applied silently. We keep the canonical schema rich, but the UI
// stays uncluttered: the creator never sees max_length, min/max, integer_only.
const DEFAULTS_FOR_TYPE: Record<PurchaseFormFieldType, Partial<PurchaseFormField>> = {
  short_text: { max_length: 200, options: null, min: null, max: null, integer_only: null },
  long_text: { max_length: 1000, options: null, min: null, max: null, integer_only: null },
  select: { max_length: null, options: [], min: null, max: null, integer_only: null },
  phone: { max_length: null, options: null, min: null, max: null, integer_only: null },
  url: { max_length: null, options: null, min: null, max: null, integer_only: null },
  number: { max_length: null, options: null, min: null, max: null, integer_only: false },
  checkbox: { max_length: null, options: null, min: null, max: null, integer_only: null },
};

const newField = (existing: PurchaseFormField[]): PurchaseFormField => {
  const baseLabel = `Question ${existing.length + 1}`;
  let id = slugifyFieldId(baseLabel);
  const used = new Set(existing.map((f) => f.id));
  let suffix = 1;
  while (used.has(id)) {
    id = slugifyFieldId(`${baseLabel} ${suffix++}`);
  }
  return {
    id,
    label: '',
    type: 'short_text',
    required: true,
    help_text: null,
    ...DEFAULTS_FOR_TYPE.short_text,
  };
};

// When the creator types a label, regenerate a stable id from it -- but only
// for newly-added fields (we don't change ids on already-issued schemas).
const reidIfPossible = (
  field: PurchaseFormField,
  label: string,
  others: PurchaseFormField[],
  isNewField: boolean,
): string => {
  if (!isNewField) return field.id;
  const slug = slugifyFieldId(label || field.id);
  const used = new Set(others.map((f) => f.id));
  if (!used.has(slug)) return slug;
  let i = 2;
  while (used.has(`${slug}_${i}`)) i++;
  return `${slug}_${i}`;
};

export const PurchaseFormBuilder: React.FC<PurchaseFormBuilderProps> = ({
  schema,
  onChange,
  isPublishedEvent = false,
  hasTickets = false,
}) => {
  const enabled = !isPurchaseFormSchemaEmpty(schema);
  const fields = useMemo(() => schema?.fields ?? [], [schema]);
  const additiveOnly = isPublishedEvent && hasTickets;
  // Snapshot, at first render, the ids that already existed on this event.
  // These are the "locked" fields for the additive-only edit rule. New fields
  // added in the current session are NOT in this set, so they remain fully
  // editable until saved.
  const lockedIdsRef = useRef<Set<string> | null>(null);
  if (lockedIdsRef.current === null) {
    lockedIdsRef.current = isPublishedEvent
      ? new Set((schema?.fields ?? []).map((f) => f.id))
      : new Set<string>();
  }
  const lockedIds = lockedIdsRef.current;

  const setFields = (nextFields: PurchaseFormField[]) => {
    if (nextFields.length === 0) {
      onChange(null);
      return;
    }
    onChange({ version: 1, fields: nextFields });
  };

  const handleEnableToggle = (checked: boolean) => {
    if (!checked) {
      if (fields.length > 0) {
        const confirmed = typeof window !== 'undefined'
          ? window.confirm('Remove all custom questions? This cannot be undone.')
          : true;
        if (!confirmed) return;
      }
      onChange(null);
      return;
    }
    if (!enabled) {
      // Start with one starter question to make the next step obvious.
      onChange({ version: 1, fields: [newField([])] });
    }
  };

  const handleAddField = () => {
    if (fields.length >= PURCHASE_FORM_MAX_FIELDS) return;
    setFields([...fields, newField(fields)]);
  };

  const isLocked = (fieldId: string) => additiveOnly && lockedIds.has(fieldId);

  const handleRemoveField = (index: number) => {
    const field = fields[index];
    if (isLocked(field.id)) {
      window.alert('You can\'t delete a question once people have started buying tickets. Mark it as optional instead.');
      return;
    }
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleMoveField = (index: number, direction: -1 | 1) => {
    if (additiveOnly) {
      window.alert('Questions can\'t be reordered once people have started buying tickets.');
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = fields.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  };

  const handleLabelChange = (index: number, label: string) => {
    const next = fields.slice();
    const others = next.filter((_, i) => i !== index);
    const isNew = !lockedIds.has(next[index].id);
    next[index] = {
      ...next[index],
      label,
      id: reidIfPossible(next[index], label, others, isNew),
    };
    setFields(next);
  };

  const handleHelpChange = (index: number, value: string) => {
    const next = fields.slice();
    next[index] = { ...next[index], help_text: value || null };
    setFields(next);
  };

  const handleTypeChange = (index: number, type: PurchaseFormFieldType) => {
    if (isLocked(fields[index].id)) {
      window.alert('You can\'t change a question\'s type once people have started buying tickets.');
      return;
    }
    const next = fields.slice();
    next[index] = {
      ...next[index],
      type,
      ...DEFAULTS_FOR_TYPE[type],
    };
    setFields(next);
  };

  const handleOptionsChange = (index: number, raw: string) => {
    const opts = raw
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, PURCHASE_FORM_MAX_SELECT_OPTIONS)
      .map((o) => o.slice(0, PURCHASE_FORM_MAX_OPTION_LENGTH));

    if (additiveOnly && lockedIds.has(fields[index].id)) {
      // Allow adding options but never removing them after tickets exist.
      const prev = fields[index].options ?? [];
      const newSet = new Set(opts);
      const removed = prev.filter((o) => !newSet.has(o));
      if (removed.length > 0) {
        window.alert('You can add new choices, but you can\'t remove existing ones once people have started buying tickets.');
        // Re-merge removed back in
        for (const o of prev) if (!newSet.has(o)) opts.push(o);
      }
    }

    const next = fields.slice();
    next[index] = { ...next[index], options: opts };
    setFields(next);
  };

  const handleRequiredChange = (index: number, required: boolean) => {
    const field = fields[index];
    if (additiveOnly && lockedIds.has(field.id) && !field.required && required) {
      window.alert('You can make a question optional, but you can\'t make an existing optional question required after tickets are sold.');
      return;
    }
    const next = fields.slice();
    next[index] = { ...next[index], required };
    setFields(next);
  };

  const sensitiveCount = useMemo(
    () => fields.filter((f) => isSensitiveLabel(f.label)).length,
    [fields],
  );

  return (
    <Card className="border-slate-200">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="purchase-form-toggle" className="text-base font-medium flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-purple-600" />
              Ask buyers extra questions
            </Label>
            <p className="text-sm text-gray-600">
              Collect a bit more info from each ticket buyer (besides their email).
              Useful for full name, phone, t-shirt size, etc.
            </p>
          </div>
          <Switch
            id="purchase-form-toggle"
            checked={enabled}
            onCheckedChange={handleEnableToggle}
          />
        </div>

        {enabled && (
          <>
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Don&apos;t ask for sensitive info</AlertTitle>
              <AlertDescription className="text-amber-700">
                Avoid passwords, social security numbers, credit card numbers, etc.
                You&apos;re responsible for any answers you collect.
                {additiveOnly && (
                  <>
                    {' '}Once tickets have been sold you can keep adding new questions, but
                    existing ones can only be made optional or have their text edited.
                  </>
                )}
              </AlertDescription>
            </Alert>

            {sensitiveCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  One of your questions looks like sensitive info. Please rename it before saving.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => {
                const locked = isLocked(field.id);
                const typeOpt = SIMPLE_TYPE_OPTIONS.find((o) => o.value === field.type);
                return (
                  <div
                    key={field.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-slate-700">
                        Question {index + 1}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMoveField(index, -1)}
                          disabled={index === 0 || additiveOnly}
                          aria-label="Move up"
                          title={additiveOnly ? 'Can\'t reorder after tickets are sold' : 'Move up'}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMoveField(index, 1)}
                          disabled={index === fields.length - 1 || additiveOnly}
                          aria-label="Move down"
                          title={additiveOnly ? 'Can\'t reorder after tickets are sold' : 'Move down'}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemoveField(index)}
                          disabled={locked}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-slate-300"
                          aria-label="Remove question"
                          title={locked ? 'Can\'t delete after tickets are sold' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`pf-label-${field.id}`}>Question</Label>
                      <Input
                        id={`pf-label-${field.id}`}
                        value={field.label}
                        maxLength={PURCHASE_FORM_MAX_LABEL_LENGTH}
                        onChange={(e) => handleLabelChange(index, e.target.value)}
                        placeholder="e.g. What's your full name?"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`pf-type-${field.id}`}>Answer type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(v) => handleTypeChange(index, v as PurchaseFormFieldType)}
                        disabled={locked}
                      >
                        <SelectTrigger id={`pf-type-${field.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIMPLE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div>
                                <div>{opt.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {opt.description}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {typeOpt && !locked && (
                        <p className="text-xs text-muted-foreground">{typeOpt.description}</p>
                      )}
                    </div>

                    {field.type === 'select' && (
                      <div className="space-y-1">
                        <Label htmlFor={`pf-options-${field.id}`}>Choices (one per line)</Label>
                        <Textarea
                          id={`pf-options-${field.id}`}
                          rows={4}
                          value={(field.options ?? []).join('\n')}
                          onChange={(e) => handleOptionsChange(index, e.target.value)}
                          placeholder="Small\nMedium\nLarge"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor={`pf-help-${field.id}`}>Hint (optional)</Label>
                      <Input
                        id={`pf-help-${field.id}`}
                        value={field.help_text ?? ''}
                        maxLength={PURCHASE_FORM_MAX_HELP_LENGTH}
                        onChange={(e) => handleHelpChange(index, e.target.value)}
                        placeholder="Shown beneath the question"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        id={`pf-required-${field.id}`}
                        checked={field.required}
                        onCheckedChange={(v) => handleRequiredChange(index, v)}
                      />
                      <Label htmlFor={`pf-required-${field.id}`} className="text-sm">
                        Must answer
                      </Label>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              onClick={handleAddField}
              variant="outline"
              size="sm"
              disabled={fields.length >= PURCHASE_FORM_MAX_FIELDS}
            >
              <Plus className="w-4 h-4 mr-1" /> Add question
            </Button>
            {fields.length >= PURCHASE_FORM_MAX_FIELDS && (
              <p className="text-xs text-slate-500">
                You&apos;ve reached the {PURCHASE_FORM_MAX_FIELDS}-question limit.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

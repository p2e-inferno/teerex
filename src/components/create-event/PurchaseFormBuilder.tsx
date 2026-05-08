import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  isPurchaseFormSchemaEmpty,
  isSensitiveLabel,
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
  { value: 'short_text', label: 'Short answer', description: 'A single line of text (e.g. full name)' },
  { value: 'long_text', label: 'Paragraph', description: 'Multiple lines of text (e.g. dietary needs)' },
  { value: 'select', label: 'Multiple choice', description: 'Pick multiple options from a list (e.g. game modes: BR / MP / 1v1)' },
  { value: 'checkbox', label: 'Single choice', description: 'Pick exactly one option — shown as radio buttons (e.g. Yes / No / Maybe)' },
  { value: 'phone', label: 'Phone number', description: 'A phone number' },
  { value: 'url', label: 'Website link', description: 'A link starting with http or https' },
  { value: 'number', label: 'Number', description: 'A number (e.g. age)' },
];

// Defaults applied silently. We keep the canonical schema rich, but the UI
// stays uncluttered: the creator never sees max_length, min/max, integer_only.
const DEFAULTS_FOR_TYPE: Record<PurchaseFormFieldType, Partial<PurchaseFormField>> = {
  short_text: { max_length: 200, options: null, min: null, max: null, integer_only: null },
  long_text: { max_length: 1000, options: null, min: null, max: null, integer_only: null },
  select: { max_length: null, options: [], min: null, max: null, integer_only: null },
  checkbox: { max_length: null, options: [], min: null, max: null, integer_only: null },
  phone: { max_length: null, options: null, min: null, max: null, integer_only: null },
  url: { max_length: null, options: null, min: null, max: null, integer_only: null },
  number: { max_length: null, options: null, min: null, max: null, integer_only: false },
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

  const addOption = (index: number, raw: string) => {
    const cleaned = raw.trim().slice(0, PURCHASE_FORM_MAX_OPTION_LENGTH);
    if (!cleaned) return;
    const current = fields[index].options ?? [];
    if (current.includes(cleaned)) return;
    if (current.length >= PURCHASE_FORM_MAX_SELECT_OPTIONS) return;
    const next = fields.slice();
    next[index] = { ...next[index], options: [...current, cleaned] };
    setFields(next);
  };

  const removeOption = (index: number, value: string) => {
    const field = fields[index];
    const wasOriginal =
      additiveOnly &&
      lockedIds.has(field.id) &&
      (field.options ?? []).includes(value);
    if (wasOriginal) {
      window.alert("You can't remove existing choices once people have started buying tickets. You can still add new ones.");
      return;
    }
    const next = fields.slice();
    next[index] = {
      ...next[index],
      options: (field.options ?? []).filter((o) => o !== value),
    };
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
                    key={index}
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
                      <Label htmlFor={`pf-label-${index}`}>Question</Label>
                      <Input
                        id={`pf-label-${index}`}
                        value={field.label}
                        maxLength={PURCHASE_FORM_MAX_LABEL_LENGTH}
                        onChange={(e) => handleLabelChange(index, e.target.value)}
                        placeholder="e.g. What's your full name?"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`pf-type-${index}`}>Answer type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(v) => handleTypeChange(index, v as PurchaseFormFieldType)}
                        disabled={locked}
                      >
                        <SelectTrigger id={`pf-type-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIMPLE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {typeOpt && !locked && (
                        <p className="text-xs text-muted-foreground">{typeOpt.description}</p>
                      )}
                    </div>

                    {(field.type === 'select' || field.type === 'checkbox') && (
                      <ChoicesEditor
                        fieldIndex={index}
                        options={field.options ?? []}
                        onAdd={(v) => addOption(index, v)}
                        onRemove={(v) => removeOption(index, v)}
                        lockedValues={
                          additiveOnly && lockedIds.has(field.id)
                            ? new Set(field.options ?? [])
                            : new Set()
                        }
                      />
                    )}

                    <div className="space-y-1">
                      <Label htmlFor={`pf-help-${index}`}>Hint (optional)</Label>
                      <Input
                        id={`pf-help-${index}`}
                        value={field.help_text ?? ''}
                        maxLength={PURCHASE_FORM_MAX_HELP_LENGTH}
                        onChange={(e) => handleHelpChange(index, e.target.value)}
                        placeholder="Shown beneath the question"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        id={`pf-required-${index}`}
                        checked={field.required}
                        onCheckedChange={(v) => handleRequiredChange(index, v)}
                      />
                      <Label htmlFor={`pf-required-${index}`} className="text-sm">
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

/**
 * Chip-style editor for the `select` field's choices. Familiar tag-input
 * pattern: type a value, press Enter (or comma) to add, click X to remove,
 * Backspace on empty input removes the last chip. Locked chips (existing
 * choices on a published event with tickets) render without an X.
 */
interface ChoicesEditorProps {
  fieldIndex: number;
  options: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  lockedValues: Set<string>;
}

const ChoicesEditor: React.FC<ChoicesEditorProps> = ({
  fieldIndex,
  options,
  onAdd,
  onRemove,
  lockedValues,
}) => {
  const [draft, setDraft] = useState('');
  const inputId = `pf-options-${fieldIndex}`;
  const atLimit = options.length >= PURCHASE_FORM_MAX_SELECT_OPTIONS;

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && options.length > 0) {
      const last = options[options.length - 1];
      if (!lockedValues.has(last)) {
        e.preventDefault();
        onRemove(last);
      }
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId}>Choices</Label>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-2 min-h-[42px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => document.getElementById(inputId)?.focus()}
      >
        {options.map((opt) => {
          const isLocked = lockedValues.has(opt);
          return (
            <span
              key={opt}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-800"
            >
              {opt}
              {!isLocked && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(opt);
                  }}
                  aria-label={`Remove ${opt}`}
                  className="text-slate-500 hover:text-slate-900 rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(e) =>
            setDraft(e.target.value.slice(0, PURCHASE_FORM_MAX_OPTION_LENGTH))
          }
          onKeyDown={handleKeyDown}
          onBlur={commit}
          disabled={atLimit}
          placeholder={
            options.length === 0
              ? 'Type a choice and press Enter (e.g. Male)'
              : atLimit
                ? `Max ${PURCHASE_FORM_MAX_SELECT_OPTIONS} choices`
                : 'Add another...'
          }
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm py-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {options.length === 0
          ? 'Press Enter after each choice to add it.'
          : `${options.length} of ${PURCHASE_FORM_MAX_SELECT_OPTIONS} choices`}
      </p>
    </div>
  );
};

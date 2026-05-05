import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  isPurchaseFormSchemaEmpty,
  PurchaseFormField,
  PurchaseFormResponseValues,
  PurchaseFormSchema,
} from '@/types/purchaseForm';

interface PurchaseFormFieldsProps {
  schema: PurchaseFormSchema | null | undefined;
  values: PurchaseFormResponseValues;
  errors?: Record<string, string>;
  onChange: (next: PurchaseFormResponseValues) => void;
  disabled?: boolean;
  /** Wallet used to fetch prefill values from the user's prior tickets. */
  prefillWallet?: string | null;
}

export const PurchaseFormFields: React.FC<PurchaseFormFieldsProps> = ({
  schema,
  values,
  errors,
  onChange,
  disabled,
  prefillWallet,
}) => {
  const empty = isPurchaseFormSchemaEmpty(schema);
  const fields = schema?.fields ?? [];
  const [prefillLoaded, setPrefillLoaded] = useState(false);

  useEffect(() => {
    if (empty || prefillLoaded || !prefillWallet) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_purchase_form_prefill', {
          p_owner_wallet: prefillWallet.toLowerCase(),
        });
        if (cancelled || error || !data) return;
        const prefill = (data ?? {}) as PurchaseFormResponseValues;
        const merged: PurchaseFormResponseValues = { ...values };
        for (const f of fields) {
          // Only fill if the user hasn't typed anything yet, and the prefill
          // value type matches the current field type expectations.
          if (merged[f.id] !== undefined && merged[f.id] !== null && merged[f.id] !== '') continue;
          const candidate = prefill[f.id];
          if (candidate === undefined || candidate === null) continue;
          if (f.type === 'select' && !(f.options ?? []).includes(String(candidate))) continue;
          merged[f.id] = candidate;
        }
        onChange(merged);
      } finally {
        if (!cancelled) setPrefillLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillWallet, empty]);

  const setValue = (field: PurchaseFormField, raw: string | number | boolean | null) => {
    onChange({ ...values, [field.id]: raw });
  };

  const renderInput = (field: PurchaseFormField) => {
    const id = `pf-input-${field.id}`;
    const current = values[field.id];
    const errorMsg = errors?.[field.id];
    const helpId = field.help_text ? `${id}-help` : undefined;
    const ariaProps: React.AriaAttributes = {
      'aria-invalid': Boolean(errorMsg),
      ...(helpId ? { 'aria-describedby': helpId } : {}),
    };

    if (field.type === 'checkbox') {
      // Checkbox renders the label inline next to the box (single canonical
      // label, no duplicate question text). Help text falls beneath as a hint.
      return (
        <div className="space-y-1" key={field.id}>
          <div className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={current === true}
              disabled={disabled}
              onCheckedChange={(v) => setValue(field, v === true)}
              {...ariaProps}
            />
            <Label htmlFor={id} className="text-sm leading-snug">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </Label>
          </div>
          {field.help_text && (
            <p id={helpId} className="text-xs text-muted-foreground pl-6">
              {field.help_text}
            </p>
          )}
          {errorMsg && (
            <p className="text-xs text-red-600 pl-6" role="alert">
              {errorMsg}
            </p>
          )}
        </div>
      );
    }

    let control: React.ReactNode;
    switch (field.type) {
      case 'short_text':
      case 'phone':
      case 'url':
        control = (
          <Input
            id={id}
            disabled={disabled}
            type={field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
            value={(current as string) ?? ''}
            maxLength={field.max_length ?? undefined}
            onChange={(e) => setValue(field, e.target.value)}
            {...ariaProps}
          />
        );
        break;
      case 'long_text':
        control = (
          <Textarea
            id={id}
            disabled={disabled}
            rows={3}
            value={(current as string) ?? ''}
            maxLength={field.max_length ?? undefined}
            onChange={(e) => setValue(field, e.target.value)}
            {...ariaProps}
          />
        );
        break;
      case 'number':
        control = (
          <Input
            id={id}
            disabled={disabled}
            type="number"
            value={current === null || current === undefined ? '' : (current as number)}
            onChange={(e) => {
              const v = e.target.value;
              setValue(field, v === '' ? null : Number(v));
            }}
            {...ariaProps}
          />
        );
        break;
      case 'select':
        control = (
          <Select
            value={(current as string) ?? ''}
            onValueChange={(v) => setValue(field, v)}
            disabled={disabled}
          >
            <SelectTrigger id={id} {...ariaProps}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;
    }

    return (
      <div className="space-y-1" key={field.id}>
        <Label htmlFor={id}>
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </Label>
        {control}
        {field.help_text && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {field.help_text}
          </p>
        )}
        {errorMsg && (
          <p className="text-xs text-red-600" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  };

  const disclosureText = useMemo(() => {
    if (empty) return null;
    return 'By submitting these answers you agree to share them with the event organiser.';
  }, [empty]);

  if (empty) return null;

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-3">{fields.map(renderInput)}</div>
      {disclosureText && (
        <p className="text-xs text-muted-foreground">{disclosureText}</p>
      )}
    </div>
  );
};

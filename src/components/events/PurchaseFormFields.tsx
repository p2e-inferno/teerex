import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
          const existing = merged[f.id];
          if (
            existing !== undefined &&
            existing !== null &&
            existing !== ''
          ) {
            continue;
          }
          const candidate = prefill[f.id];
          if (candidate === undefined || candidate === null) continue;
          // For select fields the prefill must still be one of the current options.
          if (f.type === 'select') {
            if (typeof candidate !== 'string' || !(f.options ?? []).includes(candidate)) continue;
          }
          merged[f.id] = candidate as any;
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

  const setValue = (field: PurchaseFormField, raw: string | number | null) => {
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

    // Single choice — render as radio buttons (pick one from a predefined list).
    if (field.type === 'checkbox') {
      const currentStr = typeof current === 'string' ? current : '';
      return (
        <div className="space-y-1" key={field.id}>
          <span id={`${id}-grouplabel`} className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </span>
          <RadioGroup
            value={currentStr}
            onValueChange={(v) => setValue(field, v)}
            disabled={disabled}
            aria-labelledby={`${id}-grouplabel`}
            {...(helpId ? { 'aria-describedby': helpId } : {})}
            className="space-y-1.5 pt-1"
          >
            {(field.options ?? []).map((opt) => {
              const optId = `${id}-${opt.replace(/[^a-zA-Z0-9]+/g, '_')}`;
              return (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem id={optId} value={opt} aria-invalid={Boolean(errorMsg)} />
                  <Label htmlFor={optId} className="text-sm font-normal cursor-pointer">
                    {opt}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
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
      case 'select': {
        const selected = (current as string)?.split(',').filter(Boolean) ?? [];
        const toggleOption = (option: string, isSelected: boolean) => {
          const next = isSelected 
            ? [...selected, option]
            : selected.filter((s) => s !== option);
          setValue(field, next.length > 0 ? next.join(',') : null);
        };
        return (
          <div className="space-y-1.5 pt-1" key={field.id}>
             <span className="text-sm font-medium">{field.label}
              {field.required && <span className="text-red-500"> *</span>}
             </span>
            {(field.options ?? []).map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`${id}-${opt}`}
                  checked={selected.includes(opt)}
                  onChange={(e) => toggleOption(opt, e.target.checked)}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <Label htmlFor={`${id}-${opt}`} className="text-sm font-normal cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </div>
        );
      }
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

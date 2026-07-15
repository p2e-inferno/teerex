import { describe, expect, it } from 'vitest';
import { applyPublicEventSort, PUBLIC_EVENT_SELECT } from '../../../supabase/functions/_shared/public-events';

describe('public event projection', () => {
  it('includes checkout and timing fields without exposing protected purchase copy', () => {
    expect(PUBLIC_EVENT_SELECT).toContain('starts_at');
    expect(PUBLIC_EVENT_SELECT).toContain('paystack_public_key');
    expect(PUBLIC_EVENT_SELECT).not.toContain('creator_id');
    expect(PUBLIC_EVENT_SELECT).not.toContain('purchase_confirmation_message');
    expect(PUBLIC_EVENT_SELECT).not.toContain('purchase_form_schema');
  });
});

describe('public event sorting', () => {
  it('orders upcoming events by canonical start time before the legacy date', () => {
    const calls: string[] = [];
    const query = {
      order: (column: string) => {
        calls.push(column);
        return query;
      },
    };

    applyPublicEventSort(query, 'upcoming');

    expect(calls).toEqual(['starts_at', 'date']);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

function read(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('DG redemption edge-call contracts', () => {
  it('uses callEdgeFunction from Profile redemption surfaces', () => {
    const files = [
      'src/components/profile/DgRedemptionCard.tsx',
      'src/components/profile/UserPayoutAccountCard.tsx',
      'src/pages/AdminDgRedemption.tsx',
      'src/hooks/useUserPayoutAccount.ts',
      'src/hooks/useBanks.ts',
      'src/hooks/useResolveAccount.ts',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('callEdgeFunction');
      expect(source).not.toContain('supabase.functions.invoke');
    }
  });

  it('keeps user-facing copy framed as Redeem DG', () => {
    const source = [
      read('src/components/profile/DgRedemptionCard.tsx'),
      read('src/pages/AdminDgRedemption.tsx'),
    ].join('\n');

    expect(source).toContain('Redeem DG');
    expect(source.toLowerCase()).not.toContain('sell dg');
    expect(source.toLowerCase()).not.toContain('dg sale');
  });

  it('calls GET-only payout account helper functions with GET', () => {
    expect(read('src/hooks/useBanks.ts')).toContain("method: 'GET'");
    expect(read('src/hooks/useResolveAccount.ts')).toContain("method: 'GET'");
  });

  it('keeps resumable user requests and stale expiry reachable from existing pages', () => {
    const profileSource = read('src/components/profile/DgRedemptionCard.tsx');
    const adminSource = read('src/pages/AdminDgRedemption.tsx');

    expect(profileSource).toContain('list-user-dg-redemptions');
    expect(profileSource).toContain('Resume');
    expect(profileSource).toContain('RECENT_REDEMPTIONS_PAGE_SIZE');
    expect(profileSource).toContain('recentPagination');
    expect(profileSource).toContain('max-h-[360px] overflow-y-auto');
    expect(profileSource).toContain('Load More');
    expect(adminSource).toContain('expire-dg-redemption-intents');
    expect(adminSource).toContain('setExpandedId');
  });

  it('keeps Redeem DG previews visible while blocking unavailable quotes', () => {
    const profileSource = read('src/components/profile/DgRedemptionCard.tsx');
    const quoteSource = read('supabase/functions/quote-dg-redemption/index.ts');

    expect(quoteSource).toContain('enforceWalletBalance: false');
    expect(quoteSource).toContain('reason: "wallet_balance"');
    expect(profileSource).toContain('setPreview(data.quote)');
    expect(profileSource).toContain('setPreviewCanRedeem(false)');
    expect(profileSource).toContain('getExplorerTxUrl');
    expect(profileSource).toContain('tx_hash?: string | null');
    expect(profileSource).toContain('Insufficient DG Balance');
    expect(profileSource).toContain('Send exactly {quote.amount_dg} DG to');
    expect(profileSource).toContain('Quote expires in');
    expect(profileSource).toContain('text-2xl font-bold tabular-nums');
    expect(profileSource).toContain('Do not send DG for this expired quote.');
    expect(profileSource).toContain('request_expired_review: true');
    expect(profileSource).toContain('Request Review');
    expect(profileSource).toContain('canRequestExpiredReview');
    expect(profileSource).toContain('canCancelRedemption');
    expect(profileSource).toContain('expiredReviewTarget');
    expect(profileSource).toContain('Already sent after this quote was created?');
    expect(profileSource).toContain('Receive');
    expect(profileSource).toContain('Redeem');
    expect(profileSource).toContain('Transaction hash');
    expect(profileSource).toContain('disabled={isQuoting || !previewCanRedeem}');
    expect(profileSource).toContain('canSubmitTransferForStatus');
    expect(profileSource).toContain('Promise.allSettled');
    expect(profileSource).toContain('notify-dg-redemption-admin');
    expect(profileSource).toContain('Notify Admin');
    expect(profileSource).toContain('getNotifyCooldownMs');
    expect(profileSource).toContain('next_admin_notify_at');
    expect(profileSource).toContain('rememberNotifyCooldowns');
    expect(profileSource).toContain('formatUserReviewMessage');
    expect(profileSource).toContain('Pending admin approval.');
    expect(profileSource).toContain("labels[error] || 'Pending admin review.'");
  });

  it('releases Redeem DG submit locks when network validation fails', () => {
    const source = read('supabase/functions/submit-dg-redemption-transfer/index.ts');

    expect(source).toContain('"network_validation_failed"');
    expect(source).toContain('status: "awaiting_transfer"');
    expect(source).toContain('lock_id: null');
    expect(source).toContain('return json({ ok: false, error: message }, 404)');
  });

  it('accepts expired quote transfers only into manual review after validating quote timing', () => {
    const profileSource = read('src/components/profile/DgRedemptionCard.tsx');
    const submitSource = read('supabase/functions/submit-dg-redemption-transfer/index.ts');
    const sharedSource = read('supabase/functions/_shared/dg-redemption.ts');

    expect(sharedSource).toContain('block_timestamp');
    expect(sharedSource).toContain('provider.getBlock(receipt.blockNumber)');
    expect(sharedSource).toContain('expiresAtMs <= Date.now()');
    expect(submitSource).toContain('requestExpiredTransferReview');
    expect(submitSource).toContain('request_expired_review');
    expect(submitSource).toContain('assertTransferWasAfterQuoteCreated');
    expect(submitSource).toContain('Transaction was made before this Redeem DG quote was created');
    expect(submitSource).toContain('status: "manual_review"');
    expect(submitSource).toContain('last_error: "expired_quote_transfer_submitted"');
    expect(submitSource).toContain('expired_quote_transfer_submitted_for_review');
    expect(submitSource).not.toContain('request_expired_review: false');
    expect(profileSource).toContain('expired_quote_transfer_submitted');
  });

  it('excludes time-expired open quotes from Redeem DG daily quote limits', () => {
    const quoteSource = read('supabase/functions/quote-dg-redemption/index.ts');
    const migrationSource = read('supabase/migrations/20260625143000_exclude_time_expired_dg_quotes_from_limits.sql');

    expect(quoteSource).toContain('countsTowardDailyLimit');
    expect(quoteSource).toContain('.select("gross_ngn_kobo,status,expires_at")');
    expect(quoteSource).toContain('status === "awaiting_transfer" || status === "validating_transfer"');
    expect(quoteSource).toContain('expiresAtMs > nowMs');
    expect(quoteSource).toContain('sumActiveGrossKobo(userDailyUsage.data)');
    expect(quoteSource).toContain('sumActiveGrossKobo(platformDailyUsage.data)');
    expect(migrationSource).toContain("status NOT IN ('awaiting_transfer', 'validating_transfer')");
    expect(migrationSource).toContain('OR expires_at IS NULL');
    expect(migrationSource).toContain('OR expires_at > NOW()');
    expect(migrationSource).toContain('GRANT EXECUTE ON FUNCTION public.create_dg_redemption_intent');
  });

  it('moves validated Redeem DG transfers to admin review when Paystack payout fails', () => {
    const submitSource = read('supabase/functions/submit-dg-redemption-transfer/index.ts');
    const statusSource = read('supabase/functions/get-dg-redemption-status/index.ts');
    const webhookSource = read('supabase/functions/paystack-transfer-webhook/index.ts');
    const retrySource = read('supabase/functions/retry-dg-redemption-payout/index.ts');

    expect(submitSource).toContain('status: "manual_review"');
    expect(submitSource).toContain('"paystack_transfer_admin_review_required"');
    expect(submitSource).toContain('failedStatus: "manual_review"');
    expect(statusSource).toContain('failedStatus: "manual_review"');
    expect(webhookSource).toContain('failedStatus: "manual_review"');
    expect(retrySource).toContain('failedStatus: "manual_review"');
    expect(retrySource).toContain('status: "manual_review"');
    expect(submitSource).not.toContain('"paystack_transfer_failed"');
  });

  it('lets users notify admins for reviewed Redeem DG requests with cooldown', () => {
    const source = read('supabase/functions/notify-dg-redemption-admin/index.ts');
    const sharedSource = read('supabase/functions/_shared/dg-redemption.ts');

    expect(source).toContain('OPS_ALERT_EMAIL');
    expect(sharedSource).toContain('DG_REDEMPTION_NOTIFY_ADMIN_COOLDOWN_SECONDS');
    expect(source).toContain('getNextDgRedemptionAdminNotifyAt');
    expect(source).toContain('user_admin_notification_sent');
    expect(source).toContain('String(intent.status) !== "manual_review"');
    expect(source).not.toContain('.update({');
    expect(source).toContain('sendEmail');
    expect(sharedSource).toContain('next_admin_notify_at');
  });

  it('keeps admin notification cooldowns visible on redemption reads', () => {
    const statusSource = read('supabase/functions/get-dg-redemption-status/index.ts');
    const listSource = read('supabase/functions/list-user-dg-redemptions/index.ts');
    const sharedSource = read('supabase/functions/_shared/dg-redemption.ts');

    expect(listSource).toContain('url.searchParams.get("limit")');
    expect(listSource).toContain('url.searchParams.get("offset")');
    expect(listSource).toContain('clampInteger');
    expect(listSource).toContain('.range(offset, offset + limit - 1)');
    expect(listSource).toContain('pagination:');
    expect(listSource).toContain('has_more');
    expect(statusSource).toContain('publicDgRedemptionIntentWithAdminNotify');
    expect(listSource).toContain('publicDgRedemptionIntentWithAdminNotify');
    expect(statusSource).toContain('normalizeValidatedDgRedemptionFailure');
    expect(listSource).toContain('normalizeValidatedDgRedemptionFailure');
    expect(sharedSource).toContain('validated_failure_moved_to_manual_review');
    expect(sharedSource).toContain('.eq("event_type", "transfer_validated")');
  });

  it('only reconciles Paystack transfers after Paystack has created a transfer', () => {
    const source = read('supabase/functions/get-dg-redemption-status/index.ts');

    expect(source).toContain('PAYSTACK_RECONCILABLE_STATUSES');
    expect(source).toContain('!(intent.paystack_transfer_code || intent.paystack_transfer_id)');
  });

  it('exposes guarded admin resolution actions with responsive controls', () => {
    const adminSource = read('src/pages/AdminDgRedemption.tsx');
    const resolveSource = read('supabase/functions/admin-resolve-dg-redemption/index.ts');

    expect(adminSource).toContain('TooltipProvider');
    expect(adminSource).toContain('overflow-x-auto');
    expect(adminSource).toContain('min-w-[1080px]');
    expect(adminSource).toContain('Mark manually paid');
    expect(adminSource).toContain('admin-resolve-dg-redemption');
    expect(adminSource).toContain('Copy transaction hash');
    expect(adminSource).not.toContain('Keep under review');
    expect(adminSource).toContain("expired_quote_transfer_submitted: 'Expired quote transfer submitted'");
    expect(adminSource).toContain('displayRowStatus');
    expect(resolveSource).toContain('ensureAdmin');
    expect(resolveSource).toContain('isDgRedemptionManuallyPayable');
    expect(resolveSource).toContain('active Paystack transfer');
    expect(resolveSource).toContain('action !== "mark_paid"');
    expect(resolveSource).toContain('admin_marked_manual_paid');
    expect(resolveSource).toContain('status: "completed"');
    expect(resolveSource).toContain('.not("tx_hash", "is", null)');
    expect(resolveSource).toContain('.eq("paystack_status", intent.paystack_status)');
    expect(resolveSource).toContain('.eq("paystack_transfer_code", intent.paystack_transfer_code)');
    expect(resolveSource).toContain('.eq("paystack_transfer_id", intent.paystack_transfer_id)');
    expect(adminSource).toContain('PAYSTACK_ACTIVE_STATUSES');
    expect(adminSource).toContain('PAYSTACK_TERMINAL_FAILURE_STATUSES');
    expect(adminSource).toContain('isPaystackTransferActive(row.paystack_status)');
    expect(adminSource).toContain('paystack_transfer_abandoned');
    expect(adminSource).toContain('paystack_transfer_rejected');
    expect(adminSource).toContain('paystack_transfer_blocked');
  });

  it('supports guarded Paystack OTP finalization without duplicating payout status mapping', () => {
    const adminSource = read('src/pages/AdminDgRedemption.tsx');
    const dashboardSource = read('supabase/functions/get-dg-redemption-admin-dashboard/index.ts');
    const otpSource = read('supabase/functions/manage-dg-redemption-transfer-otp/index.ts');
    const paystackSource = read('supabase/functions/_shared/paystack.ts');

    expect(paystackSource).toContain('finalizePaystackTransfer');
    expect(paystackSource).toContain('/transfer/finalize_transfer');
    expect(paystackSource).toContain('resendPaystackTransferOtp');
    expect(paystackSource).toContain('/transfer/resend_otp');
    expect(paystackSource).toContain('reason: "transfer" | "resend_otp" | "disable_otp"');
    expect(dashboardSource).toContain('paystack_transfer_code');
    expect(dashboardSource).toContain('paystack_transfer_id');
    expect(otpSource).toContain('ensureAdmin');
    expect(otpSource).toContain('String(intent.status) !== "manual_review"');
    expect(otpSource).toContain('String(intent.paystack_status || "").toLowerCase() !== "otp"');
    expect(otpSource).toContain('paystackTransferUpdateValues({ transfer: finalized.data, failedStatus: "manual_review" })');
    expect(otpSource).toContain('verifyPaystackTransfer(intent.paystack_reference)');
    expect(otpSource).toContain('isStalePaystackOtpStateError');
    expect(otpSource).toContain('paystackOtpErrorStatus');
    expect(otpSource).toContain('admin_reconciled_stale_paystack_otp');
    expect(otpSource).toContain('admin_resend_paystack_transfer_otp_failed');
    expect(otpSource).toContain('reason: "transfer"');
    expect(otpSource).not.toContain('reason: "resend_otp"');
    expect(otpSource).toContain('admin_finalized_paystack_transfer_otp');
    expect(otpSource).toContain('admin_resent_paystack_transfer_otp');
    expect(adminSource).toContain('manage-dg-redemption-transfer-otp');
    expect(adminSource).toContain('Finalize Paystack OTP');
    expect(adminSource).toContain('Resend OTP');
    expect(adminSource).toContain('canFinalizeOtp');
    expect(adminSource).toContain('!isPaystackTransferActive(row.paystack_status)');
  });

  it('rotates Paystack references before retrying terminal failed transfer attempts', () => {
    const retrySource = read('supabase/functions/retry-dg-redemption-payout/index.ts');
    const sharedSource = read('supabase/functions/_shared/dg-redemption.ts');

    expect(sharedSource).toContain('isPaystackTransferTerminalFailureStatus');
    expect(sharedSource).toContain('isPaystackTransferActiveStatus');
    expect(sharedSource).toContain('isDgRedemptionManuallyPayable');
    expect(sharedSource).toContain('"otp", "pending", "received", "queued", "processing"');
    expect(sharedSource).toContain('paystackStatus === "success"');
    expect(sharedSource).toContain('"abandoned"');
    expect(sharedSource).toContain('"rejected"');
    expect(sharedSource).toContain('"blocked"');
    expect(sharedSource).toContain('paystackTransferFailureReason');
    expect(retrySource).toContain('needsFreshPaystackReference');
    expect(retrySource).toContain('String(intent.status) === "manual_review" && isPaystackTransferTerminalFailureStatus(intent.paystack_status)');
    expect(retrySource).toContain('let rotateReference = needsFreshPaystackReference(intent)');
    expect(retrySource).toContain('rotateReference = true');
    expect(retrySource).toContain('parseReferenceId("dgr_retry")');
    expect(retrySource).toContain('admin_retry_reference_rotated');
  });
});

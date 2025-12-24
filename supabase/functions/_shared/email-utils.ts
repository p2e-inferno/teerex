/* deno-lint-ignore-file no-explicit-any */
/**
 * Email utility for sending transactional emails via Mailgun
 * Uses native fetch API with Basic Auth - no external dependencies
 */

// Type declaration for Deno global (edge function runtime)
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { EMAIL_REGEX } from './constants.ts';
import { stripHtml, truncateText } from './html-utils.ts';

/**
 * Normalize and validate an email address.
 * Returns lowercased/trimmed email or null if invalid/empty.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  return EMAIL_REGEX.test(lowered) ? lowered : null;
}

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
  testMode?: boolean;
}

export interface EmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email via Mailgun API
 * @param options Email configuration
 * @returns Result with ok status and messageId or error
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html, tags = [], testMode } = options;

  // Validate email format
  if (!EMAIL_REGEX.test(to)) {
    console.error('[EMAIL] Invalid email address:', to);
    return { ok: false, error: 'Invalid email address' };
  }

  // Get Mailgun configuration from environment
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_FROM = Deno.env.get('MAILGUN_FROM');
  const MAILGUN_API_URL = Deno.env.get('MAILGUN_API_URL') ?? 'https://api.mailgun.net';
  const MAILGUN_TEST_MODE = Deno.env.get('MAILGUN_TEST_MODE') === 'true';

  if (!MAILGUN_DOMAIN || !MAILGUN_API_KEY || !MAILGUN_FROM) {
    console.error('[EMAIL] Missing Mailgun configuration (MAILGUN_DOMAIN, MAILGUN_API_KEY, or MAILGUN_FROM)');
    return { ok: false, error: 'Email service not configured' };
  }

  // Build FormData for Mailgun API
  const formData = new FormData();
  formData.append('from', MAILGUN_FROM);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('text', text);

  if (html) {
    formData.append('html', html);
  }

  // Add tags for filtering/analytics
  tags.forEach(tag => formData.append('o:tag', tag));

  // Enable test mode if requested or configured globally
  if (testMode || MAILGUN_TEST_MODE) {
    formData.append('o:testmode', 'yes');
  }

  try {
    // Send via Mailgun API using Basic Auth
    const response = await fetch(
      `${MAILGUN_API_URL}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EMAIL] Mailgun API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return { ok: false, error: `Mailgun error: ${response.status}` };
    }

    const data = await response.json();
    console.log('[EMAIL] Email sent successfully:', {
      to,
      messageId: data.id,
      message: data.message, // "Queued. Thank you."
      testMode: testMode || MAILGUN_TEST_MODE,
    });

    return { ok: true, messageId: data.id };
  } catch (error) {
    console.error('[EMAIL] Network error while sending email:', error);
    return { ok: false, error: (error as Error).message };
  }
}

// Shared styles for consistency
const BRAND_COLOR = '#8B5CF6'; // TeeRex Purple
const BG_COLOR = '#F3F4F6';
const TEXT_COLOR = '#1F2937';
const LOGO_WIDTH = '140'; // px

/**
 * Helper to generate the common HTML wrapper
 */
function wrapHtmlContent(title: string, bodyContent: string) {
  // TODO: Replace with actual TeeRex logo URL after uploading to CDN/public storage
  const logoUrl = Deno.env.get('TEEREX_LOGO_URL') || 'https://via.placeholder.com/140x40/8B5CF6/FFFFFF?text=TeeRex';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${BG_COLOR}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BG_COLOR}; padding: 40px 0;">
        <tr>
          <td align="center">
            <!-- Main Container -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; margin: 0 auto;">

              <!-- Header / Logo -->
              <tr>
                <td align="center" style="padding: 30px 40px; border-bottom: 1px solid #f0f0f0;">
                  <img src="${logoUrl}" alt="TeeRex" width="${LOGO_WIDTH}" style="display: block; width: ${LOGO_WIDTH}px; height: auto; border: 0;" />
                </td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 40px 40px;">
                  ${bodyContent}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding: 0 40px 30px; color: #9CA3AF; font-size: 12px;">
                  <p style="margin: 0;">&copy; ${new Date().getFullYear()} TeeRex. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Generate ticket confirmation email content
 */
export function getTicketEmail(
  eventTitle: string,
  eventDate: string,
  txHash?: string,
  chainId?: number,
  explorerUrl?: string
) {
  const txLinkHtml = txHash && explorerUrl
    ? `
      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #E5E7EB;">
        <p style="margin: 0 0 8px; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">Transaction Details</p>
        <a href="${explorerUrl}" style="color: ${BRAND_COLOR}; text-decoration: none; font-size: 14px; word-break: break-all;">View on Explorer &rarr;</a>
      </div>`
    : '';

  const bodyHtml = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">You're Going! 🎟️</h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #4B5563; text-align: center;">
      Your ticket for <strong>${eventTitle}</strong> has been successfully issued and confirmed on the blockchain.
    </p>

    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 12px; color: #6B7280; text-transform: uppercase;">Event</p>
      <p style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: ${TEXT_COLOR};">${eventTitle}</p>

      <p style="margin: 0 0 4px; font-size: 12px; color: #6B7280; text-transform: uppercase;">Date</p>
      <p style="margin: 0; font-size: 16px; font-weight: 500; color: ${TEXT_COLOR};">${eventDate}</p>
    </div>

    ${txLinkHtml}
  `;

  return {
    subject: `Ticket Confirmed: ${eventTitle}`,
    text: `Your ticket for ${eventTitle} is confirmed.\n\nDate: ${eventDate}\n\n${txHash && explorerUrl ? `View Transaction: ${explorerUrl}` : ''}\n\nThank you for using TeeRex!`,
    html: wrapHtmlContent(`Your Ticket for ${eventTitle}`, bodyHtml),
  };
}

/**
 * Generate waitlist confirmation email content
 */
export function getWaitlistConfirmationEmail(
  eventTitle: string,
  eventDate: string
) {
  const bodyHtml = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">You're on the Waitlist ✅</h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #4B5563; text-align: center;">
      You have successfully joined the waitlist for <strong>${eventTitle}</strong>. We will notify you immediately via email if a spot opens up.
    </p>

    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 12px; color: #6B7280; text-transform: uppercase;">Event Details</p>
      <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: ${TEXT_COLOR};">${eventTitle}</p>
      <p style="margin: 0; font-size: 14px; color: #6B7280;">${eventDate}</p>
    </div>
  `;

  return {
    subject: `Waitlist Confirmed: ${eventTitle}`,
    text: `You've successfully joined the waitlist for ${eventTitle} on ${eventDate}.\n\nWe'll notify you when spots become available.\n\nThank you for using TeeRex!`,
    html: wrapHtmlContent(`Waitlist Confirmed for ${eventTitle}`, bodyHtml),
  };
}

/**
 * Generate waitlist spot available email content
 */
export function getWaitlistSpotOpenEmail(
  eventTitle: string,
  eventDate: string,
  eventUrl: string
) {
  const bodyHtml = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">A Spot Opened Up! 🚀</h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #4B5563; text-align: center;">
      Good news! A ticket is now available for <strong>${eventTitle}</strong>. These spots are first-come, first-served.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${eventUrl}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Secure Your Ticket</a>
    </div>

    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #6B7280;">
        Event Date: <span style="color: ${TEXT_COLOR}; font-weight: 500;">${eventDate}</span>
      </p>
    </div>
  `;

  return {
    subject: `Action Required: Spot available for ${eventTitle}`,
    text: `Good news! A spot is now available for ${eventTitle} on ${eventDate}.\n\nGet your ticket now: ${eventUrl}\n\nThank you for using TeeRex!`,
    html: wrapHtmlContent(`Spot Available for ${eventTitle}`, bodyHtml),
  };
}

/**
 * Generate allow list approval email content
 */
export function getAllowListApprovalEmail(
  eventTitle: string,
  eventDate: string,
  eventUrl: string
) {
  const bodyHtml = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">You're Approved 🎟️</h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #4B5563; text-align: center;">
      You've been approved to purchase tickets for <strong>${eventTitle}</strong>.
    </p>

    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <p style="margin: 0 0 4px; font-size: 12px; color: #6B7280; text-transform: uppercase;">Event</p>
      <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: ${TEXT_COLOR};">${eventTitle}</p>
      <p style="margin: 0; font-size: 14px; color: #6B7280;">${eventDate}</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${eventUrl}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
        Get Your Ticket
      </a>
    </div>
  `;

  return {
    subject: `Approved for ${eventTitle}`,
    text: `You have been approved to purchase tickets for ${eventTitle} on ${eventDate}.\n\nGet your ticket here: ${eventUrl}`,
    html: wrapHtmlContent(`Approved for ${eventTitle}`, bodyHtml),
  };
}

/**
 * Generate post notification email content
 */
export function getPostNotificationEmail(
  eventTitle: string,
  eventUrl: string,
  postContent: string,
  postedAt?: string,
  posterName?: string
) {
  // 1. Use the robust utilities
  // Strip HTML first to get clean text, then smart-truncate
  const cleanText = stripHtml(postContent || '');
  const preview = truncateText(cleanText, 240); // 240 chars is a good email preview length
  
  // 2. Better Date Formatting
  // Using a cleaner date format (Month Day, Year) if available
  const dateStr = postedAt 
    ? new Date(postedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const subtitle = posterName 
    ? `Posted by <strong>${posterName}</strong>` 
    : 'New update from the event team';

  const bodyHtml = `
    <!-- Header Section (Centered) -->
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${TEXT_COLOR}; text-align: center;">New Update 📢</h1>
    <p style="margin: 0 0 8px; font-size: 16px; color: ${TEXT_COLOR}; text-align: center;">
      There is a new post for <strong>${eventTitle}</strong>.
    </p>
    
    <!-- Metadata (Date) -->
    ${dateStr ? `<p style="margin: 0 0 24px; font-size: 14px; color: #9CA3AF; text-align: center;">${dateStr}</p>` : ''}

    <!-- Content Preview Card -->
    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: left;">
      <p style="margin: 0 0 12px; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">
        ${subtitle}
      </p>
      <p style="margin: 0; font-size: 15px; line-height: 24px; color: ${TEXT_COLOR};">
        "${preview || 'A new post was published.'}"
      </p>
    </div>

    <!-- CTA Button (Centered) -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${eventUrl}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
        Read Full Post
      </a>
    </div>
  `;

  return {
    subject: `Update: ${eventTitle}`, // Slightly punchier subject
    // Text version now includes the preview and the specific poster info
    text: `New update for ${eventTitle}.\n\n"${preview}"\n\nRead more: ${eventUrl}`,
    html: wrapHtmlContent(`New update for ${eventTitle}`, bodyHtml),
  };
}

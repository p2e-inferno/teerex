/* deno-lint-ignore-file no-explicit-any */

/**
 * HTML Utilities for Edge Functions
 * Optimized for performance, Unicode safety, and formatting preservation.
 */

// 1. Module-level constants for performance
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  // Currencies
  '&cent;': '¢', '&pound;': '£', '&yen;': '¥', '&euro;': '€',
  // Copyright/Symbols
  '&copy;': '©', '&reg;': '®', '&trade;': '™',
  // Punctuation
  '&hellip;': '…', '&mdash;': '—', '&ndash;': '–',
  '&ldquo;': '"', '&rdquo;': '"', '&lsquo;': "'", '&rsquo;': "'",
  '&bull;': '•', '&middot;': '·',
  // Fractions/Math
  '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾',
  '&deg;': '°', '&plusmn;': '±', '&times;': '×', '&divide;': '÷',
  // Common Accents
  '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã', '&Auml;': 'Ä',
  '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä',
  '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
  '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
  '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
  '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
  '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ', '&Ouml;': 'Ö',
  '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö',
  '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
  '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
  '&Ntilde;': 'Ñ', '&ntilde;': 'ñ', '&Ccedil;': 'Ç', '&ccedil;': 'ç',
};

// 2. Escape function for Regex safety (in case entities contain special chars)
const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 3. Compile Regex once
const ENTITY_REGEX = new RegExp(
  Object.keys(HTML_ENTITIES).map(escapeRegex).join('|'),
  'g'
);

/**
 * Strips all HTML tags and decodes HTML entities from a string
 * Preserves paragraph structure by converting block elements to newlines
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  let text = html;

  // 1. Remove script/style/title tags with content
  text = text.replace(/<(script|style|title)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Convert block elements to newlines
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|article|section|pre)>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // 4. Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Decode entities
  text = decodeHtmlEntities(text);

  // 6. Whitespace cleanup (Corrected Logic)
  text = text.replace(/\u00A0/g, ' ');           // Non-breaking spaces to normal
  text = text.replace(/[ \t]+/g, ' ');           // Collapse horizontal spaces
  text = text.replace(/^\s+|\s+$/gm, '');        // Trim individual lines

  // Collapse 3+ newlines to 2 (Preserves paragraphs, removes huge gaps)
  // This must be done AFTER trimming lines to catch " \n " scenarios
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Decodes common HTML entities to their corresponding characters
 */
export function decodeHtmlEntities(text: string): string {
  let decoded = text;

  // 1. Named entities
  decoded = decoded.replace(ENTITY_REGEX, (match) => HTML_ENTITIES[match]);

  // 2. Numeric entities (decimal)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    try {
      const code = parseInt(dec, 10);
      return isValidCodePoint(code) ? String.fromCodePoint(code) : _;
    } catch {
      return _;
    }
  });

  // 3. Hex entities
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return isValidCodePoint(code) ? String.fromCodePoint(code) : _;
    } catch {
      return _;
    }
  });

  return decoded;
}

function isValidCodePoint(code: number): boolean {
  return code >= 0 && code <= 0x10FFFF;
}

export function truncateText(
  text: string,
  maxLength: number = 500,
  ellipsis: string = '...'
): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;

  // Safety check for small limits
  if (maxLength <= ellipsis.length) {
    return ellipsis.slice(0, maxLength);
  }

  const targetLength = maxLength - ellipsis.length;
  let truncated = text.slice(0, targetLength);

  // Word boundary detection
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > targetLength * 0.8) {
    truncated = truncated.slice(0, lastSpace);
  }

  return truncated + ellipsis;
}

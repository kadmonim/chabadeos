// Phone parsing/formatting: pure functions, no DB imports, safe for islands.

const ISRAELI_LANDLINE_AREA = new Set(['02', '03', '04', '08', '09']);

/** Group digits 3-3-rest for display, best effort (used for non-Israeli numbers). */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const parts: string[] = [];
  let rest = digits;
  parts.push(rest.slice(0, 3));
  rest = rest.slice(3);
  parts.push(rest.slice(0, 3));
  rest = rest.slice(3);
  if (rest) parts.push(rest);
  return parts.join('-');
}

/**
 * Normalise a human-typed phone number.
 * examples:
 *   normalizePhone('050-123 4567')   → { e164: '+972501234567', display: '050-123-4567' }
 *   normalizePhone('03-6161616')     → { e164: '+97236161616', display: '03-616-1616' }
 *   normalizePhone('+1 212 555 0100')→ { e164: '+12125550100', display: '+1 212-555-0100' }
 *   normalizePhone('abc')            → { e164: null, display: 'abc' }
 */
export function normalizePhone(input: string | null | undefined): { e164: string | null; display: string | null } {
  const raw = (input ?? '').trim();
  if (!raw) return { e164: null, display: null };

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');

  // 00972XXXXXXXXX / 972XXXXXXXXX / +972XXXXXXXXX -> national significant number
  let national: string | null = null;
  if (digits.startsWith('00972')) national = digits.slice(5);
  else if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 12) national = digits.slice(3);
  // 05XXXXXXXX (10 digits, leading 0) mobile
  else if (/^05\d{8}$/.test(digits)) national = digits.slice(1);
  // 5XXXXXXXX (9 digits, leading 5) mobile, no leading 0
  else if (/^5\d{8}$/.test(digits)) national = digits;
  // 0X-XXXXXXX landlines: 9 digits including leading 0, area code 02/03/04/08/09
  else if (digits.length === 9 && digits[0] === '0' && ISRAELI_LANDLINE_AREA.has(digits.slice(0, 2)))
    national = digits.slice(1);

  if (national !== null) {
    const result = israeliFromNational(national);
    if (result) return result;
  }

  // Non-Israeli international number
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { e164: `+${digits}`, display: formatIntl(digits) };
  }

  return fallback(raw, digits, hasPlus);
}

// Builds the +972 e164/display pair from a national number (no leading 0, no country code).
function israeliFromNational(national: string): { e164: string; display: string } | null {
  if (national.startsWith('5') && national.length === 9) {
    // mobile: 5XX-XXX-XXXX (displayed with leading 0)
    const d = '0' + national;
    return { e164: `+972${national}`, display: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` };
  }
  if (national.length === 8) {
    // landline: 0X-XXX-XXXX
    const d = '0' + national;
    return { e164: `+972${national}`, display: `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` };
  }
  return null;
}

function formatIntl(digits: string): string {
  // best-effort: assume 1-3 digit country code isn't separable without a table,
  // so group everything after the first 1-2 digits (kept simple per contract).
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : digits.slice(0, 1);
  const rest = digits.slice(cc.length);
  return `+${cc} ${groupDigits(rest)}`;
}

function fallback(raw: string, digits: string, hasPlus: boolean): { e164: string | null; display: string | null } {
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { e164: `+${digits}`, display: formatIntl(digits) };
  }
  return { e164: null, display: raw.trim() || null };
}

/** https://wa.me/<digits without +> */
export function whatsappUrl(e164: string): string {
  return `https://wa.me/${e164.replace(/[^\d]/g, '')}`;
}

/** tel:<e164> */
export function telUrl(e164: string): string {
  return `tel:${e164}`;
}

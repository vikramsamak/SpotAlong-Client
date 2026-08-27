import { getCookiesPromised } from 'chrome-cookies-secure';

export interface CookieScanResult {
  spTCookie: string | null;
  reason?: string;
}

export type CookieScanReason =
  | 'chrome-not-found'
  | 'chrome-locked'
  | 'cookie-not-found'
  | 'unsupported-platform';

/**
 * Reads the sp_t cookie from the local Chrome cookie store, mirroring the
 * Python client's browser_scraper behaviour. Requires SpotAlong's server to
 * run on the same machine as the user's Chrome profile.
 */
export async function getSpotifySPTCookie(): Promise<CookieScanResult> {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return { spTCookie: null, reason: 'unsupported-platform' };
  }

  try {
    const cookies = await getCookiesPromised('https://open.spotify.com', 'object');
    const spT = cookies['sp_t'];
    if (!spT) {
      return { spTCookie: null, reason: 'cookie-not-found' };
    }
    return { spTCookie: spT };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Chromium >= 92 refuses to open the cookie DB while Chrome is running
    // ("database is locked" / SQLITE_BUSY).
    if (/locked|busy|database is (in use|locked)/i.test(message)) {
      return { spTCookie: null, reason: 'chrome-locked' };
    }
    if (/ENOENT|no such file|not found/i.test(message)) {
      return { spTCookie: null, reason: 'chrome-not-found' };
    }
    return { spTCookie: null, reason: message };
  }
}

const COOKIE_REASON_MESSAGES: Partial<Record<string, string>> = {
  'chrome-not-found': 'Chrome is not installed or its cookie store could not be found.',
  'chrome-locked': 'Chrome is currently running. Close Chrome and try again, or enter the sp_t cookie manually.',
  'cookie-not-found':
    'No sp_t cookie found. Open open.spotify.com in Chrome and make sure you are logged in, then close Chrome and try again.'
};

export function describeCookieScanFailure(reason: string | undefined): string {
  if (reason && COOKIE_REASON_MESSAGES[reason]) return COOKIE_REASON_MESSAGES[reason];
  return `Could not read the sp_t cookie from Chrome${reason ? ` (${reason})` : ''}.`;
}

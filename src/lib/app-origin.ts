/**
 * Trusted app origins.
 *
 * Never trust a client-supplied `origin` when building links that end up in
 * emails or Supabase `redirectTo` URLs: an attacker could point a recovery or
 * notification link at their own site. Every caller must run the value through
 * `safeAppOrigin()`, which only accepts our own hosts and otherwise falls back
 * to the canonical production URL.
 */

export const CANONICAL_APP_ORIGIN = "https://tasks.helenofhealth.com";

function isTrustedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "tasks.helenofhealth.com") return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  // Lovable preview / published hosts, e.g. hoh-tasks.lovable.app
  if (host === "lovable.app" || host.endsWith(".lovable.app")) return true;
  if (host.endsWith(".lovableproject.com")) return true;
  return false;
}

/**
 * Returns a trusted base URL (no trailing slash) for building app links.
 * Untrusted or malformed input silently falls back to the canonical origin.
 */
export function safeAppOrigin(origin: unknown): string {
  if (typeof origin !== "string" || !origin.trim()) return CANONICAL_APP_ORIGIN;
  let url: URL;
  try {
    url = new URL(origin.trim());
  } catch {
    return CANONICAL_APP_ORIGIN;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return CANONICAL_APP_ORIGIN;
  if (!isTrustedHost(url.hostname)) return CANONICAL_APP_ORIGIN;
  return `${url.protocol}//${url.host}`;
}

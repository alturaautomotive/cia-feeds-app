/**
 * SSRF (Server-Side Request Forgery) defense for outbound fetches against
 * user-controlled URLs (SECURITY_AUDIT.md F-5.5).
 *
 * Threat model: a dealer can save an arbitrary website URL on their profile
 * (Dealer.websiteUrl, Listing.scrapeUrl, etc.). Cron jobs and crawlers then
 * fetch those URLs server-side. Without validation, an attacker can point a
 * dealer record at:
 *   - http://169.254.169.254/latest/meta-data/   (AWS instance metadata)
 *   - http://metadata.google.internal/...        (GCP)
 *   - http://localhost:5432/                     (internal services)
 *   - http://10.0.0.5/...  / 172.16.0.5/...      (RFC1918 private space)
 *   - file:///etc/passwd                         (non-HTTP schemes)
 *
 * We reject these before any fetch by:
 *   1. Requiring scheme ∈ {http, https}
 *   2. Rejecting raw IPs in the hostname (force DNS names so cloud metadata
 *      addresses can't be hit directly)
 *   3. Rejecting a blocklist of known internal hostnames
 *   4. Optionally resolving DNS to confirm the hostname doesn't map to a
 *      private/loopback IP. We do this lazily because DNS adds latency; for
 *      most callers, the hostname check + scheme check is sufficient.
 *
 * Returns a `safeFetch` wrapper that also enforces:
 *   - a max response size (default 5 MB) to prevent decompression bombs
 *   - a timeout (default 10s) via AbortSignal
 *   - no redirect-following to attacker-controlled locations: redirects are
 *     re-validated against the same SSRF rules.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_IPV4_PREFIXES = [
  "10.",        // RFC1918
  "127.",       // loopback
  "169.254.",   // link-local / AWS+GCP metadata
  "192.168.",   // RFC1918
  "0.",         // "this network"
  "100.64.",    // CGNAT
];

function isPrivateIPv4(ip: string): boolean {
  if (BLOCKED_IPV4_PREFIXES.some((p) => ip.startsWith(p))) return true;
  // 172.16.0.0/12
  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:") ||
    lower.startsWith("::ffff:") // IPv4-mapped: re-check the v4 part if needed
  );
}

export interface SafeUrlOptions {
  /** Whether to perform a DNS resolution check (default false). */
  resolveDns?: boolean;
}

export interface SafeUrlResult {
  ok: boolean;
  reason?: string;
  /** Resolved IP, set when resolveDns:true and resolution succeeded. */
  resolvedIp?: string;
}

/**
 * Validate that a URL is safe to fetch from the server. Returns
 * `{ ok: false, reason }` if not.
 */
export async function isSafeUrl(
  raw: string,
  opts: SafeUrlOptions = {}
): Promise<SafeUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "blocked_hostname" };
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    if (isPrivateIPv4(host)) return { ok: false, reason: "private_ipv4" };
    // Also reject literal IPs in user-supplied URLs as a defense-in-depth
    // measure: legitimate dealer websites always have DNS names.
    return { ok: false, reason: "literal_ip_not_allowed" };
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(host)) return { ok: false, reason: "private_ipv6" };
    return { ok: false, reason: "literal_ip_not_allowed" };
  }

  if (opts.resolveDns) {
    try {
      const { address, family } = await lookup(host);
      if (family === 4 && isPrivateIPv4(address)) {
        return { ok: false, reason: "dns_resolves_private_ipv4", resolvedIp: address };
      }
      if (family === 6 && isPrivateIPv6(address)) {
        return { ok: false, reason: "dns_resolves_private_ipv6", resolvedIp: address };
      }
      return { ok: true, resolvedIp: address };
    } catch {
      return { ok: false, reason: "dns_resolution_failed" };
    }
  }

  return { ok: true };
}

export interface SafeFetchOptions extends RequestInit {
  /** Default 10s. */
  timeoutMs?: number;
  /** Default 5 MB. */
  maxBytes?: number;
  /** Default true \u2014 follow redirects manually with SSRF check at each hop. */
  followRedirects?: boolean;
  /** Default 5. */
  maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * SSRF-safe fetch with size + time bounds.
 *
 * Throws on:
 *  - invalid/blocked URL (including post-redirect URLs)
 *  - timeout
 *  - response body exceeding maxBytes
 *
 * Note: this does NOT cover DNS rebinding attacks (where a hostname's IP
 * changes between resolution and connection). For high-risk callers, gate
 * outbound fetches behind a separate egress proxy with a static block-list
 * \u2014 e.g. Cloudflare Tunnel + WARP, or AWS NAT with route filters.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    followRedirects = true,
    maxRedirects = 5,
    ...init
  } = options;

  let current = url;
  let redirects = 0;
  while (true) {
    const validation = await isSafeUrl(current);
    if (!validation.ok) {
      throw new Error(`unsafe_url: ${validation.reason} (${current})`);
    }

    const res = await fetch(current, {
      ...init,
      redirect: "manual", // we follow ourselves so we can re-validate each hop
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 3xx handling
    if (res.status >= 300 && res.status < 400 && followRedirects) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      if (++redirects > maxRedirects) {
        throw new Error(`too_many_redirects: ${redirects}`);
      }
      // Resolve relative redirects against current.
      current = new URL(loc, current).toString();
      continue;
    }

    // Enforce response size limit by reading the body in chunks.
    // We need to clone-and-cap so callers still get a normal Response back.
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > maxBytes) {
      throw new Error(`response_too_large: ${cl} bytes`);
    }
    if (!res.body) return res;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch {}
          throw new Error(`response_too_large: >${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return new Response(buf, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }
}

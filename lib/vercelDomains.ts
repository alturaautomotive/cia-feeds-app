/**
 * Thin wrapper around Vercel's Domains API.
 *
 * Used by /api/dealer/domain to attach/verify/detach custom domains pointed
 * at the cia-feeds-app project. Documentation:
 *   https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
 *
 * Required env vars:
 *   VERCEL_API_TOKEN     — token with project-write scope. Create at
 *                          https://vercel.com/account/tokens (full account scope).
 *   VERCEL_PROJECT_ID    — e.g. "prj_8VRRUgY9ZYu3S4ZHoxazXIOxYVFe"
 *   VERCEL_TEAM_ID       — e.g. "team_8YDkWKTG7cgBL3nVVzjn1B07"
 *
 * If any of those are missing, the helpers throw `VercelDomainsNotConfigured`
 * — callers should catch and fall back to saving Dealer.customDomain
 * without attempting the Vercel-side attachment (so the field can still be
 * set in dev or before the token is provisioned).
 */

const API_BASE = "https://api.vercel.com";

export class VercelDomainsNotConfigured extends Error {
  constructor() {
    super("VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID env vars not set");
    this.name = "VercelDomainsNotConfigured";
  }
}

export class VercelApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Vercel API ${status}: ${body.slice(0, 200)}`);
    this.name = "VercelApiError";
  }
}

function getConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId || !teamId) throw new VercelDomainsNotConfigured();
  return { token, projectId, teamId };
}

async function call(
  path: string,
  init: RequestInit & { qp?: Record<string, string> } = {}
): Promise<unknown> {
  const { token, teamId } = getConfig();
  const qp = new URLSearchParams({ teamId, ...(init.qp ?? {}) });
  const res = await fetch(`${API_BASE}${path}?${qp}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  if (!res.ok) throw new VercelApiError(res.status, body);
  return body ? JSON.parse(body) : null;
}

export interface VercelDomainStatus {
  name: string;
  verified: boolean;
  /** DNS records the user must add for verification. */
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  /** True if a TLS cert is provisioned. */
  hasCertificate?: boolean;
}

/**
 * Attach a domain to the cia-feeds-app project. Vercel handles cert provisioning
 * automatically once DNS resolves.
 *
 * Idempotent: if the domain is already attached, returns its current status.
 */
export async function attachDomainToProject(domain: string): Promise<VercelDomainStatus> {
  const { projectId } = getConfig();
  try {
    await call(`/v10/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
  } catch (err) {
    if (err instanceof VercelApiError && (err.status === 409 || err.body.includes("domain_already_in_use"))) {
      // Already attached — fine, just fetch status.
    } else {
      throw err;
    }
  }
  return getDomainStatus(domain);
}

export async function getDomainStatus(domain: string): Promise<VercelDomainStatus> {
  const { projectId } = getConfig();
  const data = (await call(`/v9/projects/${projectId}/domains/${domain}`)) as {
    name: string;
    verified: boolean;
    verification?: VercelDomainStatus["verification"];
  };
  // Cert status comes from a separate endpoint; do a best-effort fetch.
  let hasCertificate: boolean | undefined;
  try {
    const cert = (await call(`/v6/domains/${domain}/certificate`)) as { cns?: string[] };
    hasCertificate = Array.isArray(cert?.cns) && cert.cns.length > 0;
  } catch {
    hasCertificate = false;
  }
  return {
    name: data.name,
    verified: data.verified,
    verification: data.verification ?? [],
    hasCertificate,
  };
}

export async function detachDomainFromProject(domain: string): Promise<void> {
  const { projectId } = getConfig();
  await call(`/v9/projects/${projectId}/domains/${domain}`, { method: "DELETE" });
}

# Security Policy — CIA Feeds

## Reporting a vulnerability

We take security seriously and appreciate responsible disclosure.

**Email:** security@ciafeed.com (or info@ciafeed.com if that doesn't reach us)
**PGP:** Available on request.
**Web form:** Not provided — email is preferred to preserve chain of custody.

### What to include

- A clear description of the issue and the affected component/URL
- Reproduction steps (please don't include destructive payloads against production)
- Your assessment of the impact
- Suggested fix, if any
- How you'd like to be credited (or anonymous)

### What to expect

| Stage | Target time |
|---|---|
| Acknowledgement of receipt | 1 business day |
| Triage + severity classification | 3 business days |
| Status update | Weekly until resolved |
| Critical fix deployed | 7 days |
| High fix deployed | 30 days |
| Medium fix deployed | 90 days |
| Low fix deployed | next normal release cadence |

Reports that turn out to be valid vulnerabilities will be credited (with your
permission) in our public changelog. We do not currently run a paid bounty
program, but we may offer swag / discount credit for high-impact findings.

### Safe harbor

If you act in good faith — meaning you (a) test only against accounts and
data you control, (b) avoid disrupting production for other users, (c)
give us a reasonable disclosure window, and (d) don't exfiltrate or retain
user data — we will not pursue legal action against you for your research.

### Out of scope

- Self-XSS that requires the victim to type or paste attacker-supplied JS into devtools.
- Reports based solely on missing best-practice headers when a specific
  attack path isn't demonstrated.
- Findings on staging/preview deploys (`*.vercel.app` URLs that aren't
  `*.ciafeed.com`) — these are intentionally unhardened for development.
- Denial-of-service via volumetric attacks.
- Social engineering of CIA Feeds employees.

---

## Supported versions

We continuously deploy from `main`. Only the current production deploy is
supported; there are no maintenance branches.

---

## Public security artifacts

- **SBOM** (Software Bill of Materials, SPDX 2.3): https://www.ciafeed.com/security/sbom.json
- **Security audit summary**: See `SECURITY_AUDIT.md` in this repository.

---

## Incident-response playbook

This is the runbook the on-call engineer follows when a confirmed security
incident is in progress. It's intentionally short so you can read it during
the incident.

### 1. Detect & triage (target: 15 min)

- Confirm the issue is a real incident (not a false positive). Cross-check:
  - Vercel logs around the affected route/timestamp
  - Supabase database logs (auth/postgres) for the same window
  - GitHub Dependabot / secret-scanning alerts (a leaked secret is a P1)
- Assign a severity:
  - **P0 — Critical**: active data breach, unauthorized admin access, production fully down.
  - **P1 — High**: confirmed CVE in a production dependency, RCE potential, single-tenant data exposure.
  - **P2 — Medium**: information disclosure, abuse/DoS risk without ongoing damage.
  - **P3 — Low**: hardening miss, theoretical impact.
- Designate an Incident Commander (IC). For solo work, you are the IC.

### 2. Contain (target: 30 min after triage)

For each likely attack vector, pick the smallest action that stops the bleeding:

- **Leaked secret** → rotate the credential in the provider's UI immediately; update Vercel env vars; redeploy. Then revoke any tokens the secret might have minted.
- **Compromised admin account** → invalidate sessions via `NEXTAUTH_SECRET` rotation (forces all logout); remove the user from `AdminAllowlist`; rotate their password.
- **Active SQLi / data exfil** → take the affected route offline via Vercel WAF rule or a route guard that returns 503; the rest of the site keeps working.
- **Compromised dependency** → pin or remove the package; redeploy.
- **Database-level compromise** → rotate `DATABASE_URL` / `DIRECT_URL` (Supabase dashboard → reset password → update Vercel env → redeploy). Confirm `auth.users`, `Dealer`, and `AdminAllowlist` row counts haven't changed unexpectedly.

### 3. Eradicate (target: 24 h)

- Patch the root cause in code. Use a focused branch and a clean PR.
- Add or update tests so the same class of bug fails CI.
- Confirm the patch in production via the same probe that revealed the issue.

### 4. Recover

- Restore any data from PITR if needed (Supabase Pro plan — confirm retention).
- Re-enable any routes that were disabled during containment.
- Verify production smoke tests pass:
  - `curl https://www.ciafeed.com/` → 200
  - `curl https://www.ciafeed.com/feeds/<a-real-slug>` → 200
  - `curl https://www.ciafeed.com/login` → 200

### 5. Communicate

- **Internal**: notify Luis (owner) and document the incident in an internal Notion/log entry.
- **Affected users**: if user data was exposed, send a transactional email within 72 hours (GDPR Article 33) explaining what happened, what data was involved, what we did, and what they should do.
- **Public**: publish a post-incident summary on the changelog/security page after resolution.

### 6. Post-mortem (within 1 week)

- Blameless write-up covering:
  - Timeline (UTC)
  - Root cause (5 whys)
  - Detection path (how we found it; how could we have found it sooner?)
  - Containment + remediation actions
  - Action items with owners and target dates
- File the action items as issues in this repo with the `security` label.
- Update `SECURITY_AUDIT.md` if the post-mortem adds new findings or remediation steps.

---

## Operational security baseline (as of May 2026)

These controls are in place. See `SECURITY_AUDIT.md` for full evidence.

| Domain | Status |
|---|---|
| TLS 1.3 + HSTS preload (2-year) | ✅ |
| Security headers (CSP, XFO, XCTO, RP, PP, COOP) | ✅ |
| Row Level Security on all public tables | ✅ |
| AES-256-GCM at-rest encryption of OAuth tokens | ✅ |
| Bcrypt-12 password hashing + HIBP breach check | ✅ |
| Brute-force-protected auth (per-IP + per-email, fail closed) | ✅ |
| Stripe webhook signature verification + idempotency | ✅ |
| Meta delivery queue with leases + circuit breaker | ✅ |
| HMAC-signed Conversions API (in grace period; required May 2026 EOM) | ✅ |
| Magic-byte file upload validation | ✅ |
| SSRF allow-list on outbound fetches against user URLs | ✅ |
| HTML-escaped user content in outbound email | ✅ |
| Immutable admin audit log with secret redaction | ✅ |
| GitHub Dependabot + secret scanning + push protection | ✅ |
| GDPR/CCPA data export + soft-delete (30-day grace) + retention cron | ✅ |
| SBOM published at /security/sbom.json | ✅ |
| Zero high/critical CVEs in production dependencies | ✅ |

---

## Acknowledgements

We thank the following researchers for responsibly disclosed findings:

_(none yet — be the first!)_

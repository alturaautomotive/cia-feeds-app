# SOC-2 Type-I Readiness Self-Checklist — CIA Feeds

| Field | Value |
|---|---|
| **Document owner** | Luis Delgado (Altura Apps) |
| **Last reviewed** | May 15, 2026 |
| **Review cadence** | Quarterly (next: August 2026) |
| **Scope** | CIA Feeds production service (`www.ciafeed.com`) — B2B marketing/lead-capture SaaS for car dealers, running on Next.js (Vercel), Supabase Postgres 17 (us-east-1), Prisma, NextAuth, Stripe, Resend, Meta Graph API, Google Gemini, OpenAI, Firecrawl, Google Maps |
| **Intended audience** | Founder/owner working through self-attestation; OR compliance platform onboarding team at Drata, Vanta, Secureframe, or Thoropass |
| **How to use this document** | This is a working readiness checklist, not a marketing artifact. Work through section 5 top-to-bottom, file evidence in the `docs/` folder of this repo as you go, and mark gaps as resolved before engaging an auditor. Section 6 gives a concrete 90-day plan. |

---

## Table of Contents

1. [SOC-2 Overview](#1-soc-2-overview)
2. [Scope Recommendation for v1 Audit](#2-scope-recommendation-for-v1-audit)
3. [Compliance Platform Comparison](#3-compliance-platform-comparison)
4. [Readiness Checklist — Evidence and Gaps](#4-readiness-checklist--evidence-and-gaps)
5. [90-Day Path to Type-I Audit](#5-90-day-path-to-type-i-audit)
6. [Subprocessor SOC-2 Reports to Collect](#6-subprocessor-soc-2-reports-to-collect)
7. [Out-of-Scope Justifications](#7-out-of-scope-justifications)

---

## 1. SOC-2 Overview

### What is SOC-2?

SOC-2 (System and Organization Controls 2) is an attestation framework developed by the American Institute of Certified Public Accountants (AICPA). It requires an independent CPA firm to evaluate whether a service organization's controls meet the AICPA's Trust Services Criteria (TSC). The result is a formal attestation report, not a certification — the auditor attests that your controls exist and/or operate as described.

SOC-2 has become the de-facto gate for B2B SaaS sales in North America. Enterprise and mid-market buyers routinely include it in vendor security questionnaires and procurement checklists. For a platform like CIA Feeds that handles dealer PII and integrates with dealer Meta Business accounts, having a SOC-2 report substantially shortens security review cycles.

### Type-I vs. Type-II

| Dimension | Type-I | Type-II |
|---|---|---|
| **What is evaluated** | Whether controls are *designed* appropriately at a single point in time | Whether controls *operated effectively* over a defined observation period (typically 6–12 months) |
| **Observation period** | None — snapshot audit | 6–12 months minimum |
| **Time to complete** | 2–4 months from engagement to report | 9–18 months from engagement to report |
| **Report weight with customers** | Demonstrates intent and design rigor; accepted by many mid-market buyers | Stronger signal; required by most enterprise and regulated-industry buyers |
| **Cost (platform + audit)** | ~$15,000–$50,000 all-in for a startup | ~$30,000–$100,000+ all-in |
| **Recommended order** | Start here — establishes baseline and gets the first report in hand | Initiate observation period immediately after Type-I report is issued |

**Practical implication for CIA Feeds:** Issue the Type-I report first. The observation period for Type-II can begin the day the Type-I audit window closes, so there is no calendar penalty to doing them sequentially.

### The Five Trust Services Criteria

| TSC | Abbreviation | What it covers |
|---|---|---|
| **Security** | CC (Common Criteria) | Logical and physical access, system operations, change management, risk assessment, monitoring, incident response — the "baseline" TSC |
| **Availability** | A | Uptime commitments, capacity planning, backup/recovery |
| **Processing Integrity** | PI | Accuracy and completeness of processing; financial or transactional correctness |
| **Confidentiality** | C | Protection of data designated confidential under business agreements |
| **Privacy** | P | Collection, use, retention, disclosure, and disposal of personal information per the AICPA Privacy Management Framework |

**Security is the only required TSC.** All others are optional add-ons. Auditor scope is defined up-front; you select which TSCs to include.

### Typical All-In Cost Ranges (2025–2026)

| Phase | Low estimate | High estimate | Notes |
|---|---|---|---|
| Compliance platform (annual) | $7,500 | $20,000 | Startup/small-team pricing; scales with headcount and frameworks |
| Readiness / gap assessment | $5,000 | $15,000 | Often included in platform fee or performed self-service |
| Penetration test | $8,000 | $20,000 | Required by most auditors for a credible Type-I |
| Audit firm fee (Type-I) | $8,000 | $25,000 | CPA firm; varies by scope and brand |
| **Total, Type-I** | **$28,500** | **$80,000** | For a lean startup expect the lower end; budget $30k to be safe |
| Audit firm fee (Type-II add-on) | $10,000 | $40,000 | Incremental to Type-I; auditor already knows your environment |

These are estimates based on publicly reported ranges from [Vanta](https://www.vanta.com/collection/soc-2/soc-2-audit-cost), [Secureframe](https://secureframe.com/hub/soc-2/audit-cost), and [Thoropass](https://www.thoropass.com/blog/how-much-does-soc-2-cost) as of 2025. Get three auditor quotes before committing.

---

## 2. Scope Recommendation for v1 Audit

### Recommended TSC Set: Security + Availability + Confidentiality

| TSC | Include in v1? | Rationale |
|---|---|---|
| **Security (CC)** | **Yes — required** | Baseline; every audit includes this |
| **Availability (A)** | **Yes** | CIA Feeds is a real-time operational tool for dealers. Dealers care about uptime. Evidence already exists: DR_RUNBOOK.md, RTO/RPO targets, Supabase daily backups, circuit breakers, dbResilience.ts. Marginal effort to include is low. |
| **Confidentiality (C)** | **Yes** | Dealers upload lead PII (name, email, phone). The platform stores Meta access tokens. Confidentiality controls are already substantial: RLS on 17 tables, app-layer AES-256-GCM encryption for Lead PII (lib/leadCrypto.ts), GDPR export/delete endpoints. Marginal effort is low; competitive signal is high. |
| **Processing Integrity (PI)** | **Defer** | CIA Feeds is not a financial processor or data transformation pipeline where the accuracy of the output has direct financial consequence. Including PI increases auditor scope without a proportional customer trust benefit for a marketing lead platform. Re-evaluate if the product adds billing calculations or data reconciliation features. |
| **Privacy (P)** | **Defer** | Privacy TSC maps to the AICPA Privacy Management Framework, which requires a formal notice, consent, and data-lifecycle management program. That is achievable but represents significant policy writing effort beyond what already exists. Defer until (a) a customer with GDPR DPA obligations explicitly requires it, (b) CCPA/CPRA compliance becomes a customer deal blocker, or (c) you expand to a European dealer base. GDPR export/delete endpoints already in the codebase provide a head start. |

### Why not just Security-only?

Security-only is the minimum viable scope. However, for a B2B SaaS explicitly marketing to enterprise car dealers and handling lead PII, Availability and Confidentiality are the TSCs your buyers will ask about by name. Adding them at the Type-I stage costs roughly $2,000–$5,000 in additional audit time and saves significant back-and-forth on customer security questionnaires.

---

## 3. Compliance Platform Comparison

All four major platforms offer: policy templates, automated evidence collection, auditor-in-the-loop (or auditor network), and integrations with the cloud services CIA Feeds uses. The differentiators are price, auditor relationships, and how much hand-holding a solo founder needs.

| Dimension | [Drata](https://drata.com) | [Vanta](https://vanta.com) | [Secureframe](https://secureframe.com) | [Thoropass](https://thoropass.com) |
|---|---|---|---|---|
| **Annual platform cost (startup tier)** | ~$7,500–$15,000/yr (Essential); $15,000+/yr (Foundation, most common) | ~$10,000–$15,000/yr (Essential); scales to $30,000–$80,000/yr | ~$7,500–$20,000/yr; quote-based, three tiers (Fundamentals, Complete, Defense) | Quote-based; bundled platform + auditor; typically $20,000–$37,000 all-in for platform + Type-I audit |
| **Pricing model** | Tiered annual plans; not per-employee at startup tier | Per-seat-adjacent with tiered plans; Essential is flat for small teams | Quote-based per-year; not per-employee | Bundled platform + audit; cost includes auditor fees |
| **Audit firm included?** | No — you hire separately from Drata's partner network | No — you hire separately from Vanta's partner network | No — partner network available | **Yes** — Thoropass is both the platform and the licensed CPA firm. One contract. |
| **Target customer** | Mid-market; strong for teams with 10–200 employees scaling compliance | Startups and fast-moving mid-market; known for fast time-to-report | Startups to enterprise; broad framework coverage; strong federal/CMMC track | Startups and SMBs that want a single vendor; audit bundled reduces coordination overhead |
| **Strengths** | Deepest automation; large integration library; strong Slack UX; good for multi-framework | User-friendly; fast first report; large customer base means lots of peer benchmarking; strong SMB reputation | Deep integration coverage; detailed evidence mapping; competitive on HIPAA + ISO; good policy library | One-vendor simplicity; auditor on-staff means faster iteration; transparent about audit process |
| **Potential drawbacks** | Higher starting price; onboarding can feel heavy for a solo founder | Evidence collection can require manual effort for smaller/newer stacks; upsells accumulate | No public pricing; sales process required upfront | Less name recognition than Drata/Vanta in enterprise RFPs; newer brand |
| **Vercel integration** | ✅ Native | ✅ Native | ✅ Native | ✅ Via API/connector |
| **Supabase integration** | ⚠️ Via PostgreSQL connector or API | ⚠️ Via PostgreSQL connector | ⚠️ Via PostgreSQL connector | ⚠️ Via API or manual |
| **GitHub integration** | ✅ Native (PR review, Dependabot, secret scanning) | ✅ Native | ✅ Native | ✅ Native |
| **Stripe integration** | ✅ Native | ✅ Native | ✅ Native | ✅ Native |
| **Google Workspace integration** | ✅ Native | ✅ Native | ✅ Native | ✅ Native |
| **Best fit for CIA Feeds** | Good fit if budget allows; strongest automation for solo founder | **Best fit for solo founder at this stage** — lower entry cost, fast onboarding, large community for policy templates | Good fit if you want breadth (e.g., HIPAA later); price unknown until quote | Best fit if you want to minimize vendor coordination — one contract covers platform and audit |

### Recommendation for CIA Feeds

**If optimizing for speed and simplicity:** Start with Vanta. The Essential plan is the lowest-friction entry point for a single-founder operation, and Vanta's integrations with GitHub, Vercel, and Stripe are mature. Budget ~$10,000–$15,000/yr for the platform plus ~$15,000–$25,000 for an audit firm from their partner network.

**If optimizing for lowest total cost:** Talk to Thoropass first. Their bundled model (platform + auditor) often comes out cheaper than buying both separately, and they work well with small teams. The lack of a separate auditor negotiation reduces total founder time investment.

**If you later need HIPAA or ISO 27001:** Secureframe's multi-framework coverage is the strongest, and their Fundamentals tier maps well to a startup getting its first SOC-2.

In all cases, request a demo and ask each vendor explicitly: "Do you have native evidence collection for Supabase?" Supabase's evidence collection is less automated than AWS RDS or GCP Cloud SQL across all platforms; plan for some manual evidence uploads for database-level controls.

---

## 4. Readiness Checklist — Evidence and Gaps

**How to read this table:**
- **Evidence we already have** = artifacts in this repo or in our production systems that a SOC-2 auditor can use as evidence today.
- **Gaps** = items an auditor will look for that we do not yet have documented or implemented. Each gap is tagged with a priority: 🔴 Required before audit / 🟡 Should have / 🟢 Nice to have.

---

### 4.1 Logical Access Controls

Maps to: CC6.1, CC6.2, CC6.3 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Authentication mechanism** | NextAuth with credentials provider; bcrypt cost 12 + HIBP k-anonymity breach check on signup (shipped May 15, 2026) | No MFA enforcement *within* the CIA Feeds app itself for dealer accounts. Current MFA protection exists at the provider layer (GitHub, Vercel, Supabase) for the operator, not for dealer end-users. 🟡 Consider adding TOTP option for dealer admins, especially those with Meta integrations. |
| **Session management** | JWT sessions via NextAuth; `NEXTAUTH_SECRET` rotation invalidates all sessions; `userType` JWT claim prevents cross-role IDOR (`verifyDealer()` defense-in-depth) | Document session timeout policy (current behavior undocumented). 🟡 |
| **Access provisioning and de-provisioning policy** | `docs/EMPLOYEE_ACCESS_POLICY.md` (published May 15, 2026) — covers onboarding/offboarding steps for every production system; role matrix per service; MFA requirement; same-day revocation on departure | Access register (`docs/ACCESS_REGISTER.md`) referenced in the policy does not yet exist as a file. 🔴 Create it before audit — even if it's a single row for Luis Delgado, it demonstrates the control is operating. |
| **MFA on production systems** | EMPLOYEE_ACCESS_POLICY.md mandates MFA on all production-affecting accounts (Vercel, Supabase, GitHub, Stripe, Meta, GoDaddy). GitHub org-level MFA enforcement is confirmed. | No evidence screenshot or export yet. 🔴 Before audit: export MFA status from each provider (GitHub org → People → MFA; Vercel org → Team Settings; Supabase org → Members) and save to `docs/evidence/mfa-enrollment-YYYY-MM.pdf` |
| **Privileged action logging** | `AdminAuditLog` table in Postgres; captures all privileged actions with actor, timestamp, action type, target ID | Audit log retention policy not formally documented (e.g., "30 days" or "1 year"). 🔴 Add a note in `docs/EMPLOYEE_ACCESS_POLICY.md` §4 specifying retention duration. |
| **Quarterly access review** | EMPLOYEE_ACCESS_POLICY.md §6 defines a quarterly review process | No completed review log exists yet. 🔴 Complete the first review immediately; document in `docs/ACCESS_REVIEW_LOG.md` with date, systems reviewed, findings. |
| **Separation of duties** | GitHub requires PRs (no direct push to `main`); production deploys are Vercel git-integration only; no single person can simultaneously write code and approve it to production (pending first hire) | Single-founder environment inherently lacks separation. 🟡 Auditors accept this for solo operations — document it explicitly as a compensating control acknowledgment in the risk assessment. |
| **Minimum necessary access** | EMPLOYEE_ACCESS_POLICY.md prescribes least-privilege per role per service | — |

---

### 4.2 System Operations and Change Management

Maps to: CC8.1, CC7.1, CC7.2 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Code review process** | GitHub PR workflow enforced; no direct push to `main` | Document the branch protection rules as formal evidence. 🟡 Export GitHub branch protection settings for `main` via the API or screenshot for the auditor package. |
| **Dependency management** | Dependabot enabled (alerts + auto-PRs for security patches); secret scanning enabled at the org level | Dependabot deferred major upgrades (vitest, `@google/genai`, vite) noted in SECURITY_AUDIT.md #26–30. 🟡 Document a formal policy for "how long a Dependabot alert can remain open before required action" — e.g., critical = 7 days, high = 30 days, medium = 90 days. |
| **Schema migration safety** | `prisma migrate deploy` is gated in the Vercel build step — the deployment fails if migrations are inconsistent; migration files are committed to the repo and reviewed in PRs | — |
| **Vulnerability tracking** | SECURITY_AUDIT.md documents the full Top-10 risk process, ship status, and 5 outstanding items; tracks issue-to-resolution dates | SECURITY_AUDIT.md is currently narrative. 🟡 For auditor consumption, add a one-page summary table: vulnerability, severity, identified date, remediated date, outstanding Y/N. |
| **Periodic security review evidence** | SECURITY_AUDIT.md functions as the formal periodic security review | Review cadence not yet documented as a policy (quarterly vs. annual). 🔴 Add review cadence to SECURITY_AUDIT.md header and link from this document. |
| **Deployment pipeline** | Vercel git integration; each push to `main` triggers a build including `prisma migrate deploy` | No formal change approval record for production deployments. 🟡 GitHub PRs serve as the approval record — ensure all production-bound changes go via PR (currently enforced by branch protection). |
| **SBOM** | `/security/sbom.json` published at https://www.ciafeed.com/security/sbom.json (SPDX 2.3 format) | SBOM generation cadence not documented. 🟡 Document when the SBOM is regenerated (e.g., every production release). |

---

### 4.3 Risk Assessment

Maps to: CC3.1, CC3.2, CC3.3, CC3.4 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Formal risk assessment process** | SECURITY_AUDIT.md constitutes a point-in-time risk assessment: identifies risks, assigns severity, tracks remediation | Risk assessment does not follow a formal methodology with documented scoring criteria (e.g., NIST FIPS 199, CVSS, or a simple probability × impact matrix). 🔴 Add a two-paragraph "Methodology" section to SECURITY_AUDIT.md describing how risks are identified, scored, and prioritized. |
| **Risk register** | SECURITY_AUDIT.md Top-10 table functions as a risk register | No formal risk register artifact separate from the narrative audit document. 🟡 Extract the Top-10 table into a standalone `docs/RISK_REGISTER.md` with columns: Risk ID, Description, Likelihood, Impact, Overall Score, Control, Status, Owner, Review Date. |
| **Risk review cadence** | SECURITY_AUDIT.md has a "last updated" field | Quarterly review commitment not formally stated. 🔴 Add a review cadence and reviewer name to the risk register document. |
| **Vendor/third-party risk** | Implicit in SECURITY_AUDIT.md (circuit breakers for third-party APIs; secrets management) | No formal vendor risk assessment or vendor register. 🔴 See 4.4 below — vendor management is a significant gap. |
| **Threat modeling** | Implicitly covered in SECURITY_AUDIT.md domain analysis | No formal data flow diagram or threat model document. 🟡 A simple one-page architecture diagram with trust boundaries satisfies most Type-I auditors at this scale. |

---

### 4.4 Vendor Management

Maps to: CC9.2 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Vendor register** | None documented | 🔴 **Critical gap.** Create `docs/VENDOR_REGISTER.md` listing every vendor that touches CIA Feeds data. At minimum: Vercel, Supabase, Stripe, Resend, Meta, OpenAI, Google (Maps/Gemini), Firecrawl, GoDaddy. Columns: Vendor, Data Shared, Classification, SOC-2 Available, DPA Signed, Review Date. |
| **Vendor DPAs (Data Processing Agreements)** | Implicit acceptance of vendor ToS | 🔴 For GDPR-relevant data flows, formal DPAs are required. Stripe, Resend, and OpenAI publish DPAs on request; Vercel and Supabase include them in their enterprise agreements. Pull each DPA and store in `docs/vendor-dpas/`. |
| **Subprocessor SOC-2 reports** | Not yet collected | 🔴 Collect all applicable SOC-2 reports — see section 6 of this document for where each vendor publishes them. Store downloaded PDFs in `docs/vendor-soc2/`. |
| **Vendor security review on onboarding** | No documented process | 🟡 Add a brief checklist to `docs/VENDOR_REGISTER.md`: before adding a new vendor, (1) confirm SOC-2 or ISO 27001 status, (2) sign DPA if vendor handles personal data, (3) review their security disclosure page. |

---

### 4.5 Incident Response

Maps to: CC7.3, CC7.4, CC7.5 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Incident response plan** | `SECURITY.md` contains a full incident response playbook covering: detect & triage, contain (P0–P3 severity), eradicate, recover, communicate, post-mortem | IRP has not been tested (no completed drill or tabletop exercise on record). 🔴 Document one completed tabletop or drill in `docs/INCIDENTS.md` before audit. A 30-minute paper walkthrough of a hypothetical P1 scenario (e.g., leaked `STRIPE_SECRET_KEY`) counts. |
| **Communication plan** | SECURITY.md §9 covers in-app banner (TBD), email broadcast (Resend), status page (TBD) | Status page not yet live. 🟡 A static `status.ciafeed.com` page (even if manually updated) satisfies this control. |
| **Defined severity levels** | SECURITY.md §1 defines P0 (critical data breach / fully down), P1 (confirmed CVE / RCE / single-tenant exposure), P2 (information disclosure), P3 (theoretical) | — |
| **Defined response timelines** | SECURITY.md §1 target: 15 min detect, 30 min contain, 24h eradicate | — |
| **Breach notification policy** | Implicit (email dealers via Resend; post-mortem within 5 business days) | No explicit customer breach notification SLA documented (e.g., "notify affected customers within 72 hours of confirming a breach affecting their data"). 🔴 Add a one-paragraph breach notification commitment to SECURITY.md, consistent with GDPR 72-hour clock if any EU data subjects are involved. |
| **Post-mortem process** | SECURITY.md §9: post-mortem within 5 business days in `docs/INCIDENTS.md` | No incidents on record to reference yet. Auditors will accept "no incidents during the audit period" if documented. 🟡 Create a `docs/INCIDENTS.md` file now, even if it has only one entry: "No security incidents occurred in [period]." |
| **DR runbook** | `docs/DR_RUNBOOK.md` — full runbook with RTO 4h / RPO 24h; Supabase daily backups; rollback procedures; third-party API degradation handling; circuit breakers | — |
| **DR drill cadence** | DR_RUNBOOK.md §10 mandates monthly backup restore verification and quarterly full failover drill | No completed drill log exists yet. 🔴 Create `docs/DR_DRILL_LOG.md`; document the first drill immediately (even a short backup restore test counts). |

---

### 4.6 Encryption in Transit and at Rest

Maps to: CC6.7, C1.1 (Security + Confidentiality TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Encryption in transit** | HSTS enforced (max-age=63072000; includeSubDomains; preload) via `next.config.ts` security headers; TLS enforced by Vercel edge; all API calls to third parties use HTTPS | Document TLS version floor (TLS 1.2 minimum). 🟡 Vercel enforces TLS 1.2+ by default — confirm in Vercel docs and note in a network architecture document. |
| **Encryption at rest — database** | Supabase Postgres 17 storage is AES-256 encrypted at rest by default (AWS EBS encryption) | Confirm and document Supabase at-rest encryption. The Supabase SOC-2 Type-II report (section 6 below) contains this attestation. 🟡 Note the evidence source in the vendor register. |
| **Encryption at rest — Lead PII (application layer)** | `lib/leadCrypto.ts` — AES-256-GCM application-layer encryption of Lead PII fields (added May 15, 2026); key stored in `TOKEN_ENCRYPTION_KEY` Vercel env var | Encryption key rotation policy not documented. 🔴 Document in `docs/EMPLOYEE_ACCESS_POLICY.md` §5 or a new `docs/KEY_MANAGEMENT.md`: how often the key is rotated, what triggers an out-of-cycle rotation, and the procedure for re-encrypting existing records. |
| **Encryption at rest — Meta tokens** | Meta access tokens stored with AES-256-GCM encryption (noted in SECURITY_AUDIT.md Executive Summary) | Same key rotation gap applies. |
| **Key management** | Encryption keys stored as Vercel environment variables; access restricted to project owners | No formal key management policy or key inventory. 🔴 Create a one-page `docs/KEY_MANAGEMENT.md` listing all encryption keys, storage location, access control, rotation schedule, and rotation procedure. |
| **CSP and security headers** | Full security header set in `next.config.ts`: CSP (enforce mode as of May 15, 2026), HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy; CSP violation reports collected at `/api/csp-report` | — |

---

### 4.7 Backup and Recovery

Maps to: A1.2, A1.3 (Availability TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Backup frequency** | Supabase Pro daily backups (noted in DR_RUNBOOK.md) | 🔴 **PITR verification outstanding.** SECURITY_AUDIT.md lists PITR confirmation as outstanding item #30. Verify PITR is enabled in Supabase dashboard → Database → Point-in-Time Recovery. Document the result in DR_RUNBOOK.md and DR_DRILL_LOG.md. |
| **Backup retention** | Supabase Pro plan retains daily backups (retention period varies by plan — verify in project settings) | Retention period not documented in DR_RUNBOOK.md. 🔴 Log the current retention window (days) in DR_RUNBOOK.md §5. |
| **Backup restore testing** | DR_RUNBOOK.md §10 mandates monthly restore verification | No completed restore test on record. 🔴 Complete and document the first backup restore drill in `docs/DR_DRILL_LOG.md`. |
| **RTO / RPO** | DR_RUNBOOK.md documents RTO 4h (regional outage) / RPO 24h | — |
| **Offsite / cross-region backup** | Supabase backups are managed by Supabase (offsite from application perspective) | No cross-region warm standby. 🟡 This is acceptable for Type-I — document it as a known single-region dependency and a risk acceptance. Consider a quarterly cross-region restore drill as evidence the RPO is achievable. |
| **Application state recovery** | DR_RUNBOOK.md §4 covers Vercel rollback procedure; environment variable backup via `vercel env ls` | Environment variables not backed up to a secure location outside Vercel. 🟡 Export env var names (not values) to `docs/ENV_INVENTORY.md`; store values in a password manager or encrypted secrets vault accessible to the owner independent of Vercel. |

---

### 4.8 Monitoring and Alerting

Maps to: CC7.1, CC7.2, A1.1 (Security + Availability TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Application logging** | Vercel function logs for all API routes; structured log events for circuit breaker state changes (`circuit_breaker_opened`), DB retries | Logs are available but no log retention policy is documented. 🟡 Note Vercel's log retention (varies by plan) in the monitoring policy. |
| **Database logging** | Supabase activity logs and Postgres logs; `AdminAuditLog` table captures privileged actions | — |
| **Security event logging** | `/api/csp-report` receives and stores CSP violation reports; `AdminAuditLog` for privileged actions | No aggregated security event dashboard or SIEM. 🟡 For Type-I, this is acceptable — document the logging sources and how logs are reviewed. Formal SIEM is a Type-II enhancement. |
| **Dependency vulnerability alerting** | GitHub Dependabot security alerts with email/PR notifications; GitHub secret scanning with alerts | No formal SLA for responding to Dependabot alerts. 🔴 Add a policy statement (see 4.2 gap) defining response timelines for critical/high/medium Dependabot alerts. |
| **Uptime / availability monitoring** | Meta delivery alerting cron | 🔴 **Significant gap.** No external uptime monitor for `www.ciafeed.com`. Add a free or low-cost uptime monitor (e.g., Better Uptime, UptimeRobot, Vercel's own monitoring) and configure alerts to the owner's email or phone. This is required for the Availability TSC and expected by auditors. |
| **Real-time alert routing** | None beyond Dependabot email alerts | 🔴 Define at minimum one alert channel — email or Slack — for: (1) Vercel deployment failures, (2) uptime incidents, (3) Supabase compute alerts, (4) Dependabot critical/high alerts. Document the routing in a monitoring policy. |
| **On-call rotation** | N/A — single founder | Document this explicitly: "Single owner; all alerts route to Luis Delgado." An auditor needs to see that someone is accountable. 🟡 |

---

### 4.9 Physical Security

Maps to: CC6.4, CC6.5 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Physical access to infrastructure** | CIA Feeds has no on-premises infrastructure. All compute and storage is provided by Vercel (global edge / us-east-1 lambdas) and Supabase (AWS us-east-1). | — |
| **Physical security attestation** | Physical security of Vercel and Supabase data centers is covered by their respective SOC-2 Type-II reports (see section 6). Both rely on AWS data center physical security, which is covered by AWS's own compliance certifications. | Collect Vercel and Supabase SOC-2 reports as evidence. See section 6. 🔴 |
| **Auditor scoping** | Physical security is explicitly out of scope for CIA Feeds' audit because the company has no data center, no server rooms, and no company-owned devices used for production workloads. Auditors will ask; the answer is: "Inherited from Vercel and Supabase; covered by their SOC-2 reports available in our vendor documentation folder." | Document this scope exclusion in the audit scope letter. See section 7. |

---

### 4.10 HR Security

Maps to: CC1.4 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Background checks** | N/A — no employees as of May 15, 2026 | 🟡 Once the first hire is made, a background check policy is required. Add a placeholder in `docs/EMPLOYEE_ACCESS_POLICY.md` §4: "Background check required before provisioning access to production systems for any new employee or long-term contractor." |
| **Acceptable use policy** | `docs/EMPLOYEE_ACCESS_POLICY.md` includes use restrictions by role | No signed acknowledgment process. 🟡 Add a step to the onboarding checklist: new employee signs and dates the access policy on their first day. Store signatures in `docs/signed-policies/`. |
| **Security awareness training** | N/A — no employees | 🟡 Once first hire arrives, annual security awareness training is required. A self-paced module (e.g., KnowBe4 or a free CISA module) costs near-zero and satisfies this control. |
| **Offboarding** | EMPLOYEE_ACCESS_POLICY.md §5 defines same-day revocation, credential rotation, and session invalidation | No completed offboarding on record (no employees yet). Auditors accept "no personnel transitions during audit period" if documented. 🟡 |

---

### 4.11 Data Classification and Handling

Maps to: CC6.1, C1.1 (Security + Confidentiality TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Data classification policy** | None | 🔴 **Significant gap.** Create a one-page `docs/DATA_CLASSIFICATION.md` defining data tiers. Suggested for CIA Feeds: |
| | | **Restricted:** Lead PII (name, email, phone, IP), Meta access tokens, dealer credentials, `AdminAuditLog` entries, Stripe payment data |
| | | **Confidential:** Dealer business configuration, inventory data, subscription status |
| | | **Internal:** Application logs, CSP violation reports, deployment metadata |
| | | **Public:** Feed URLs (`/feeds/<slug>`), SBOM (`/security/sbom.json`), marketing pages |
| **Data handling procedures** | RLS on 17 sensitive tables; app-layer PII encryption via `lib/leadCrypto.ts`; GDPR export (`/api/dealer/me/export`) and delete (`/api/dealer/me/delete`) endpoints; 30-day data retention cron (`/api/cron/data-retention`) | Once the classification policy exists, add a handling-rules table to `DATA_CLASSIFICATION.md`: for each tier, specify: storage location, encryption requirement, retention period, access control, deletion procedure. 🔴 |
| **Data retention policy** | 30-day cron for lead data; GDPR-compliant delete on request | Retention periods for all data types not formally documented. 🟡 Expand `DATA_CLASSIFICATION.md` to include retention period per data type. |
| **Data inventory** | Implicit in Prisma schema | 🟡 A simple data inventory table (`docs/DATA_INVENTORY.md`) listing data types, tables/storage locations, classification tier, and processing purpose satisfies auditor requirements at Type-I scale. |

---

### 4.12 Confidentiality of Customer Data

Maps to: C1.1, C1.2 (Confidentiality TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Access control on customer data** | Row-Level Security (RLS) enabled on 17 sensitive Supabase/Postgres tables; `verifyDealer()` + `userType` JWT claim enforce application-layer tenant isolation | RLS policies are in the DB but not documented in audit-friendly format. 🟡 Export RLS policies (via `pg_policies` system table) and save snapshot to `docs/evidence/rls-policies-YYYY-MM.sql`. |
| **Encryption of sensitive fields** | AES-256-GCM encryption of Lead PII (`lib/leadCrypto.ts`); Meta tokens encrypted at rest | — |
| **Customer right to export** | `/api/dealer/me/export` GDPR-compliant data export endpoint | — |
| **Customer right to deletion** | `/api/dealer/me/delete` endpoint; 30-day data retention cron | Document what the deletion covers (all associated data? just PII?) in `DATA_CLASSIFICATION.md`. 🟡 |
| **Confidentiality obligations to customers** | Not formally stated outside ToS | 🔴 Ensure the Terms of Service and/or Privacy Policy explicitly state what data CIA Feeds collects, how it is used, with whom it is shared, and how customers can request deletion. If a DPA is required by a customer (common for enterprise/GDPR), have a template ready. |
| **Limiting data sharing with third parties** | Third-party API calls are minimal-data: OpenAI/Gemini receive only necessary content; Firecrawl receives only URLs; Resend receives only name + email for transactional emails | No formal data minimization policy documented. 🟡 Add a data minimization statement to `DATA_CLASSIFICATION.md`. |

---

### 4.13 Durable Rate Limiting and API Protection

Maps to: CC6.6, CC6.8 (Security TSC)

| Common Criteria | Evidence we already have | Gaps |
|---|---|---|
| **Public endpoint protection** | `durableRateLimit()` DB-backed rate limiting on public endpoints (`/api/leads`, `/api/track`, `/api/catalog/[slug]`) | Document rate limit thresholds and window sizes. 🟡 |
| **HMAC-signed tracking** | `/api/track` requires `TRACK_REQUIRE_SIGNATURE=true` HMAC signature (enforced May 15, 2026) | — |
| **Circuit breakers** | `lib/circuitBreaker.ts` wraps Firecrawl, OpenAI, Gemini, Resend; `lib/dbResilience.ts` for transient DB errors | — |

---

## 5. 90-Day Path to Type-I Audit

This plan assumes a start date of June 1, 2026 and a target readiness date of September 1, 2026 (Type-I audit engagement). At CIA Feeds' current posture (strong technical controls, gaps concentrated in documentation and policy), the primary work is policy writing and evidence collection, not security engineering.

### Phase 1: Foundation (Weeks 1–4, June 1–28)

**Goal:** Close all 🔴 Required gaps from section 4. Engage a compliance platform.

| Task | Owner | Effort | Deadline |
|---|---|---|---|
| Create `docs/ACCESS_REGISTER.md` with current access snapshot | Luis | 1 hour | June 7 |
| Export MFA enrollment status from all 9 providers; save to `docs/evidence/mfa-enrollment-2026-06.pdf` | Luis | 2 hours | June 7 |
| Add audit log retention period to `docs/EMPLOYEE_ACCESS_POLICY.md` | Luis | 30 min | June 7 |
| Complete first access review; document in `docs/ACCESS_REVIEW_LOG.md` | Luis | 1 hour | June 7 |
| Add risk scoring methodology to `SECURITY_AUDIT.md` | Luis | 1 hour | June 14 |
| Create `docs/RISK_REGISTER.md` (extract from SECURITY_AUDIT.md) | Luis | 2 hours | June 14 |
| Create `docs/VENDOR_REGISTER.md` with all 10 current vendors | Luis | 2 hours | June 14 |
| Pull DPAs from Stripe, Resend, OpenAI, Vercel, Supabase; save to `docs/vendor-dpas/` | Luis | 3 hours | June 21 |
| Collect SOC-2 reports from all vendors (see section 6); save to `docs/vendor-soc2/` | Luis | 2 hours | June 21 |
| Create `docs/KEY_MANAGEMENT.md` with key inventory and rotation policy | Luis | 1 hour | June 21 |
| Create `docs/DATA_CLASSIFICATION.md` with 4-tier classification and handling rules | Luis | 3 hours | June 28 |
| Verify PITR is enabled in Supabase; document result in DR_RUNBOOK.md | Luis | 30 min | June 28 |
| Complete first backup restore test; document in `docs/DR_DRILL_LOG.md` | Luis | 2 hours | June 28 |
| Set up external uptime monitor for `www.ciafeed.com`; configure alerts | Luis | 1 hour | June 28 |
| Add breach notification SLA (72h) to SECURITY.md | Luis | 30 min | June 28 |
| Create `docs/INCIDENTS.md` ("no incidents during period") | Luis | 30 min | June 28 |
| Add Dependabot alert response SLA policy to SECURITY_AUDIT.md | Luis | 30 min | June 28 |
| **Engage compliance platform** (Vanta, Drata, Thoropass, or Secureframe) | Luis | — | June 28 |

**Phase 1 total estimated effort: ~25 focused hours across 4 weeks.**

---

### Phase 2: Evidence Collection and Platform Onboarding (Weeks 5–8, June 29–July 26)

**Goal:** Connect all integrations to the compliance platform; complete automated evidence collection; complete penetration test.

| Task | Owner | Effort | Deadline |
|---|---|---|---|
| Connect GitHub, Vercel, Stripe integrations to compliance platform | Luis | 2 hours | July 5 |
| Connect Supabase via PostgreSQL connector (manual evidence if no native integration) | Luis | 3 hours | July 5 |
| Complete compliance platform policy review; adopt/modify suggested templates | Luis | 5 hours | July 12 |
| Engage penetration tester; schedule test for July | Luis | — | July 5 |
| Complete penetration test; receive draft report | Pen tester | — | July 26 |
| Remediate any critical/high findings from pen test | Luis | TBD | August 2 |
| Export RLS policy snapshot; save to `docs/evidence/rls-policies-2026-07.sql` | Luis | 1 hour | July 12 |
| Review and update `docs/DATA_CLASSIFICATION.md` and data inventory | Luis | 2 hours | July 19 |
| Run second quarterly access review; document in ACCESS_REVIEW_LOG.md | Luis | 1 hour | July 26 |
| Run DR drill (backup restore + partial failover walkthrough); document in DR_DRILL_LOG.md | Luis | 3 hours | July 26 |
| Tabletop incident response exercise (30-minute paper walkthrough of a P1 scenario) | Luis | 30 min | July 26 |

---

### Phase 3: Audit Readiness Review (Weeks 9–12, July 27–August 30)

**Goal:** Compile evidence package; address platform-flagged gaps; engage auditor; complete readiness review.

| Task | Owner | Effort | Deadline |
|---|---|---|---|
| Review all compliance platform automated findings; resolve remaining amber/red items | Luis | 5 hours | August 9 |
| Prepare audit evidence folder with all documents cross-referenced to this checklist | Luis | 3 hours | August 9 |
| Engage CPA audit firm; agree on scope letter (Security + Availability + Confidentiality TSCs) | Luis + auditor | — | August 9 |
| Pre-audit readiness call with auditor (review evidence package, identify last-minute gaps) | Luis + auditor | 2 hours | August 23 |
| Address auditor pre-audit questions | Luis | TBD | August 30 |
| **Audit observation period begins** | Auditor | — | September 1 |

**Type-I report estimated delivery:** November–December 2026 (2–3 months after observation).

---

### Transition to Type-II

Begin the Type-II observation period immediately after the Type-I audit closes (no gap needed). At the observation period start, ensure:
- All controls from the Type-I scope are actively operating (not just documented).
- Monthly and quarterly evidence collection is automated via the compliance platform.
- Uptime monitor data is being recorded (needed for Availability TSC).
- Access reviews and DR drills are on the calendar.

Type-II report would be available approximately 12 months after the Type-I audit closes (i.e., Q4 2027 if the Type-I closes Q4 2026).

---

## 6. Subprocessor SOC-2 Reports to Collect

Collecting vendor SOC-2 reports serves two purposes: (1) it satisfies the CC9.2 vendor management control in your own audit, and (2) it documents the inherited controls you are relying on (especially physical security and infrastructure encryption).

Store downloaded reports as PDFs in `docs/vendor-soc2/` with filenames like `vercel-soc2-type2-2025.pdf`.

| Vendor | Report availability | How to obtain | Notes |
|---|---|---|---|
| **Vercel** | SOC-2 Type II (Security, Confidentiality, Availability) | [security.vercel.com](https://security.vercel.com) — request access via the Trust Center. Requires a Vercel account. | Also holds ISO/IEC 27001, PCI DSS, and HIPAA certifications. |
| **Supabase** | SOC-2 Type II (annual, March 1 – February 28 window) | Supabase project dashboard → Organization → Settings → Legal Documents. **Requires Team or Enterprise plan.** If on Pro plan, contact Supabase support to request. | [Supabase SOC-2 compliance docs](https://supabase.com/docs/guides/security/soc-2-compliance) confirm annual audit by independent third party. |
| **Stripe** | SOC 1 and SOC 2 Type II (annual) | Contact Stripe support via the dashboard → request the SOC 2 Type II report directly. Stripe also publishes a SOC 3 (public summary) at [stripe.com/docs/security](https://docs.stripe.com/security). | Stripe also provides a PCI DSS Attestation of Compliance (AoC) — relevant since CIA Feeds uses Stripe for payment processing. |
| **Resend** | SOC-2 Type II (February 1 – February 1 window; zero exceptions) | [resend.com/security/soc-2](https://resend.com/security/soc-2) — download from the Documents page in your Resend dashboard. | Current reporting period: February 1, 2025 – February 1, 2026. |
| **OpenAI** | SOC-2 Type II (Security, Availability, Confidentiality, Privacy; January 1 – June 30, 2025 period) | [trust.openai.com](https://trust.openai.com) — create an account and request access to Documents section. | Also holds ISO/IEC 27001, 27017, 27018, and 27701 certifications. Report covers the API, ChatGPT Enterprise, and ChatGPT Edu. |
| **Google (Cloud / Gemini / Maps)** | SOC 1, SOC 2, and SOC 3 Type II (multiple GCP services covered) | [cloud.google.com/security/compliance/compliance-reports-manager](https://cloud.google.com/security/compliance/compliance-reports-manager) — Google Compliance Reports Manager; sign in with a Google Cloud account. Also [workspace.google.com/learn-more/security](https://workspace.google.com/learn-more/security/security-whitepaper/page-5/) for Workspace-specific reports. | Download the GCP SOC 2 Type II report that covers Vertex AI and Maps Platform. |
| **Meta (Graph API / Business Tools)** | Meta does not publish a standalone SOC-2 report for the Graph API in the way other SaaS vendors do. Meta's [Data Security Requirements](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-protection-assessment/data-security/) for app developers describe their security expectations for *apps* (i.e., CIA Feeds), not Meta's own infrastructure. | For evidence of Meta's infrastructure security posture, reference Meta's [Data Policy](https://www.facebook.com/privacy/policy/) and their [Responsible Platform Initiative](https://developers.facebook.com/docs/resp-plat-initiatives/) documentation. Meta's WhatsApp Business API has a dedicated SOC-2 Type II at [facebook.com/business/business-messaging/compliance](https://www.facebook.com/business/business-messaging/compliance/whatsapp-soc2) — reference if relevant. | For the purposes of CIA Feeds' audit, document Meta as a high-risk vendor given the access token sensitivity, note the absence of a SOC-2 report, and include compensating controls: token encryption at rest (AES-256-GCM), circuit breaker, quarterly access review of Meta Business Manager roles. |
| **Firecrawl** | Check [firecrawl.dev/security](https://firecrawl.dev) or contact Firecrawl support for current compliance posture. As a newer vendor, a SOC-2 report may not yet be available. | Contact Firecrawl directly. If no SOC-2 is available, document the risk acceptance: Firecrawl receives only public URLs (no PII), reducing the data risk classification. | Low-risk vendor because no PII is sent; compensating control is the circuit breaker. |
| **GoDaddy** | SOC 2 Type II available — GoDaddy holds multiple compliance certifications for its hosting infrastructure. | Contact GoDaddy Enterprise or check [GoDaddy Trust Center](https://www.godaddy.com/agreements/trust-center). For CIA Feeds' use (domain registrar only, no hosting), the risk is limited to DNS availability. | Low-priority relative to Vercel and Supabase. |

---

## 7. Out-of-Scope Justifications

The following items are explicitly excluded from the CIA Feeds SOC-2 audit scope. This section should be reviewed with the auditor and included in the scope letter.

| Item | Exclusion justification |
|---|---|
| **On-premises infrastructure** | CIA Feeds has no physical servers, no company-owned rack space, and no co-location facilities. All compute and storage is cloud-provided by Vercel (serverless edge) and Supabase (managed Postgres on AWS us-east-1). Physical security controls are inherited from these vendors and covered by their own SOC-2 reports. |
| **Customer-managed encryption keys (CMEK)** | CIA Feeds does not offer customers the ability to supply or manage their own encryption keys. All encryption uses CIA Feeds-controlled keys stored in Vercel environment variables. This is a known product limitation, acceptable at the current customer size (~22 dealers). Document as a design decision; reconsider if an enterprise customer requires CMEK as a contractual obligation. |
| **Internal HR systems** | CIA Feeds has no employees as of the audit start date, no HRIS, no payroll system, and no internal ticketing system. HR controls are limited to the owner's own access management as documented in `docs/EMPLOYEE_ACCESS_POLICY.md`. |
| **Internal financial systems** | Financial operations (invoicing, revenue reporting) are handled entirely by Stripe. CIA Feeds does not run an internal ERP, billing engine, or general ledger. Financial accuracy of processing is Stripe's responsibility; CIA Feeds' scope is limited to correct invocation of Stripe APIs (confirmed via webhook signature verification). |
| **Processing Integrity TSC** | CIA Feeds is a marketing lead-capture and catalog distribution platform, not a financial or transactional processing pipeline. Outputs of the system (lead notifications, Meta catalog feeds) do not carry financial consequence requiring independent accuracy attestation. |
| **Privacy TSC** | Deferred until customer demand or regulatory trigger. GDPR-relevant controls (export/delete endpoints, 30-day retention cron) are implemented but a formal Privacy Management Framework (notice, consent management, privacy impact assessments) is not yet in scope. |
| **Legacy decommissioned systems** | The orphaned Supabase Auth schema (`profiles`, `dealerships`, `handle_new_user()`) was dropped in May 2026 (SECURITY_AUDIT.md item #1). No data was ever stored in these tables. Auditors should be informed of the clean-up but these systems are excluded from scope. |
| **Non-production environments** | Vercel preview deployments (`*.vercel.app`) are intentionally unhardened for development velocity. The audit scope is limited to the production deployment at `www.ciafeed.com` and the `main` branch pipeline. |
| **Cloudflare** | CIA Feeds does not currently route traffic through Cloudflare. DNS is GoDaddy + Vercel DNS. If Cloudflare is added as a CDN or DDoS layer in the future, its SOC-2 report (available at [cloudflare.com/trust-hub](https://www.cloudflare.com/trust-hub/)) should be collected and the audit scope updated. |
| **Devices (endpoints)** | CIA Feeds has no company-issued laptops or mobile devices under MDM (mobile device management). The founder uses personal devices. Auditors may flag this as a gap for a future Type-II audit — compensating control is that no customer data is stored on endpoints (all data is in Supabase/Vercel; MFA is required for all production access from any device). |

---

## Appendix A — Evidence Folder Checklist

Before handing this document to an auditor or a compliance platform, the following files should exist:

```
docs/
├── SOC2_READINESS.md                        ← this document
├── EMPLOYEE_ACCESS_POLICY.md                ← exists (May 15, 2026)
├── DR_RUNBOOK.md                            ← exists (May 15, 2026)
├── ACCESS_REGISTER.md                       ← to create (§4.1)
├── ACCESS_REVIEW_LOG.md                     ← to create (§4.1)
├── RISK_REGISTER.md                         ← to create (§4.3)
├── VENDOR_REGISTER.md                       ← to create (§4.4)
├── KEY_MANAGEMENT.md                        ← to create (§4.6)
├── DATA_CLASSIFICATION.md                   ← to create (§4.11)
├── INCIDENTS.md                             ← to create (§4.5)
├── DR_DRILL_LOG.md                          ← to create (§4.7)
├── vendor-dpas/
│   ├── stripe-dpa.pdf
│   ├── resend-dpa.pdf
│   ├── openai-dpa.pdf
│   ├── vercel-dpa.pdf
│   └── supabase-dpa.pdf
├── vendor-soc2/
│   ├── vercel-soc2-type2-2025.pdf
│   ├── supabase-soc2-type2-2025.pdf
│   ├── stripe-soc2-type2-2025.pdf
│   ├── resend-soc2-type2-2025.pdf
│   ├── openai-soc2-type2-2025.pdf
│   └── google-gcp-soc2-type2-2025.pdf
└── evidence/
    ├── mfa-enrollment-2026-06.pdf
    ├── rls-policies-2026-07.sql
    └── github-branch-protection-2026-06.png
```

Root-level security artifacts already in place:
```
SECURITY_AUDIT.md                            ← exists (May 15, 2026)
SECURITY.md                                  ← exists
/security/sbom.json                          ← published at ciafeed.com/security/sbom.json
```

---

## Appendix B — Quick-Reference Gap Summary

The following table consolidates all 🔴 Required gaps for a pre-audit sprint:

| Gap | Section | Estimated effort |
|---|---|---|
| Create `docs/ACCESS_REGISTER.md` | 4.1 | 1 hour |
| Export MFA enrollment evidence from all 9 providers | 4.1 | 2 hours |
| Add audit log retention period to `EMPLOYEE_ACCESS_POLICY.md` | 4.1 | 30 min |
| Complete and document first access review | 4.1 | 1 hour |
| Add risk scoring methodology to SECURITY_AUDIT.md | 4.3 | 1 hour |
| Create `docs/RISK_REGISTER.md` | 4.3 | 2 hours |
| Create `docs/VENDOR_REGISTER.md` | 4.4 | 2 hours |
| Pull and store all vendor DPAs | 4.4 | 3 hours |
| Collect all vendor SOC-2 reports (section 6) | 4.4 | 2 hours |
| Add breach notification SLA (72h) to SECURITY.md | 4.5 | 30 min |
| Create `docs/INCIDENTS.md` (no-incidents entry) | 4.5 | 30 min |
| Complete first incident response tabletop exercise | 4.5 | 30 min |
| Create `docs/DR_DRILL_LOG.md` and complete first drill | 4.7 | 3 hours |
| Verify PITR is enabled; document in DR_RUNBOOK.md | 4.7 | 30 min |
| Create `docs/KEY_MANAGEMENT.md` | 4.6 | 1 hour |
| Create `docs/DATA_CLASSIFICATION.md` | 4.11 | 3 hours |
| Set up external uptime monitor + alert routing | 4.8 | 1 hour |
| Add Dependabot SLA policy | 4.2 | 30 min |
| **Total estimated effort** | | **~25 hours** |

All 🔴 required gaps can be closed in approximately 25 focused hours — roughly one full working week. The technical controls are strong; the gap is entirely in documentation, policy statements, and evidence artifacts.

---

*Document generated May 15, 2026. Next review due August 2026.*

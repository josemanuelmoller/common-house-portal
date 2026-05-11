// Public responsible-disclosure page — no auth required.

export const metadata = {
  title: "Common House — Security",
  description:
    "Responsible disclosure policy. How to report a vulnerability to Common House.",
};

export const revalidate = 3600;

export default function SecurityPage() {
  return (
    <div
      className="min-h-screen bg-[#f4f4ef] text-[#0a0a0a]"
      style={{ fontFamily: "var(--font-hall-sans)" }}
    >
      <div className="max-w-[760px] mx-auto px-6 sm:px-10 py-16">
        <header className="mb-12">
          <div className="text-[11px] uppercase tracking-[1.5px] text-black/40 font-bold mb-3">
            Common House
          </div>
          <h1 className="text-[48px] font-light tracking-[-1.5px] leading-[1] mb-6">
            Security
          </h1>
          <p className="text-[16px] leading-[1.6] text-black/60">
            Responsible disclosure policy. If you've found a security issue in
            our platform, here's how to tell us.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            How to report
          </h2>
          <div className="border-l-2 border-[#c6f24a] pl-5 py-3 bg-black/3 mb-5">
            <div className="font-mono text-[15px] font-semibold">
              security@wearecommonhouse.com
            </div>
          </div>
          <p className="text-[14px] leading-[1.65] text-black/70">
            PGP encryption: optional. Reach out and we'll exchange keys
            out-of-band if your report contains sensitive details.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            What we commit to
          </h2>
          <ul className="space-y-3 text-[14px] leading-[1.65] text-black/70">
            <li className="flex gap-3">
              <span className="text-black/30 font-mono pt-1">→</span>
              <span>
                <strong>Acknowledge your report within 24 hours.</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono pt-1">→</span>
              <span>
                <strong>Triage within 72 hours</strong> and tell you whether
                we've reproduced the issue.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono pt-1">→</span>
              <span>
                <strong>Confirm a fix timeline</strong> appropriate to
                severity (P0 ≤ 24h, P1 ≤ 7d, P2 ≤ 30d).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono pt-1">→</span>
              <span>
                <strong>Credit you publicly</strong> in our hall of fame on
                this page, with your preferred handle and link (unless you
                request anonymity).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono pt-1">→</span>
              <span>
                <strong>Never pursue legal action</strong> against
                good-faith research conducted within this policy.
              </span>
            </li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            In scope
          </h2>
          <ul className="space-y-2 text-[14px] leading-[1.65] text-black/70">
            <li>
              <code className="font-mono text-[12px]">portal.wearecommonhouse.com</code> and all subdomains
            </li>
            <li>
              Public APIs at <code className="font-mono text-[12px]">/api/*</code>
            </li>
            <li>Code in the public repository (responsible disclosure of OSS supply chain issues welcome)</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            Out of scope
          </h2>
          <ul className="space-y-2 text-[14px] leading-[1.65] text-black/70">
            <li>Findings derived from physical access, social engineering of staff, or attacks against employees' personal accounts.</li>
            <li>Denial-of-service tests, traffic floods, or anything affecting platform availability.</li>
            <li>Issues in third-party services (Clerk, Supabase, Vercel) — please report directly to them.</li>
            <li>Missing security headers without a demonstrated exploit chain.</li>
            <li>UI-only issues with no security impact (e.g. CSS injection without script execution).</li>
            <li>Self-XSS or issues requiring an already-compromised user device.</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            Reward
          </h2>
          <p className="text-[14px] leading-[1.65] text-black/70 mb-3">
            We don't operate a monetary bug bounty at our current stage. We
            offer:
          </p>
          <ul className="space-y-2 text-[14px] leading-[1.65] text-black/70">
            <li>→ Public credit in the hall of fame below</li>
            <li>→ CH-branded swag for first-time reporters (when shipping cost is reasonable)</li>
            <li>→ Founder reference letter for valid P0/P1 findings (LinkedIn / job search)</li>
          </ul>
          <p className="text-[14px] leading-[1.65] text-black/60 mt-4 italic">
            A monetary bounty will be added when CH commercial traction
            justifies the budget. We'll announce it here when ready.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-[20px] font-light tracking-[-0.5px] mb-3 border-b border-black/10 pb-3">
            Hall of fame
          </h2>
          <p className="text-[14px] leading-[1.65] text-black/50 italic">
            No external reports validated yet. Be the first.
          </p>
        </section>

        <footer className="text-[11px] text-black/40 leading-relaxed border-t border-black/10 pt-6">
          <div>Last updated: 2026-05-11</div>
          <div className="mt-1">
            Trust pack:{" "}
            <a href="/trust" className="underline hover:text-black/70">
              /trust
            </a>
            {" • "}
            Status:{" "}
            <a href="/status" className="underline hover:text-black/70">
              /status
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

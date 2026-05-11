// Public trust page — no auth required.
// Single-page trust pack: what runs CH, who we share data with, how to
// reach security, link to status + responsible disclosure.

export const metadata = {
  title: "Common House — Trust",
  description:
    "How Common House protects customer data and runs the portal. Sub-processors, security practices, contact.",
};

export const revalidate = 3600;

type Subprocessor = {
  name: string;
  service: string;
  location: string;
  soc2: boolean;
};

const subprocessors: Subprocessor[] = [
  { name: "Vercel", service: "Hosting + CDN", location: "Global edge (US-East primary)", soc2: true },
  { name: "Supabase", service: "Postgres + Storage + Auth", location: "US-East", soc2: true },
  { name: "Clerk", service: "User authentication", location: "US", soc2: true },
  { name: "Anthropic", service: "LLM API (Claude)", location: "US", soc2: true },
  { name: "GitHub", service: "Source code + CI/CD", location: "US", soc2: true },
  { name: "Google Workspace", service: "Founder email + Drive", location: "US/Global", soc2: true },
  { name: "Cloudflare", service: "DNS + WAF + DDoS", location: "Global edge", soc2: true },
  { name: "Notion", service: "Legacy data store (sunset 2026-06-02)", location: "US", soc2: true },
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8.5l3 3 7-7"
        stroke="#16a34a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pill({ children, color = "neutral" }: { children: React.ReactNode; color?: "green" | "neutral" | "amber" }) {
  const styles = {
    green: { bg: "#dcfce7", border: "#16a34a", fg: "#166534" },
    amber: { bg: "#fef3c7", border: "#d97706", fg: "#92400e" },
    neutral: { bg: "#f1f5f9", border: "#94a3b8", fg: "#475569" },
  }[color];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
      style={{ background: styles.bg, borderColor: styles.border, color: styles.fg }}
    >
      {children}
    </span>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="flex items-baseline gap-3 mb-5 border-b border-black/10 pb-3">
        <span className="text-[11px] font-mono text-black/30 tabular-nums">{num}</span>
        <h2 className="text-[22px] font-light tracking-[-0.5px]">{title}</h2>
      </div>
      <div className="text-[14px] leading-[1.65] text-black/70">{children}</div>
    </section>
  );
}

export default function TrustPage() {
  return (
    <div
      className="min-h-screen bg-[#f4f4ef] text-[#0a0a0a]"
      style={{ fontFamily: "var(--font-hall-sans)" }}
    >
      <div className="max-w-[820px] mx-auto px-6 sm:px-10 py-16">
        <header className="mb-16">
          <div className="text-[11px] uppercase tracking-[1.5px] text-black/40 font-bold mb-3">
            Common House
          </div>
          <h1 className="text-[56px] font-light tracking-[-2px] leading-[1] mb-6">
            Trust
          </h1>
          <p className="text-[16px] leading-[1.6] text-black/60 max-w-[600px]">
            How we run the portal, who we share data with, and how to reach us
            about security. Updated continuously alongside the codebase — every
            claim on this page is backed by code or documentation you can audit.
          </p>
        </header>

        <Section num="01" title="Security posture">
          <p className="mb-4">
            The portal at <code className="font-mono">portal.wearecommonhouse.com</code> is built
            on Next.js + Supabase + Clerk + Vercel. Authentication, transport
            encryption, row-level security, and CSP are configured to current
            best practice. Recent third-party-equivalent review:{" "}
            <strong>2026-05</strong>, internal DIY pen-test using OWASP ZAP +
            Nuclei + adversarial AI red-team across 5 remediation waves.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="border border-black/10 rounded-[14px] p-4 bg-white">
              <div className="text-[11px] uppercase tracking-[1px] text-black/40 font-bold mb-1">
                MFA
              </div>
              <div className="text-[14px] font-semibold">WebAuthn passkeys</div>
            </div>
            <div className="border border-black/10 rounded-[14px] p-4 bg-white">
              <div className="text-[11px] uppercase tracking-[1px] text-black/40 font-bold mb-1">
                Encryption
              </div>
              <div className="text-[14px] font-semibold">TLS 1.3 + AES-256 at rest</div>
            </div>
            <div className="border border-black/10 rounded-[14px] p-4 bg-white">
              <div className="text-[11px] uppercase tracking-[1px] text-black/40 font-bold mb-1">
                Headers
              </div>
              <div className="text-[14px] font-semibold">HSTS preload + CSP + frame-ancestors none</div>
            </div>
            <div className="border border-black/10 rounded-[14px] p-4 bg-white">
              <div className="text-[11px] uppercase tracking-[1px] text-black/40 font-bold mb-1">
                CI gates
              </div>
              <div className="text-[14px] font-semibold">5 mandatory checks per PR</div>
            </div>
          </div>
        </Section>

        <Section num="02" title="Compliance">
          <p className="mb-4">
            SOC 2 Type II audit is on the roadmap. Controls are documented and
            operating today — we're transparent that the CPA-issued
            report is the missing piece, and we'll pay for it when a customer
            contract justifies the cost.
          </p>
          <div className="space-y-3 mt-6">
            <div className="flex items-center justify-between border border-black/10 rounded-[14px] p-4 bg-white">
              <div>
                <div className="text-[14px] font-semibold">SOC 2 Type II</div>
                <div className="text-[12px] text-black/50 mt-0.5">Controls operating; audit deferred</div>
              </div>
              <Pill color="amber">In progress</Pill>
            </div>
            <div className="flex items-center justify-between border border-black/10 rounded-[14px] p-4 bg-white">
              <div>
                <div className="text-[14px] font-semibold">GDPR</div>
                <div className="text-[12px] text-black/50 mt-0.5">Art. 30 record of processing + DSAR procedure</div>
              </div>
              <Pill color="green">
                <CheckIcon /> Self-attest
              </Pill>
            </div>
            <div className="flex items-center justify-between border border-black/10 rounded-[14px] p-4 bg-white">
              <div>
                <div className="text-[14px] font-semibold">HIPAA / PCI DSS</div>
                <div className="text-[12px] text-black/50 mt-0.5">Not applicable — we don't process health or cardholder data</div>
              </div>
              <Pill>N/A</Pill>
            </div>
          </div>
        </Section>

        <Section num="03" title="Sub-processors">
          <p className="mb-5">
            Third parties that touch CH data. We notify customers 30 days
            before adding or changing any sub-processor.
          </p>
          <div className="border border-black/10 rounded-[14px] overflow-hidden bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-black/5 text-left">
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Region</th>
                  <th className="px-4 py-3 font-semibold">SOC 2</th>
                </tr>
              </thead>
              <tbody>
                {subprocessors.map((v, i) => (
                  <tr key={v.name} className={i > 0 ? "border-t border-black/6" : ""}>
                    <td className="px-4 py-3 font-semibold">{v.name}</td>
                    <td className="px-4 py-3 text-black/60">{v.service}</td>
                    <td className="px-4 py-3 text-black/60">{v.location}</td>
                    <td className="px-4 py-3">
                      {v.soc2 ? <CheckIcon /> : <span className="text-black/30">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section num="04" title="Data">
          <p className="mb-4">
            What we store, where, and how long. Detail at{" "}
            <code className="font-mono text-[12px]">docs/compliance/data-inventory.md</code>.
          </p>
          <ul className="space-y-2 mt-4">
            <li className="flex gap-3">
              <span className="text-black/30 font-mono text-[11px] pt-1">→</span>
              <span>
                <strong>Contact + engagement data:</strong> stored in
                Supabase (US-East). Indefinite retention by default; deleted
                within 30 days of a verified request.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono text-[11px] pt-1">→</span>
              <span>
                <strong>What we don't store:</strong> bank account numbers,
                social security / passport numbers, health data, biometric
                data, payment card data.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-black/30 font-mono text-[11px] pt-1">→</span>
              <span>
                <strong>LLM processing:</strong> agent runs send prompts to
                Anthropic Claude. Prompts include text you've authored or
                pulled from CH databases. Anthropic does not train on our
                API traffic.
              </span>
            </li>
          </ul>
        </Section>

        <Section num="05" title="Incident response">
          <p>
            Material incidents affecting customer data are communicated via
            email to your designated contact within 72 hours of confirmation
            (GDPR Art. 33 timing). Operational status is live at{" "}
            <a href="/status" className="underline hover:text-black/60">
              /status
            </a>{" "}
            and updated within 30 minutes of any user-facing impact.
          </p>
        </Section>

        <Section num="06" title="Responsible disclosure">
          <p className="mb-4">
            Found a vulnerability? We respect responsible disclosure and credit
            researchers in our hall of fame.
          </p>
          <div className="border-l-2 border-[#c6f24a] pl-5 py-2 bg-black/3">
            <div className="font-mono text-[13px]">security@wearecommonhouse.com</div>
            <div className="text-[12px] text-black/50 mt-1">
              SLA: ack within 24h. Full policy at{" "}
              <a href="/security" className="underline hover:text-black/70">
                /security
              </a>.
            </div>
          </div>
        </Section>

        <Section num="07" title="Contact">
          <ul className="space-y-2">
            <li>
              <strong>Security & vulnerabilities:</strong>{" "}
              <a href="mailto:security@wearecommonhouse.com" className="underline">
                security@wearecommonhouse.com
              </a>
            </li>
            <li>
              <strong>Customer security questions / DPA:</strong>{" "}
              <a href="mailto:security@wearecommonhouse.com" className="underline">
                security@wearecommonhouse.com
              </a>
            </li>
            <li>
              <strong>Live operational status:</strong>{" "}
              <a href="/status" className="underline">
                /status
              </a>
            </li>
          </ul>
        </Section>

        <footer className="text-[11px] text-black/40 leading-relaxed border-t border-black/10 pt-6 mt-16">
          <div>Last updated: 2026-05-11</div>
          <div className="mt-1">
            Full controls documentation:{" "}
            <code className="font-mono">docs/compliance/</code> in the source repository.
          </div>
        </footer>
      </div>
    </div>
  );
}

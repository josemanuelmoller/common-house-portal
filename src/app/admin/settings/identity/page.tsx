import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getUserIdentity } from "@/lib/user-context";
import { UserIdentityForm } from "@/components/UserIdentityForm";

export const dynamic = "force-dynamic";

export default async function IdentitySettingsPage() {
  await requireAdmin();
  const identity = await getUserIdentity();

  // PORTAL_DESIGN: every hex was tokenized to --hall-* so this page matches
  // the rest of the admin chrome. Lime accent on "identity" stays — the
  // dark hero card here is a brand surface (one of the documented places
  // lime is allowed alongside Focus-of-day + LIVE pulse).
  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main className="flex-1 md:ml-[228px]">
        <header className="px-12 pt-10 pb-11" style={{ background: "var(--hall-ink-0)" }}>
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Settings · Identity
          </p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Your <em className="font-black italic" style={{ color: "var(--hall-lime-ink)" }}>identity</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 max-w-2xl">
            Tell the AI who <em>you</em> are so it never confuses your own orgs or roles with a contact&apos;s. This is injected into every Claude prompt that writes about your contacts — summaries, open loops, news scans, topics.
          </p>
        </header>

        <div className="px-12 py-9 max-w-3xl space-y-6">
          <UserIdentityForm
            initial={{
              user_name:         identity?.user_name         ?? "",
              user_aliases:      identity?.user_aliases      ?? [],
              user_own_orgs:     identity?.user_own_orgs     ?? [],
              user_role_context: identity?.user_role_context ?? "",
            }}
          />

          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-line-soft)" }}
          >
            <p
              className="text-[10px] font-bold tracking-widest uppercase mb-2"
              style={{ color: "var(--hall-muted-2)" }}
            >
              How it works
            </p>
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>
              Every time Claude writes an operating brief, extracts open loops, or scans news for a contact, the values you enter here get prepended to the system prompt. Example:{" "}
              <em>&ldquo;The user is José Manuel Moller. Their own organisations are Common House, Moller Upstream Consultancy. Do not attribute these to OTHER contacts unless evidence explicitly says so.&rdquo;</em>
            </p>
            <p className="text-[11.5px] leading-relaxed mt-2" style={{ color: "var(--hall-ink-3)" }}>
              Per-contact corrections (clickable <em>&ldquo;This is wrong&rdquo;</em> buttons on any AI output) layer on top — those travel with the specific contact record and take precedence over the raw data.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

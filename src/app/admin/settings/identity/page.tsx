import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getUserIdentity } from "@/lib/user-context";
import { UserIdentityForm } from "@/components/UserIdentityForm";

export const dynamic = "force-dynamic";

export default async function IdentitySettingsPage() {
  await requireAdmin();
  const identity = await getUserIdentity();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 md:ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Settings · Identity
          </p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Your <em className="font-black italic text-[#c8f55a]">identity</em>
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

          <div className="bg-[#FAFAF6] border border-[#E0E0D8] rounded-2xl px-5 py-4">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/45 mb-2">How it works</p>
            <p className="text-[11.5px] text-[#131218]/70 leading-relaxed">
              Every time Claude writes an operating brief, extracts open loops, or scans news for a contact, the values you enter here get prepended to the system prompt. Example:{" "}
              <em>&ldquo;The user is José Manuel Moller. Their own organisations are Common House, Moller Upstream Consultancy. Do not attribute these to OTHER contacts unless evidence explicitly says so.&rdquo;</em>
            </p>
            <p className="text-[11.5px] text-[#131218]/70 leading-relaxed mt-2">
              Per-contact corrections (clickable <em>&ldquo;This is wrong&rdquo;</em> buttons on any AI output) layer on top — those travel with the specific contact record and take precedence over the raw data.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

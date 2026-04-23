import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getUserIdentity } from "@/lib/user-identity";
import { UserIdentityEditor } from "@/components/UserIdentityEditor";

export const dynamic = "force-dynamic";

export default async function UserIdentitySettingsPage() {
  const user  = await requireAdmin();
  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  const identity = await getUserIdentity(email);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-8">
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
            <span>Control Room</span>
            <span>›</span>
            <span>Settings</span>
            <span>›</span>
            <span className="text-white/50">AI Grounding</span>
          </div>
          <h1 className="text-[2.4rem] font-light text-white tracking-[-1px] leading-none">
            AI Grounding
          </h1>
          <p className="text-[13px] text-white/55 mt-4 max-w-2xl leading-snug">
            Global facts about you that are injected into every contact-intelligence prompt so the AI
            never confuses your own organisations with someone else&apos;s. Edits take effect on the
            next regeneration — no reindex required.
          </p>
        </header>

        <div className="px-12 py-9 max-w-3xl">
          <UserIdentityEditor initial={identity} />

          <section className="mt-10 bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
              How this is used
            </p>
            <ul className="text-[11.5px] text-[#131218]/70 leading-snug space-y-1.5 list-disc pl-5">
              <li>Prepended to the system prompt of <code className="font-mono text-[10px] bg-[#EFEFEA] px-1">summarize</code>, <code className="font-mono text-[10px] bg-[#EFEFEA] px-1">open-loops</code>, <code className="font-mono text-[10px] bg-[#EFEFEA] px-1">topics/synthesize</code>, and <code className="font-mono text-[10px] bg-[#EFEFEA] px-1">contact-news/scan</code>.</li>
              <li>Tells the model that your own orgs are YOURS — it must not claim a contact works at them unless the input data proves it.</li>
              <li>Complements per-contact corrections (the &ldquo;Fix ✎&rdquo; button on each AI output). Those override this for their specific contact.</li>
              <li>If this block is empty, the prompts still work — they just lose the structural guardrail.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

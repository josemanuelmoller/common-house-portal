// Landing for authenticated users without any client_access grant and not admin.
// Shown when someone signs in but their email/userId isn't mapped to a project.

import { currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";

export const metadata = {
  title: "Common House — No access",
  description: "Your Common House account is not currently linked to any project.",
};

export default async function NoAccessPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{
        background: "var(--hall-paper-1, #f4f4ef)",
        fontFamily: "var(--font-hall-sans)",
      }}
    >
      <div className="max-w-[480px] w-full">
        <div className="text-[11px] uppercase tracking-[1.5px] font-bold mb-3 text-black/40">
          Common House
        </div>
        <h1 className="text-[40px] font-light tracking-[-1.2px] leading-[1] mb-6">
          Not yet linked
        </h1>
        <p className="text-[15px] leading-[1.65] text-black/65 mb-6">
          You&apos;re signed in
          {email ? (
            <>
              {" "}as <code className="font-mono text-[13px]">{email}</code>,
            </>
          ) : (
            ","
          )}{" "}
          but your account isn&apos;t connected to a project yet.
        </p>
        <p className="text-[15px] leading-[1.65] text-black/65 mb-8">
          Reach out to your Common House contact and they&apos;ll wire your
          access. Once it&apos;s in place, sign out and back in and you&apos;ll
          land directly in your project space.
        </p>
        <div className="border-l-2 border-[#c6f24a] pl-5 py-3 bg-black/3 mb-8">
          <div className="text-[11px] uppercase tracking-[1px] text-black/50 font-bold mb-1">
            Need help?
          </div>
          <a
            href="mailto:hello@wearecommonhouse.com"
            className="font-mono text-[13px] underline hover:text-black/70"
          >
            hello@wearecommonhouse.com
          </a>
        </div>
        <SignOutButton>
          <button
            type="button"
            className="text-[13px] font-semibold underline text-black/60 hover:text-black/90"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}

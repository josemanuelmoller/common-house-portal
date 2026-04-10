import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#131218] flex flex-col items-center justify-center">
      {/* Logo */}
      <div className="mb-8 text-center">
        <p className="text-white font-bold text-2xl tracking-tight leading-tight">
          common<br />house
        </p>
        <span className="mt-3 inline-block bg-[#B2FF59] text-[#131218] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
          Client Portal
        </span>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: "shadow-none",
            card: "rounded-2xl border border-white/10 shadow-none bg-white",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            formButtonPrimary:
              "bg-[#131218] hover:bg-[#131218]/80 text-white rounded-xl text-sm font-semibold tracking-wide",
            formFieldInput:
              "rounded-xl border-[#E0E0D8] focus:border-[#131218] focus:ring-0",
            footerActionLink: "text-[#131218] font-semibold",
          },
        }}
      />
    </div>
  );
}

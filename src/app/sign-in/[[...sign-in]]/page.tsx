import { SignIn } from "@clerk/nextjs";
import { BrandLogo } from "@/components/BrandLogo";

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: "var(--hall-paper-1)",
        fontFamily: "var(--font-hall-sans)",
      }}
    >
      <div className="mb-8 text-center flex flex-col items-center">
        <BrandLogo variant="black" height={72} priority />
        <p
          className="text-[18px] tracking-tight mt-3"
          style={{
            fontFamily: "var(--font-hall-display)",
            fontStyle: "italic",
            fontWeight: 400,
            color: "var(--hall-ink-0)",
          }}
        >
          portal
        </p>
        <span
          className="mt-3 inline-block text-[10px] font-bold px-3 py-1 rounded-full uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            background: "var(--hall-lime-soft)",
            color: "var(--hall-lime-ink)",
            letterSpacing: "0.14em",
          }}
        >
          Client Portal
        </span>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: "shadow-none",
            card: "rounded-[3px] shadow-none",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            formButtonPrimary:
              "bg-[#0a0a0a] hover:bg-[#2a2a2a] text-white rounded-[3px] text-sm font-semibold tracking-wide",
            formFieldInput:
              "rounded-[3px] border-[#e4e4dd] focus:border-[#0a0a0a] focus:ring-0",
            footerActionLink: "text-[#0a0a0a] font-semibold",
          },
        }}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "+" button to jump to /admin/capture/new from any admin page.
 * Hidden on the capture form itself.
 */
export function CaptureFAB() {
  const pathname = usePathname();
  if (
    pathname?.startsWith("/admin/capture/new") ||
    pathname?.startsWith("/sign-in")
  ) {
    return null;
  }
  return (
    <Link
      href="/admin/capture/new"
      aria-label="Captura rápida"
      className="fixed z-40 flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        right: "18px",
        width: "52px",
        height: "52px",
        background: "var(--hall-ink-0)",
        color: "var(--hall-paper-0)",
        fontSize: "26px",
        lineHeight: "1",
      }}
    >
      +
    </Link>
  );
}

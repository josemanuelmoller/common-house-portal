import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/**
 * PortalShell — canonical K-v2 page layout for every admin surface.
 *
 * Use this on every NEW admin page so the K-v2 design system (tokens,
 * fonts, mobile responsiveness, header pattern) is applied automatically.
 * No need to remember `md:ml-60`, `px-4 sm:px-9`, eyebrow font sizes,
 * or any of the inline patterns scattered across the legacy pages.
 *
 * See docs/PORTAL_DESIGN.md for the full design system reference.
 *
 * @example
 *   <PortalShell
 *     eyebrow={{ label: "KNOWLEDGE", accent: `${count} NODES` }}
 *     title="Knowledge"
 *     flourish="tree"
 *     meta="updated 14 min ago"
 *   >
 *     <HallSection title="Domain" flourish="overview">…</HallSection>
 *   </PortalShell>
 */

type PortalShellProps = {
  /** Mono uppercase eyebrow above/inline with the title. The optional
   *  `accent` is rendered in bold ink-0 (the rest stays muted). */
  eyebrow?: { label: string; accent?: string };

  /** Page title — Inter Tight 16px, ink-0. Bold spans (e.g. user name)
   *  can be passed as a ReactNode. */
  title: ReactNode;

  /** Optional italic Instrument Serif word(s) appended to title.
   *  E.g. title="Knowledge" + flourish="tree" → "Knowledge *tree*." */
  flourish?: string;

  /** Append a "." after the title. Default true. */
  period?: boolean;

  /** Right-side meta on the header. Can be:
   *    - text/ReactNode (mono stats, action buttons, HallLiveClock, etc.)
   *    - a tuple `[desktopNode, mobileNode]` to render different versions
   *      at >=sm vs. <sm. If you pass a single node it stays the same on
   *      both, which is fine for short content but causes overflow with
   *      long stat strips. */
  meta?: ReactNode;

  /** Mobile-only meta override. When provided, this shows below `sm`
   *  and `meta` shows above `sm`. Use for compact stat rollups. */
  metaMobile?: ReactNode;

  /** Optional subtitle paragraph below the header. */
  subtitle?: ReactNode;

  /** Optional tab nav between header and body. */
  tabs?: ReactNode;

  /** Constrain body to a max-width. Default false (full width). */
  narrow?: boolean;

  /** Vertical spacing between top-level body children. Default 7 (28px). */
  bodySpacing?: 5 | 6 | 7 | 8;

  /** Disable body padding entirely. Useful when the body is a custom
   *  full-bleed grid (e.g. the Hall tab grid). Default false. */
  bodyBleed?: boolean;

  /** Optional className additions on the inner body container. */
  bodyClassName?: string;

  /** Body content. */
  children: ReactNode;
};

const SPACING_CLS: Record<NonNullable<PortalShellProps["bodySpacing"]>, string> = {
  5: "space-y-5",
  6: "space-y-6",
  7: "space-y-7",
  8: "space-y-8",
};

export function PortalShell({
  eyebrow,
  title,
  flourish,
  period = true,
  meta,
  metaMobile,
  subtitle,
  tabs,
  narrow = false,
  bodySpacing = 7,
  bodyBleed = false,
  bodyClassName = "",
  children,
}: PortalShellProps) {
  const bodyPadding = bodyBleed ? "" : "px-4 sm:px-9 py-5 sm:py-6";
  const bodyWidth = narrow ? "max-w-5xl" : "";
  const bodySpacingCls = SPACING_CLS[bodySpacing];

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-60 overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 thin 1-line header */}
        <header
          className="flex items-center justify-between gap-3 sm:gap-6 px-4 sm:px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-3 sm:gap-4 min-w-0 flex-1">
            {eyebrow && (
              <span
                className="hidden sm:inline text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                {eyebrow.label}
                {eyebrow.accent && (
                  <>
                    {" · "}
                    <b style={{ color: "var(--hall-ink-0)" }}>{eyebrow.accent}</b>
                  </>
                )}
              </span>
            )}
            <h1
              className="text-[15px] sm:text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {title}
              {flourish && (
                <>
                  {" "}
                  <em
                    style={{
                      fontFamily: "var(--font-hall-display)",
                      fontStyle: "italic",
                      fontWeight: 400,
                    }}
                  >
                    {flourish}
                  </em>
                </>
              )}
              {period && "."}
            </h1>
          </div>

          {meta && (
            <div className={metaMobile ? "hidden sm:block" : "block"}>
              {meta}
            </div>
          )}
          {metaMobile && (
            <div className="sm:hidden">
              {metaMobile}
            </div>
          )}
        </header>

        {subtitle && (
          <div
            className="px-4 sm:px-9 pt-4 pb-2 text-[11.5px] max-w-3xl leading-relaxed"
            style={{ color: "var(--hall-muted-2)" }}
          >
            {subtitle}
          </div>
        )}

        {tabs}

        <div className={`${bodyPadding} ${bodyWidth} ${bodySpacingCls} ${bodyClassName}`.trim()}>
          {children}
        </div>
      </main>
    </div>
  );
}

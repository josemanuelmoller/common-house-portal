import { type ReactNode } from "react";

/**
 * HallSection — K-v2 section wrapper.
 *
 * Renders the standard K-v2 section head (h2 with ink-0 border-bottom,
 * optional italic Instrument Serif flourish, optional mono meta on the
 * right) and the section body below with standard vertical spacing.
 *
 * Design rules:
 *   - h2 font: Inter Tight 19px weight 700 letter-spacing -0.02em
 *   - flourish: Instrument Serif italic 400, same ink color (NEVER lime)
 *   - meta: JetBrains Mono 10px, muted, letter-spacing 0.06em
 *   - border-bottom under head: 1px solid ink-0
 *   - margin-bottom between sections: 28px
 */

type Props = {
  title: string;
  /** Italic Instrument Serif word(s) that follow the title (e.g. "blocks"). */
  flourish?: string;
  /** Right-aligned mono meta (e.g. "3 PROPOSED · TODAY & TOMORROW"). */
  meta?: string;
  /** Pass data-hall-tab through so the whole section is tab-scoped. */
  tab?: string;
  children: ReactNode;
};

export function HallSection({ title, flourish, meta, tab, children }: Props) {
  return (
    <section
      className="mb-7"
      data-hall-tab={tab}
      style={{ fontFamily: "var(--font-hall-sans)" }}
    >
      <div
        className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
        style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
      >
        <h2
          className="text-[19px] font-bold leading-none"
          style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
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
                  color: "var(--hall-ink-0)",
                }}
              >
                {flourish}
              </em>
            </>
          )}
        </h2>
        {meta && (
          <span
            className="text-[10px] tracking-[0.06em] whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

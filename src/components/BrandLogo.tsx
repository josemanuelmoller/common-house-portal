import Image from "next/image";

/**
 * BrandLogo — official Common House wordmark.
 *
 * Source files live in /public/brand/common-house-{black,lime,white}.png.
 * Native aspect ratio is 3445×1102 ≈ 3.126:1.
 *
 * Use the variant that contrasts with the surface it sits on:
 *   - black → default, on paper / light backgrounds
 *   - white → on dark backgrounds (ink-0 headers, dark banners)
 *   - lime  → on pure black surfaces where lime accent is allowed
 *
 * Provide either `height` (width is derived from the aspect ratio) or a
 * `className` with an aspect-ratio constraint. Default height is 48px.
 */

type Variant = "black" | "white" | "lime";

type Props = {
  variant?: Variant;
  /** Pixel height. Width is auto-derived. Default 48. */
  height?: number;
  /** Optional override for the <Image> className. */
  className?: string;
  /** For SEO / screen-readers. Default "Common House". */
  alt?: string;
  priority?: boolean;
};

const SRC: Record<Variant, string> = {
  black: "/brand/common-house-black.png",
  white: "/brand/common-house-white.png",
  lime:  "/brand/common-house-lime.png",
};

// Native intrinsic dimensions of the source PNG — used to preserve
// aspect ratio without layout shift.
const NATIVE_WIDTH  = 3445;
const NATIVE_HEIGHT = 1102;
const ASPECT = NATIVE_WIDTH / NATIVE_HEIGHT;

export function BrandLogo({
  variant = "black",
  height = 48,
  className,
  alt = "Common House",
  priority = false,
}: Props) {
  const width = Math.round(height * ASPECT);
  return (
    <Image
      src={SRC[variant]}
      width={width}
      height={height}
      alt={alt}
      priority={priority}
      className={className}
      style={{ width, height, objectFit: "contain" }}
    />
  );
}

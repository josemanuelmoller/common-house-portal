"use client";

import { useState } from "react";

/**
 * Contact avatar: renders the photo_url if present, falls back to a coloured
 * circle with the first initial. Graceful on 404 (Google Contacts URLs can
 * rotate) — if the `<img>` fails to load, we transparently switch to
 * initials without a broken-image icon.
 */
export function ContactAvatar({
  photoUrl,
  display,
  size = 40,
  rounded = "full",
}: {
  photoUrl: string | null | undefined;
  display:  string;
  size?:    number;
  rounded?: "full" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const initial = (display || "?").trim().slice(0, 1).toUpperCase() || "?";
  const ring = rounded === "full" ? "rounded-full" : "rounded-lg";

  if (photoUrl && !failed) {
    // Append size hint for Google URLs (=s256 upscales the thumbnail
    // cleanly). Gravatar already has ?s=256 in the URL.
    const src = photoUrl.includes("googleusercontent.com") && !photoUrl.includes("=s")
      ? `${photoUrl}=s${size * 2}`
      : photoUrl;
    return (
      <img
        src={src}
        alt={display}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${ring} object-cover bg-[#0a0a0a] flex-shrink-0`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`${ring} bg-[#0a0a0a] text-white flex items-center justify-center font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initial}
    </div>
  );
}

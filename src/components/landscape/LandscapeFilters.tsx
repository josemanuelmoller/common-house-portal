"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Initial = {
  q: string;
  cat: string;
  region: string;
  country: string;
  stage: string;
  status: string;
  promoted: string;
};

type Props = {
  categories: string[];
  regions: string[];
  countries: string[];
  stages: string[];
  initial: Initial;
};

export function LandscapeFilters({
  categories,
  regions,
  countries,
  stages,
  initial,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Initial>(initial);

  function apply(next: Partial<Initial>) {
    const merged = { ...state, ...next };
    setState(merged);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "") qs.set(k, v);
    }
    startTransition(() => router.push(`/admin/landscape${qs.toString() ? `?${qs}` : ""}`));
  }

  function reset() {
    const cleared: Initial = {
      q: "",
      cat: "",
      region: "",
      country: "",
      stage: "",
      status: "",
      promoted: "",
    };
    setState(cleared);
    startTransition(() => router.push("/admin/landscape"));
  }

  const labelCls = "text-[10px] uppercase tracking-[0.06em] mb-1 block";
  const selectCls =
    "w-full text-[12px] px-2 py-1.5 bg-transparent focus:outline-none";
  const selectStyle: React.CSSProperties = {
    border: "1px solid var(--hall-line-strong)",
    borderRadius: 3,
    color: "var(--hall-ink-0)",
    fontFamily: "var(--font-hall-sans)",
    background: "var(--hall-paper-0)",
  };

  return (
    <section
      className="mb-6 grid gap-3 sm:gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}
    >
      <div className="sm:col-span-2 col-span-full">
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Search
        </label>
        <input
          type="text"
          placeholder="name, mission, description…"
          value={state.q}
          onChange={(e) => setState({ ...state, q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ q: state.q });
          }}
          onBlur={() => {
            if (state.q !== initial.q) apply({ q: state.q });
          }}
          className={selectCls}
          style={selectStyle}
        />
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Category
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.cat}
          onChange={(e) => apply({ cat: e.target.value })}
        >
          <option value="">All ({categories.length})</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Region
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.region}
          onChange={(e) => apply({ region: e.target.value })}
        >
          <option value="">All</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Country
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.country}
          onChange={(e) => apply({ country: e.target.value })}
        >
          <option value="">All ({countries.length})</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Stage
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.stage}
          onChange={(e) => apply({ stage: e.target.value })}
        >
          <option value="">All</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Status
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.status}
          onChange={(e) => apply({ status: e.target.value })}
        >
          <option value="">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div>
        <label
          className={labelCls}
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          In CH network
        </label>
        <select
          className={selectCls}
          style={selectStyle}
          value={state.promoted}
          onChange={(e) => apply({ promoted: e.target.value })}
        >
          <option value="">All</option>
          <option value="yes">Promoted</option>
          <option value="no">Not promoted</option>
        </select>
      </div>

      <div className="flex items-end">
        <button
          type="button"
          onClick={reset}
          className="text-[10px] uppercase tracking-[0.06em] px-3 py-1.5 w-full"
          style={{
            fontFamily: "var(--font-hall-mono)",
            border: "1px solid var(--hall-line-strong)",
            borderRadius: 3,
            background: "var(--hall-paper-0)",
            color: "var(--hall-ink-0)",
            opacity: pending ? 0.4 : 1,
          }}
          disabled={pending}
        >
          {pending ? "…" : "Reset"}
        </button>
      </div>
    </section>
  );
}

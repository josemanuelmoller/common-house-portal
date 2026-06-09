/**
 * SafeServerSection — turns an async server-component render into one
 * that cannot crash the whole page. If the render function throws, we
 * catch it, persist the stack to `public.debug_log`, and render a small
 * inline fallback instead of the section's normal output.
 *
 * Why: `/admin` mounts ~10 self-fetching server components inside
 * <Suspense>. A single rejection in any of them bubbles up to error.tsx
 * and blanks the dashboard. After 2026-05-18 the failure mode was a
 * TypeError with no source location surfaced; sections were the unit of
 * failure but not the unit of recovery. This wrapper makes them both.
 *
 * Pattern (render-prop, not children — children of a JSX element does
 * NOT bubble through to React's render-time error path):
 *
 *   <Suspense fallback={<HallSkeleton lines={3} />}>
 *     <SafeServerSection name="HallPipelineState" render={() => HallPipelineState()} />
 *   </Suspense>
 *
 * `render` is invoked here, awaited inside this try/catch, and any
 * thrown error is captured to debug_log with source = `admin/section:<name>`.
 */

import { logServerError } from "@/lib/debug-log";

export async function SafeServerSection({
  name,
  render,
}: {
  name: string;
  render: () => React.ReactNode | Promise<React.ReactNode>;
}) {
  try {
    return await Promise.resolve(render());
  } catch (err) {
    await logServerError(`admin/section:${name}`, err, { section: name });
    return (
      <div
        className="text-[11px] rounded px-3 py-2 my-1"
        style={{
          color: "var(--hall-muted-3)",
          border: "1px dashed var(--hall-line-soft)",
          background: "var(--hall-paper-1)",
        }}
      >
        Section <b>{name}</b> failed to render — captured to debug_log.
      </div>
    );
  }
}

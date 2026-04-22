import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

/**
 * GET /api/hall/network — builds a network graph of Jose's contacts based on
 * co-attendance in hall_calendar_events (last 180d). Two contacts share an
 * edge if they appear together in ≥ 2 events. Nodes are placed on concentric
 * rings by relationship class priority.
 *
 * Returns { ok, nodes: Node[], edges: Edge[] }.
 */

type NodeOut = {
  email:    string;
  name:     string;
  classes:  string[];
  top:      string;
  touches:  number;
  ring:     number;    // 1 (inner) .. 4 (outer)
};
type EdgeOut = { a: string; b: string; weight: number };

const CLASS_RING: Record<string, number> = {
  Family:          1, Friend:        1, "Personal Service": 1,
  VIP:             2, Client:        2, Investor:       2, Funder: 2,
  Portfolio:       3, Partner:       3, Team:           3,
  Vendor:          4, External:      4,
};

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const since = new Date(Date.now() - 180 * 86400_000).toISOString();

  const [attRes, evRes] = await Promise.all([
    sb.from("people")
      .select("email, display_name, relationship_classes, meeting_count, transcript_count, email_thread_count")
      .not("relationship_classes", "is", null),
    sb.from("hall_calendar_events")
      .select("event_id, attendee_emails, event_start")
      .gte("event_start", since)
      .eq("is_cancelled", false)
      .limit(3000),
  ]);

  type Att = {
    email: string; display_name: string | null; relationship_classes: string[] | null;
    meeting_count: number | null; transcript_count: number | null; email_thread_count: number | null;
  };
  const attendees = (attRes.data ?? []) as Att[];

  // Filter to contacts with at least one class AND at least 2 total touches
  const registry = new Map<string, Att>();
  for (const a of attendees) {
    if (!a.email || selfSet.has(a.email.toLowerCase())) continue;
    const classes = a.relationship_classes ?? [];
    if (classes.length === 0) continue;
    const touches = (a.meeting_count ?? 0) + (a.transcript_count ?? 0) + (a.email_thread_count ?? 0);
    if (touches < 2) continue;
    registry.set(a.email.toLowerCase(), a);
  }

  // Walk calendar events to build co-attendance graph
  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const pairCount = new Map<string, number>();
  for (const ev of (evRes.data ?? []) as { attendee_emails: string[] | null }[]) {
    const filtered = (ev.attendee_emails ?? [])
      .map(e => e.toLowerCase())
      .filter(e => !selfSet.has(e) && registry.has(e));
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const k = pairKey(filtered[i], filtered[j]);
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
    }
  }

  // Build edge list ≥2 co-occurrences
  const edges: EdgeOut[] = [];
  const usedEmails = new Set<string>();
  for (const [k, w] of pairCount.entries()) {
    if (w < 2) continue;
    const [a, b] = k.split("|");
    edges.push({ a, b, weight: w });
    usedEmails.add(a);
    usedEmails.add(b);
  }

  // Nodes = any registered contact that's in at least one edge (prevents
  // isolated floaters). If no edges exist, still show top-30 by touches.
  const nodes: NodeOut[] = [];
  const source = usedEmails.size > 0
    ? [...usedEmails]
    : [...registry.keys()].slice(0, 30);

  for (const email of source) {
    const a = registry.get(email)!;
    const classes = a.relationship_classes ?? [];
    // Top class = highest-priority one with lowest ring value present
    let top = classes[0];
    let minRing = CLASS_RING[top] ?? 4;
    for (const c of classes) {
      const r = CLASS_RING[c] ?? 4;
      if (r < minRing) { minRing = r; top = c; }
    }
    const touches = (a.meeting_count ?? 0) + (a.transcript_count ?? 0) + (a.email_thread_count ?? 0);
    nodes.push({
      email,
      name:    a.display_name ?? email.split("@")[0],
      classes,
      top,
      touches,
      ring:    minRing,
    });
  }

  // Prune edges to nodes only (belt+suspenders in isolated fallback case)
  const nodeSet = new Set(nodes.map(n => n.email));
  const prunedEdges = edges.filter(e => nodeSet.has(e.a) && nodeSet.has(e.b));

  return NextResponse.json({ ok: true, nodes, edges: prunedEdges });
}

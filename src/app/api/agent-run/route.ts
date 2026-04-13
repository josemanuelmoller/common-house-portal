import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const AGENT_API_KEY = process.env.AGENT_API_KEY

export async function POST(req: NextRequest) {
  // Validate agent API key
  const key = req.headers.get("x-agent-key")
  if (!AGENT_API_KEY || key !== AGENT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { agent_name, status, output_summary, items_processed, duration_seconds } = body

  if (!agent_name || !status) {
    return NextResponse.json({ error: "agent_name and status required" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // service key for server-side writes
  )

  const { error } = await supabase.from("agent_runs").insert({
    agent_name,
    status,
    output_summary: output_summary ?? null,
    items_processed: items_processed ?? 0,
    duration_seconds: duration_seconds ?? null,
  })

  if (error) {
    console.error("agent_runs insert error:", error)
    return NextResponse.json({ error: "Insert failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

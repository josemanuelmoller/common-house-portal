/* Variant K-v2 — K con 8 ajustes de UX aplicados:
   1. Focus más pesado + countdown live
   2. Right col reordenada por proximidad temporal
   3. Suggested blocks: fila clickable, CTA en hover
   4. Header colapsado una línea + tabs con contadores
   5. Deadline movido al right col
   6. Commitments 2-col (I owe / Owed)
   7. Inbox 5 items + "más"
   8. Lime reservado solo para focus + now */

function VariantK2() {
  const [now, setNow] = React.useState(new Date(2026, 3, 23, 14, 9));
  React.useEffect(() => {
    const t = setInterval(() => setNow(d => new Date(d.getTime() + 60000)), 30000);
    return () => clearInterval(t);
  }, []);
  const focusStart = new Date(2026, 3, 23, 14, 30);
  const diffMin = Math.max(0, Math.round((focusStart - now) / 60000));
  const meetStart = new Date(2026, 3, 23, 15, 0);
  const meetDiff = Math.max(0, Math.round((meetStart - now) / 60000));

  return (
    <div className="hall-root">
      <Sidebar />
      <main className="vK2-main">
        {/* 4. Header colapsado — una línea */}
        <header className="vK2-top">
          <div className="vK2-top-l">
            <span className="vK2-top-eyebrow">THE HALL · <b>THU 23 APR</b></span>
            <span className="vK2-h1">Hi <span>Jose Manuel</span>.</span>
          </div>
          <div className="vK2-top-r">
            <span className="time">{String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}</span>
            <span className="sep"/>
            <span>17 AGENTS ONLINE</span>
          </div>
        </header>

        {/* 4. Tabs con contadores */}
        <div className="vK2-tabs">
          <span className="on">Today <b>3</b></span>
          <span className="alert">Signals <b>3 new</b></span>
          <span>Relationships <b>8</b></span>
          <span>Portfolio <b>15</b></span>
        </div>

        <div className="vK2-grid">
          {/* LEFT COL — narrativa del día */}
          <div className="vK2-col left">

            {/* 1. FOCUS — mucho más peso visual + countdown live */}
            <section className="vK2-box">
              <div className="vK2-chips">
                <span className="vK2-chip-dark">FOCUS OF THE DAY</span>
                <span className="vK2-chip-out"><span className="live-dot"/> LIVE</span>
              </div>
              <div className="vK2-focus">
                <div className="vK2-focus-top">
                  <span style={{fontFamily:"JetBrains Mono", fontSize:10, color:"#6b6b6b", letterSpacing:"0.08em"}}>14:30 · 30 MIN WINDOW</span>
                  <span className="vK2-focus-countdown">
                    <span className="dot"/>
                    Starts in <b>{diffMin} min</b>
                  </span>
                </div>
                <div className="vK2-focus-grid">
                  <div className="vK2-focus-ico">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>
                  </div>
                  <div className="vK2-focus-body">
                    <h3>Decide raise path — SAFE or Series A.</h3>
                    <p>Between a SAFE extension and a priced round. Unblocks 3 portfolio missions and sets Q2 investor strategy. Evidence is ready.</p>
                    <span className="mono">
                      <span className="pill">ops-manager</span>
                      <span className="pill">portfolio-director</span>
                      <span>12 evidence docs</span>
                    </span>
                    <div className="vK2-focus-actions">
                      <button className="btn-p">Start 30-min block →</button>
                      <button className="btn-o">Open evidence · 12</button>
                      <button className="btn-g">Postpone · Delegate</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Suggested blocks — filas clickables, CTA en hover */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Suggested <em>blocks</em></h2>
                <span className="meta">3 PROPOSED · TODAY & TOMORROW</span>
              </div>
              <div className="vK2-tb">
                <div className="vK2-tb-row">
                  <div className="vK2-tb-time"><b>FRI 11:40</b>12:30 · 50m</div>
                  <div className="vK2-tb-body">
                    <b>Prep for "Reúso"</b>
                    <em>VIP attendee confirmed · meeting FRI 07:00. Review open commitments and walk in with prep actions decided.</em>
                    <span className="tag">PREP · reúso</span>
                  </div>
                  <button className="cta">Block →</button>
                </div>
                <div className="vK2-tb-row">
                  <div className="vK2-tb-time"><b>FRI 15:10</b>15:55 · 45m</div>
                  <div className="vK2-tb-body">
                    <b>Follow up on "Reuse For All Kiu"</b>
                    <em>Meeting ended 16h ago — follow-up decays fast. One email to 2 attendees.</em>
                    <span className="tag">FOLLOW-UP · kiu</span>
                  </div>
                  <button className="cta">Block →</button>
                </div>
                <div className="vK2-tb-row">
                  <div className="vK2-tb-time"><b>THU 13:30</b>14:45 · 75m</div>
                  <div className="vK2-tb-body">
                    <b>Unblock — Venue constraints</b>
                    <em>Near-airport venue requires full build-out. Decision written down and unblocked next step.</em>
                    <span className="tag">DEEP · foro-basura-cero</span>
                  </div>
                  <button className="cta">Block →</button>
                </div>
              </div>
            </section>

            {/* 7. Inbox — 5 items + "más" */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Inbox · <em>needs attention</em></h2>
                <span className="meta">5 VISIBLE · 12 TOTAL</span>
              </div>
              <ul className="vK2-list">
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>Follow-up ZW Districts</b><em>Neil Khor · requires follow-up on funders</em></div>
                  <span className="mono late">7d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>ZW Awards nominations</b><em>Neil Khor · unread · needs names</em></div>
                  <span className="mono late">6d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>Video call with Manuel Maqueda</b><em>Apr 16 · 30 min — The Americas</em></div>
                  <span className="mono late">7d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>California Common House sequence</b><em>Team · needs project plan sign-off</em></div>
                  <span className="mono">4d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>Baptiste / ADEME panel slot</b><em>Awaiting your go/no-go</em></div>
                  <span className="mono">3d</span>
                </li>
                <button className="more">+ 7 más en inbox →</button>
              </ul>
            </section>

            {/* 6. Commitments — 2 columnas */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Commitments</h2>
                <span className="meta">10 ACTIVE</span>
              </div>
              <div className="vK2-commit-grid">
                <div className="vK2-commit-col">
                  <h4><b>5</b>I OWE</h4>
                  <ul className="vK2-commit-list">
                    <li><div><b>Data flow sketch</b><em>reuse pilot</em></div><span className="mono warn">6d</span></li>
                    <li><div><b>Paris meeting dep.</b><em>post-event coord.</em></div><span className="mono warn">6d</span></li>
                    <li><div><b>California sequence</b><em>project plan</em></div><span className="mono">4d</span></li>
                    <li><div><b>ADEME panel reply</b><em>Baptiste</em></div><span className="mono">3d</span></li>
                    <li><div><b>Q2 board prep</b><em>deck + memo</em></div><span className="mono">2d</span></li>
                  </ul>
                </div>
                <div className="vK2-commit-col">
                  <h4><b>5</b>OWED TO ME</h4>
                  <ul className="vK2-commit-list">
                    <li><div><b>ZWD Plan</b><em>Neil Khor</em></div><span className="mono late">7d</span></li>
                    <li><div><b>Consulting opp.</b><em>waiting</em></div><span className="mono late">29d</span></li>
                    <li><div><b>Env. Ministers Panel</b><em>confirmation</em></div><span className="mono late">4d</span></li>
                    <li><div><b>ZW draft</b><em>Neil</em></div><span className="mono">3d</span></li>
                    <li><div><b>Reúso deck</b><em>Mariel</em></div><span className="mono">2d</span></li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COL — contexto ordenado por proximidad temporal:
              2. Next meeting (inminente) → Deadline (semana) → Allocation (week) → Signals → Agents */}
          <div className="vK2-col right">

            {/* Next meeting */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Next <em>meeting</em></h2>
                <span className="meta">IN {meetDiff} MIN</span>
              </div>
              <div className="vK2-next">
                <h4>Foro Basura Cero · José y GAIA</h4>
                <div className="vK2-next-sub">THU 23 APR · 15:00 · 60 MIN</div>
                <span className="vK2-next-countdown"><span className="dot"/> Starts in {meetDiff} min</span>
                <div className="vK2-next-lbl">Attendees</div>
                <div className="vK2-next-at">
                  <span>mariel · ext</span>
                  <span>macarena · ext</span>
                  <span>cecilia · ext</span>
                </div>
                <div className="vK2-next-lbl">Talking points</div>
                <ul className="vK2-next-tp">
                  <li>Align zero-waste forum objectives with GAIA priorities.</li>
                  <li>Clarify José / GAIA roles in forum leadership.</li>
                  <li>Concrete next steps and launch resources.</li>
                </ul>
              </div>
            </section>

            {/* 5. Deadline — movido del medio al right col */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>This <em>week</em></h2>
                <span className="meta">1 DEADLINE</span>
              </div>
              <div className="vK2-dead">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d98a00" strokeWidth="1.8" style={{marginTop:2}}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <div>
                  <b>Editorial Policy — escalation rules</b>
                  <em>When to escalate Content Pipeline feedback.</em>
                  <div className="when">CLOSES APR 30 · 7 DAYS</div>
                </div>
              </div>
            </section>

            {/* Allocation */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Time <em>allocation</em></h2>
                <span className="meta">WEEK · 33.3H</span>
              </div>
              <div>
                <Alc2 label="Partner" v={46} tgt={15} st="over"/>
                <Alc2 label="Client" v={30} tgt={20} st="ok"/>
                <Alc2 label="Funder" v={9} tgt={5} st="ok"/>
                <Alc2 label="Portfolio" v={6} tgt={20} st="under"/>
                <Alc2 label="Team" v={3} tgt={10} st="under"/>
                <Alc2 label="Admin" v={6} tgt={5} st="ok"/>
              </div>
            </section>

            {/* Signals */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Market <em>signals</em></h2>
                <span className="meta">3 NEW · 8H</span>
              </div>
              <ul className="vK2-sig">
                <li>
                  <span className="k">Policy</span>
                  <p>UK Extended Producer Responsibility shifts waste costs to producers over 50 tonnes annually.</p>
                  <span className="age">8h</span>
                </li>
                <li>
                  <span className="k">Funding</span>
                  <p>UK government commits £1.1B+ via Innovate UK Smart Grants, BBRs and sector challenges.</p>
                  <span className="age">12h</span>
                </li>
                <li>
                  <span className="k">Sector</span>
                  <p>Ellen MacArthur framework defines circular transition as the decade's central challenge.</p>
                  <span className="age">1d</span>
                </li>
              </ul>
            </section>

            {/* 2. Agents — al final (sistema, no acción) */}
            <section className="vK2-box">
              <div className="vK2-box-head">
                <h2>Agents</h2>
                <span className="meta">24H · SYSTEM</span>
              </div>
              <div className="vK2-ag-stats">
                <div><b>70</b><span>runs</span></div>
                <div><b>2,559</b><span>writes</span></div>
                <div><b style={{color:"#d93636"}}>11</b><span>errors 7d</span></div>
              </div>
              <ul className="vK2-list">
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg></div>
                  <div><b>Grant Radar</b><em>4 new candidates</em></div>
                  <span className="mono" style={{color:"#2f9e44"}}>OK</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></div>
                  <div><b>Deal Flow</b><em>Needs human review</em></div>
                  <span className="mono" style={{color:"#d98a00"}}>WARN</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Alc2({label, v, tgt, st}) {
  return (
    <div className={"vK2-alc-row " + st}>
      <b>{label}</b>
      <div className="track">
        <span style={{width: Math.min(v, 100)+"%"}}/>
        <span className="mark" style={{left: tgt+"%"}}/>
      </div>
      <span className="v">{v}%/{tgt}%</span>
      <span className="s">{st === "over" ? "OVER" : st === "under" ? "UNDER" : "OK"}</span>
    </div>
  );
}

window.VariantK2 = VariantK2;

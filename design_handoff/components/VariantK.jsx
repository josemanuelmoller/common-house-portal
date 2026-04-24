/* Variant K — structure like A (2-col), aesthetic from agent-architecture ref.
   Focus of the day is a regular box (not the header hero). */

function VariantK() {
  return (
    <div className="hall-root">
      <Sidebar />
      <main className="vK-main">
        {/* Header is just a greeting + date — no focus hero */}
        <header className="vK-top">
          <div className="vK-top-l">
            <div className="vK-top-eyebrow">THE HALL · <b>THU 23 APR 2026</b></div>
            <h1 className="vK-h1">Good afternoon, <em>Jose Manuel</em>.</h1>
            <div className="vK-top-summary">
              <span><b>3</b> things today</span>
              <span className="sep"/>
              <span><b>1</b> deadline this week</span>
              <span className="sep"/>
              <span><b>4</b> projects blocked</span>
            </div>
          </div>
          <div className="vK-top-r">
            <span className="time">14:09</span>
            <span>17 AGENTS ONLINE</span>
          </div>
        </header>

        <div className="vK-tabs">
          <span className="on">Today</span>
          <span>Signals</span>
          <span>Relationships</span>
          <span>Portfolio</span>
        </div>

        <div className="vK-grid">
          {/* LEFT COL */}
          <div className="vK-col left">

            {/* Focus of the day — a BOX, not the header */}
            <section className="vK-box">
              <div className="vK-chips">
                <span className="vK-chip-dark">FOCUS OF THE DAY</span>
                <span className="vK-chip-out"><span className="live-dot"/> LIVE</span>
              </div>
              <div className="vK-box-head">
                <h2>One <em>decision</em> today.</h2>
                <span className="vK-box-meta">14:30 · 30 MIN WINDOW</span>
              </div>
              <div className="vK-focus">
                <div className="vK-focus-grid">
                  <div className="vK-focus-ico">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>
                  </div>
                  <div className="vK-focus-meta">
                    <b>Decide raise path · Reuse for All</b>
                    <em>Between a SAFE extension and a priced Series A. Unblocks 3 portfolio missions and sets Q2 investor strategy.</em>
                    <span className="mono">ops-manager · portfolio-director · 12 evidence docs</span>
                    <div className="vK-focus-actions">
                      <button className="btn-p">Start 30-min block →</button>
                      <button className="btn-o">Evidence · 12</button>
                      <button className="btn-g">Postpone · Delegate</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Deadline strip */}
            <div className="vK-dead">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d98a00" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <div>
                <b>1 deadline this week</b>
                <em>Editorial Policy — When to escalate Content Pipeline feedback · closes Apr 30</em>
              </div>
            </div>

            {/* Time blocks */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Suggested <em>blocks</em></h2>
                <span className="vK-box-meta">3 PROPOSED · TODAY & TOMORROW</span>
              </div>
              <div className="vK-tb">
                <div className="vK-tb-row">
                  <div className="vK-tb-time"><b>FRI 11:40</b>12:30 · 50m</div>
                  <div className="vK-tb-body">
                    <b>Prep for "Reúso"</b>
                    <em>VIP attendee confirmed · meeting FRI 07:00. Review open commitments, walk in with prep actions decided.</em>
                    <span className="tag">PREP · reúso</span>
                  </div>
                  <button>Block →</button>
                </div>
                <div className="vK-tb-row">
                  <div className="vK-tb-time"><b>FRI 15:10</b>15:55 · 45m</div>
                  <div className="vK-tb-body">
                    <b>Follow up on "Reuse For All Kiu"</b>
                    <em>Meeting ended 16h ago — follow-up decays fast. One email to 2 attendees.</em>
                    <span className="tag">FOLLOW-UP · kiu</span>
                  </div>
                  <button>Block →</button>
                </div>
                <div className="vK-tb-row">
                  <div className="vK-tb-time"><b>THU 13:30</b>14:45 · 75m</div>
                  <div className="vK-tb-body">
                    <b>Unblock — Venue constraints</b>
                    <em>Near-airport venue requires full build-out. Unblocked next step decided and written down.</em>
                    <span className="tag">DEEP · foro-basura-cero</span>
                  </div>
                  <button>Block →</button>
                </div>
              </div>
            </section>

            {/* Inbox */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Inbox · <em>needs attention</em></h2>
                <span className="vK-box-meta">5 ITEMS · 3 CRITICAL</span>
              </div>
              <ul className="vK-list">
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>Follow-up ZW Districts</b><em>Neil Khor · requires follow-up on funders</em></div>
                  <span className="mono">7d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>ZW Awards nominations</b><em>Neil Khor · unread · needs names</em></div>
                  <span className="mono">6d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                  <div><b>Video call with Manuel Maqueda</b><em>Apr 16 · 30 min — The Americas</em></div>
                  <span className="mono">7d</span>
                </li>
              </ul>
            </section>

            {/* Commitments */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Commitments</h2>
                <span className="vK-box-meta">5 I OWE · 5 OWED TO ME</span>
              </div>
              <ul className="vK-list">
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div>
                  <div><b>Data flow sketch · reuse pilot</b><em>Pending 6d</em></div>
                  <span className="mono">6d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div>
                  <div><b>Paris meeting dependency</b><em>Post-event coordination</em></div>
                  <span className="mono">6d</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div>
                  <div><b>California Common House sequence</b><em>Finalize project plan</em></div>
                  <span className="mono">6d</span>
                </li>
              </ul>
            </section>
          </div>

          {/* RIGHT COL */}
          <div className="vK-col right">
            {/* Next meeting */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Next <em>meeting</em></h2>
                <span className="vK-box-meta">IN 51 MIN</span>
              </div>
              <div className="vK-next">
                <h4>Foro Basura Cero · José y GAIA</h4>
                <div className="vK-next-sub">THU 23 APR · 15:00 · 60 MIN</div>
                <div className="vK-next-lbl">Attendees</div>
                <div className="vK-next-at">
                  <span>mariel · external</span>
                  <span>macarena · external</span>
                  <span>cecilia · external</span>
                </div>
                <div className="vK-next-lbl">Talking points</div>
                <ul className="vK-next-tp">
                  <li>Align zero-waste forum objectives with GAIA priorities.</li>
                  <li>Clarify José/GAIA roles in forum leadership.</li>
                  <li>Discuss concrete next steps and launch resources.</li>
                </ul>
              </div>
            </section>

            {/* Agents */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Agent <em>activity</em></h2>
                <span className="vK-box-meta">24H</span>
              </div>
              <div className="vK-ag-stats">
                <div><b>70</b><span>runs</span></div>
                <div><b>2,559</b><span>records</span></div>
                <div><b style={{color:"#d93636"}}>11</b><span>errors 7d</span></div>
              </div>
              <ul className="vK-list">
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg></div>
                  <div><b>Grant Radar</b><em>4 new candidates</em></div>
                  <span className="mono" style={{color:"#2f9e44"}}>OK</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M3 17l6-6 4 4 8-8"/></svg></div>
                  <div><b>Signal Scanner</b><em>3 market signals</em></div>
                  <span className="mono" style={{color:"#2f9e44"}}>OK</span>
                </li>
                <li>
                  <div className="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></div>
                  <div><b>Deal Flow</b><em>Needs human review</em></div>
                  <span className="mono" style={{color:"#d98a00"}}>WARN</span>
                </li>
              </ul>
            </section>

            {/* Signals */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>Market <em>signals</em></h2>
                <span className="vK-box-meta">3 NEW · 8H</span>
              </div>
              <ul className="vK-sig">
                <li>
                  <span className="k">Policy</span>
                  <p>UK Extended Producer Responsibility for Packaging shifts waste costs to producers over 50 tonnes annually.</p>
                  <span className="age">8h</span>
                </li>
                <li>
                  <span className="k">Funding</span>
                  <p>UK government commits £1.1B+ via Innovate UK Smart Grants, BBRs and sector challenges.</p>
                  <span className="age">12h</span>
                </li>
                <li>
                  <span className="k">Sector</span>
                  <p>Ellen MacArthur framework defines circular transition as the decade's central economic challenge.</p>
                  <span className="age">1d</span>
                </li>
              </ul>
            </section>

            {/* Allocation */}
            <section className="vK-box">
              <div className="vK-box-head">
                <h2>This <em>week</em></h2>
                <span className="vK-box-meta">33.3H LOGGED</span>
              </div>
              <div>
                <AlcK label="Partner" v={46} tgt={15} st="over"/>
                <AlcK label="Client" v={30} tgt={20} st="ok"/>
                <AlcK label="Funder" v={9} tgt={5} st="ok"/>
                <AlcK label="Portfolio" v={6} tgt={20} st="under"/>
                <AlcK label="Team" v={3} tgt={10} st="under"/>
                <AlcK label="Admin" v={6} tgt={5} st="ok"/>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function AlcK({label, v, tgt, st}) {
  return (
    <div className={"vK-alc-row " + st}>
      <b>{label}</b>
      <div className="track">
        <span style={{width: Math.min(v, 100)+"%"}}/>
        <span className="mark" style={{left: tgt+"%"}}/>
      </div>
      <span className="v">{v}% / {tgt}%</span>
      <span className="s">{st === "over" ? "OVER" : st === "under" ? "UNDER" : "OK"}</span>
    </div>
  );
}

window.VariantK = VariantK;

/* Variant M — C-structure (modular command center) with architecture aesthetic.
   Focus is one module among many. */

function VariantM() {
  return (
    <div className="hall-root">
      <Sidebar />
      <main className="vM-main">
        <header className="vM-top">
          <div className="vM-top-l">
            <div className="vM-top-eyebrow">THE HALL · <b>THU 23 APR</b> · 14:09</div>
            <h1 className="vM-h1">Hi <em>Jose Manuel</em>.</h1>
          </div>
          <div className="vM-top-r">
            <span>17 AGENTS ONLINE</span>
            <span>·</span>
            <span>2,559 RECORDS 24H</span>
            <button>+ New</button>
          </div>
        </header>

        <div className="vM-grid">
          {/* Focus module — span 8 */}
          <section className="vM-mod focus">
            <div className="vM-chips">
              <span className="vM-chip-dark">FOCUS OF THE DAY</span>
              <span className="vM-chip-out"><span className="live-dot"/> LIVE</span>
            </div>
            <div className="vM-mod-head">
              <h3>One <em>decision</em> today</h3>
              <span className="meta">14:30 · 30 MIN WINDOW</span>
            </div>
            <div className="vM-focus-inner">
              <div className="vM-focus-ico">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>
              </div>
              <div className="vM-focus-body">
                <b>Decide raise path · Reuse for All</b>
                <em>Between a SAFE extension and a priced Series A. Unblocks 3 portfolio missions and sets Q2 investor strategy.</em>
                <span className="mono">ops-manager · portfolio-director · 12 evidence docs</span>
                <div className="vM-focus-actions">
                  <button className="p">Start 30-min block →</button>
                  <button className="o">Evidence · 12</button>
                  <button className="g">Postpone · Delegate</button>
                </div>
              </div>
            </div>
          </section>

          {/* Day at a glance — span 4 */}
          <section className="vM-mod span-4">
            <div className="vM-mod-head">
              <h3>Day at a <em>glance</em></h3>
              <span className="meta">TODAY</span>
            </div>
            <div className="vM-glance">
              <div><b>3</b><span>decisions</span></div>
              <div><b>2</b><span>meetings</span></div>
              <div><b>5</b><span>commitments</span></div>
              <div><b style={{color:"#d93636"}}>4</b><span>blocked</span></div>
            </div>
            <ul className="vM-list" style={{marginTop:14}}>
              <li>
                <div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
                <div><b>Deadline this week</b><em>Editorial Policy · Apr 30</em></div>
                <span className="mono warn">7d</span>
              </li>
              <li>
                <div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M3 12l6 6L21 6"/></svg></div>
                <div><b>Week progress</b><em>3/7 objectives moving</em></div>
                <span className="mono">42%</span>
              </li>
            </ul>
          </section>

          {/* Next meeting — span 5 */}
          <section className="vM-mod span-5">
            <div className="vM-mod-head">
              <h3>Next <em>meeting</em></h3>
              <span className="meta">IN 51 MIN</span>
            </div>
            <div className="vM-meet">
              <h4>Foro Basura Cero · José y GAIA</h4>
              <div className="sub">THU 23 APR · 15:00 · 60M</div>
              <div className="lbl">Attendees</div>
              <div className="at">
                <span>mariel · ext</span>
                <span>macarena · ext</span>
                <span>cecilia · ext</span>
              </div>
              <div className="lbl">Talking points</div>
              <ul>
                <li>Align zero-waste forum objectives with GAIA priorities</li>
                <li>Clarify José / GAIA roles in forum leadership</li>
                <li>Concrete next steps and launch resources</li>
              </ul>
            </div>
          </section>

          {/* Schedule blocks — span 7 */}
          <section className="vM-mod span-7">
            <div className="vM-mod-head">
              <h3>Suggested <em>blocks</em></h3>
              <span className="meta">3 PROPOSED · TODAY & FRI</span>
            </div>
            <div className="vM-sch">
              <div className="vM-sch-row">
                <div className="vM-sch-time"><b>FRI 11:40</b>12:30 · 50m</div>
                <div className="vM-sch-body">
                  <b>Prep for "Reúso"</b>
                  <em>VIP attendee confirmed · FRI 07:00. Review open commitments and decide on walk-in actions.</em>
                </div>
                <button>Block →</button>
              </div>
              <div className="vM-sch-row">
                <div className="vM-sch-time"><b>FRI 15:10</b>15:55 · 45m</div>
                <div className="vM-sch-body">
                  <b>Follow up on "Reuse For All Kiu"</b>
                  <em>Meeting ended 16h ago — one email to 2 attendees.</em>
                </div>
                <button>Block →</button>
              </div>
              <div className="vM-sch-row">
                <div className="vM-sch-time"><b>THU 13:30</b>14:45 · 75m</div>
                <div className="vM-sch-body">
                  <b>Unblock — Venue constraints</b>
                  <em>Near-airport venue requires full build-out. Unblocked next step decided and written down.</em>
                </div>
                <button>Block →</button>
              </div>
            </div>
          </section>

          {/* Inbox — span 4 */}
          <section className="vM-mod span-4 k-inbox">
            <div className="vM-mod-head">
              <h3>Inbox · <em>needs reply</em></h3>
              <span className="meta">3 CRITICAL</span>
            </div>
            <ul className="vM-list">
              <li>
                <div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                <div><b>Follow-up ZW Districts</b><em>Neil Khor · funders</em></div>
                <span className="mono">7d</span>
              </li>
              <li>
                <div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                <div><b>ZW Awards nominations</b><em>Neil Khor · unread</em></div>
                <span className="mono">6d</span>
              </li>
              <li>
                <div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
                <div><b>Video call Manuel Maqueda</b><em>30m · The Americas</em></div>
                <span className="mono">7d</span>
              </li>
            </ul>
          </section>

          {/* Agents — span 4 */}
          <section className="vM-mod span-4 k-agent">
            <div className="vM-mod-head">
              <h3>Agent <em>activity</em></h3>
              <span className="meta">24H</span>
            </div>
            <div className="vM-glance">
              <div><b>70</b><span>runs</span></div>
              <div><b>2559</b><span>writes</span></div>
              <div><b style={{color:"#d93636"}}>11</b><span>errors 7d</span></div>
              <div><b style={{color:"#2f9e44"}}>OK</b><span>status</span></div>
            </div>
            <ul className="vM-list" style={{marginTop:14}}>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg></div><div><b>Grant Radar</b><em>4 new candidates</em></div><span className="mono ok">OK</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M3 17l6-6 4 4 8-8"/></svg></div><div><b>Signal Scanner</b><em>3 signals</em></div><span className="mono ok">OK</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg></div><div><b>Deal Flow</b><em>human review</em></div><span className="mono warn">WARN</span></li>
            </ul>
          </section>

          {/* Portfolio — span 4 */}
          <section className="vM-mod span-4 k-portfolio">
            <div className="vM-mod-head">
              <h3>Portfolio <em>check-ins</em></h3>
              <span className="meta">15 TRACKED</span>
            </div>
            <div className="vM-port">
              <div className="vM-port-row moving"><div><b>Reuse for All</b><em>Kiu · raise decision</em></div><span className="stage">SERIES A</span><span className="n">€2.1M</span><span className="st">↗</span></div>
              <div className="vM-port-row blocked"><div><b>Foro Basura Cero</b><em>Venue blocked</em></div><span className="stage">EXEC</span><span className="n">—</span><span className="st">BLK</span></div>
              <div className="vM-port-row flat"><div><b>ZW Districts</b><em>Neil · funders</em></div><span className="stage">DEV</span><span className="n">€780k</span><span className="st">—</span></div>
              <div className="vM-port-row moving"><div><b>California CH</b><em>Sequence finalizing</em></div><span className="stage">PLAN</span><span className="n">€500k</span><span className="st">↗</span></div>
              <div className="vM-port-row blocked"><div><b>Content Pipeline</b><em>Editorial policy</em></div><span className="stage">OPS</span><span className="n">—</span><span className="st">BLK</span></div>
            </div>
          </section>

          {/* Commitments — span 6 */}
          <section className="vM-mod span-6 k-commit">
            <div className="vM-mod-head">
              <h3><em>Commitments</em></h3>
              <span className="meta">5 I OWE · 5 OWED</span>
            </div>
            <ul className="vM-list">
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>Data flow sketch · reuse pilot</b><em>I owe — Kiu</em></div><span className="mono warn">6d</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>Paris meeting dependency</b><em>I owe — Baptiste</em></div><span className="mono warn">6d</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>California sequence</b><em>I owe — team</em></div><span className="mono">6d</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>ZWD action items</b><em>Owed — Neil Khor</em></div><span className="mono err">7d</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div><div><b>Consulting opportunity</b><em>Owed — waiting</em></div><span className="mono err">29d</span></li>
            </ul>
          </section>

          {/* Signals — span 6 */}
          <section className="vM-mod span-6 k-signals">
            <div className="vM-mod-head">
              <h3>Market <em>signals</em></h3>
              <span className="meta">3 NEW · 8H</span>
            </div>
            <ul className="vM-sig">
              <li>
                <span className="tag">Policy</span><span className="age">8h</span>
                <p>UK Extended Producer Responsibility for Packaging shifts waste costs to producers over 50 tonnes annually. Affects UK portfolio.</p>
              </li>
              <li>
                <span className="tag">Funding</span><span className="age">12h</span>
                <p>UK government commits £1.1B+ via Innovate UK Smart Grants, BBRs and sector challenges — strong fit for 3 missions.</p>
              </li>
              <li>
                <span className="tag">Sector</span><span className="age">1d</span>
                <p>Ellen MacArthur framework defines circular transition as the decade's central economic challenge — aligns messaging.</p>
              </li>
            </ul>
          </section>

          {/* Alloc — span 6 */}
          <section className="vM-mod span-6 k-alloc">
            <div className="vM-mod-head">
              <h3>Time <em>allocation</em></h3>
              <span className="meta">WEEK · 33.3H LOGGED</span>
            </div>
            <div>
              <AlcM label="Partner" v={46} tgt={15}/>
              <AlcM label="Client" v={30} tgt={20}/>
              <AlcM label="Funder" v={9} tgt={5}/>
              <AlcM label="Portfolio" v={6} tgt={20}/>
              <AlcM label="Team" v={3} tgt={10}/>
              <AlcM label="Admin" v={6} tgt={5}/>
            </div>
          </section>

          {/* Discovery — span 6 */}
          <section className="vM-mod span-6">
            <div className="vM-mod-head">
              <h3>Discovery <em>queue</em></h3>
              <span className="meta">4 CANDIDATES · GRANT-RADAR</span>
            </div>
            <ul className="vM-list">
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div><div><b>Laudes Foundation</b><em>Fashion & Circular · up to €2M</em></div><span className="mono ok">88</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div><div><b>HORIZON-CL6 CIRCBIO</b><em>€5–6M · Circular & Bioeconomy</em></div><span className="mono ok">85</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div><div><b>MacArthur Foundation</b><em>Systems · $500k</em></div><span className="mono warn">72</span></li>
              <li><div className="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div><div><b>Innovate UK Smart</b><em>Circular materials · £250k</em></div><span className="mono warn">68</span></li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

function AlcM({label, v, tgt}) {
  return (
    <div className="vM-alc-row">
      <b>{label}</b>
      <div className="track">
        <span style={{width: Math.min(v, 100)+"%"}}/>
        <span className="mk" style={{left: tgt+"%"}}/>
      </div>
      <span className="v">{v}%</span>
    </div>
  );
}

window.VariantM = VariantM;

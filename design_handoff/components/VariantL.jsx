/* Variant L — B-structure: priority feed, right rail. Focus = first box. */

function VariantL() {
  return (
    <div className="hall-root">
      <Sidebar />
      <main className="vL-main">
        <header className="vL-top">
          <div className="vL-top-l">
            <div className="vL-top-eyebrow">THE HALL · THU 23 APR · 14:09</div>
            <h1 className="vL-h1">Hi <em>Jose Manuel</em>. 3 things to resolve today.</h1>
          </div>
          <div className="vL-top-r">
            <span>17 AGENTS ONLINE</span>
            <span>·</span>
            <span>2,559 RECORDS 24H</span>
          </div>
        </header>

        <div className="vL-kpis">
          <div className="vL-kpi lime"><div className="l">Focus</div><div className="v">30<em style={{fontStyle:"normal", fontSize:14, color:"#6b6b6b"}}>min</em></div><div className="s">Capital raise decision</div></div>
          <div className="vL-kpi"><div className="l">Deadlines</div><div className="v">1</div><div className="s">Editorial Policy · Apr 30</div></div>
          <div className="vL-kpi"><div className="l">Blocked</div><div className="v">4</div><div className="s">Portfolio · need unblock</div></div>
          <div className="vL-kpi"><div className="l">Commitments</div><div className="v">5/5</div><div className="s">I owe / owed to me</div></div>
          <div className="vL-kpi"><div className="l">Week</div><div className="v">42%</div><div className="s">3 of 7 objectives</div></div>
        </div>

        <div className="vL-filters">
          <div className="vL-filters-l">
            <span className="on">All <b>18</b></span>
            <span>Today <b>3</b></span>
            <span>Week <b>7</b></span>
            <span>Waiting <b>8</b></span>
          </div>
          <div className="vL-filters-r">
            <span>CAL · 3m</span>
            <span>GMAIL · 6h</span>
            <span>MEET · 2h</span>
          </div>
        </div>

        <div className="vL-body">
          <div className="vL-feed">
            <div className="vL-chips">
              <span className="vL-chip-dark">FOCUS OF THE DAY</span>
              <span className="vL-chip-out"><span className="live-dot"/> LIVE</span>
            </div>
            <div className="vL-item focus">
              <div className="vL-ico">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></svg>
              </div>
              <div className="vL-item-body">
                <b>Decide raise path — SAFE or Series A</b>
                <em>Unblocks 3 portfolio missions. Decision pending 12 days. 30-min window at 14:30.</em>
                <span className="mono">ops-manager · portfolio-director · 12 evidence docs ready</span>
                <div className="vL-item-actions">
                  <button className="p">Start now →</button>
                  <button className="o">Evidence · 12</button>
                  <button className="o">Postpone</button>
                </div>
              </div>
              <div className="vL-item-score"><span className="n">96</span>score</div>
            </div>

            <div className="vL-sep"><span>QUEUE · NEXT 3</span></div>

            <div className="vL-item">
              <div className="vL-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <div className="vL-item-body">
                <b>Prep for "Reúso" — VIP attendee confirmed</b>
                <em>FRI 07:00 · high-stakes. Review open commitments before entering.</em>
                <span className="mono">information-coordinator · last notes Apr 14</span>
                <div className="vL-item-actions">
                  <button className="o">Block 50 min</button>
                  <button className="o">Open brief</button>
                </div>
              </div>
              <div className="vL-item-score"><span className="n">88</span>score</div>
            </div>

            <div className="vL-item">
              <div className="vL-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
              </div>
              <div className="vL-item-body">
                <b>Venue constraints — Foro Basura Cero</b>
                <em>Near-airport venue requires full build-out. Affecting availability and session timing.</em>
                <span className="mono">project-manager · Baptiste/ADEME panel</span>
                <div className="vL-item-actions">
                  <button className="o">Decide → Unblock</button>
                  <button className="o">Open Notion</button>
                </div>
              </div>
              <div className="vL-item-score"><span className="n">82</span>score</div>
            </div>

            <div className="vL-sep"><span>INBOX · NEEDS REPLY</span></div>

            <div className="vL-item">
              <div className="vL-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
              <div className="vL-item-body">
                <b>Follow-up action items · ZW Districts</b>
                <em>Neil Khor · requires Jose's follow-up on funders.</em>
                <span className="mono">7d old · urgent</span>
              </div>
              <div className="vL-item-score"><span className="n">74</span>score</div>
            </div>

            <div className="vL-item">
              <div className="vL-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div>
              <div className="vL-item-body">
                <b>2026 Zero Waste Awards nominations</b>
                <em>Neil Khor · unread · nominate entrepreneurs.</em>
                <span className="mono">6d old · unread</span>
              </div>
              <div className="vL-item-score"><span className="n">70</span>score</div>
            </div>

            <div className="vL-sep"><span>DISCOVERY · 4 CANDIDATES</span></div>

            <div className="vL-item">
              <div className="vL-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div>
              <div className="vL-item-body">
                <b>Laudes Foundation — Fashion & Circular Economy</b>
                <em>up to €2M · fit 88/100 · grant application window open.</em>
                <span className="mono">grant-radar · high fit</span>
                <div className="vL-item-actions">
                  <button className="p">✓ Create opportunity</button>
                  <button className="o">Ignore</button>
                </div>
              </div>
              <div className="vL-item-score"><span className="n">88</span>fit</div>
            </div>

            <div className="vL-item">
              <div className="vL-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg></div>
              <div className="vL-item-body">
                <b>HORIZON-CL6-2026-01-CIRCBIO</b>
                <em>€5–6M · Circular Economy & Bioeconomy · fit 85/100.</em>
                <span className="mono">grant-radar · horizon-europe</span>
              </div>
              <div className="vL-item-score"><span className="n">85</span>fit</div>
            </div>
          </div>

          <aside className="vL-rail">
            <div className="vL-rail-box">
              <div className="vL-rail-box-head"><h3>Agents <em>today</em></h3><span>24H</span></div>
              <div className="vL-ag-stats">
                <div><b>70</b><span>runs</span></div>
                <div><b>2559</b><span>writes</span></div>
                <div><b style={{color:"#d93636"}}>11</b><span>errors</span></div>
              </div>
              <ul>
                <li><div><b>Grant Radar</b><em>4 new candidates</em></div><span className="age" style={{color:"#2f9e44"}}>OK</span></li>
                <li><div><b>Signal Scanner</b><em>3 signals</em></div><span className="age" style={{color:"#2f9e44"}}>OK</span></li>
                <li><div><b>Deal Flow</b><em>human review</em></div><span className="age" style={{color:"#d98a00"}}>WARN</span></li>
                <li><div><b>Memory Keeper</b><em>2 errors</em></div><span className="age" style={{color:"#d93636"}}>ERR</span></li>
              </ul>
            </div>

            <div className="vL-rail-box">
              <div className="vL-rail-box-head"><h3>Next <em>meeting</em></h3><span>IN 51 MIN</span></div>
              <div className="vL-meet">
                <h4>Foro Basura Cero</h4>
                <div className="sub">THU 15:00 · JOSÉ & GAIA · 60M</div>
                <div className="lbl">Attendees</div>
                <div style={{fontSize:11, color:"#2a2a2a"}}>mariel · macarena · cecilia</div>
                <div className="lbl">Talking points</div>
                <ul>
                  <li>Align goals with GAIA</li>
                  <li>Clarify roles & responsibilities</li>
                  <li>Concrete next steps</li>
                </ul>
              </div>
            </div>

            <div className="vL-rail-box">
              <div className="vL-rail-box-head"><h3>Waiting <em>on them</em></h3><span>8</span></div>
              <ul>
                <li><div><b>ZWD Plan</b><em>Neil Khor</em></div><span className="age late">7d</span></li>
                <li><div><b>Environment Ministers Panel</b></div><span className="age late">4d</span></li>
                <li><div><b>Zero Waste Draft</b><em>Neil</em></div><span className="age">3d</span></li>
                <li><div><b>Consulting Opportunity</b></div><span className="age crit">29d</span></li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

window.VariantL = VariantL;

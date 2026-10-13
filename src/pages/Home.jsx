import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtClock, fmtTime, sessionStatus, timeAgo, tone } from "../api.js";
import { useLive } from "../live.jsx";
import { Avatar, Icon } from "../components/Icons.jsx";
import PassModal from "../components/PassModal.jsx";

/* ───────────────────────── Featured match ───────────────────────── */
function Player({ p, win }) {
  return (
    <div className={"player" + (win ? " win" : "")}>
      <Avatar initials={p.initials} tone={tone(p.name)} size={56} />
      <b>{p.name}</b>
      <span className="mono">{p.xp.toLocaleString()} XP</span>
      {win && (
        <em className="crown">
          <Icon name="trophy" size={13} /> Winner
        </em>
      )}
    </div>
  );
}

function FeaturedMatch() {
  const live = useLive();
  const nav = useNavigate();
  const [d, setD] = useState(undefined); // undefined = load ho raha, null = koi duel nahi
  const [left, setLeft] = useState(0);

  const load = useCallback(() => {
    api("/featured/")
      .then((r) => {
        setD(r.duel);
        setLeft(r.duel?.seconds_left ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (live.duelTick) load(); // duel shuru/khatam hote hi refresh
  }, [live.duelTick, load]);

  useEffect(() => {
    if (!d?.live) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [d?.live, d?.id]);

  if (d === undefined) return <aside className="match skeleton" aria-busy="true" />;

  if (d === null) {
    return (
      <aside className="match empty">
        <h3 className="match-title">No duel on the board yet</h3>
        <p className="muted">Pehla duel tum shuru karo. Ek opponent milte hi match yahan live dikhega.</p>
        <button className="btn primary" onClick={() => nav("/arena?mode=duel")}>
          <Icon name="bolt" /> Start a duel
        </button>
      </aside>
    );
  }

  const winner = d.winner_id === d.p1.id ? d.p1 : d.winner_id === d.p2.id ? d.p2 : null;
  return (
    <aside className={"match" + (d.live ? " is-live" : "")} aria-label="Featured match">
      <header className="match-top">
        <span className="match-tag">FEATURED MATCH · {d.code}</span>
        {d.live ? (
          <span className="live-badge">
            <i /> LIVE MATCH
          </span>
        ) : (
          <span className="badge dim">Final result</span>
        )}
      </header>

      <h3 className="match-title">{d.title}</h3>

      <div className="vs-row">
        <Player p={d.p1} win={winner?.id === d.p1.id} />
        <div className="vs-mid">
          <span className="vs">VS</span>
          <span className={"clock" + (d.live ? " live" : "")}>{d.live ? fmtClock(left) : winner ? "Final" : "Draw"}</span>
        </div>
        <Player p={d.p2} win={winner?.id === d.p2.id} />
      </div>

      <div className="match-code" aria-label="Problem sample">
        <div>
          <span className="k">problem</span>
          {d.title} <span className={"diff " + d.difficulty}>{d.difficulty}</span>
        </div>
        <div>
          <span className="k">input</span>
          {d.example_input}
        </div>
        <div>
          <span className="k">output</span>
          {d.example_output}
        </div>
        <div className="verdict">
          <Icon name="check" size={14} />
          {d.live
            ? `Judging ${d.tests} hidden tests. Pehla full pass jeetega`
            : winner
            ? `${winner.name} passed ${d.tests}/${d.tests} tests`
            : "Time khatam, koi winner nahi"}
        </div>
      </div>
    </aside>
  );
}

/* ───────────────────────── Live ticker ───────────────────────── */
function Ticker({ items }) {
  const list = items.slice(0, 12);
  const run = list.length >= 4;
  const render = (suffix) =>
    list.map((a, i) => (
      <span key={a.id + suffix} className={"tick" + (i === 0 && suffix === "" ? " fresh" : "")} aria-hidden={suffix !== ""}>
        <Icon name={a.kind === "solve" ? "bolt" : a.kind === "duel" ? "arena" : a.kind === "checkin" ? "qr" : "users"} size={14} />
        {a.text}
        {a.points != null && <b className="pts">+{a.points} pts</b>}
        <time className="muted">{timeAgo(a.at)}</time>
      </span>
    ));
  return (
    <div className="ticker">
      <span className="ticker-tag">LIVE TICKER</span>
      <div className="ticker-view">
        {list.length === 0 ? (
          <span className="muted">Abhi koi activity nahi. Pehla solve tumhara ho sakta hai.</span>
        ) : (
          <div className={"ticker-track" + (run ? " run" : "")} style={{ "--dur": `${Math.max(24, list.length * 7)}s` }}>
            {render("")}
            {run && render("-copy")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Leaderboard + trends ───────────────────────── */
function Leaderboard({ me }) {
  const live = useLive();
  const [tab, setTab] = useState("today");
  const rows = (tab === "today" ? live.today : live.rows).slice(0, 8);
  return (
    <section className="panel">
      <header className="panel-head">
        <h3>
          <Icon name="trophy" /> Arena leaderboard
        </h3>
        <div className="seg" role="tablist" aria-label="Leaderboard period">
          <button role="tab" aria-selected={tab === "today"} className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>
            Today
          </button>
          <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
            All time
          </button>
        </div>
      </header>
      <ol className="lb">
        <li className="lb-head" aria-hidden="true">
          <span>#</span>
          <span>Coder</span>
          <span>Solves</span>
          <span>Points</span>
        </li>
        {rows.map((r) => (
          <li key={r.id} className={`lb-row r${r.rank}` + (r.id === me.id ? " me" : "")}>
            <span className="lb-rank mono">{String(r.rank).padStart(2, "0")}</span>
            <span className="lb-who">
              <Avatar initials={r.initials} tone={tone(r.name)} size={34} />
              <span>
                <b>{r.name}</b>
                {r.team && <small>{r.team}</small>}
              </span>
            </span>
            <span className="lb-n mono">{r.solved}</span>
            <span className="lb-xp mono">
              <b>{r.score.toLocaleString()}</b> XP
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="muted lb-empty">Koi participant nahi mila.</li>}
      </ol>
    </section>
  );
}

function Trends() {
  const live = useLive();
  const max = Math.max(1, ...live.trends.map((t) => t.attempts));
  return (
    <section className="panel">
      <header className="panel-head">
        <h3>
          <Icon name="code" /> Challenge solve rate
        </h3>
      </header>
      <div className="trends">
        {live.trends.map((t) => (
          <div key={t.problem} className="trend">
            <div className="trend-head">
              <span>{t.problem}</span>
              <span className="mono muted">
                {t.solves}/{t.attempts}
              </span>
            </div>
            <div className="bar">
              <div className="bar-attempts" style={{ width: `${(t.attempts / max) * 100}%` }}>
                <div className="bar-solves" style={{ width: t.attempts ? `${(t.solves / t.attempts) * 100}%` : 0 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="legend muted">
        <span>
          <i className="sw cyan" /> solved
        </span>
        <span>
          <i className="sw dim" /> attempts
        </span>
      </p>
    </section>
  );
}

/* ───────────────────────── Event timeline ───────────────────────── */
function Timeline({ schedule, me, onPass }) {
  const nav = useNavigate();
  const first = schedule.sessions[0];
  const day = first ? new Date(first.start).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
  return (
    <section className="panel timeline">
      <header className="panel-head">
        <h3>
          <Icon name="calendar" /> Event timeline
        </h3>
        {day && <span className="badge dim">{day}</span>}
      </header>

      {schedule.sessions.map((s) => {
        const st = sessionStatus(s);
        const scanned = me.checkins?.[s.id];
        const [clock, ampm] = fmtTime(s.start).split(" ");
        const mins = Math.round((new Date(s.end) - new Date(s.start)) / 60000);
        return (
          <article key={s.id} className={"tl " + st}>
            <div className="tl-time">
              <b className="mono">{clock}</b>
              <span>{ampm}</span>
            </div>
            <div className="tl-main">
              <h4>{s.title}</h4>
              <p className="muted">
                {s.location} · {mins >= 120 ? `${Math.round(mins / 6) / 10} h` : `${mins} min`}
              </p>
              <div className="tl-tags">
                <span className={"tag " + s.kind}>{s.tag || s.kind}</span>
                {st === "live" && (
                  <span className="live-badge small">
                    <i /> Live now
                  </span>
                )}
              </div>
            </div>
            {me.is_staff ? (
              <button className="btn small" onClick={() => nav(`/checkin?session=${s.id}`)}>
                Open scanner
              </button>
            ) : (
              <button className={"btn small" + (scanned ? " ok" : "")} onClick={() => onPass(s)}>
                {scanned ? (
                  <>
                    <Icon name="check" size={14} /> Checked in
                  </>
                ) : (
                  "Check in"
                )}
              </button>
            )}
          </article>
        );
      })}
      {schedule.sessions.length === 0 && <p className="muted">Schedule abhi add nahi hua.</p>}
    </section>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function Home({ me }) {
  const live = useLive();
  const nav = useNavigate();
  const [stats, setStats] = useState({ challenges: 0, sessions: 0 });
  const [schedule, setSchedule] = useState({ event: null, sessions: [] });
  const [pass, setPass] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => {
    api("/stats/").then(setStats).catch(() => {});
    api("/schedule/").then(setSchedule).catch(() => {});
    const t = setInterval(() => tick((n) => n + 1), 30000); // LIVE/done badges refresh
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            <span>Think fast.</span>
            <span className="grad">Code faster.</span>
          </h1>
          <p className="lede">
            Your command center for live coding duels, hackathon leaderboards, event check-ins, and finding the perfect
            teammates.
          </p>
          <div className="cta-row">
            <button className="btn primary lg" onClick={() => nav("/arena?mode=duel")}>
              <Icon name="bolt" size={20} /> Start a duel
            </button>
            <Link className="btn lg" to="/teams">
              Find your squad →
            </Link>
          </div>
          <div className="hero-stats">
            <div>
              <b>{live.online.toLocaleString()}</b>
              <span>Coders online</span>
            </div>
            <div>
              <b>{stats.challenges}</b>
              <span>Challenges</span>
            </div>
            <div>
              <b>{stats.sessions}</b>
              <span>Sessions today</span>
            </div>
          </div>
        </div>
        <FeaturedMatch />
      </section>

      <section className="section">
        <header className="section-head">
          <div>
            <h2>Command Center</h2>
            <p className="muted">Every solve counts. Every second matters.</p>
          </div>
          <span className={"live-chip" + (live.connected ? " on" : "")}>
            <i /> {live.connected ? "UPDATING LIVE" : "RECONNECTING"}
          </span>
        </header>

        <Ticker items={live.activity} />

        <div className="cc-grid">
          <div className="stack">
            <Leaderboard me={me} />
            <Trends />
          </div>
          <Timeline schedule={schedule} me={me} onPass={setPass} />
        </div>
      </section>

      {pass && <PassModal session={pass} me={me} onClose={() => setPass(null)} />}
    </>
  );
}

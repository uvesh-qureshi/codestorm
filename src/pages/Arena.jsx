import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { api, fmtClock, tone, useSocket } from "../api.js";
import { Avatar, Icon } from "../components/Icons.jsx";

const STARTERS = {
  python: "import sys\n\ndata = sys.stdin.read().split()\n# TODO: input se answer nikalo\n\nprint()\n",
  javascript:
    "const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\n// TODO: input se answer nikalo\n\nconsole.log();\n",
};

/* ───────── Output panel ───────── */
function Output({ out }) {
  if (!out) return <div className="out idle">Output will appear here…</div>;

  if (out.kind === "error") {
    return (
      <div className="out fail">
        <div className="out-head">
          <Icon name="x" /> {out.message}
        </div>
      </div>
    );
  }

  if (out.kind === "sample") {
    return (
      <div className={"out " + (out.passed ? "pass" : "fail")}>
        <div className="out-head">
          <span>
            <Icon name={out.passed ? "check" : "x"} /> {out.passed ? "Sample passed" : "Sample failed"}
          </span>
          <span className="mono">{out.ms} ms</span>
        </div>
        <dl className="out-grid">
          <dt>Input</dt>
          <dd>
            <pre>{out.input.trim() || "(empty)"}</pre>
          </dd>
          <dt>Expected</dt>
          <dd>
            <pre>{out.expected}</pre>
          </dd>
          <dt>Your output</dt>
          <dd>
            <pre>{out.output || "(empty)"}</pre>
          </dd>
        </dl>
        {out.error && <pre className="out-err">{out.error}</pre>}
      </div>
    );
  }

  return (
    <div className={"out " + (out.passed ? "pass" : "fail")}>
      <div className="out-head">
        <span>
          <Icon name={out.passed ? "check" : "x"} /> {out.passed ? "Accepted" : "Not accepted"}: {out.passed_count}/{out.total} tests
        </span>
        <span className="mono">{out.ms} ms</span>
      </div>
      {out.points != null && (
        <p className="out-note">
          +{out.points} XP{out.bonus ? `, includes +${out.bonus} first-solve bonus` : ""}
        </p>
      )}
      {out.message && <pre className="out-err">{out.message}</pre>}
    </div>
  );
}

/* ───────── Editor + buttons (practice aur duel dono me) ───────── */
function CodePanel({ problem, submitUrl, disabled, onSample, onSubmit }) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(STARTERS.python);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState("");
  const [plain, setPlain] = useState(false);
  const [monacoReady, setMonacoReady] = useState(false);

  // Monaco CDN se aata hai. 8 sec me na aaye toh basic editor pe chale jao
  useEffect(() => {
    if (monacoReady) return;
    const t = setTimeout(() => setPlain(true), 8000);
    return () => clearTimeout(t);
  }, [monacoReady]);

  const changeLang = (l) => {
    setLanguage(l);
    setCode(STARTERS[l]);
    setOut(null);
  };

  const reset = () => {
    setCode(STARTERS[language]);
    setOut(null);
  };

  const runSample = async () => {
    setBusy("sample");
    try {
      const r = await api(`/problems/${problem.id}/run/`, { method: "POST", body: { code, language } });
      setOut({ kind: "sample", ...r });
      onSample?.(r);
    } catch (e) {
      setOut({ kind: "error", message: e.message });
    }
    setBusy("");
  };

  const submit = async () => {
    setBusy("submit");
    try {
      const r = await api(submitUrl, { method: "POST", body: { code, language } });
      setOut({ kind: "submit", ...r });
      onSubmit?.(r);
    } catch (e) {
      setOut({ kind: "error", message: e.message });
    }
    setBusy("");
  };

  return (
    <section className="panel editor-panel">
      <header className="editor-bar">
        <label className="lang">
          <span className="muted">Language</span>
          <select className="input" value={language} onChange={(e) => changeLang(e.target.value)}>
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
          </select>
        </label>
        <div className="editor-actions">
          <button className="btn ghost small" onClick={() => setPlain(!plain)} title="Monaco load na ho toh basic editor use karo">
            {plain ? "Pro editor" : "Basic editor"}
          </button>
          <button className="btn ghost small" onClick={reset} disabled={!!busy}>
            <Icon name="reset" size={14} /> Reset
          </button>
          <button className="btn" onClick={runSample} disabled={!!busy || disabled}>
            <Icon name="play" size={14} /> {busy === "sample" ? "Running…" : "Run sample"}
          </button>
          <button className="btn primary" onClick={submit} disabled={!!busy || disabled}>
            {busy === "submit" ? "Judging…" : "Submit"}
          </button>
        </div>
      </header>

      {plain ? (
        <textarea className="plain-editor" spellCheck={false} aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
      ) : (
        <Editor
          height="300px"
          theme="vs-dark"
          language={language}
          value={code}
          onChange={(v) => setCode(v || "")}
          onMount={() => setMonacoReady(true)}
          options={{ fontSize: 14, minimap: { enabled: false }, fontFamily: "JetBrains Mono, monospace", scrollBeyondLastLine: false }}
        />
      )}

      <Output out={out} />
      <p className="runner-note muted">
        Demo runner: code tumhare backend computer pe chalta hai, secure sandbox nahi. Untrusted code mat chalao.
      </p>
    </section>
  );
}

function ProblemHead({ problem }) {
  return (
    <section className="panel challenge">
      <div className="problem-head">
        <span className={"badge " + problem.difficulty}>{problem.difficulty}</span>
        <span className="badge cyan">{problem.points} XP</span>
      </div>
      <h3>{problem.title}</h3>
      <p>{problem.description}</p>
      <div className="io">
        <div>
          <div className="label">Example input</div>
          <pre>{problem.example_input.trim()}</pre>
        </div>
        <div>
          <div className="label">Example output</div>
          <pre>{problem.example_output}</pre>
        </div>
      </div>
    </section>
  );
}

/* ───────── Practice mode ───────── */
const TIMER = 600; // 10:00

function Challenge({ problem, onSolved }) {
  const [sample, setSample] = useState(null); // null | true | false
  const [res, setRes] = useState(null);
  const [timer, setTimer] = useState({ status: "ready", left: TIMER });

  useEffect(() => {
    if (timer.status !== "running") return;
    const t = setInterval(
      () => setTimer((s) => (s.left <= 1 ? { status: "timeup", left: 0 } : { ...s, left: s.left - 1 })),
      1000
    );
    return () => clearInterval(t);
  }, [timer.status]);

  const handleSubmit = (r) => {
    setRes(r);
    if (r.passed) {
      setTimer((s) => (s.status === "running" ? { status: "solved", left: s.left } : s));
      onSolved?.();
    }
  };

  const status = { ready: "READY", running: "RUNNING", solved: "SOLVED", timeup: "TIME UP" }[timer.status];
  const bonusState =
    res?.bonus > 0 ? "claimed-by-you" : problem.first_solver ? "claimed" : "open";

  return (
    <div className="arena-main-grid">
      <div className="arena-main">
        <ProblemHead problem={problem} />
        <CodePanel
          problem={problem}
          submitUrl={`/problems/${problem.id}/submit/`}
          onSample={(r) => setSample(r.passed)}
          onSubmit={handleSubmit}
        />
      </div>

      <aside className="arena-side">
        <section className={"panel duel-status " + timer.status}>
          <header className="panel-head">
            <h3>
              <Icon name="clock" /> Duel status
            </h3>
            <span className={"state-chip " + timer.status}>{status}</span>
          </header>
          <div className="vs-mini">
            <div>
              <Avatar initials="YOU" tone={0} size={40} />
              <span>You</span>
            </div>
            <span className="vs">VS</span>
            <div>
              <Avatar initials="AI" tone={4} size={40} />
              <span>Practice bot</span>
            </div>
          </div>
          <div className={"clock big" + (timer.status === "running" && timer.left < 60 ? " danger" : "")}>{fmtClock(timer.left)}</div>
          <button
            className="btn full"
            onClick={() => setTimer({ status: "running", left: TIMER })}
          >
            <Icon name={timer.status === "ready" ? "play" : "reset"} size={14} />
            {timer.status === "ready" ? "Start 10:00 timer" : "Restart timer"}
          </button>
          <p className="muted small-text">Timer sirf practice pressure ke liye hai. Submit karne par score normally judta hai.</p>
        </section>

        <section className="panel checklist">
          <header className="panel-head">
            <h3>Round checklist</h3>
          </header>
          <ul>
            <li className={sample === true ? "pass" : sample === false ? "fail" : ""}>
              <span className="ck">{sample === true ? <Icon name="check" size={14} /> : sample === false ? <Icon name="x" size={14} /> : "01"}</span>
              <div>
                <b>Basic sample</b>
                <small>{sample === null ? "Waiting to run" : sample ? "Sample output matched" : "Output match nahi hua"}</small>
              </div>
            </li>
            <li className={res ? (res.passed ? "pass" : "fail") : ""}>
              <span className="ck">{res ? res.passed ? <Icon name="check" size={14} /> : <Icon name="x" size={14} /> : "02"}</span>
              <div>
                <b>All tests</b>
                <small>{res ? `${res.passed_count}/${res.total} tests passed` : "Submit karke check karo"}</small>
              </div>
            </li>
            <li className={bonusState === "claimed-by-you" ? "pass" : ""}>
              <span className="ck">
                <Icon name="star" size={14} />
              </span>
              <div>
                <b>First solve bonus</b>
                <small>
                  {bonusState === "claimed-by-you"
                    ? "+25 XP tumne claim kiya"
                    : bonusState === "claimed"
                    ? `${problem.first_solver} ne claim kar liya`
                    : "+25 XP abhi unclaimed hai"}
                </small>
              </div>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Practice() {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const data = await api("/problems/");
    setList(data);
    setSelected((s) => s ?? data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const problem = list.find((p) => p.id === selected);
  return (
    <div>
      <div className="problem-tabs" role="tablist" aria-label="Challenges">
        {list.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === selected} className={"ptab" + (p.id === selected ? " on" : "")} onClick={() => setSelected(p.id)}>
            {p.solved && <Icon name="check" size={13} />}
            {p.title}
            <span className="mono">{p.points}</span>
          </button>
        ))}
      </div>
      {problem && <Challenge key={problem.id} problem={problem} onSolved={load} />}
    </div>
  );
}

/* ───────── 1v1 Duel mode ───────── */
function Duel() {
  const [duel, setDuel] = useState(null);
  const [feed, setFeed] = useState([]);
  const [left, setLeft] = useState(null);
  const [error, setError] = useState("");

  const duelId = duel?.id;
  const status = duel?.status;

  const refresh = useCallback(async () => {
    if (!duelId) return;
    try {
      setDuel(await api(`/duels/${duelId}/`));
    } catch {
      /* ignore */
    }
  }, [duelId]);

  const find = async () => {
    setError("");
    setFeed([]);
    try {
      setDuel(await api("/duels/quick/", { method: "POST" }));
    } catch (e) {
      setError(e.message);
    }
  };

  // live events (opponent ne attempt kiya, duel start/finish)
  useSocket(duelId ? `/ws/duel/${duelId}/` : null, (msg) => {
    if (msg.kind === "attempt") {
      setFeed((f) => [`${msg.who}: ${msg.passed}/${msg.total} tests pass`, ...f].slice(0, 6));
    }
    refresh();
  });

  // backup polling (WebSocket miss ho jaye toh)
  useEffect(() => {
    if (!duelId || status === "finished") return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [duelId, status, refresh]);

  // countdown timer
  useEffect(() => {
    if (status !== "active") return;
    setLeft(duel.seconds_left);
    const t = setInterval(() => setLeft((l) => Math.max(0, (l ?? 0) - 1)), 1000);
    return () => clearInterval(t);
  }, [status, duelId, duel?.seconds_left]); // eslint-disable-line

  useEffect(() => {
    if (left === 0 && status === "active") refresh();
  }, [left, status, refresh]);

  if (!duel) {
    return (
      <section className="panel center-card">
        <div className="big-icon">
          <Icon name="bolt" size={34} />
        </div>
        <h3>1v1 speed-coding duel</h3>
        <p className="muted">
          Ek random opponent se match hoga. Dono ko same problem milegi, 5 minute ka timer. Jo pehle saare tests pass kare wo
          jeetega (+50 XP).
        </p>
        {error && <div className="error">{error}</div>}
        <button className="btn primary lg" onClick={find}>
          Find opponent
        </button>
      </section>
    );
  }

  const opp = duel.player1.id === duel.me ? duel.player2 : duel.player1;
  const finished = duel.status === "finished";

  if (duel.status === "waiting") {
    return (
      <section className="panel center-card">
        <div className="spinner" />
        <h3>Opponent dhundh rahe hain…</h3>
        <p className="muted">Doosre browser ya account se bhi “Find opponent” dabao (jaise bob) toh match ho jayega.</p>
      </section>
    );
  }

  return (
    <div>
      <section className="panel vs-bar">
        <div className="vs-player you">
          <Avatar initials="YOU" tone={0} size={48} />
          <b>You</b>
        </div>
        <div className="vs-mid">
          <span className="vs">VS</span>
          {!finished && <span className={"clock" + ((left ?? 0) < 30 ? " danger" : " live")}>{fmtClock(left)}</span>}
        </div>
        <div className="vs-player">
          <Avatar initials={opp?.initials} tone={tone(opp?.display_name)} size={48} />
          <b>{opp?.display_name}</b>
        </div>
      </section>

      {finished && (
        <div className={"banner " + (duel.winner_id === duel.me ? "win" : duel.winner ? "lose" : "draw")}>
          <span>
            {duel.winner_id === duel.me
              ? "Tum jeet gaye! +50 XP"
              : duel.winner
              ? `${duel.winner} jeet gaya. Agli baar!`
              : "Time up, draw raha"}
          </span>
          <button className="btn small" onClick={() => setDuel(null)}>
            New duel
          </button>
        </div>
      )}

      <div className="arena-main-grid">
        <div className="arena-main">
          <ProblemHead problem={duel.problem} />
          <CodePanel problem={duel.problem} submitUrl={`/duels/${duel.id}/submit/`} disabled={finished} />
        </div>
        <aside className="arena-side">
          <section className="panel feed">
            <header className="panel-head">
              <h3>Live feed</h3>
            </header>
            {feed.length === 0 && <p className="muted small-text">Opponent ke attempts yahan dikhenge…</p>}
            {feed.map((f, i) => (
              <div key={i} className="feed-item mono">
                {f}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Arena() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "duel" ? "duel" : "practice";
  const setMode = (m) => setParams(m === "duel" ? { mode: "duel" } : {});
  return (
    <div>
      <header className="section-head">
        <div>
          <h2>1v1 speed-coding arena</h2>
          <p className="muted">Ready. Set. Solve. Practice karo ya kisi se duel khelo.</p>
        </div>
        <div className="seg" role="tablist" aria-label="Arena mode">
          <button role="tab" aria-selected={mode === "practice"} className={mode === "practice" ? "on" : ""} onClick={() => setMode("practice")}>
            Practice mode
          </button>
          <button role="tab" aria-selected={mode === "duel"} className={mode === "duel" ? "on" : ""} onClick={() => setMode("duel")}>
            1v1 duel
          </button>
        </div>
      </header>
      {mode === "practice" ? <Practice /> : <Duel />}
    </div>
  );
}

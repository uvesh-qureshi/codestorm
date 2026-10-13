import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fmtTime, sessionStatus, timeAgo, tone } from "../api.js";
import { useLive } from "../live.jsx";
import { Avatar, Icon } from "../components/Icons.jsx";
import Scanner, { beep } from "../components/Scanner.jsx";
import PassModal from "../components/PassModal.jsx";

/* Scan ka result: Checked in (green) / Already scanned (amber) / Invalid (red) */
function ResultCard({ r }) {
  if (!r) {
    return (
      <div className="result idle">
        <Icon name="qr" size={30} />
        <p>Camera ke saamne QR rakho. Result yahan dikhega.</p>
      </div>
    );
  }
  if (r.kind === "bad") {
    return (
      <div className="result bad" role="alert">
        <Icon name="x" size={30} />
        <div>
          <b>Invalid QR</b>
          <p>{r.error}</p>
        </div>
      </div>
    );
  }
  const dup = r.kind === "dup";
  return (
    <div className={"result " + (dup ? "dup" : "ok")} role="status">
      <Avatar initials={r.initials} tone={tone(r.name)} size={52} />
      <div className="result-main">
        <span className="result-state">
          <Icon name={dup ? "alert" : "check"} size={16} /> {dup ? "Already scanned" : "Checked in"}
        </span>
        <b>{r.name}</b>
        <span className="muted mono">
          {r.code}
          {r.team ? ` · ${r.team}` : ""}
        </span>
        {dup && (
          <small>
            Pehli baar {fmtTime(r.scanned_at)} pe scan hua{r.scanned_by ? ` (by ${r.scanned_by})` : ""}
            {r.method === "manual" ? " · manual" : ""}
          </small>
        )}
      </div>
    </div>
  );
}

function Station({ me }) {
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(Number(params.get("session")) || 0);
  const [list, setList] = useState({ count: 0, total: 0, items: [] });
  const [result, setResult] = useState(null);
  const [flash, setFlash] = useState(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [msg, setMsg] = useState("");
  const [qrFor, setQrFor] = useState(null);
  const sidRef = useRef(sid);
  sidRef.current = sid;

  useEffect(() => {
    api("/schedule/").then((s) => {
      setSessions(s.sessions);
      if (!sid) {
        const pick = s.sessions.find((x) => sessionStatus(x) === "live") || s.sessions[0];
        if (pick) setSid(pick.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadList = useCallback(() => {
    if (!sid) return;
    api(`/checkins/?session=${sid}`).then(setList).catch(() => {});
  }, [sid]);
  useEffect(loadList, [loadList]);
  // koi bhi scan (dusre device se bhi) hote hi list refresh
  useEffect(() => {
    if (live.event) loadList();
  }, [live.event, loadList]);

  const pickSession = (id) => {
    setSid(id);
    setParams({ session: id });
    setResult(null);
  };

  const submit = useCallback(
    async (token, method = "qr") => {
      if (!sidRef.current) {
        setMsg("Pehle session select karo");
        return;
      }
      setMsg("");
      try {
        const r = await api("/checkin/", { method: "POST", body: { token, session: sidRef.current, method } });
        const kind = r.already ? "dup" : "ok";
        setResult({ ...r, kind });
        setFlash({ kind, n: Date.now() });
        beep(kind);
        setList((l) => ({ ...l, count: r.count, total: r.total }));
        loadList();
      } catch (e) {
        setResult({ kind: "bad", error: e.message });
        setFlash({ kind: "bad", n: Date.now() });
        beep("bad");
      }
    },
    [loadList]
  );

  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      setFound(await api(`/participants/lookup/?q=${encodeURIComponent(q.trim())}`));
      setMsg("");
    } catch (err) {
      setMsg(err.message);
    }
  };

  const scannedIds = new Set(list.items.map((i) => i.id));
  const pct = list.total ? Math.round((list.count / list.total) * 100) : 0;
  const cur = sessions.find((s) => s.id === sid);

  return (
    <div>
      <header className="section-head">
        <div>
          <h2>Event operations</h2>
          <p className="muted">QR check-in station. Scan karo, aur turant dikhega kaun already scan ho chuka hai.</p>
        </div>
      </header>

      <div className="session-pick" role="tablist" aria-label="Session">
        {sessions.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === sid} className={"spick" + (s.id === sid ? " on" : "")} onClick={() => pickSession(s.id)}>
            {sessionStatus(s) === "live" && <i className="dot-live" />}
            <b>{s.title}</b>
            <small>{fmtTime(s.start)}</small>
          </button>
        ))}
      </div>

      <div className="two-col station">
        <section className="panel">
          <header className="panel-head">
            <h3>
              <Icon name="camera" /> QR check-in station
            </h3>
            {cur && <span className="badge dim">{cur.title}</span>}
          </header>
          <Scanner onDecode={(t) => submit(t, "qr")} flash={flash} />
          <ResultCard r={result} />
          {msg && <div className="error">{msg}</div>}
        </section>

        <div className="stack">
          <section className="panel">
            <header className="panel-head">
              <h3>
                <Icon name="users" /> Scanned list
              </h3>
              <span className="badge lime">
                {list.count} / {list.total}
              </span>
            </header>
            <div className="meter" aria-label={`${pct}% checked in`}>
              <i style={{ width: pct + "%" }} />
            </div>
            <ul className="scanned">
              {list.items.map((i) => (
                <li key={i.id}>
                  <Avatar initials={i.initials} tone={tone(i.name)} size={34} />
                  <span>
                    <b>{i.name}</b>
                    <small className="muted mono">
                      {i.code} · {i.method}
                    </small>
                  </span>
                  <span className="muted small-text">{timeAgo(i.at)}</span>
                </li>
              ))}
              {list.items.length === 0 && <li className="muted empty-note">Abhi kisi ne scan nahi kiya.</li>}
            </ul>
          </section>

          <section className="panel">
            <header className="panel-head">
              <h3>
                <Icon name="search" /> Manual check-in / Generate QR code
              </h3>
            </header>
            <form className="row" onSubmit={search}>
              <input className="input" placeholder="Naam, username ya ID (CS-0003)" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn">Search</button>
            </form>
            <div className="lookup">
              {found.map((p) => {
                const done = scannedIds.has(p.id);
                return (
                  <div key={p.id} className="lookup-row">
                    <Avatar initials={p.initials} tone={tone(p.display_name)} size={34} />
                    <span>
                      <b>{p.display_name}</b>
                      <small className="muted mono">{p.code}</small>
                    </span>
                    <button className="btn small ghost" onClick={() => setQrFor(p)}>
                      <Icon name="qr" size={15} /> QR
                    </button>
                    <button className={"btn small" + (done ? " ok" : " primary")} onClick={() => submit(p.code, "manual")}>
                      {done ? "Scanned" : "Check in"}
                    </button>
                  </div>
                );
              })}
            </div>
            {qrFor && (
              <div className="qr-preview">
                <img className="qr-img" src={qrFor.qr} alt={`QR ${qrFor.display_name}`} />
                <p>
                  <b>{qrFor.display_name}</b> <span className="mono muted">{qrFor.code}</span>
                </p>
                <a className="btn small" href={qrFor.qr} download={`${qrFor.code}.png`}>
                  <Icon name="download" size={15} /> Download QR
                </a>
              </div>
            )}
            {!qrFor && <p className="muted small-text">Search karke QR preview dekho ya manual check-in karo.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

/* Participant: apna pass + har session ka status */
function MyPass({ me, reload }) {
  const live = useLive();
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api("/schedule/").then((s) => setSessions(s.sessions));
  }, []);
  useEffect(() => {
    if (live.event?.participant_id === me.id) reload();
  }, [live.event, me.id, reload]);

  return (
    <div>
      <header className="section-head">
        <div>
          <h2>My pass</h2>
          <p className="muted">Entry pe ye QR coordinator ko dikhao. Scan hote hi neeche “Checked in” aa jayega.</p>
        </div>
      </header>
      <div className="two-col">
        <section className="panel pass-panel">
          <div className="pass-qr">
            <img src={me.qr} alt="Tumhara QR pass" />
          </div>
          <p className="pass-name">{me.display_name}</p>
          <p className="mono muted">{me.code}</p>
        </section>
        <section className="panel">
          <header className="panel-head">
            <h3>
              <Icon name="calendar" /> Sessions
            </h3>
          </header>
          {sessions.map((s) => {
            const at = me.checkins?.[s.id];
            return (
              <div key={s.id} className="lookup-row">
                <span>
                  <b>{s.title}</b>
                  <small className="muted">{fmtTime(s.start)}</small>
                </span>
                <button className={"btn small" + (at ? " ok" : "")} onClick={() => setOpen(s)}>
                  {at ? "Checked in" : "Show pass"}
                </button>
              </div>
            );
          })}
        </section>
      </div>
      {open && <PassModal session={open} me={me} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function CheckIn({ me, reload }) {
  return me.is_staff ? <Station me={me} /> : <MyPass me={me} reload={reload} />;
}

import { useEffect, useState } from "react";
import { API, LEVELS, SKILLS, api, pingBackend, setToken } from "../api.js";

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [online, setOnline] = useState(null); // null = check ho raha hai

  // backend chal raha hai ya nahi, har 4 sec me check
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = await pingBackend();
      if (alive) setOnline(ok);
    };
    check();
    const t = setInterval(check, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", experience: "Beginner", project_idea: "" });
  const [skills, setSkills] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleSkill = (s) =>
    setSkills(skills.includes(s) ? skills.filter((x) => x !== s) : [...skills, s]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        const t = await api("/register/", { method: "POST", body: { ...form, skills } });
        setToken(t.access);
      } else {
        const t = await api("/login/", {
          method: "POST",
          body: { username: form.username, password: form.password },
        });
        setToken(t.access);
      }
      await onAuth();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="hero-tag">LIVE · REAL-TIME · COMPETITIVE</div>
        <h1>
          CodeStorm <span className="grad">Arena</span>
        </h1>
        <p>Live leaderboard, 1v1 speed-coding duels, QR check-in aur team matchmaker. Sab ek jagah.</p>
        <ul className="hero-list">
          <li>Real-time ranking, bina refresh</li>
          <li>1v1 coding duel, timer ke saath</li>
          <li>QR scanner se entry, skills se team</li>
        </ul>
      </div>

      <form className="card auth-card" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Login</button>
          <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        <input className="input" placeholder="Username" value={form.username} onChange={set("username")} required />
        <input className="input" type="password" placeholder="Password" value={form.password} onChange={set("password")} required />

        {mode === "register" && (
          <>
            <input className="input" placeholder="Display name (leaderboard pe dikhega)" value={form.display_name} onChange={set("display_name")} />
            <select className="input" value={form.experience} onChange={set("experience")}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <input className="input" maxLength={140} placeholder="Project idea (optional)" value={form.project_idea} onChange={set("project_idea")} />
            <div className="label">Tumhari skills</div>
            <div className="chips">
              {SKILLS.map((s) => (
                <button type="button" key={s} className={"chip" + (skills.includes(s) ? " on" : "")} onClick={() => toggleSkill(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {online === false && (
          <div className="error">
            Backend offline hai ({API}). Naya terminal kholo, <code>backend</code> folder me jaake{" "}
            <code>python manage.py runserver</code> chalao. Ye message apne aap hat jayega.
          </div>
        )}
        {error && online !== false && <div className="error">{error}</div>}
        <div className={"server-pill" + (online ? " on" : online === false ? " off" : "")}>
          {online === null ? "Backend check ho raha hai…" : online ? "Backend connected" : "Backend offline"}
        </div>
        <button className="btn primary full" disabled={busy || online === false}>
          {busy ? "Wait…" : mode === "login" ? "Enter Arena" : "Create Account"}
        </button>

        {mode === "login" && (
          <p className="hint">
            Demo: <code>alice</code> / <code>pass1234</code> · Coordinator: <code>admin</code> / <code>admin123</code>
          </p>
        )}
      </form>
    </div>
  );
}

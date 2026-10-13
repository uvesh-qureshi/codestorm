import { useCallback, useEffect, useState } from "react";
import { LEVELS, SKILLS, api, tone } from "../api.js";
import { Avatar, Icon } from "../components/Icons.jsx";
import { useToast } from "../toast.jsx";

const toggle = (list, s) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

/* ───────── Matchmaker: profile cards ───────── */
function ProfileCard({ p, need, onConnect }) {
  const lower = (p.matched || []).map((x) => x.toLowerCase());
  return (
    <article className="profile">
      <Avatar initials={p.initials} tone={tone(p.display_name)} size={46} />
      <div className="profile-main">
        <div className="profile-name">
          <b>{p.display_name}</b>
          <span className={"lvl " + p.experience.toLowerCase()}>{p.experience}</span>
        </div>
        <p className="muted">{p.project_idea || "Project idea abhi nahi likha"}</p>
        <div className="chips tight">
          {p.skills.map((s) => (
            <span key={s} className={"tag " + (lower.includes(s.toLowerCase()) ? "hit" : "")}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <button
        className={"btn small" + (p.invite ? " ok" : " primary")}
        disabled={p.invite === "sent"}
        onClick={() => onConnect(p)}
      >
        {p.invite === "sent" ? "Requested" : p.invite === "incoming" ? "Reply below" : "Connect"}
      </button>
    </article>
  );
}

export default function Teams({ user, reload }) {
  const toast = useToast();
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("");
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({ my_team: null, teams: [] });
  const [invites, setInvites] = useState({ incoming: [], outgoing: [] });
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // profile form
  const [form, setForm] = useState({
    display_name: user.display_name,
    skills: user.skills,
    experience: user.experience,
    project_idea: user.project_idea || "",
    looking_for_team: user.looking_for_team,
  });

  const loadMatches = useCallback(async () => {
    const q = new URLSearchParams();
    if (skill) q.set("need", skill);
    if (level) q.set("experience", level);
    setMatches(await api("/matchmaker/?" + q.toString()));
  }, [skill, level]);
  const loadTeams = useCallback(async () => setTeams(await api("/teams/")), []);
  const loadInvites = useCallback(async () => setInvites(await api("/invites/")), []);

  const refreshAll = useCallback(
    () => Promise.all([loadMatches(), loadTeams(), loadInvites(), reload()]),
    [loadMatches, loadTeams, loadInvites, reload]
  );

  useEffect(() => {
    loadMatches().catch(() => {});
  }, [loadMatches]);
  useEffect(() => {
    loadTeams().catch(() => {});
    loadInvites().catch(() => {});
    const t = setInterval(() => {
      loadInvites().catch(() => {});
      loadMatches().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [loadTeams, loadInvites, loadMatches]);

  const act = async (fn, okText) => {
    setError("");
    try {
      await fn();
      await refreshAll();
      if (okText) toast(okText);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveProfile = (e) => {
    e.preventDefault();
    act(() => api("/me/", { method: "PATCH", body: form }), "Profile saved");
  };

  return (
    <div>
      <header className="section-head">
        <div>
          <h2>Team matchmaker</h2>
          <p className="muted">Great builds start with great teams. Find collaborators by role, skills, and project vibe.</p>
        </div>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="two-col">
        {/* ── LEFT: find teammates ── */}
        <section className="panel">
          <header className="panel-head">
            <h3>
              <Icon name="search" /> Find teammates
            </h3>
            <span className="badge dim">{matches.length} profiles</span>
          </header>

          <div className="filters">
            <label>
              <span className="muted">Skill you need</span>
              <select className="input" value={skill} onChange={(e) => setSkill(e.target.value)}>
                <option value="">Any skill</option>
                {SKILLS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">Experience</span>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Any level</option>
                {LEVELS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="profiles">
            {matches.map((p) => (
              <ProfileCard
                key={p.id}
                p={p}
                need={skill}
                onConnect={(x) => act(() => api(`/connect/${x.id}/`, { method: "POST" }), `Request bheji: ${x.display_name}`)}
              />
            ))}
            {matches.length === 0 && <p className="muted empty-note">Is filter me koi solo participant nahi mila. Filter badlo.</p>}
          </div>
        </section>

        {/* ── RIGHT: your profile, invites, teams ── */}
        <div className="stack">
          <form className="panel" onSubmit={saveProfile}>
            <header className="panel-head">
              <h3>
                <Icon name="star" /> Your profile
              </h3>
            </header>
            <label className="field">
              <span>Display name</span>
              <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="e.g. code_wizard" />
            </label>
            <div className="field">
              <span>Primary skills</span>
              <div className="chips">
                {SKILLS.map((s) => (
                  <button type="button" key={s} className={"chip" + (form.skills.includes(s) ? " on" : "")} onClick={() => setForm({ ...form, skills: toggle(form.skills, s) })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Experience</span>
              <select className="input" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                {LEVELS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Project idea</span>
              <input className="input" maxLength={140} value={form.project_idea} onChange={(e) => setForm({ ...form, project_idea: e.target.value })} placeholder="e.g. AI study buddy" />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.looking_for_team} onChange={(e) => setForm({ ...form, looking_for_team: e.target.checked })} />
              Mujhe team chahiye (doosron ko matchmaker me dikhao)
            </label>
            <button className="btn primary full">Save my profile</button>
          </form>

          <section className="panel">
            <header className="panel-head">
              <h3>
                <Icon name="link" /> Invites
              </h3>
              {invites.incoming.length > 0 && <span className="badge pink">{invites.incoming.length} new</span>}
            </header>
            {invites.incoming.map((i) => (
              <div key={i.id} className="invite">
                <Avatar initials={i.who.initials} tone={tone(i.who.display_name)} size={36} />
                <div>
                  <b>{i.who.display_name}</b>
                  <small className="muted">{i.who.project_idea || "team banana chahta hai"}</small>
                </div>
                <div className="invite-actions">
                  <button className="btn small primary" onClick={() => act(() => api(`/invites/${i.id}/respond/`, { method: "POST", body: { action: "accept" } }), "Team ban gayi")}>
                    Accept
                  </button>
                  <button className="btn small ghost" onClick={() => act(() => api(`/invites/${i.id}/respond/`, { method: "POST", body: { action: "decline" } }))}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {invites.outgoing.slice(0, 4).map((i) => (
              <div key={i.id} className="invite sent">
                <Avatar initials={i.who.initials} tone={tone(i.who.display_name)} size={30} />
                <div>
                  <b>{i.who.display_name}</b>
                </div>
                <span className={"badge " + (i.status === "accepted" ? "lime" : i.status === "declined" ? "dim" : "cyan")}>{i.status}</span>
              </div>
            ))}
            {invites.incoming.length === 0 && invites.outgoing.length === 0 && <p className="muted small-text">Abhi koi invite nahi. Left se kisi ko Connect karo.</p>}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h3>
                <Icon name="users" /> Teams
              </h3>
            </header>
            {!teams.my_team && (
              <div className="row">
                <input className="input" placeholder="Nayi team ka naam" value={name} onChange={(e) => setName(e.target.value)} />
                <button
                  className="btn primary"
                  onClick={() =>
                    act(async () => {
                      await api("/teams/", { method: "POST", body: { name } });
                      setName("");
                    }, "Team ban gayi")
                  }
                >
                  Create
                </button>
              </div>
            )}
            {teams.teams.map((t) => {
              const mine = t.id === teams.my_team;
              return (
                <div key={t.id} className={"team-card" + (mine ? " mine" : "")}>
                  <div className="team-head">
                    <strong>{t.name}</strong>
                    <span className="muted small-text mono">
                      {t.members.length}/{t.max_size}
                    </span>
                    {mine ? (
                      <button className="btn ghost small" onClick={() => act(() => api("/teams/leave/", { method: "POST" }))}>
                        Leave
                      </button>
                    ) : (
                      <button className="btn small" disabled={!!teams.my_team || t.open_slots === 0} onClick={() => act(() => api(`/teams/${t.id}/join/`, { method: "POST" }), `Joined ${t.name}`)}>
                        {t.open_slots === 0 ? "Full" : "Join"}
                      </button>
                    )}
                  </div>
                  {t.members.map((m) => (
                    <div key={m.id} className="member">
                      {m.display_name} <span className="muted small-text">{m.skills.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {teams.teams.length === 0 && <p className="muted small-text">Abhi koi team nahi. Pehli team tum banao.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

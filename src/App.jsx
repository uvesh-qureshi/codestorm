import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api, clearToken, getToken } from "./api.js";
import { LiveProvider, useLive } from "./live.jsx";
import { ToastProvider, useToast } from "./toast.jsx";
import { Avatar, Icon } from "./components/Icons.jsx";
import Auth from "./pages/Auth.jsx";
import Home from "./pages/Home.jsx";
import Arena from "./pages/Arena.jsx";
import Teams from "./pages/Teams.jsx";
import CheckIn from "./pages/CheckIn.jsx";

const NAV = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/arena", label: "Arena", icon: "arena" },
  { to: "/teams", label: "Teams", icon: "users" },
  { to: "/checkin", label: "Check-in", icon: "qr" },
];

function Shell({ user, reload, logout }) {
  const live = useLive();
  const toast = useToast();

  // koi mera pass scan kare toh toast + data refresh
  useEffect(() => {
    const ev = live.event;
    if (!ev) return;
    if (ev.participant_id === user.id) {
      toast(`Checked in: ${ev.session_title}`);
      reload();
    }
  }, [live.event]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-bolt">
            <Icon name="bolt" size={18} />
          </span>
          CodeStorm <b>Arena</b>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} size={17} /> <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span className={"live-chip" + (live.connected ? " on" : "")} title={live.connected ? "Live connected" : "Reconnecting"}>
            <i /> {live.online} online
          </span>
          <Avatar initials={user.initials} tone={2} size={32} />
          <span className="who-name">
            {user.display_name}
            {user.is_staff && <span className="badge pink">staff</span>}
          </span>
          <button className="btn ghost small" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Home me={user} />} />
          <Route path="/arena" element={<Arena user={user} />} />
          <Route path="/teams" element={<Teams user={user} reload={reload} />} />
          <Route path="/checkin" element={<CheckIn me={user} reload={reload} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <footer className="foot">
        Built with <span className="grad">Django + React</span> by <b>Faize</b> &amp; <b>Uvesh</b>
      </footer>

      <nav className="bottom-nav" aria-label="Mobile">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const loadUser = useCallback(async () => {
    try {
      setUser(await api("/me/"));
    } catch {
      clearToken();
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (getToken()) loadUser();
  }, [loadUser]);

  const logout = () => {
    clearToken();
    setUser(null);
  };

  if (loading) return <div className="center-screen">Loading…</div>;

  return (
    <ToastProvider>
      {!user ? (
        <Auth onAuth={loadUser} />
      ) : (
        <BrowserRouter>
          <LiveProvider>
            <Shell user={user} reload={loadUser} logout={logout} />
          </LiveProvider>
        </BrowserRouter>
      )}
    </ToastProvider>
  );
}

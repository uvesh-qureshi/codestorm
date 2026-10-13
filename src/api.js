import { useEffect, useRef } from "react";

// Backend ka address. Browser jis host pe frontend khola hai (localhost / 127.0.0.1 / LAN IP)
// wahi host backend ke liye use hota hai, isse "Failed to fetch" (host mismatch) nahi aata.
// Alag backend ho toh frontend/.env me VITE_API_URL=http://... likh do
const HOST = window.location.hostname || "localhost";
export const API = import.meta.env.VITE_API_URL || `http://${HOST}:8000`;
export const WS = API.replace(/^http/, "ws");

export const getToken = () => localStorage.getItem("token");
export const setToken = (t) => localStorage.setItem("token", t);
export const clearToken = () => localStorage.removeItem("token");

// Backend chal raha hai ya nahi (login page pe status dikhane ke liye)
export async function pingBackend() {
  try {
    const res = await fetch(`${API}/api/login/`, { method: "OPTIONS" });
    return res.ok;
  } catch {
    return false;
  }
}

// Saari API calls yahin se jaati hain
export async function api(path, { method = "GET", body } = {}) {
  const isAuthCall = path.startsWith("/login/") || path.startsWith("/register/");
  const headers = { "Content-Type": "application/json" };
  // login/register ke saath purana token nahi bhejte
  if (getToken() && !isAuthCall) headers.Authorization = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Backend se connect nahi ho paya (${API}). Backend terminal me "python manage.py runserver" chal raha hai? Nahi toh pehle use start karo.`
    );
  }
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (isAuthCall) throw new Error("Username ya password galat hai. Demo accounts ke liye backend me `python manage.py seed_demo` chalao.");
    clearToken();
    throw new Error("Login expire ho gaya, dobara login karo");
  }
  if (!res.ok) throw new Error(data.error || data.detail || "Kuch galat ho gaya");
  return data;
}

// WebSocket hook: server se live messages aate hain, band ho toh khud reconnect karta hai
export function useSocket(path, onMessage, onStatus) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const status = useRef(onStatus);
  status.current = onStatus;

  useEffect(() => {
    if (!path) return;
    let ws;
    let closed = false;
    let timer;

    const connect = () => {
      ws = new WebSocket(WS + path);
      ws.onopen = () => status.current && status.current(true);
      ws.onmessage = (e) => handler.current(JSON.parse(e.data));
      ws.onclose = () => {
        if (status.current) status.current(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }, [path]);
}

export const SKILLS = ["Frontend", "Backend", "Machine Learning", "Mobile", "DevOps", "UI/UX", "Data"];
export const LEVELS = ["Beginner", "Intermediate", "Advanced"];

// ───────── chhote helpers ─────────
export const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// naam se ek stable rang (avatar ke liye): 0..5
export function tone(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h % 6;
}

export function sessionStatus(s) {
  const now = Date.now();
  if (now >= new Date(s.start) && now < new Date(s.end)) return "live";
  return now < new Date(s.start) ? "upcoming" : "done";
}

import { createContext, useContext, useEffect, useState } from "react";
import { api, useSocket } from "./api.js";

// Ek hi WebSocket poori app ke liye: leaderboard, ticker, "coders online" aur check-in events.
const Ctx = createContext(null);
export const useLive = () => useContext(Ctx);

export function LiveProvider({ children }) {
  const [snap, setSnap] = useState({ rows: [], today: [], trends: [] });
  const [online, setOnline] = useState(0);
  const [activity, setActivity] = useState([]);
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState(null); // aakhri check-in event
  const [duelTick, setDuelTick] = useState(0); // duel start/finish pe badhta hai

  useEffect(() => {
    api("/activity/").then((list) => setActivity((cur) => mergeActivity(cur, list))).catch(() => {});
  }, []);

  const addItem = (item) => setActivity((cur) => mergeActivity(cur, [item]));

  useSocket(
    "/ws/leaderboard/",
    (m) => {
      if (m.kind === "snapshot") {
        setSnap({ rows: m.rows, today: m.today, trends: m.trends });
        setOnline(m.online ?? 0);
        if (m.activity) addItem(m.activity);
      } else if (m.kind === "presence") {
        setOnline(m.online);
      } else if (m.kind === "activity") {
        addItem(m.item);
      } else if (m.kind === "checkin") {
        setEvent({ ...m, n: Date.now() });
        if (m.item) addItem(m.item);
      } else if (m.kind === "duel") {
        setDuelTick((t) => t + 1);
      }
    },
    setConnected
  );

  return (
    <Ctx.Provider value={{ ...snap, online, activity, connected, event, duelTick }}>{children}</Ctx.Provider>
  );
}

// naye items upar, id se duplicate hatao, latest 30 rakho
function mergeActivity(cur, incoming) {
  const map = new Map();
  [...incoming, ...cur].forEach((a) => map.set(a.id, a));
  return [...map.values()].sort((a, b) => new Date(b.at) - new Date(a.at) || b.id - a.id).slice(0, 30);
}

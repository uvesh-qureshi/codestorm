import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Icon } from "./Icons.jsx";

// Scan hone par chhoti awaaz + vibration: ok = checked in, dup = already scanned, bad = invalid
let audioCtx;
export function beep(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const tones =
      kind === "ok" ? [[880, 0, 0.1], [1320, 0.11, 0.16]] : kind === "dup" ? [[330, 0, 0.12], [330, 0.2, 0.12]] : [[170, 0, 0.3]];
    tones.forEach(([freq, at, dur]) => {
      const t0 = audioCtx.currentTime + at;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = kind === "bad" ? "sawtooth" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 60 : kind === "dup" ? [40, 60, 40] : 200);
  } catch {
    /* audio block ho toh koi baat nahi */
  }
}

function explain(err) {
  const msg = String(err?.message || err || "");
  const name = err?.name || "";
  if (msg === "INSECURE")
    return "Camera sirf localhost ya HTTPS pe chalta hai. Neeche QR image upload ya manual ID use karo.";
  if (name === "NotAllowedError" || /permission|denied/i.test(msg))
    return "Camera permission block hai. Address bar ke camera icon se Allow karo, phir Start camera dabao.";
  if (name === "NotFoundError" || /not found|no camera|requested device/i.test(msg))
    return "Is device me camera nahi mila. Neeche QR image upload ya manual ID use karo.";
  if (name === "NotReadableError" || /in use|could not start/i.test(msg))
    return "Camera kisi aur app/tab me khula hai. Use band karke dobara try karo.";
  return "Camera start nahi hua. Neeche QR image upload ya manual ID use karo.";
}

/**
 * Camera QR scanner.
 *  onDecode(text)  - har naye QR pe call hota hai (same QR 3 sec tak dobara ignore)
 *  flash           - {kind: 'ok'|'dup'|'bad', n} - result ka rang/animation scanner pe dikhata hai
 */
export default function Scanner({ onDecode, flash }) {
  const rid = useRef(`qr-${Math.random().toString(36).slice(2, 8)}`).current;
  const scanner = useRef(null);
  const last = useRef({ text: "", at: 0 });
  const handler = useRef(onDecode);
  handler.current = onDecode;

  const [state, setState] = useState("idle"); // idle | starting | running
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState([]);
  const [camIdx, setCamIdx] = useState(0);

  const stop = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    if (s) {
      try {
        if (s.isScanning) await s.stop();
      } catch {
        /* ignore */
      }
      try {
        s.clear();
      } catch {
        /* ignore */
      }
    }
    setState("idle");
  }, []);

  const start = useCallback(
    async (cameraId) => {
      setError("");
      setState("starting");
      try {
        if (!window.isSecureContext) throw new Error("INSECURE");
        await stop();
        const s = new Html5Qrcode(rid, { verbose: false });
        scanner.current = s;
        await s.start(
          cameraId || { facingMode: "environment" },
          {
            fps: 10,
            aspectRatio: 1,
            qrbox: (w, h) => {
              const side = Math.floor(Math.min(w, h) * 0.72);
              return { width: side, height: side };
            },
          },
          (text) => {
            const now = Date.now();
            if (last.current.text === text && now - last.current.at < 3000) return;
            last.current = { text, at: now };
            handler.current(text);
          },
          () => {}
        );
        setState("running");
        Html5Qrcode.getCameras().then(setCameras).catch(() => {});
      } catch (e) {
        scanner.current = null;
        setState("idle");
        setError(explain(e));
      }
    },
    [rid, stop]
  );

  const flip = async () => {
    if (cameras.length < 2) return;
    const next = (camIdx + 1) % cameras.length;
    setCamIdx(next);
    await start(cameras[next].id);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const fileScanner = new Html5Qrcode(`${rid}-file`, { verbose: false });
      const text = await fileScanner.scanFile(file, false);
      try {
        fileScanner.clear();
      } catch {
        /* ignore */
      }
      last.current = { text, at: Date.now() };
      handler.current(text);
    } catch {
      setError("Is image me QR code nahi mila. Clear photo ya screenshot upload karo.");
    }
  };

  // page chhodte waqt camera band karo
  useEffect(
    () => () => {
      const s = scanner.current;
      scanner.current = null;
      if (s) {
        Promise.resolve(s.isScanning ? s.stop() : null)
          .catch(() => {})
          .finally(() => {
            try {
              s.clear();
            } catch {
              /* ignore */
            }
          });
      }
    },
    []
  );

  const running = state === "running";
  return (
    <div className="scanner">
      <div className={"scan-view" + (running ? " running" : "")}>
        <div id={rid} className="scan-region" />

        {!running && (
          <div className="scan-idle">
            <Icon name="camera" size={34} />
            <p>{state === "starting" ? "Camera khul raha hai…" : "Camera band hai"}</p>
          </div>
        )}

        {running && (
          <div className="scan-frame" aria-hidden="true">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <span className="scan-line" />
          </div>
        )}

        {flash && (
          <div key={flash.n} className={"scan-flash " + flash.kind} aria-hidden="true">
            <Icon name={flash.kind === "ok" ? "check" : flash.kind === "dup" ? "alert" : "x"} size={72} />
          </div>
        )}
      </div>

      <div className="scan-controls">
        {running ? (
          <button className="btn" onClick={stop}>
            Stop camera
          </button>
        ) : (
          <button className="btn primary" onClick={() => start()} disabled={state === "starting"}>
            <Icon name="camera" /> Start camera
          </button>
        )}
        {running && cameras.length > 1 && (
          <button className="btn ghost" onClick={flip} aria-label="Camera badlo">
            <Icon name="flip" /> Flip
          </button>
        )}
        <label className="btn ghost file-btn">
          <Icon name="upload" /> Upload QR image
          <input type="file" accept="image/*" onChange={onFile} hidden />
        </label>
      </div>

      {error && <p className="scan-error">{error}</p>}
      <div id={`${rid}-file`} hidden />
    </div>
  );
}

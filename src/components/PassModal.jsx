import { useEffect, useRef } from "react";
import { fmtTime } from "../api.js";
import { Icon } from "./Icons.jsx";

// Timeline ke "Check in" button se khulta hai: participant ka QR pass + us session ka status
export default function PassModal({ session, me, onClose }) {
  const scannedAt = me.checkins?.[session.id];
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`QR pass: ${session.title}`} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="modal-x" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <h3>{session.title}</h3>
        <p className="muted">
          {fmtTime(session.start)} · {session.location}
        </p>

        <div className={"pass-qr" + (scannedAt ? " done" : "")}>
          <img src={me.qr} alt="Tumhara QR pass" />
          {scannedAt && (
            <div className="pass-stamp">
              <Icon name="check" size={22} /> Checked in
            </div>
          )}
        </div>

        <p className="pass-name">{me.display_name}</p>
        <p className="mono muted">{me.code}</p>
        <p className="modal-hint">
          {scannedAt
            ? `Scan hua: ${fmtTime(scannedAt)}. Ab andar ja sakte ho.`
            : "Entry pe ye QR coordinator ko dikhao. Scan hote hi yahan apne aap “Checked in” aa jayega."}
        </p>
      </div>
    </div>
  );
}

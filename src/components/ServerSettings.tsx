import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useStudio } from "../lib/studio.tsx";

export function ServerSettings() {
  const { pending, applying, connecting, pushing } = useStudio();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [mode, setMode] = useState("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setBusy(true); setError("");
    api.remoteConfig().then((config) => {
      setUrl(config.url); setHasKey(config.hasApiKey); setMode(config.mode); setKey("");
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }, [open]);
  const save = async (offline = false) => {
    setBusy(true); setError("");
    try {
      await api.saveRemoteConfig({ url: offline ? "" : url.trim(), apiKey: key.trim() });
      window.location.reload(); // Drop old session binding; Connect uploads into the new server.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); setBusy(false);
    }
  };
  const blocked = busy || applying || connecting || pushing || pending.size > 0;
  return <>
    <button type="button" className="am-ghost" onClick={() => setOpen(true)} disabled={applying || connecting || pushing}>Server</button>
    {open ? <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 10000, display: "grid", placeItems: "center", padding: 20 }}>
      <section className="am-panel" role="dialog" aria-modal="true" aria-labelledby="server-title"
        style={{ width: "min(560px, 100%)", background: "#131c2d", padding: 24, borderRadius: 12 }}>
        <h2 id="server-title">Render server</h2>
        <p className="am-hint">Current mode: {mode}. ADB stays on this computer.</p>
        <label style={{ display: "block", marginTop: 16 }}>Server URL
          <input className="am-field-input" style={{ width: "100%", marginTop: 6 }} type="url" placeholder="https://your-app.onrender.com"
            value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
        </label>
        <label style={{ display: "block", marginTop: 16 }}>API key
          <input className="am-field-input" style={{ width: "100%", marginTop: 6 }} type="password" autoComplete="off"
            placeholder={hasKey ? "Saved — leave blank to keep" : "HC_API_KEY from Render"}
            value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
        </label>
        <p className="am-hint" style={{ marginTop: 16 }}>Saving verifies the connection and reloads the UI. Connect again afterwards. Your save is uploaded to this server when you press Connect.</p>
        {pending.size ? <p role="status">Save or revert staged edits before changing servers.</p> : null}
        {error ? <p role="alert" style={{ color: "#ff9c9c", overflowWrap: "anywhere" }}>{error}</p> : null}
        <div className="am-row" style={{ gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="am-ghost am-ghost--primary" type="button" disabled={blocked || !url.trim()} onClick={() => void save()}>{busy ? "Checking…" : "Save Render connection"}</button>
          <button className="am-ghost" type="button" disabled={blocked} onClick={() => void save(true)}>Use local mode</button>
          <button className="am-ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button>
        </div>
      </section>
    </div> : null}
  </>;
}

import { useEffect, useRef, useState } from 'react';
import './owner-keys.css';
type LicenseRow = { id: string; hint: string; note: string; expires_at: number | string; created_at: number | string; bound: boolean; revoked: number; role: 'owner' | 'user'; max_devices: number };
async function ownerApi<T>(path: string, data?: object): Promise<T> {
  const response = await fetch('/api/admin/' + path, { method: data ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('hc-login-required'));
    throw Error(result.error ?? `Request failed (${response.status})`);
  }
  return result;
}
export function OwnerKeys() {
  const [allowed, setAllowed] = useState(false); const [open, setOpen] = useState(false);
  const [maxDevices, setMaxDevices] = useState('1'); const [deviceIds, setDeviceIds] = useState('');
  const [days, setDays] = useState('30'); const [note, setNote] = useState('');
  const [rows, setRows] = useState<LicenseRow[]>([]); const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const busyRef = useRef(false); const keyInput = useRef<HTMLInputElement>(null); const closeButton = useRef<HTMLButtonElement>(null); const trigger = useRef<HTMLButtonElement>(null); const dialog = useRef<HTMLElement>(null);
  useEffect(() => { let active = true; void fetch('/api/local/auth').then(r => r.json()).then(s => { if (active) setAllowed(s.loggedIn === true && s.isOwner === true); }).catch(() => {}); return () => { active = false; }; }, []);
  async function refresh() { const data = await ownerApi<{ licenses: LicenseRow[] }>('licenses'); setRows(data.licenses); }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete the request.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function close() { if (!busyRef.current) { setOpen(false); setKey(''); setCopied(false); trigger.current?.focus(); } }
  useEffect(() => {
    if (!open) return; closeButton.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { setOpen(false); setKey(''); setCopied(false); trigger.current?.focus(); }
      if (e.key === 'Tab') {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]');
        if (!nodes?.length) { e.preventDefault(); dialog.current?.focus(); return; } const first = nodes[0]!; const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [open]);
  if (!allowed) return null;
  return <>
    <button ref={trigger} type="button" className="am-ghost am-ghost--primary" onClick={() => { setOpen(true); setKey(''); setCopied(false); void run(refresh); }}>Issue keys · Owner</button>
    {open && <div className="owner-overlay"><section ref={dialog} tabIndex={-1} className="owner-panel" role="dialog" aria-modal="true" aria-labelledby="owner-title" aria-busy={busy}>
      <header><div><p className="owner-eyebrow">OWNER CONSOLE</p><h2 id="owner-title">Issue & manage keys</h2></div><button ref={closeButton} className="owner-secondary" type="button" disabled={busy} onClick={close}>Close</button></header>
      <p className="owner-description">Create VIP keys in the app. Validity starts when a key is created. User keys work only on the assigned Device IDs. The Owner key works on multiple devices.</p>
      <form className="owner-create" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await ownerApi<{ key: string }>('create', { days: Number(days), note, maxDevices: Number(maxDevices), deviceIds: deviceIds.trim().split(/[\s,;]+/).filter(Boolean).map(id => id.toUpperCase()) }); setKey(result.key); setCopied(false); await refresh(); }); }}>
        <label>Validity<select value={days} onChange={e => setDays(e.target.value)} disabled={busy}><option value="7">7 days</option><option value="30">30 days</option><option value="365">365 days</option><option value="0">Lifetime</option></select></label>
        <label>Maximum devices<input type="number" min="1" max="100" value={maxDevices} onChange={e => setMaxDevices(e.target.value)} disabled={busy}/></label>
        <label className="owner-note">Assigned Device IDs<input required value={deviceIds} onChange={e => setDeviceIds(e.target.value)} placeholder="VIP-XXXX-XXXX-XXXX-XXXX-XXXX; next ID" disabled={busy}/></label>
        <label className="owner-note">User note<input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Customer name or reference" disabled={busy}/></label>
        <button className="owner-primary" type="submit" disabled={busy}>{busy ? 'Processing…' : 'Create VIP key'}</button>
      </form>
      {key && <section className="owner-result" aria-label="New key"><p>New key — copy it now. The full key cannot be viewed again after closing.</p><div><input ref={keyInput} aria-label="New key" readOnly value={key}/><button type="button" className="owner-secondary" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(key); setCopied(true); } catch { keyInput.current?.focus(); keyInput.current?.select(); try { setCopied(document.execCommand('copy')); } catch {} } })(); }}>{copied ? 'Copied' : 'Copy'}</button></div></section>}
      {error && <p className="owner-error" role="alert">{error}</p>}
      <div className="owner-list-heading"><h3>License keys</h3><button type="button" className="owner-secondary" disabled={busy} onClick={() => void run(refresh)}>Refresh</button></div>
      <div className="owner-table-wrap"><table><thead><tr><th>Key suffix</th><th>Note</th><th>Devices</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="owner-key-hint">{row.role === 'owner' ? 'OWNER' : '…' + row.hint}</td><td>{row.note}</td><td>{row.role === 'owner' ? 'Unlimited' : row.max_devices}</td><td>{Number(row.expires_at) ? new Date(Number(row.expires_at) * 1000).toLocaleString('en-US') : 'Lifetime'}</td><td>{row.revoked ? 'Revoked' : Number(row.expires_at) && Number(row.expires_at) * 1000 <= Date.now() ? 'Expired' : row.bound ? 'Device assigned' : 'Unassigned'}</td><td>{row.role === 'owner' ? <span className="owner-description">Manage in web Admin</span> : <div className="owner-row-actions"><button type="button" className="owner-secondary" disabled={busy || !!row.revoked || !row.bound} onClick={() => { if (window.confirm('Unbind key …' + row.hint + '? Existing sessions will be invalidated.')) void run(async () => { await ownerApi('unbind', { id: row.id }); await refresh(); }); }}>Unbind device</button><button type="button" className="owner-danger" disabled={busy || !!row.revoked} onClick={() => { if (window.confirm('Revoke key …' + row.hint + '? The user will no longer be able to use this key.')) void run(async () => { await ownerApi('revoke', { id: row.id }); await refresh(); }); }}>Revoke</button></div>}</td></tr>)}</tbody></table>{!rows.length && !busy && <p className="owner-description">No keys yet.</p>}</div>
    </section></div>}
  </>;
}

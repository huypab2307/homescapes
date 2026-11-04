import { useEffect, useRef, useState } from 'react';
import './owner-keys.css';
type LicenseRow = { id: string; hint: string; note: string; expires_at: number | string; created_at: number | string; bound: boolean; revoked: number; role: 'owner' | 'user' };
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
  const [days, setDays] = useState('30'); const [note, setNote] = useState('');
  const [rows, setRows] = useState<LicenseRow[]>([]); const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const busyRef = useRef(false); const keyInput = useRef<HTMLInputElement>(null); const closeButton = useRef<HTMLButtonElement>(null); const trigger = useRef<HTMLButtonElement>(null); const dialog = useRef<HTMLElement>(null);
  useEffect(() => { let active = true; void fetch('/api/local/auth').then(r => r.json()).then(s => { if (active) setAllowed(s.loggedIn === true && s.isOwner === true); }).catch(() => {}); return () => { active = false; }; }, []);
  async function refresh() { const data = await ownerApi<{ licenses: LicenseRow[] }>('licenses'); setRows(data.licenses); }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thực hiện được yêu cầu.'); }
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
    <button ref={trigger} type="button" className="am-ghost am-ghost--primary" onClick={() => { setOpen(true); setKey(''); setCopied(false); void run(refresh); }}>Cấp key · Owner</button>
    {open && <div className="owner-overlay"><section ref={dialog} tabIndex={-1} className="owner-panel" role="dialog" aria-modal="true" aria-labelledby="owner-title" aria-busy={busy}>
      <header><div><p className="owner-eyebrow">OWNER CONSOLE</p><h2 id="owner-title">Cấp & quản lý key</h2></div><button ref={closeButton} className="owner-secondary" type="button" disabled={busy} onClick={close}>Đóng</button></header>
      <p className="owner-description">Tạo key VIP cho người dùng ngay trong ứng dụng. Thời hạn bắt đầu từ lúc tạo; mỗi key liên kết với một máy.</p>
      <form className="owner-create" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await ownerApi<{ key: string }>('create', { days: Number(days), note }); setKey(result.key); setCopied(false); await refresh(); }); }}>
        <label>Thời hạn<select value={days} onChange={e => setDays(e.target.value)} disabled={busy}><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="365">365 ngày</option><option value="0">Vĩnh viễn</option></select></label>
        <label className="owner-note">Ghi chú người dùng<input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Tên hoặc mã khách hàng" disabled={busy}/></label>
        <button className="owner-primary" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Tạo key VIP'}</button>
      </form>
      {key && <section className="owner-result" aria-label="Key vừa tạo"><p>Key vừa tạo — sao chép ngay, không thể xem lại toàn bộ key sau khi đóng.</p><div><input ref={keyInput} aria-label="Key vừa tạo" readOnly value={key}/><button type="button" className="owner-secondary" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(key); setCopied(true); } catch { keyInput.current?.focus(); keyInput.current?.select(); try { setCopied(document.execCommand('copy')); } catch {} } })(); }}>{copied ? 'Đã sao chép' : 'Sao chép'}</button></div></section>}
      {error && <p className="owner-error" role="alert">{error}</p>}
      <div className="owner-list-heading"><h3>Danh sách key</h3><button type="button" className="owner-secondary" disabled={busy} onClick={() => void run(refresh)}>Làm mới</button></div>
      <div className="owner-table-wrap"><table><thead><tr><th>Đuôi key</th><th>Ghi chú</th><th>Hết hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="owner-key-hint">{row.role === 'owner' ? 'OWNER' : '…' + row.hint}</td><td>{row.note}</td><td>{Number(row.expires_at) ? new Date(Number(row.expires_at) * 1000).toLocaleString('vi-VN') : 'Vĩnh viễn'}</td><td>{row.revoked ? 'Đã thu hồi' : Number(row.expires_at) && Number(row.expires_at) * 1000 <= Date.now() ? 'Hết hạn' : row.bound ? 'Đã khóa máy' : 'Chưa khóa máy'}</td><td>{row.role === 'owner' ? <span className="owner-description">Quản lý tại web Admin</span> : <div className="owner-row-actions"><button type="button" className="owner-secondary" disabled={busy || !!row.revoked || !row.bound} onClick={() => { if (window.confirm('Gỡ khóa máy cho key …' + row.hint + '? Phiên đăng nhập hiện có sẽ mất hiệu lực.')) void run(async () => { await ownerApi('unbind', { id: row.id }); await refresh(); }); }}>Gỡ khóa máy</button><button type="button" className="owner-danger" disabled={busy || !!row.revoked} onClick={() => { if (window.confirm('Thu hồi key …' + row.hint + '? Người dùng sẽ không thể tiếp tục sử dụng key này.')) void run(async () => { await ownerApi('revoke', { id: row.id }); await refresh(); }); }}>Thu hồi</button></div>}</td></tr>)}</tbody></table>{!rows.length && !busy && <p className="owner-description">Chưa có key.</p>}</div>
    </section></div>}
  </>;
}

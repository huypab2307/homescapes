import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StudioApp } from './StudioApp.tsx';
import './license.css';
const translations = {
  vi: { tag: 'CLIENT', subtitle: 'Công cụ Homescapes', first: 'Kết nối game trên máy của bạn. Mọi thao tác chỉnh save được xử lý trên server.', second: 'Đăng nhập bằng key được cấp. Key liên kết với thiết bị để bảo vệ quyền truy cập.', title: 'Client', intro: 'Nhập license key được cấp cho máy này. Liên hệ quản trị viên để nhận key.', device: 'DEVICE ID', license: 'LICENSE KEY', copy: 'Sao chép', copied: 'Đã chép', unlock: 'Mở khóa', checking: 'Đang xác minh…', loading: 'Đang tải…', offline: 'Không kết nối được ứng dụng. Hãy mở lại EXE.', expired: 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.', copyError: 'Không thể tự sao chép. Hãy chọn Device ID và nhấn Ctrl+C.', footer: 'HOMESCAPES SAVE STUDIO', starting: 'Lần kết nối đầu có thể chậm khi server khởi động.' },
  en: { tag: 'CLIENT', subtitle: 'Homescapes tool', first: 'Connect to the game on your machine. Save editing is processed on the server.', second: 'Sign in with your issued license. Your key is linked to your device to protect access.', title: 'Client', intro: 'Enter the license issued for this machine. Contact your administrator to get a key.', device: 'DEVICE ID', license: 'LICENSE KEY', copy: 'Copy', copied: 'Copied', unlock: 'Unlock', checking: 'Verifying…', loading: 'Loading…', offline: 'Cannot connect to the application. Please reopen the EXE.', expired: 'Your session is no longer valid. Please sign in again.', copyError: 'Select the Device ID and press Ctrl+C to copy it.', footer: 'HOMESCAPES SAVE STUDIO', starting: 'The first connection may take longer while the server starts.' },
};
function Icon({ kind }: { kind: 'device' | 'key' | 'copy' | 'lock' | 'link' | 'server' | 'globe' }) {
  const shapes: Record<typeof kind, ReactNode> = {
    device: <><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="9" r="2"/><path d="M9 15h6m-5 3h4"/></>,
    key: <><path d="m8 16-4 4m3-3-2-2m5-1 6-6m-3-3 6 6 3-3-6-6z"/><circle cx="9" cy="15" r="3"/></>,
    copy: <><rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V3H4v14h4m3-6h6m-6 4h6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0m-4 7v3"/></>,
    link: <><path d="m10 8-2-2a4 4 0 0 0-6 6l4 4a4 4 0 0 0 6 0m2 0 2 2a4 4 0 0 0 6-6l-4-4a4 4 0 0 0-6 0m-4 0 8 8"/></>,
    server: <><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6h.01M8 17h.01m4-11h5m-5 11h5"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[kind]}</svg>;
}
export function LicenseApp() {
  const [state, setState] = useState<{ loggedIn: boolean; deviceId: string; expiresAt: number }>();
  const [lang, setLang] = useState<'vi' | 'en'>(() => { try { return localStorage.getItem('hc-ui-language-v2') === 'vi' ? 'vi' : 'en'; } catch { return 'en'; } });
  const t = translations[lang];
  const [key, setKey] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [copied, setCopied] = useState(false); const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const deviceInput = useRef<HTMLInputElement>(null);
  useEffect(() => { let active = true; void fetch('/api/local/auth').then(async r => { if (!r.ok) throw Error(); return r.json(); }).then(s => { if (active) setState(s); }).catch(() => { if (active) setError(translations[lang].offline); }); return () => { active = false; }; }, []);
  useEffect(() => {
    const expired = () => { setState(s => s ? { ...s, loggedIn: false } : s); setError(t.expired); };
    window.addEventListener('hc-login-required', expired);
    return () => window.removeEventListener('hc-login-required', expired);
  }, [t.expired]);
  useEffect(() => () => { clearTimeout(copyTimer.current); }, []);
  async function copyDevice() {
    if (!state?.deviceId) return;
    let success = false;
    try { await navigator.clipboard.writeText(state.deviceId); success = true; } catch {
      deviceInput.current?.focus(); deviceInput.current?.select();
      try { success = document.execCommand('copy'); } catch { /* keep selected for manual copy */ }
    }
    if (success) { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800); } else setError(t.copyError);
  }
  if (state?.loggedIn) return <StudioApp />;
  return <main className="vip-login" lang={lang}>
    <div className="vip-language"><Icon kind="globe"/><select aria-label="Language" value={lang} onChange={e => { const next = e.target.value as 'vi' | 'en'; setLang(next); try { localStorage.setItem('hc-ui-language-v2', next); } catch {} }}><option value="vi">VI</option><option value="en">EN</option></select></div>
    <div className="vip-login-layout">
      <section className="vip-intro" aria-labelledby="vip-brand">
        <div className="vip-accent"/>
        <div className="vip-brand-row"><img className="vip-logo vip-logo-large" src="/assets/ui/app-icon.png" alt=""/><div><p className="vip-eyebrow">{t.tag}</p><h1 id="vip-brand">HOMESCAPES <span>VIP TOOL</span></h1></div></div>
        <h2>{t.subtitle}</h2>
        <div className="vip-benefits"><p><span className="vip-small-icon"><Icon kind="link"/></span><span>{t.first}</span></p><p><span className="vip-small-icon"><Icon kind="server"/></span><span>{t.second}</span></p></div>
      </section>
      <section className="vip-card" aria-labelledby="vip-login-title">
        <header className="vip-card-header"><img className="vip-logo" src="/assets/ui/app-icon.png" alt=""/><div><p className="vip-eyebrow">HOMESCAPES VIP TOOL</p><h2 id="vip-login-title">{t.title}</h2><p className="vip-description">{t.intro}</p></div></header>
        <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void fetch('/api/local/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: key.trim().toUpperCase() }) }).then(async r => { const s = await r.json(); if (!r.ok) throw Error(s.error); setKey(''); setState(s); }).catch(e => setError(e instanceof Error ? e.message : t.offline)).finally(() => setBusy(false)); }}>
          <label className="vip-field-label" htmlFor="vip-device"><Icon kind="device"/>{t.device}</label>
          <div className="vip-device"><span className="vip-device-icon"><Icon kind="device"/></span><div className="vip-device-value"><span>DEVICE ID</span><input id="vip-device" ref={deviceInput} readOnly value={state?.deviceId ?? t.loading} spellCheck={false}/></div><button className="vip-copy" type="button" disabled={!state?.deviceId} onClick={() => void copyDevice()}><Icon kind="copy"/><span aria-live="polite">{copied ? t.copied : t.copy}</span></button></div>
          <label className="vip-field-label vip-key-label" htmlFor="vip-license"><Icon kind="key"/>{t.license}</label>
          <div className="vip-key-input"><Icon kind="key"/><input id="vip-license" type="text" required maxLength={256} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={key} onChange={e => setKey(e.target.value.toUpperCase())} placeholder="VIP-XXXX-XXXX-XXXX-XXXX-XXXX" disabled={busy} aria-describedby={error ? 'vip-error' : undefined}/></div>
          {error && <p id="vip-error" className="vip-error" role="alert">{error}</p>}
          <button className="vip-unlock" type="submit" disabled={busy || !state || !key.trim()}><Icon kind="lock"/>{busy ? t.checking : t.unlock}</button>
          <p className="vip-starting">{t.starting}</p>
        </form>
      </section>
    </div>
    <footer className="vip-footer"><span/>{t.footer}<span/></footer>
  </main>;
}

import { useEffect, useState } from 'react';
import { StudioApp } from './StudioApp.tsx';
export function LicenseApp() {
  const [state, setState] = useState<{ loggedIn: boolean; deviceId: string; expiresAt: number }>();
  const [key, setKey] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; void fetch('/api/local/auth').then(r => r.json()).then(s => { if (active) setState(s); }).catch(() => { if (active) setError('Không kết nối được ứng dụng. Hãy mở lại EXE.'); }); return () => { active = false; }; }, []);
  useEffect(() => {
    const expired = () => { setState(s => s ? { ...s, loggedIn: false } : s); setError('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.'); };
    window.addEventListener('hc-login-required', expired);
    return () => window.removeEventListener('hc-login-required', expired);
  }, []);
  if (state?.loggedIn) return <StudioApp />;
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1221', color: '#e5eefb', padding: 24 }}>
    <form style={{ width: 'min(480px, 100%)', background: '#162237', borderRadius: 20, padding: 32 }} onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void fetch('/api/local/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).then(async r => { const s = await r.json(); if (!r.ok) throw Error(s.error); setKey(''); setState(s); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
      <p style={{ color: '#88aaff' }}>HOMESCAPES SAVE STUDIO</p><h1>Đăng nhập bằng key</h1>
      <p className="am-hint">Key được liên kết với máy khi đăng nhập lần đầu.</p><label>Device ID<input className="am-field-input" style={{ width: '100%', margin: '10px 0 24px' }} readOnly value={state?.deviceId ?? 'Đang tải…'} /></label>
      <label>License key<input className="am-field-input" style={{ width: '100%', margin: '10px 0 24px' }} type="password" required autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="HC-…" /></label>
      {error && <p role="alert" style={{ color: '#ffaaaa' }}>{error}</p>}
      <button className="am-ghost am-ghost--primary" disabled={busy || !state || !key.trim()}>{busy ? 'Đang xác minh…' : 'Đăng nhập'}</button>
      <p className="am-hint" style={{ marginTop: 24 }}>Logic chỉnh save chạy trên server. Lần kết nối đầu có thể chậm khi Render khởi động.</p>
    </form>
  </main>;
}

import { OwnerKeys } from './OwnerKeys.tsx';
import { useState } from 'react';
import { useStudio } from '../lib/studio.tsx';
export function ServerSettings() {
  const { pending, applying, connecting, pushing } = useStudio();
  const [busy, setBusy] = useState(false);
  return <><OwnerKeys/><button className="am-ghost" disabled={busy || applying || connecting || pushing || pending.size > 0} onClick={() => {
    setBusy(true); void fetch('/api/local/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ logout: true }) }).then(r => { if (r.ok) window.location.reload(); }).finally(() => setBusy(false));
  }}>Đăng xuất</button></>;
}

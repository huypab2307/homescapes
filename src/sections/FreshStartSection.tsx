import { useStudio } from '../lib/studio.tsx';

export function FreshStartSection() {
  const { overview, serial, deviceSerial, pending, pushing, applying, connecting, newAccount, restoreDeviceBackup } = useStudio();
  const busy = pushing || applying || connecting;
  const ready = !!overview && !!serial && serial === deviceSerial && !pending.size && !busy;
  return <section className="am-panel">
    <div className="am-panel-head">
      <img src="assets/ui/panel-bars.png" alt=""/>
      <h2 className="am-panel-title">Fresh Start</h2>
    </div>
    <div style={{ margin: '18px 0 8px', padding: 24, border: '1px solid #a5c5fa', borderRadius: 16, background: '#eef5ff' }}>
      <h3 style={{ fontSize: 22, fontWeight: 700, color: '#143e87', margin: '0 0 20px' }}>Create new account</h3>
      <div className="am-row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <button className="am-ghost am-ghost--primary" type="button" disabled={!ready} onClick={() => {
          if (window.confirm('Create a new account on the selected device? Current progress will be replaced. You can restore the backup.')) void newAccount();
        }}>{pushing ? 'Processing…' : 'Create new account'}</button>
        <button className="am-ghost" type="button" disabled={!serial || busy} onClick={() => {
          if (window.confirm('Restore previous progress on the selected device?')) void restoreDeviceBackup();
        }}>Restore previous account</button>
      </div>
      {!overview && <p className="am-hint" style={{ margin: '14px 0 0' }}>Connect a device to continue.</p>}
      {!!pending.size && <p className="am-hint" style={{ margin: '14px 0 0' }}>Save or discard pending changes before continuing.</p>}
    </div>
  </section>;
}

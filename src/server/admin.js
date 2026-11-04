let token = '', generated = '';
const el = id => document.getElementById(id);
async function api(path, body) {
  const response = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) logout(); throw Error(data.error || 'Request failed'); }
  return data;
}
function logout() { token = ''; generated = ''; el('newkey').textContent = ''; el('rows').replaceChildren(); el('panel').hidden = true; el('login').hidden = false; }
async function run(fn) { el('message').textContent = ''; try { await fn(); } catch (e) { el('message').textContent = e.message; } }
async function refresh() {
  const data = await api('licenses'); el('rows').replaceChildren();
  for (const l of data.licenses) {
    const row = document.createElement('tr');
    for (const value of [l.hint, l.note, Number(l.expires_at) ? new Date(Number(l.expires_at)*1000).toLocaleString() : 'Lifetime', l.revoked ? 'Revoked' : Number(l.expires_at) && Number(l.expires_at)*1000 <= Date.now() ? 'Expired' : l.bound ? 'Device assigned' : 'Unassigned']) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    const actions = document.createElement('td');
    for (const [label, route] of [['Unbind device', 'unbind'], ['Revoke', 'revoke']]) { const button = document.createElement('button'); button.textContent = label; button.disabled = !!l.revoked; button.onclick = () => { if (confirm(label + ' key …' + l.hint + '?')) void run(async () => { await api(route, { id: l.id }); await refresh(); }); }; actions.append(button); }
    row.append(actions); el('rows').append(row);
  }
}
el('loginForm').onsubmit = e => { e.preventDefault(); void run(async () => { const d = await api('login', { password: el('password').value }); el('password').value = ''; token = d.accessToken; el('panel').hidden = false; el('login').hidden = true; await refresh(); }); };
el('createForm').onsubmit = e => { e.preventDefault(); void run(async () => { const d = await api('create', { days: Number(el('days').value), note: el('note').value, maxDevices: Number(el('maxDevices').value), deviceIds: el('deviceIds').value.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean) }); generated = d.key; el('newkey').textContent = d.key + '\nSave this key now. The server stores only its hash; the full key cannot be viewed again.'; el('copy').hidden = false; await refresh(); }); };
el('copy').onclick = () => void run(async () => navigator.clipboard.writeText(generated));
el('refresh').onclick = () => void run(refresh); el('logout').onclick = logout;

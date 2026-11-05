import { useEffect, useState } from 'react';
import { api, money, fmtDate } from './api.js';

export function Analytics() {
  const [d, setD] = useState([]);
  useEffect(() => { api('/analytics').then(setD).catch(() => {}); }, []);
  const W = 300, H = 110, max = Math.max(1, ...d.flatMap((m) => [m.in, m.out])), X = (i) => 10 + (i * (W - 20)) / Math.max(1, d.length - 1);
  const pts = (k) => d.map((m, i) => [X(i), H - 8 - (m[k] / max) * (H - 24)]);
  const curve = (p) => p.map((q, i) => (i ? `C${(p[i - 1][0] + q[0]) / 2},${p[i - 1][1]} ${(p[i - 1][0] + q[0]) / 2},${q[1]} ${q[0]},${q[1]}` : `M${q[0]},${q[1]}`)).join('');
  const lines = [['in', 'var(--good)'], ['out', 'var(--bad)']];
  return (<section className="panel"><h3>Cash flow · 6 months</h3>
    <svg className="lc" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Money in and out by month">
      <defs>{lines.map(([k, c]) => <linearGradient key={k} id={'g' + k} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient>)}</defs>
      {d.length > 1 && lines.map(([k, c]) => { const p = pts(k); return (<g key={k}><path className="area" d={`${curve(p)}L${p[p.length - 1][0]},${H}L${p[0][0]},${H}Z`} fill={`url(#g${k})`} />
        <path className="line" pathLength="1" d={curve(p)} stroke={c} />{p.map(([x, y], i) => <circle key={i} className="pt" cx={x} cy={y} r="3.2" fill={c}><title>{`${d[i].month}: ${money(d[i][k])}`}</title></circle>)}</g>); })}
      {d.map((m, i) => <text key={m.month} x={X(i)} y={H + 14} textAnchor="middle" className="lbl">{m.month}</text>)}
    </svg><p className="split"><span className="in">● Money in</span><span className="out">● Money out</span></p></section>);
}

export function PayeePicker({ onPick }) {
  const [p, setP] = useState([]);
  useEffect(() => { api('/payees').then(setP).catch(() => {}); }, []);
  if (!p.length) return null;
  return <label>Saved payees<select defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)}><option value="">Choose a payee…</option>{p.map((x) => <option key={x._id} value={x.number}>{x.name} · {x.number}</option>)}</select></label>;
}

export function Payees() {
  const [p, setP] = useState([]); const [f, setF] = useState({ name: '', number: '' }); const [err, setErr] = useState('');
  const load = () => api('/payees').then(setP).catch(() => {}); useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); setErr(''); try { await api('/payees', f); setF({ name: '', number: '' }); load(); } catch (x) { setErr(x.message); } };
  const del = async (id) => { await api('/payees/' + id, null, 'DELETE'); load(); };
  return (<div className="grid"><form className="panel form" onSubmit={add}><h3>Save a payee</h3>
    <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength="40" required /></label>
    <label>Account number<input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} inputMode="numeric" maxLength="10" required /></label>
    {err && <p className="err" role="alert">{err}</p>}<button className="btn">Save payee</button></form>
    <section className="panel"><h3>Your payees</h3>{p.length === 0 ? <p className="empty">No payees yet. Save the people you pay often.</p> :
      <ul className="txns">{p.map((x) => <li key={x._id}><span className="dot in">{x.name[0]}</span><div><b>{x.name}</b><small>{x.number}</small></div><button className="link" onClick={() => del(x._id)}>Remove</button></li>)}</ul>}</section></div>);
}

export function TwoFA({ enabled, onChange }) {
  const [s, setS] = useState(); const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [m, setM] = useState('');
  const run = (fn) => async (e) => { e.preventDefault(); setM(''); try { await fn(); setCode(''); setPw(''); setS(); onChange(); } catch (x) { setM(x.message); } };
  return (<section className="panel form"><h3>Two-factor sign-in</h3>
    {!enabled && !s && <><p>Add a 6-digit code from an authenticator app (Google Authenticator, Authy…) every time you sign in.</p>
      <button className="btn" onClick={async () => { try { setS(await api('/2fa/setup', {})); } catch (x) { setM(x.message); } }}>Turn on two-factor</button></>}
    {s && <form className="form" onSubmit={run(() => api('/2fa/enable', { code }))}><img src={s.qr} alt="QR code to scan with your authenticator app" width="180" height="180" />
      <small>Can't scan? Enter this key: <code>{s.secret}</code></small>
      <label>Code from the app<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength="6" required /></label><button className="btn">Confirm and turn on</button></form>}
    {enabled && <form className="form" onSubmit={run(() => api('/2fa/disable', { code, password: pw }))}><p className="ok">Two-factor is on.</p>
      <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
      <label>Current code<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength="6" required /></label><button className="btn">Turn off</button></form>}
    {m && <p className="err" role="alert">{m}</p>}</section>);
}

export function Freeze({ acct, refresh }) {
  const [m, setM] = useState('');
  const go = async () => { setM(''); try { await api('/accounts/freeze', { frozen: !acct.frozen }); refresh(); } catch (x) { setM(x.message); } };
  return (<section className="panel form"><h3>Freeze account</h3><p>{acct?.frozen ? 'Your account is frozen. Money can’t leave or be added.' : 'Lost your phone or see something odd? Pause all outgoing money instantly.'}</p>
    {m && <p className="err" role="alert">{m}</p>}<button className="btn" onClick={go}>{acct?.frozen ? 'Unfreeze account' : 'Freeze account'}</button></section>);
}

export function Admin() {
  const [st, setSt] = useState(); const [us, setUs] = useState([]); const [au, setAu] = useState([]);
  const load = () => { api('/admin/stats').then(setSt).catch(() => {}); api('/admin/users').then(setUs).catch(() => {}); api('/admin/audit').then(setAu).catch(() => {}); };
  useEffect(() => { load(); }, []);
  const toggle = async (u) => { await api(`/admin/users/${u.id}/freeze`, { frozen: !u.frozen }); load(); };
  return (<>{st && <div className="grid">{[['Customers', st.users], ['Transactions', st.txns], ['Money held', money(st.total)], ['Frozen accounts', st.frozen]].map(([l, v]) => <section key={l} className="panel"><small>{l}</small><h2>{v}</h2></section>)}</div>}
    <section className="panel"><h3>Customers</h3><div className="scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Balance</th><th></th></tr></thead><tbody>
      {us.map((u) => <tr key={u.id}><td>{u.name}{u.role === 'admin' && ' (admin)'}</td><td>{u.email}</td><td>{u.number}</td><td>{money(u.balance)}</td><td><button className="link" onClick={() => toggle(u)}>{u.frozen ? 'Unfreeze' : 'Freeze'}</button></td></tr>)}</tbody></table></div></section>
    <section className="panel"><h3>Audit log</h3><ul className="txns">{au.map((a, i) => <li key={i}><span className="dot in">✓</span><div><b>{a.event}</b><small>{a.who || 'unknown'} · {fmtDate(a.date)} · {a.ip}</small></div></li>)}</ul></section></>);
}

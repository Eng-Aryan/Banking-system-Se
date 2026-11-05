import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { api, money, fmtDate } from './api.js';
import { BANK_NAME } from './config.js';
import { Analytics, PayeePicker, Payees, TwoFA, Freeze, Admin } from './Extra.jsx';

const Toast = createContext(() => {});
const P = { home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8M21 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8', shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 12H5z', out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9', sun: 'M12 17a5 5 0 100-10 5 5 0 000 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z', up: 'M7 17L17 7M8 7h9v9', down: 'M17 7L7 17M16 17H7V8', dl: 'M12 3v12M7 10l5 5 5-5M5 21h14', copy: 'M9 9h11v11H9zM5 15V5h10',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6', wifi: 'M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01' };
const Icon = ({ n, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
const Logo = () => <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b8cff" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
  <rect width="32" height="32" rx="9" fill="url(#lg)" /><path d="M9 21V11l7 6 7-6v10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Mesh = () => <div className="mesh" aria-hidden="true"><i /><i /><i /></div>;

function useCountUp(target, ms = 1000) {
  const [v, setV] = useState(0); const from = useRef(0);
  useEffect(() => {
    if (target == null) return; const s = from.current, t0 = performance.now(); let raf;
    const d = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ms;
    const tick = (t) => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 4); setV(Math.round(s + (target - s) * e)); if (p < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
const strength = (p) => [p.length >= 10, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
const LINES = ['Send money in seconds.', 'Guarded by two-factor security.', 'Every move, always in view.'];

function Auth({ onDone }) {
  const [mode, setMode] = useState('login'); const [f, setF] = useState({ name: '', email: '', password: '', code: '' });
  const [need, setNeed] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 3800); return () => clearInterval(t); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fld = (label, k, p = {}) => <div className="fl"><input placeholder=" " value={f[k]} onChange={set(k)} required {...p} /><span>{label}</span></div>;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api(mode === 'login' ? '/auth/login' : '/auth/register', f); onDone(); } catch (x) { if (x.data?.need2fa) setNeed(true); setErr(x.message); } setBusy(false);
  };
  const s = strength(f.password);
  return (
    <main className="auth"><Mesh />
      <section className="auth-art"><div className="brand"><Logo /><b>{BANK_NAME}</b></div>
        <h1 key={i} className="swap">{LINES[i]}</h1>
        <div className="float-cards" aria-hidden="true">
          <div className="mini a"><small>Total balance</small><b>$12,480.50</b></div>
          <div className="mini b"><Icon n="shield" /> 2-step verified</div>
          <div className="mini c"><small>Salary</small><b className="in">+ $2,400.00</b></div></div></section>
      <form className="auth-form glass" onSubmit={submit} key={mode}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Open your account'}</h2>
        {mode === 'register' && fld('Full name', 'name', { autoComplete: 'name' })}
        {fld('Email', 'email', { type: 'email', autoComplete: 'email' })}
        {fld('Password', 'password', { type: 'password', autoComplete: mode === 'login' ? 'current-password' : 'new-password' })}
        {mode === 'register' && <><div className="meter" data-s={s} style={{ '--s': s }}><i /></div><small>10+ characters, upper & lower case, a number.</small></>}
        {need && mode === 'login' && fld('Authenticator code', 'code', { inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' })}
        {err && <p className="err shake" role="alert" key={err}>{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'New here? Open an account' : 'Already a customer? Sign in'}</button>
      </form></main>);
}

function BankCard({ acct, name }) {
  const ref = useRef(); const toast = useContext(Toast); const [show, setShow] = useState(false); const bal = useCountUp(acct?.balance);
  const move = (e) => { const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, st = ref.current.style;
    st.setProperty('--rx', (0.5 - y) * 14 + 'deg'); st.setProperty('--ry', (x - 0.5) * 18 + 'deg'); st.setProperty('--mx', x * 100 + '%'); st.setProperty('--my', y * 100 + '%'); };
  const leave = () => { ref.current.style.setProperty('--rx', '0deg'); ref.current.style.setProperty('--ry', '0deg'); };
  const num = acct ? (show ? acct.number.replace(/(\d{4})(\d{4})(\d{2})/, '$1 $2 $3') : '•••• •••• •• ' + acct.number.slice(-2)) : '';
  return (<div className="card3d" onMouseMove={move} onMouseLeave={leave}><div className={'card-face' + (acct?.frozen ? ' frozen' : '')} ref={ref}>
    <div className="card-top"><b>{BANK_NAME}</b><span className="chip" /></div>
    <div><small>Available balance</small><div className="card-bal">{acct ? money(bal) : '…'}</div></div>
    <div className="card-foot"><div><div className="card-num">{num}
      <button aria-label="Show or hide number" onClick={() => setShow(!show)}><Icon n="eye" s={16} /></button>
      <button aria-label="Copy account number" onClick={() => { navigator.clipboard?.writeText(acct.number); toast('Account number copied'); }}><Icon n="copy" s={16} /></button></div>
      <small>{name.toUpperCase()}</small></div><Icon n="wifi" s={26} /></div>
    {acct?.frozen && <span className="frozen-tag">FROZEN</span>}</div></div>);
}

const Txns = ({ rows }) => rows.length === 0 ? <p className="empty">Nothing here yet. Make a deposit or send money to get started.</p> : (
  <ul className="txns">{rows.map((t, i) => (
    <li key={t.id} style={{ '--i': i }}><span className={'dot ' + (t.amount > 0 ? 'in' : 'out')}><Icon n={t.amount > 0 ? 'down' : 'up'} s={18} /></span>
      <div><b>{t.type === 'deposit' ? 'Deposit' : t.amount > 0 ? `From ${t.counterparty}` : `To ${t.counterparty}`}</b><small>{t.note || t.type} · {fmtDate(t.date)}</small></div>
      <em className={t.amount > 0 ? 'in' : 'out'}>{t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}</em></li>))}</ul>);

function Home({ acct, user, rows, refresh, go }) {
  const toast = useContext(Toast); const [amt, setAmt] = useState('');
  const dep = async (e) => { e.preventDefault(); try { await api('/accounts/deposit', { amount: Number(amt) }); setAmt(''); toast('Deposit added'); refresh(); } catch (x) { toast(x.message, 'bad'); } };
  const inn = rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), out = rows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const pct = inn + out ? Math.round((inn / (inn + out)) * 100) : 50;
  const quick = [['send', 'Send', 'transfer'], ['users', 'Payees', 'payees'], ['list', 'History', 'history'], ['dl', 'Statement']];
  return (<div className="stack">
    <div className="hero"><BankCard acct={acct} name={user.name} />
      <section className="panel"><div className="quick">{quick.map(([ic, l, v]) => v ? <button key={l} onClick={() => go(v)}><i><Icon n={ic} /></i>{l}</button>
        : <a key={l} href="/api/transactions/export.csv" download><i><Icon n={ic} /></i>{l}</a>)}</div>
        <h3>Money in vs out</h3><div className="bar" role="img" aria-label={`${pct}% money in`}><i style={{ '--w': pct + '%' }} /></div>
        <p className="split"><span className="in">In {money(inn)}</span><span className="out">Out {money(out)}</span></p>
        <form className="inline" onSubmit={dep}><input type="number" step="0.01" min="1" placeholder="Add demo funds ($)" aria-label="Deposit amount" value={amt} onChange={(e) => setAmt(e.target.value)} required /><button className="btn sm">Deposit</button></form></section></div>
    <div className="two"><Analytics /><section className="panel"><h3>Recent activity</h3><Txns rows={rows.slice(0, 6)} /></section></div></div>);
}

function Transfer({ refresh }) {
  const toast = useContext(Toast); const [f, setF] = useState({ toAccount: '', amount: '', note: '' }); const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async () => { setBusy(true); try { await api('/transactions/transfer', { ...f, amount: Number(f.amount) }); setStep(2); refresh(); } catch (x) { toast(x.message, 'bad'); setStep(0); } setBusy(false); };
  const steps = <ol className="steps">{['Details', 'Review', 'Done'].map((l, i) => <li key={l} className={i <= step ? 'on' : ''}>{l}</li>)}</ol>;
  if (step === 2) return (<section className="panel success">{steps}<div className="tick-wrap"><div className="confetti">{Array.from({ length: 18 }, (_, k) => <i key={k} style={{ '--a': k * 20 + 'deg', '--d': 50 + (k % 3) * 22 + 'px', '--c': ['#5b8cff', '#8b5cf6', '#34d399', '#f5c86b'][k % 4] }} />)}</div>
    <svg className="tick" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" pathLength="1" fill="none" stroke="var(--good)" strokeWidth="3" /><path d="M15 27l8 8 14-16" pathLength="1" fill="none" stroke="var(--good)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
    <h2>Money sent</h2><p>{money(Math.round(f.amount * 100))} is on its way to {f.toAccount}.</p>
    <button className="btn" onClick={() => { setF({ toAccount: '', amount: '', note: '' }); setStep(0); }}>Send another</button></section>);
  if (step === 1) return (<section className="panel review">{steps}<small>You are sending</small><div className="amount-big">{money(Math.round(f.amount * 100))}</div>
    <div className="row"><span>To account</span><b>{f.toAccount}</b></div>{f.note && <div className="row"><span>Note</span><b>{f.note}</b></div>}<div className="row"><span>Fee</span><b>$0.00</b></div>
    <p className="warn">Check the account number carefully. Transfers can’t be undone.</p>
    <div className="inline"><button className="btn ghost" onClick={() => setStep(0)}>Edit</button><button className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Confirm & send'}</button></div></section>);
  return (<form className="panel form" onSubmit={(e) => { e.preventDefault(); setStep(1); }}>{steps}<h3>Send money</h3>
    <PayeePicker onPick={(n) => setF((p) => ({ ...p, toAccount: n }))} />
    <label>Recipient account number<input value={f.toAccount} onChange={set('toAccount')} inputMode="numeric" maxLength="10" pattern="\d{10}" title="10 digits" required /></label>
    <label>Amount (USD)<input type="number" step="0.01" min="0.01" value={f.amount} onChange={set('amount')} required /></label>
    <label>Note (optional)<input value={f.note} onChange={set('note')} maxLength="80" /></label><button className="btn">Review transfer</button></form>);
}

function History() {
  const [type, setType] = useState(''); const [rows, setRows] = useState(null); const [q, setQ] = useState('');
  useEffect(() => { setRows(null); api('/transactions' + (type ? `?type=${type}` : '')).then(setRows).catch(() => setRows([])); }, [type]);
  const shown = (rows || []).filter((r) => !q || `${r.note} ${r.counterparty} ${r.type}`.toLowerCase().includes(q.toLowerCase()));
  return (<section className="panel"><div className="between"><h3>Transactions</h3><a className="link" href="/api/transactions/export.csv" download>Download CSV</a></div>
    <input className="search" placeholder="Search transactions" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="chips">{[['', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['deposit', 'Deposits']].map(([v, l]) => <button key={v} className={type === v ? 'on' : ''} onClick={() => setType(v)}>{l}</button>)}</div>
    {rows === null ? [0, 1, 2, 3].map((k) => <div className="skel" key={k} />) : <Txns rows={shown} />}</section>);
}

function Security({ user, acct, refresh, boot }) {
  const toast = useContext(Toast); const [f, setF] = useState({ current: '', password: '' }); const [log, setLog] = useState([]);
  const load = () => api('/activity').then(setLog).catch(() => {}); useEffect(() => { load(); }, []);
  const save = async (e) => { e.preventDefault(); try { await api('/auth/password', f); setF({ current: '', password: '' }); toast('Password updated'); load(); } catch (x) { toast(x.message, 'bad'); } };
  return (<div className="grid"><TwoFA enabled={user.totpEnabled} onChange={boot} /><Freeze acct={acct} refresh={refresh} />
    <form className="panel form" onSubmit={save}><h3>Change password</h3>
      <label>Current password<input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label>New password<input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label><button className="btn">Update password</button></form>
    <section className="panel"><h3>Recent security activity</h3><ul className="txns">{log.map((l, i) => <li key={i} style={{ '--i': i }}><span className="dot in"><Icon n="shield" s={18} /></span><div><b>{l.event}</b><small>{fmtDate(l.createdAt)} · IP {l.ip}</small></div></li>)}</ul></section></div>);
}

const NAV = [['home', 'Overview', 'home'], ['transfer', 'Send', 'send'], ['history', 'History', 'list'], ['payees', 'Payees', 'users'], ['security', 'Security', 'shield']];

export default function App() {
  const [user, setUser] = useState(undefined); const [view, setView] = useState('home'); const [acct, setAcct] = useState(); const [rows, setRows] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark'); const [toasts, setToasts] = useState([]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  const toast = useCallback((m, k = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, m, k }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600); }, []);
  const refresh = useCallback(() => { api('/accounts/me').then(setAcct).catch(() => {}); api('/transactions').then(setRows).catch(() => {}); }, []);
  const boot = useCallback(() => api('/auth/me').then((u) => { setUser(u); refresh(); }).catch(() => setUser(null)), [refresh]);
  useEffect(() => { boot(); }, [boot]);
  if (user === undefined) return <><Mesh /><div className="boot"><Logo /></div></>;
  if (!user) return <Auth onDone={boot} />;
  const items = [...NAV, ...(user.role === 'admin' ? [['admin', 'Admin', 'crown']] : [])]; const idx = Math.max(0, items.findIndex((x) => x[0] === view));
  const hr = new Date().getHours(), hi = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const out = async () => { await api('/auth/logout', {}); setUser(null); setView('home'); };
  return (<Toast.Provider value={toast}><Mesh /><div className="shell">
    <aside><div className="brand"><Logo /><b>{BANK_NAME}</b></div>
      <nav style={{ '--n': items.length }}><i className="pill" style={{ '--i': idx }} />{items.map(([k, l, ic]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}><Icon n={ic} /><span>{l}</span></button>)}</nav></aside>
    <main className="main"><header className="top"><div><small>{hi}</small><h2>{user.name.split(' ')[0]}</h2></div>
      <div className="tools"><button className="iconbtn" aria-label="Toggle light or dark theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon n={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="iconbtn" aria-label="Sign out" onClick={out}><Icon n="out" /></button><span className="avatar" aria-hidden="true">{user.name[0].toUpperCase()}</span></div></header>
      <div className="view" key={view}>
        {view === 'home' && <Home acct={acct} user={user} rows={rows} refresh={refresh} go={setView} />}
        {view === 'transfer' && <Transfer refresh={refresh} />}
        {view === 'history' && <History />}
        {view === 'payees' && <Payees />}
        {view === 'security' && <Security user={user} acct={acct} refresh={refresh} boot={boot} />}
        {view === 'admin' && user.role === 'admin' && <Admin />}</div></main>
    <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={'toast ' + t.k}>{t.m}</div>)}</div></div></Toast.Provider>);
}

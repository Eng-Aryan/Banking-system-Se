import { useEffect, useState } from 'react';
import { api, money } from './api.js';

/** Virtual cards: issue, freeze, daily limit, reveal (needs password), simulated purchase. */
export function Cards({ toast, refresh }) {
  const [cards, setCards] = useState(null); const [shown, setShown] = useState({});
  const load = () => api('/cards').then(setCards).catch(() => setCards([])); useEffect(() => { load(); }, []);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); load(); refresh?.(); } catch (e) { toast(e.message, 'bad'); } };
  const add = () => act(() => api('/cards', { label: prompt('Card name', 'Online shopping') || undefined }), 'Card issued');
  const reveal = async (c) => { const password = prompt('Enter your password to show the card number'); if (!password) return; try { setShown({ ...shown, [c.id]: await api(`/cards/${c.id}/reveal`, { password }) }); } catch (e) { toast(e.message, 'bad'); } };
  const pay = (c) => { const merchant = prompt('Merchant', 'Coffee Shop'); const amount = Number(prompt('Amount (USD)', '12.50')); if (merchant && amount) act(() => api(`/cards/${c.id}/pay`, { merchant, amount }), 'Payment approved'); };
  const limit = (c) => { const v = Number(prompt('Daily limit (USD)', c.dailyLimit / 100)); if (v) act(() => api(`/cards/${c.id}/limit`, { limit: v }), 'Limit updated'); };
  return (<section><div className="pg-head"><div><h3>Virtual cards</h3><small>Up to 3 cards. Freeze instantly, set a daily limit.</small></div><button className="btn" onClick={add}>+ New card</button></div>
    {cards === null ? <div className="skel" /> : !cards.length ? <p className="panel">No cards yet. Create your first virtual card.</p> :
      <div className="pg-grid">{cards.map((c) => (<div key={c.id} className="panel"><div className={'vcard' + (c.frozen ? ' off' : '')}><div className="row2"><b>{c.label}</b><span>{c.frozen ? 'FROZEN' : 'VISA'}</span></div><div className="chip" />
        <div className="pan">{shown[c.id]?.pan || `•••• •••• •••• ${c.last4}`}</div><div className="row2"><span>Exp {c.expiry}</span><span>Daily {money(c.dailyLimit)}</span></div></div>
        <div className="bar"><i style={{ width: Math.min(100, (c.spentToday / c.dailyLimit) * 100) + '%' }} /></div><small>Spent today {money(c.spentToday)}</small>
        <div className="tools-row"><button className="btn" onClick={() => pay(c)}>Pay</button><button className="btn ghost" onClick={() => act(() => api(`/cards/${c.id}/freeze`, { frozen: !c.frozen }), c.frozen ? 'Card unfrozen' : 'Card frozen')}>{c.frozen ? 'Unfreeze' : 'Freeze'}</button>
          <button className="btn ghost" onClick={() => limit(c)}>Limit</button><button className="btn ghost" onClick={() => reveal(c)}>Show number</button>
          <button className="btn ghost" onClick={() => confirm('Close this card?') && act(() => api(`/cards/${c.id}`, null, 'DELETE'), 'Card closed')}>Close</button></div></div>))}</div>}</section>);
}

/** Savings goals: money moves atomically between the account and a goal pot. */
export function Goals({ toast, refresh }) {
  const [goals, setGoals] = useState(null); const [f, setF] = useState({ name: '', target: '' }); const [amt, setAmt] = useState({});
  const load = () => api('/goals').then(setGoals).catch(() => setGoals([])); useEffect(() => { load(); }, []);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); load(); refresh?.(); } catch (e) { toast(e.message, 'bad'); } };
  return (<section><div className="pg-head"><div><h3>Savings goals</h3><small>Set money aside for what matters.</small></div></div>
    <form className="panel form" onSubmit={(e) => { e.preventDefault(); act(() => api('/goals', { name: f.name, target: Number(f.target) }), 'Goal created').then(() => setF({ name: '', target: '' })); }}>
      <div className="mini-in"><input placeholder="Goal name (e.g. New laptop)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength="40" />
        <input type="number" min="1" placeholder="Target USD" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} required /><button className="btn">Create</button></div></form>
    <div className="pg-grid" style={{ marginTop: 20 }}>{(goals || []).map((g) => (<div key={g._id} className="panel"><div className="between"><h3>{g.name}</h3><b>{Math.round((g.saved / g.target) * 100)}%</b></div>
      <div className="bar"><i style={{ width: Math.min(100, (g.saved / g.target) * 100) + '%' }} /></div><small>{money(g.saved)} of {money(g.target)}</small>
      <div className="mini-in"><input type="number" step="0.01" min="0.01" placeholder="USD" value={amt[g._id] || ''} onChange={(e) => setAmt({ ...amt, [g._id]: e.target.value })} />
        <button className="btn" onClick={() => act(() => api(`/goals/${g._id}/add`, { amount: Number(amt[g._id]) }), 'Added to goal')}>Add</button>
        <button className="btn ghost" onClick={() => act(() => api(`/goals/${g._id}/withdraw`, { amount: Number(amt[g._id]) }), 'Moved back')}>Take</button>
        <button className="btn ghost" onClick={() => act(() => api(`/goals/${g._id}`, null, 'DELETE'), 'Goal deleted')}>✕</button></div></div>))}</div></section>);
}

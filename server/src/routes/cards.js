import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { body, param } from 'express-validator';
import { Account, Card, User } from '../models/index.js';
import { auth, check, log, wrap } from '../middleware/index.js';
import { decrypt } from '../services/crypto.js';
import { debitFilter, checkDebit, ERR, MSG } from '../services/finance.js';
import { appendLedger, atomic, run, Fail } from '../services/ledger.js';
const router = Router(); const id = param('id').isMongoId();
const luhn = (d) => { let s = 0; [...d].reverse().forEach((c, i) => { let n = +c; if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } s += n; }); return (10 - (s % 10)) % 10; };
const newPan = () => { const b = '4' + String(crypto.randomInt(0, 1e14)).padStart(14, '0'); return b + luhn(b); }; // Visa-style test number
const pub = (c) => ({ id: c._id, label: c.label, last4: c.last4, expiry: c.expiry, frozen: c.frozen, dailyLimit: c.dailyLimit, spentToday: c.spentDay === new Date().toISOString().slice(0, 10) ? c.spentToday : 0, status: c.status });

router.get('/cards', auth, wrap(async (req, res) => res.json((await Card.find({ user: req.uid, status: 'active' })).map(pub))));
router.post('/cards', auth, check([body('label').optional().isString().trim().isLength({ max: 30 })]), wrap(async (req, res) => {
  if ((await Card.countDocuments({ user: req.uid, status: 'active' })) >= 3) return res.status(400).json({ error: 'You can have up to 3 active cards' });
  const pan = newPan(), y = new Date().getUTCFullYear() + 4;
  const c = await Card.create({ user: req.uid, label: req.body.label || 'Virtual card', pan, last4: pan.slice(-4), expiry: `12/${String(y).slice(2)}` });
  await log(req.uid, `Card •••• ${c.last4} issued`, req); res.status(201).json(pub(c));
}));
router.post('/cards/:id/freeze', auth, check([id, body('frozen').isBoolean()]), wrap(async (req, res) => {
  const c = await Card.findOneAndUpdate({ _id: req.params.id, user: req.uid, status: 'active' }, { frozen: req.body.frozen }, { new: true });
  if (!c) return res.status(404).json({ error: 'Card not found' }); await log(req.uid, `Card •••• ${c.last4} ${c.frozen ? 'frozen' : 'unfrozen'}`, req); res.json(pub(c));
}));
router.post('/cards/:id/limit', auth, check([id, body('limit').isFloat({ min: 1, max: 5000 }).withMessage('Limit between $1 and $5,000')]), wrap(async (req, res) => {
  const c = await Card.findOneAndUpdate({ _id: req.params.id, user: req.uid, status: 'active' }, { dailyLimit: Math.round(req.body.limit * 100) }, { new: true });
  c ? res.json(pub(c)) : res.status(404).json({ error: 'Card not found' });
}));
router.post('/cards/:id/reveal', auth, check([id, body('password').isString()]), wrap(async (req, res) => { // full number only after re-entering the password
  const u = await User.findById(req.uid); if (!(await bcrypt.compare(req.body.password, u.password))) return res.status(400).json({ error: 'Password is incorrect' });
  const c = await Card.findOne({ _id: req.params.id, user: req.uid }).select('+pan'); if (!c) return res.status(404).json({ error: 'Card not found' });
  await log(req.uid, `Card •••• ${c.last4} revealed`, req); res.json({ pan: decrypt(c.pan).replace(/(\d{4})(?=\d)/g, '$1 '), expiry: c.expiry });
}));
router.delete('/cards/:id', auth, check([id]), wrap(async (req, res) => { await Card.updateOne({ _id: req.params.id, user: req.uid }, { status: 'closed' }); await log(req.uid, 'Card closed', req); res.json({ ok: true }); }));
// Simulated purchase: atomic debit + ledger, subject to freeze and daily limit
router.post('/cards/:id/pay', auth, check([id, body('merchant').isString().trim().isLength({ min: 1, max: 40 }), body('amount').isFloat({ min: 0.01, max: 5000 })]), run(async (req, res) => {
  const cents = Math.round(req.body.amount * 100), day = new Date().toISOString().slice(0, 10);
  const bal = await atomic(async (s) => {
    const c = await Card.findOne({ _id: req.params.id, user: req.uid, status: 'active' }).session(s); if (!c) throw new Fail(404, 'Card not found');
    if (c.frozen) throw new Fail(403, 'This card is frozen', 'ERR_CARD_FROZEN');
    const spent = c.spentDay === day ? c.spentToday : 0; if (spent + cents > c.dailyLimit) throw new Fail(400, 'Daily card limit exceeded', 'ERR_CARD_LIMIT');
    const me = await Account.findOne({ user: req.uid }).session(s); if (me.frozen) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
    const v = checkDebit(me.type, me.balance, cents); if (!v.ok) throw new Fail(400, MSG[v.code], v.code);
    const a = await Account.findOneAndUpdate({ _id: me._id, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents }, $min: { monthMin: me.balance - cents } }, { new: true, session: s });
    if (!a) throw new Fail(400, MSG[ERR.INSUFFICIENT], ERR.INSUFFICIENT);
    await Card.updateOne({ _id: c._id }, { spentDay: day, spentToday: spent + cents }, { session: s });
    await appendLedger(s, { from: a.number, amount: cents, type: 'card', note: `${req.body.merchant} (•••• ${c.last4})`, owners: [req.uid], balanceAfter: a.balance });
    return a.balance;
  });
  await log(req.uid, `Card payment ${req.body.merchant}`, req); res.status(201).json({ balance: bal });
}));
export default router;

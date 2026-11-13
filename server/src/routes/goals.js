import { Router } from 'express';
import { body, param } from 'express-validator';
import { Account, Goal } from '../models/index.js';
import { auth, check, log, wrap } from '../middleware/index.js';
import { debitFilter, checkDebit, ERR, MSG } from '../services/finance.js';
import { appendLedger, atomic, run, Fail } from '../services/ledger.js';
const router = Router(); const id = param('id').isMongoId(), amt = body('amount').isFloat({ min: 0.01, max: 5000 }).withMessage('Amount between $0.01 and $5,000');
router.get('/goals', auth, wrap(async (req, res) => res.json(await Goal.find({ user: req.uid }).sort({ createdAt: -1 }).select('name target saved'))));
router.post('/goals', auth, check([body('name').isString().trim().isLength({ min: 1, max: 40 }).withMessage('Name your goal'), body('target').isFloat({ min: 1, max: 1_000_000 })]), wrap(async (req, res) => {
  if ((await Goal.countDocuments({ user: req.uid })) >= 10) return res.status(400).json({ error: 'Up to 10 goals' });
  res.status(201).json(await Goal.create({ user: req.uid, name: req.body.name, target: Math.round(req.body.target * 100) }));
}));
// money moves atomically between the account and the goal pot, with a ledger entry
router.post('/goals/:id/add', auth, check([id, amt]), run(async (req, res) => {
  const cents = Math.round(req.body.amount * 100);
  const out = await atomic(async (s) => {
    const g = await Goal.findOne({ _id: req.params.id, user: req.uid }).session(s); if (!g) throw new Fail(404, 'Goal not found');
    const me = await Account.findOne({ user: req.uid }).session(s); if (me.frozen) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
    const v = checkDebit(me.type, me.balance, cents); if (!v.ok) throw new Fail(400, MSG[v.code], v.code);
    const a = await Account.findOneAndUpdate({ _id: me._id, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents }, $min: { monthMin: me.balance - cents } }, { new: true, session: s });
    if (!a) throw new Fail(400, MSG[ERR.INSUFFICIENT], ERR.INSUFFICIENT);
    g.saved += cents; await g.save({ session: s });
    await appendLedger(s, { from: a.number, amount: cents, type: 'goal', note: `To goal: ${g.name}`, owners: [req.uid], balanceAfter: a.balance });
    return { balance: a.balance, saved: g.saved };
  }); await log(req.uid, 'Goal deposit', req); res.status(201).json(out);
}));
router.post('/goals/:id/withdraw', auth, check([id, amt]), run(async (req, res) => {
  const cents = Math.round(req.body.amount * 100);
  const out = await atomic(async (s) => {
    const g = await Goal.findOneAndUpdate({ _id: req.params.id, user: req.uid, saved: { $gte: cents } }, { $inc: { saved: -cents } }, { new: true, session: s }); if (!g) throw new Fail(400, 'Not enough saved in this goal');
    const a = await Account.findOneAndUpdate({ user: req.uid, frozen: { $ne: true } }, { $inc: { balance: cents } }, { new: true, session: s }); if (!a) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
    await appendLedger(s, { to: a.number, amount: cents, type: 'goal', note: `From goal: ${g.name}`, owners: [req.uid], balanceAfter: a.balance });
    return { balance: a.balance, saved: g.saved };
  }); res.json(out);
}));
router.delete('/goals/:id', auth, check([id]), wrap(async (req, res) => {
  const g = await Goal.findOne({ _id: req.params.id, user: req.uid }); if (g?.saved > 0) return res.status(400).json({ error: 'Withdraw the saved money first' });
  await Goal.deleteOne({ _id: req.params.id, user: req.uid }); res.json({ ok: true });
}));
export default router;

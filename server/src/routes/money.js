import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { body, query, param } from 'express-validator';
import { User, Account, Txn, Audit, Payee, Card, Goal } from '../models/index.js';
import { wrap, check, log, auth, admin, strong, setCookie, authLimit } from '../middleware/index.js';
import { ACCOUNT_TYPES, BCRYPT_COST, ERR, MSG, checkDebit, debitFilter, afterFailedLogin, isLocked } from '../services/finance.js';
import { verifyTotp, b32enc } from '../services/totp.js';
import { runMonthlyInterest } from '../services/interest.js';
import { appendLedger, verifyChain, atomic, run, Fail } from '../services/ledger.js';
import { env } from '../config/env.js';
const SECRET = env.jwtSecret, SECURE = env.secureCookie, S = env.jwtSecret, sec = env.secureCookie;
const router = Router();
  router.post('/accounts/deposit', auth, check([body('amount').isFloat({ min: 1, max: 10000 }).withMessage('Deposit between $1 and $10,000')]), run(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const bal = await atomic(async (s) => {
      const a = await Account.findOneAndUpdate({ user: req.uid, frozen: { $ne: true } }, { $inc: { balance: cents } }, { new: true, session: s });
      if (!a) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
      await appendLedger(s, { to: a.number, amount: cents, type: 'deposit', note: 'Deposit', owners: [req.uid], balanceAfter: a.balance });
      return a.balance;
    });
    await log(req.uid, 'Deposit', req); res.json({ balance: bal });
  }));

  router.post('/accounts/withdraw', auth, check([body('amount').isFloat({ min: 0.01, max: 5000 }).withMessage('Withdraw between $0.01 and $5,000')]), run(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const out = await atomic(async (s) => {
      const me = await Account.findOne({ user: req.uid }).session(s);
      if (me.frozen) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
      const v = checkDebit(me.type, me.balance, cents);
      if (!v.ok) throw new Fail(400, MSG[v.code], v.code);
      // the floor is re-checked inside the same transaction: concurrent withdrawals can never overdraw
      const a = await Account.findOneAndUpdate({ _id: me._id, frozen: { $ne: true }, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents }, $min: { monthMin: me.balance - cents } }, { new: true, session: s });
      if (!a) throw new Fail(400, MSG[ERR.INSUFFICIENT], ERR.INSUFFICIENT);
      await appendLedger(s, { from: a.number, amount: cents, type: 'withdrawal', note: 'Withdrawal', owners: [req.uid], balanceAfter: a.balance });
      return { balance: a.balance, overdraft: a.balance < 0 };
    });
    await log(req.uid, 'Withdrawal', req); res.status(201).json(out);
  }));

  router.post('/transactions/transfer', auth, check([body('toAccount').matches(/^\d{10}$/).withMessage('Account numbers have 10 digits'),
    body('amount').isFloat({ min: 0.01, max: 5000 }).withMessage('Transfer between $0.01 and $5,000'), body('note').optional().isString().trim().isLength({ max: 80 })]), run(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const bal = await atomic(async (s) => {
      const me = await Account.findOne({ user: req.uid }).session(s), to = await Account.findOne({ number: req.body.toAccount }).session(s);
      if (!to) throw new Fail(404, 'No account found with that number');
      if (to.id === me.id) throw new Fail(400, 'You cannot transfer to your own account');
      if (me.frozen || to.frozen) throw new Fail(403, MSG[ERR.FROZEN], ERR.FROZEN);
      const d = await Account.findOneAndUpdate({ _id: me._id, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents }, $min: { monthMin: me.balance - cents } }, { new: true, session: s });
      if (!d) throw new Fail(400, MSG[ERR.INSUFFICIENT], ERR.INSUFFICIENT);
      await Account.updateOne({ _id: to._id }, { $inc: { balance: cents } }, { session: s });
      await appendLedger(s, { from: me.number, to: to.number, amount: cents, type: 'transfer', note: req.body.note || '', owners: [req.uid, to.user], balanceAfter: d.balance });
      return d.balance;
    });
    await log(req.uid, `Transfer to ${req.body.toAccount}`, req); res.status(201).json({ balance: bal });
  }));

  router.get('/ledger/verify', auth, wrap(async (req, res) => res.json(await verifyChain((await Account.findOne({ user: req.uid })).number))));


export default router;

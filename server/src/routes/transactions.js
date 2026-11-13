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
const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // CSV-injection safe
router.get('/transactions', auth, check([query('type').optional().isIn(['deposit', 'withdrawal', 'transfer', 'in', 'out'])]),
  wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid });
    const f = { owners: a.user }; const t = req.query.type;
    if (t === 'deposit' || t === 'transfer') f.type = t; if (t === 'in') f.to = a.number; if (t === 'out') f.from = a.number;
    const rows = await Txn.find(f).sort({ createdAt: -1 }).limit(50).lean();
    res.json(rows.map((r) => ({ id: r._id, type: r.type, note: r.note, date: r.createdAt, counterparty: r.from === a.number ? r.to : r.from,
      amount: r.to === a.number ? r.amount : -r.amount })));
  }));

router.get('/activity', auth, wrap(async (req, res) => res.json(await Audit.find({ user: req.uid }).sort({ createdAt: -1 }).limit(15).select('event ip createdAt -_id'))));

  router.get('/analytics', auth, wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid }); const n = new Date();
    const since = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 5, 1)); const m = {};
    for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1)); m[d.toISOString().slice(0, 7)] = { month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), in: 0, out: 0 }; }
    for (const r of await Txn.find({ owners: req.uid, createdAt: { $gte: since } }).lean()) { const k = r.createdAt.toISOString().slice(0, 7); if (m[k]) r.to === a.number ? (m[k].in += r.amount) : (m[k].out += r.amount); }
    res.json(Object.values(m));
  }));

  router.get('/transactions/export.csv', auth, wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid });
    const rows = await Txn.find({ owners: req.uid }).sort({ createdAt: -1 }).limit(1000).lean();
    const lines = ['Date,Type,Counterparty,Note,Amount (USD)', ...rows.map((r) => [cell(r.createdAt.toISOString()), cell(r.type), cell(r.from === a.number ? r.to : r.from), cell(r.note), ((r.to === a.number ? r.amount : -r.amount) / 100).toFixed(2)].join(','))];
    res.type('text/csv').attachment('bank-statement.csv').send(lines.join('\n'));
  }));


export default router;

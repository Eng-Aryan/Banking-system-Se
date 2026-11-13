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
  router.get('/admin/stats', auth, admin, wrap(async (_q, res) => {
    const [users, txns, agg] = await Promise.all([User.countDocuments(), Txn.countDocuments(), Account.aggregate([{ $group: { _id: null, total: { $sum: '$balance' }, frozen: { $sum: { $cond: ['$frozen', 1, 0] } } } }])]);
    res.json({ users, txns, total: agg[0]?.total || 0, frozen: agg[0]?.frozen || 0 });
  }));
  router.get('/admin/users', auth, admin, wrap(async (_q, res) => {
    const as = await Account.find().populate('user', 'name email role').sort({ createdAt: -1 }).limit(100).lean();
    res.json(as.filter((a) => a.user).map((a) => ({ id: a.user._id, name: a.user.name, email: a.user.email, role: a.user.role, number: a.number, balance: a.balance, frozen: !!a.frozen })));
  }));
  router.post('/admin/users/:id/freeze', auth, admin, check([param('id').isMongoId(), body('frozen').isBoolean()]), wrap(async (req, res) => {
    const a = await Account.findOneAndUpdate({ user: req.params.id }, { frozen: req.body.frozen, lockedByAdmin: req.body.frozen }, { new: true });
    if (!a) return res.status(404).json({ error: 'Account not found' });
    await log(req.uid, `Admin ${a.frozen ? 'froze' : 'unfroze'} account ${a.number}`, req); res.json({ frozen: a.frozen });
  }));
  router.post('/admin/interest/run', auth, admin, wrap(async (req, res) => {
    const n = await runMonthlyInterest(); await log(req.uid, `Admin ran monthly interest (${n} accounts)`, req); res.json({ accounts: n });
  }));
  router.get('/admin/audit', auth, admin, wrap(async (_q, res) => {
    const rows = await Audit.find().sort({ createdAt: -1 }).limit(30).populate('user', 'email').lean();
    res.json(rows.map((r) => ({ event: r.event, who: r.user?.email, ip: r.ip, date: r.createdAt })));
  }));

export default router;

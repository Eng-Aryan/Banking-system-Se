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
router.get('/accounts/me', auth, wrap(async (req, res) => {
  const a = await Account.findOne({ user: req.uid }); res.json({ number: a.number, balance: a.balance, frozen: a.frozen, type: a.type });
}));

  router.post('/accounts/freeze', auth, check([body('frozen').isBoolean()]), wrap(async (req, res) => {
    const cur = await Account.findOne({ user: req.uid });
    if (cur.lockedByAdmin) return res.status(403).json({ error: 'Your account was frozen by the bank. Please contact support.' });
    const a = await Account.findOneAndUpdate({ user: req.uid }, { frozen: req.body.frozen }, { new: true });
    await log(req.uid, a.frozen ? 'Account frozen' : 'Account unfrozen', req); res.json({ frozen: a.frozen });
  }));


export default router;

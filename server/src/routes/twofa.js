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
  router.post('/2fa/setup', auth, wrap(async (req, res) => {
    const u = await User.findById(req.uid);
    if (u.totpEnabled) return res.status(400).json({ error: 'Two-factor sign-in is already on' });
    u.totpSecret = b32enc(crypto.randomBytes(20)); await u.save();
    const uri = `otpauth://totp/Bank:${encodeURIComponent(u.email)}?secret=${u.totpSecret}&issuer=Bank`;
    res.json({ secret: u.totpSecret, qr: await QRCode.toDataURL(uri) });
  }));
  router.post('/2fa/enable', auth, check([body('code').matches(/^\d{6}$/).withMessage('Enter the 6-digit code')]), wrap(async (req, res) => {
    const u = await User.findById(req.uid).select('+totpSecret');
    if (!verifyTotp(u.totpSecret, req.body.code)) return res.status(400).json({ error: 'That code did not match. Try the next one.' });
    u.totpEnabled = true; await u.save(); await log(u._id, 'Two-factor turned on', req); res.json({ ok: true });
  }));
  router.post('/2fa/disable', auth, check([body('code').matches(/^\d{6}$/), body('password').isString()]), wrap(async (req, res) => {
    const { default: bcrypt } = await import('bcryptjs');
    const u = await User.findById(req.uid).select('+totpSecret');
    if (!(await bcrypt.compare(req.body.password, u.password)) || !verifyTotp(u.totpSecret, req.body.code)) return res.status(400).json({ error: 'Password or code is incorrect' });
    u.totpEnabled = false; u.totpSecret = undefined; await u.save(); await log(u._id, 'Two-factor turned off', req); res.json({ ok: true });
  }));


export default router;

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
const newNumber = () => String(crypto.randomInt(1_000_000_000, 9_999_999_999));
router.post('/auth/register', authLimit, check([
  body('name').isString().trim().isLength({ min: 2, max: 60 }).withMessage('Enter your full name'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
  body('accountType').optional().isIn(ACCOUNT_TYPES).withMessage('Choose a current or savings account'), strong]),
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, BCRYPT_COST) });
    await Account.create({ user: user._id, number: newNumber(), type: req.body.accountType || 'current', balance: 100_000, monthMin: 100_000 }); // $1,000 simulated welcome funds
    await log(user._id, 'Account created', req); setCookie(res, user.id);
    res.status(201).json({ name });
  }));

router.post('/auth/login', authLimit, check([body('email').isEmail().normalizeEmail(), body('password').isString().isLength({ max: 72 })]),
  wrap(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+totpSecret');
    const bad = () => res.status(401).json({ error: 'Incorrect email or password' });
    if (!user) { await bcrypt.compare(req.body.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi'); return bad(); }
    if (isLocked({ lockUntil: user.lockUntil?.getTime() })) return res.status(423).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    if (!(await bcrypt.compare(req.body.password, user.password))) {
      const s = afterFailedLogin({ failed: user.failed, firstFailAt: user.firstFailAt?.getTime(), lockUntil: user.lockUntil?.getTime() });
      user.failed = s.failed; user.firstFailAt = s.firstFailAt ? new Date(s.firstFailAt) : undefined; user.lockUntil = s.lockUntil ? new Date(s.lockUntil) : undefined;
      await user.save(); await log(user._id, s.locked ? 'Account locked after 3 failed sign-ins' : 'Failed sign-in', req); return bad();
    }
    if (user.totpEnabled && !verifyTotp(user.totpSecret, req.body.code)) {
      await log(user._id, 'Failed 2FA code', req);
      return res.status(401).json({ error: req.body.code ? 'That code is not valid' : 'Enter the 6-digit code from your authenticator app', need2fa: true });
    }
    user.failed = 0; user.firstFailAt = undefined; user.lockUntil = undefined; await user.save();
    if (user.passkeys?.length) { // step 3: Face ID is mandatory once registered
      res.cookie('pre', jwt.sign({ uid: user.id }, SECRET, { expiresIn: '5m' }), { httpOnly: true, sameSite: 'strict', secure: SECURE, maxAge: 300_000 });
      return res.json({ needFace: true });
    }
    await log(user._id, 'Signed in', req); setCookie(res, user.id); res.json({ name: user.name });
  }));

router.post('/auth/logout', (_q, res) => res.clearCookie('sid').json({ ok: true }));

router.get('/auth/me', auth, wrap(async (req, res) => {
  const u = await User.findById(req.uid).select('name email role totpEnabled passkeys').lean().then((x) => x && { ...x, faceEnabled: !!x.passkeys?.length, passkeys: undefined });
  u ? res.json(u) : res.status(401).json({ error: 'Please sign in' });
}));

router.post('/auth/password', auth, check([body('current').isString(), body('password').custom((v) => v !== undefined), strong]),
  wrap(async (req, res) => {
    const u = await User.findById(req.uid);
    if (!(await bcrypt.compare(req.body.current, u.password))) return res.status(400).json({ error: 'Current password is incorrect' });
    u.password = await bcrypt.hash(req.body.password, BCRYPT_COST); await u.save();
    await log(u._id, 'Password changed', req); res.json({ ok: true });
  }));


export default router;

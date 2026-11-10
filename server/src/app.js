import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, query, validationResult } from 'express-validator';
import crypto from 'node:crypto';
import { User, Account, Txn, Audit } from './models.js';
import { mount, verifyTotp } from './advanced.js';
import { BCRYPT_COST, ACCOUNT_TYPES, ERR, MSG, checkDebit, debitFilter, afterFailedLogin, isLocked } from './finance.js';

const SECRET = process.env.JWT_SECRET || '';
const SECURE = process.env.COOKIE_SECURE === 'true';
export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
// strip Mongo operators ($, .) from user input -> NoSQL injection defence
const clean = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k.startsWith('$') || k.includes('.')) delete o[k]; else clean(o[k]); } return o; };
app.use((req, _res, next) => { clean(req.body); clean(req.query); next(); });
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const check = (rules) => [...rules, (req, res, next) => {
  const e = validationResult(req);
  return e.isEmpty() ? next() : res.status(400).json({ error: e.array()[0].msg });
}];
const log = (user, event, req) => Audit.create({ user, event, ip: req.ip }).catch(() => {});
const strong = body('password').isLength({ min: 10, max: 72 }).withMessage('Password must be 10–72 characters')
  .matches(/[a-z]/).matches(/[A-Z]/).matches(/\d/).withMessage('Use upper & lower case letters and a number');
const setCookie = (res, id) => res.cookie('sid', jwt.sign({ id }, SECRET, { expiresIn: '30m' }), {
  httpOnly: true, sameSite: 'strict', secure: SECURE, maxAge: 30 * 60_000 });
const auth = wrap(async (req, res, next) => {
  try { req.uid = jwt.verify(req.cookies.sid, SECRET).id; } catch { return res.status(401).json({ error: 'Please sign in' }); }
  next();
});
const newNumber = () => String(crypto.randomInt(1_000_000_000, 9_999_999_999));

app.get('/api/health', (_q, r) => r.json({ status: 'ok' }));

app.post('/api/auth/register', authLimit, check([
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

app.post('/api/auth/login', authLimit, check([body('email').isEmail().normalizeEmail(), body('password').isString().isLength({ max: 72 })]),
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
    await log(user._id, 'Signed in', req); setCookie(res, user.id); res.json({ name: user.name });
  }));

app.post('/api/auth/logout', (_q, res) => res.clearCookie('sid').json({ ok: true }));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const u = await User.findById(req.uid).select('name email role totpEnabled');
  u ? res.json(u) : res.status(401).json({ error: 'Please sign in' });
}));

app.post('/api/auth/password', auth, check([body('current').isString(), body('password').custom((v) => v !== undefined), strong]),
  wrap(async (req, res) => {
    const u = await User.findById(req.uid);
    if (!(await bcrypt.compare(req.body.current, u.password))) return res.status(400).json({ error: 'Current password is incorrect' });
    u.password = await bcrypt.hash(req.body.password, BCRYPT_COST); await u.save();
    await log(u._id, 'Password changed', req); res.json({ ok: true });
  }));

app.get('/api/accounts/me', auth, wrap(async (req, res) => {
  const a = await Account.findOne({ user: req.uid }); res.json({ number: a.number, balance: a.balance, frozen: a.frozen, type: a.type });
}));

app.post('/api/accounts/deposit', auth, check([body('amount').isFloat({ min: 1, max: 10000 }).withMessage('Deposit between $1 and $10,000')]),
  wrap(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const a = await Account.findOneAndUpdate({ user: req.uid, frozen: { $ne: true } }, { $inc: { balance: cents } }, { new: true });
    if (!a) return res.status(403).json({ error: 'Your account is frozen' });
    try { await Txn.create({ to: a.number, amount: cents, type: 'deposit', note: 'Simulated deposit', owners: [req.uid] }); }
    catch (e) { await Account.updateOne({ _id: a._id }, { $inc: { balance: -cents } }); throw e; } // roll back: no ledger entry, no money
    await log(req.uid, 'Deposit', req); res.json({ balance: a.balance });
  }));

app.post('/api/accounts/withdraw', auth, check([body('amount').isFloat({ min: 0.01, max: 5000 }).withMessage('Withdraw between $0.01 and $5,000')]),
  wrap(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const me = await Account.findOne({ user: req.uid });
    if (me.frozen) return res.status(403).json({ error: MSG[ERR.FROZEN], code: ERR.FROZEN });
    const verdict = checkDebit(me.type, me.balance, cents);
    if (!verdict.ok) return res.status(400).json({ error: MSG[verdict.code], code: verdict.code });
    // atomic debit: the database re-checks the floor, so two simultaneous requests can never overdraw
    const a = await Account.findOneAndUpdate({ _id: me._id, frozen: { $ne: true }, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents } }, { new: true });
    if (!a) return res.status(400).json({ error: MSG[ERR.INSUFFICIENT], code: ERR.INSUFFICIENT });
    try { await Txn.create({ from: a.number, amount: cents, type: 'withdrawal', note: 'Withdrawal', owners: [req.uid] }); }
    catch (e) { await Account.updateOne({ _id: a._id }, { $inc: { balance: cents } }); throw e; } // roll back the debit
    await Account.updateOne({ _id: a._id }, { $min: { monthMin: a.balance } });
    await log(req.uid, 'Withdrawal', req); res.status(201).json({ balance: a.balance });
  }));

app.post('/api/transactions/transfer', auth, check([
  body('toAccount').matches(/^\d{10}$/).withMessage('Account numbers have 10 digits'),
  body('amount').isFloat({ min: 0.01, max: 5000 }).withMessage('Transfer between $0.01 and $5,000'),
  body('note').optional().isString().trim().isLength({ max: 80 })]),
  wrap(async (req, res) => {
    const cents = Math.round(req.body.amount * 100);
    const me = await Account.findOne({ user: req.uid });
    const to = await Account.findOne({ number: req.body.toAccount });
    if (!to) return res.status(404).json({ error: 'No account found with that number' });
    if (to.id === me.id) return res.status(400).json({ error: 'You cannot transfer to your own account' });
    if (me.frozen) return res.status(403).json({ error: 'Your account is frozen. Unfreeze it in Security to send money.' });
    if (to.frozen) return res.status(400).json({ error: 'The recipient account cannot receive money right now' });
    // atomic debit: only succeeds if funds are sufficient (prevents overdraft + race conditions)
    const debited = await Account.findOneAndUpdate({ _id: me._id, ...debitFilter(me.type, cents) }, { $inc: { balance: -cents } }, { new: true });
    if (!debited) return res.status(400).json({ error: MSG[ERR.INSUFFICIENT], code: ERR.INSUFFICIENT });
    await Account.updateOne({ _id: me._id }, { $min: { monthMin: debited.balance } });
    try { await Account.updateOne({ _id: to._id }, { $inc: { balance: cents } }); }
    catch (e) { await Account.updateOne({ _id: me._id }, { $inc: { balance: cents } }); throw e; }
    await Txn.create({ from: me.number, to: to.number, amount: cents, note: req.body.note || '', type: 'transfer', owners: [req.uid, to.user] });
    await log(req.uid, `Transfer to ${to.number}`, req); res.status(201).json({ balance: debited.balance });
  }));

app.get('/api/transactions', auth, check([query('type').optional().isIn(['deposit', 'withdrawal', 'transfer', 'in', 'out'])]),
  wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid });
    const f = { owners: a.user }; const t = req.query.type;
    if (t === 'deposit' || t === 'transfer') f.type = t; if (t === 'in') f.to = a.number; if (t === 'out') f.from = a.number;
    const rows = await Txn.find(f).sort({ createdAt: -1 }).limit(50).lean();
    res.json(rows.map((r) => ({ id: r._id, type: r.type, note: r.note, date: r.createdAt, counterparty: r.from === a.number ? r.to : r.from,
      amount: r.to === a.number ? r.amount : -r.amount })));
  }));

app.get('/api/activity', auth, wrap(async (req, res) => res.json(await Audit.find({ user: req.uid }).sort({ createdAt: -1 }).limit(15).select('event ip createdAt -_id'))));

mount(app, { auth, wrap, check, log });
app.use((_q, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _q, res, _n) => {
  const client = err.status >= 400 && err.status < 500; // e.g. 413 body too large, 400 malformed JSON
  if (!client) console.error(err);
  res.status(client ? err.status : 500).json({ error: client ? 'Request could not be processed' : 'Something went wrong' });
});

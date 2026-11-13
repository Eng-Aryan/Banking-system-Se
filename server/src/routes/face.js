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
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
const RP = { id: env.rpId, name: 'Secure Bank', origin: env.rpOrigin };
  // ---------- Face ID / Touch ID / Windows Hello (WebAuthn, user verification REQUIRED) ----------
  const challenge = (res, name, uid, ch) => res.cookie(name, jwt.sign({ uid, ch }, S, { expiresIn: '5m' }), { httpOnly: true, sameSite: 'strict', secure: sec, maxAge: 300_000 });
  const read = (req, name) => { try { return jwt.verify(req.cookies[name], S); } catch { return null; } };

  router.post('/face/register/options', auth, wrap(async (req, res) => {
    const u = await User.findById(req.uid);
    const o = await generateRegistrationOptions({ rpName: RP.name, rpID: RP.id, userName: u.email, userID: Buffer.from(u.id), attestationType: 'none',
      excludeCredentials: u.passkeys.map((p) => ({ id: p.id })), authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' } });
    challenge(res, 'wa_reg', req.uid, o.challenge); res.json(o);
  }));
  router.post('/face/register/verify', auth, wrap(async (req, res) => {
    const c = read(req, 'wa_reg'); if (c?.uid !== req.uid) return res.status(400).json({ error: 'Face ID setup expired. Try again.' });
    const v = await verifyRegistrationResponse({ response: req.body, expectedChallenge: c.ch, expectedOrigin: RP.origin, expectedRPID: RP.id, requireUserVerification: true }).catch(() => null);
    if (!v?.verified) return res.status(400).json({ error: 'Face ID could not be verified' });
    const { credential } = v.registrationInfo;
    await User.updateOne({ _id: req.uid }, { $push: { passkeys: { id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64'), counter: credential.counter, transports: credential.transports } } });
    await log(req.uid, 'Face ID registered', req); res.json({ ok: true });
  }));
  router.post('/face/remove', auth, wrap(async (req, res) => { await User.updateOne({ _id: req.uid }, { $set: { passkeys: [] } }); await log(req.uid, 'Face ID removed', req); res.json({ ok: true }); }));

  // 3rd login step: runs after password + authenticator code (cookie "pre" is issued by /api/auth/login)
  router.post('/auth/face/options', wrap(async (req, res) => {
    const p = read(req, 'pre'); if (!p) return res.status(401).json({ error: 'Sign in again' });
    const u = await User.findById(p.uid);
    const o = await generateAuthenticationOptions({ rpID: RP.id, userVerification: 'required', allowCredentials: u.passkeys.map((k) => ({ id: k.id, transports: k.transports })) });
    challenge(res, 'wa_auth', p.uid, o.challenge); res.json(o);
  }));
  router.post('/auth/face/verify', wrap(async (req, res) => {
    const p = read(req, 'pre'), c = read(req, 'wa_auth'); if (!p || !c || p.uid !== c.uid) return res.status(401).json({ error: 'Sign in again' });
    const u = await User.findById(p.uid); const k = u.passkeys.find((x) => x.id === req.body.id);
    const v = k && await verifyAuthenticationResponse({ response: req.body, expectedChallenge: c.ch, expectedOrigin: RP.origin, expectedRPID: RP.id, requireUserVerification: true,
      credential: { id: k.id, publicKey: Buffer.from(k.publicKey, 'base64'), counter: k.counter, transports: k.transports } }).catch(() => null);
    if (!v?.verified) { await log(u._id, 'Failed Face ID', req); return res.status(401).json({ error: 'Face ID did not match' }); }
    k.counter = v.authenticationInfo.newCounter; await u.save();
    res.clearCookie('pre').clearCookie('wa_auth');
    res.cookie('sid', jwt.sign({ id: u.id }, S, { expiresIn: '30m' }), { httpOnly: true, sameSite: 'strict', secure: sec, maxAge: 30 * 60_000 });
    await log(u._id, 'Signed in with password + 2FA + Face ID', req); res.json({ name: u.name });
  }));

export default router;

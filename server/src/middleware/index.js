import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { User, Audit } from '../models/index.js';
import { env } from '../config/env.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const check = (rules) => [...rules, (req, res, next) => { const e = validationResult(req); return e.isEmpty() ? next() : res.status(400).json({ error: e.array()[0].msg }); }];
export const log = (user, event, req) => Audit.create({ user, event, ip: req.ip }).catch(() => {});
export const strong = body('password').isLength({ min: 10, max: 72 }).withMessage('Password must be 10–72 characters')
  .matches(/[a-z]/).matches(/[A-Z]/).matches(/\d/).withMessage('Use upper & lower case letters and a number');
export const setCookie = (res, id) => res.cookie('sid', jwt.sign({ id }, env.jwtSecret, { expiresIn: '30m' }), { httpOnly: true, sameSite: 'strict', secure: env.secureCookie, maxAge: 30 * 60_000 });
export const auth = wrap(async (req, res, next) => {
  try { req.uid = jwt.verify(req.cookies.sid, env.jwtSecret).id; } catch { return res.status(401).json({ error: 'Please sign in' }); }
  next();
});
export const admin = wrap(async (req, res, next) => {
  const u = await User.findById(req.uid).select('role');
  return u?.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
});
export const apiLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
export const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
// strip Mongo operators ($, .) from user input -> NoSQL injection defence
const clean = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k.startsWith('$') || k.includes('.')) delete o[k]; else clean(o[k]); } return o; };
export const sanitize = (req, _res, next) => { clean(req.body); clean(req.query); next(); };
export const notFound = (_q, res) => res.status(404).json({ error: 'Not found' });
export const errorHandler = (err, _q, res, _n) => {
  const client = err.status >= 400 && err.status < 500;
  if (!client) console.error(err);
  res.status(client ? err.status : 500).json({ error: client ? 'Request could not be processed' : 'Something went wrong' });
};

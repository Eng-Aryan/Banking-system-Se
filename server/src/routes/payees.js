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
  router.get('/payees', auth, wrap(async (req, res) => res.json(await Payee.find({ user: req.uid }).select('name number'))));
  router.post('/payees', auth, check([body('name').isString().trim().isLength({ min: 1, max: 40 }).withMessage('Enter a payee name'), body('number').matches(/^\d{10}$/).withMessage('Account numbers have 10 digits')]),
    wrap(async (req, res) => {
      if (!(await Account.exists({ number: req.body.number }))) return res.status(404).json({ error: 'No account found with that number' });
      if ((await Payee.countDocuments({ user: req.uid })) >= 20) return res.status(400).json({ error: 'You can save up to 20 payees' });
      res.status(201).json(await Payee.create({ user: req.uid, name: req.body.name, number: req.body.number }));
    }));
  router.delete('/payees/:id', auth, check([param('id').isMongoId()]), wrap(async (req, res) => { await Payee.deleteOne({ _id: req.params.id, user: req.uid }); res.json({ ok: true }); }));


export default router;

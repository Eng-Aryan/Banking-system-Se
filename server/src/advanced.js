import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { body, param } from 'express-validator';
import { User, Account, Txn, Audit, Payee } from './models.js';

// ---- TOTP (RFC 6238) two-factor, no external service ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = (buf) => { let bits = 0, v = 0, o = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) o += B32[(v << (5 - bits)) & 31]; return o; };
const b32dec = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
export const hotp = (secret, counter) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
export const verifyTotp = (secret, code) => { const c = Math.floor(Date.now() / 30000); return !!secret && [-1, 0, 1].some((d) => hotp(secret, c + d) === String(code)); };

const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // CSV-injection safe

export function mount(app, { auth, wrap, check, log }) {
  const admin = wrap(async (req, res, next) => {
    const u = await User.findById(req.uid).select('role');
    return u?.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
  });

  app.get('/api/analytics', auth, wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid }); const n = new Date();
    const since = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 5, 1)); const m = {};
    for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1)); m[d.toISOString().slice(0, 7)] = { month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), in: 0, out: 0 }; }
    for (const r of await Txn.find({ owners: req.uid, createdAt: { $gte: since } }).lean()) { const k = r.createdAt.toISOString().slice(0, 7); if (m[k]) r.to === a.number ? (m[k].in += r.amount) : (m[k].out += r.amount); }
    res.json(Object.values(m));
  }));

  app.get('/api/transactions/export.csv', auth, wrap(async (req, res) => {
    const a = await Account.findOne({ user: req.uid });
    const rows = await Txn.find({ owners: req.uid }).sort({ createdAt: -1 }).limit(1000).lean();
    const lines = ['Date,Type,Counterparty,Note,Amount (USD)', ...rows.map((r) => [cell(r.createdAt.toISOString()), cell(r.type), cell(r.from === a.number ? r.to : r.from), cell(r.note), ((r.to === a.number ? r.amount : -r.amount) / 100).toFixed(2)].join(','))];
    res.type('text/csv').attachment('bank-statement.csv').send(lines.join('\n'));
  }));

  app.get('/api/payees', auth, wrap(async (req, res) => res.json(await Payee.find({ user: req.uid }).select('name number'))));
  app.post('/api/payees', auth, check([body('name').isString().trim().isLength({ min: 1, max: 40 }).withMessage('Enter a payee name'), body('number').matches(/^\d{10}$/).withMessage('Account numbers have 10 digits')]),
    wrap(async (req, res) => {
      if (!(await Account.exists({ number: req.body.number }))) return res.status(404).json({ error: 'No account found with that number' });
      if ((await Payee.countDocuments({ user: req.uid })) >= 20) return res.status(400).json({ error: 'You can save up to 20 payees' });
      res.status(201).json(await Payee.create({ user: req.uid, name: req.body.name, number: req.body.number }));
    }));
  app.delete('/api/payees/:id', auth, check([param('id').isMongoId()]), wrap(async (req, res) => { await Payee.deleteOne({ _id: req.params.id, user: req.uid }); res.json({ ok: true }); }));

  app.post('/api/2fa/setup', auth, wrap(async (req, res) => {
    const u = await User.findById(req.uid);
    if (u.totpEnabled) return res.status(400).json({ error: 'Two-factor sign-in is already on' });
    u.totpSecret = b32enc(crypto.randomBytes(20)); await u.save();
    const uri = `otpauth://totp/Bank:${encodeURIComponent(u.email)}?secret=${u.totpSecret}&issuer=Bank`;
    res.json({ secret: u.totpSecret, qr: await QRCode.toDataURL(uri) });
  }));
  app.post('/api/2fa/enable', auth, check([body('code').matches(/^\d{6}$/).withMessage('Enter the 6-digit code')]), wrap(async (req, res) => {
    const u = await User.findById(req.uid).select('+totpSecret');
    if (!verifyTotp(u.totpSecret, req.body.code)) return res.status(400).json({ error: 'That code did not match. Try the next one.' });
    u.totpEnabled = true; await u.save(); await log(u._id, 'Two-factor turned on', req); res.json({ ok: true });
  }));
  app.post('/api/2fa/disable', auth, check([body('code').matches(/^\d{6}$/), body('password').isString()]), wrap(async (req, res) => {
    const { default: bcrypt } = await import('bcryptjs');
    const u = await User.findById(req.uid).select('+totpSecret');
    if (!(await bcrypt.compare(req.body.password, u.password)) || !verifyTotp(u.totpSecret, req.body.code)) return res.status(400).json({ error: 'Password or code is incorrect' });
    u.totpEnabled = false; u.totpSecret = undefined; await u.save(); await log(u._id, 'Two-factor turned off', req); res.json({ ok: true });
  }));

  app.post('/api/accounts/freeze', auth, check([body('frozen').isBoolean()]), wrap(async (req, res) => {
    const cur = await Account.findOne({ user: req.uid });
    if (cur.lockedByAdmin) return res.status(403).json({ error: 'Your account was frozen by the bank. Please contact support.' });
    const a = await Account.findOneAndUpdate({ user: req.uid }, { frozen: req.body.frozen }, { new: true });
    await log(req.uid, a.frozen ? 'Account frozen' : 'Account unfrozen', req); res.json({ frozen: a.frozen });
  }));

  app.get('/api/admin/stats', auth, admin, wrap(async (_q, res) => {
    const [users, txns, agg] = await Promise.all([User.countDocuments(), Txn.countDocuments(), Account.aggregate([{ $group: { _id: null, total: { $sum: '$balance' }, frozen: { $sum: { $cond: ['$frozen', 1, 0] } } } }])]);
    res.json({ users, txns, total: agg[0]?.total || 0, frozen: agg[0]?.frozen || 0 });
  }));
  app.get('/api/admin/users', auth, admin, wrap(async (_q, res) => {
    const as = await Account.find().populate('user', 'name email role').sort({ createdAt: -1 }).limit(100).lean();
    res.json(as.filter((a) => a.user).map((a) => ({ id: a.user._id, name: a.user.name, email: a.user.email, role: a.user.role, number: a.number, balance: a.balance, frozen: !!a.frozen })));
  }));
  app.post('/api/admin/users/:id/freeze', auth, admin, check([param('id').isMongoId(), body('frozen').isBoolean()]), wrap(async (req, res) => {
    const a = await Account.findOneAndUpdate({ user: req.params.id }, { frozen: req.body.frozen, lockedByAdmin: req.body.frozen }, { new: true });
    if (!a) return res.status(404).json({ error: 'Account not found' });
    await log(req.uid, `Admin ${a.frozen ? 'froze' : 'unfroze'} account ${a.number}`, req); res.json({ frozen: a.frozen });
  }));
  app.get('/api/admin/audit', auth, admin, wrap(async (_q, res) => {
    const rows = await Audit.find().sort({ createdAt: -1 }).limit(30).populate('user', 'email').lean();
    res.json(rows.map((r) => ({ event: r.event, who: r.user?.email, ip: r.ip, date: r.createdAt })));
  }));
}

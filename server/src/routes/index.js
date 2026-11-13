import { Router } from 'express';
import auth from './auth.js'; import face from './face.js'; import twofa from './twofa.js'; import accounts from './accounts.js'; import money from './money.js';
import transactions from './transactions.js'; import payees from './payees.js'; import cards from './cards.js'; import goals from './goals.js'; import admin from './admin.js';
const api = Router();
api.get('/health', (_q, r) => r.json({ status: 'ok' }));
for (const r of [auth, face, twofa, accounts, money, transactions, payees, cards, goals, admin]) api.use(r);
export default api;

import { useEffect, useState } from 'react';
import { api, money, fmtDate } from './api.js';

export function Analytics() {
  const [data, setData] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/analytics')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const W = 300;
  const H = 110;

  const max = Math.max(
    1,
    ...data.flatMap((month) => [month.in, month.out])
  );

  const x = (index) =>
    10 + (index * (W - 20)) / Math.max(1, data.length - 1);

  const points = (key) =>
    data.map((month, index) => [
      x(index),
      H - 8 - (month[key] / max) * (H - 24)
    ]);

  const curve = (items) =>
    items
      .map((point, index) => {
        if (index === 0) {
          return `M${point[0]},${point[1]}`;
        }

        const previous = items[index - 1];
        const middle = (previous[0] + point[0]) / 2;

        return (
          `C${middle},${previous[1]} ` +
          `${middle},${point[1]} ${point[0]},${point[1]}`
        );
      })
      .join('');

  const lines = [
    ['in', 'var(--good)'],
    ['out', 'var(--bad)']
  ];

  return (
    <section className="panel">
      <h3>Cash flow · 6 months</h3>

      {error && <p className="err" role="alert">{error}</p>}

      <svg
        className="lc"
        viewBox={`0 0 ${W} ${H + 18}`}
        role="img"
        aria-label="Money in and out by month"
      >
        <defs>
          {lines.map(([key, color]) => (
            <linearGradient
              key={key}
              id={`g${key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0" stopColor={color} stopOpacity=".35" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {data.length > 1 &&
          lines.map(([key, color]) => {
            const items = points(key);

            return (
              <g key={key}>
                <path
                  className="area"
                  d={
                    `${curve(items)}` +
                    `L${items[items.length - 1][0]},${H}` +
                    `L${items[0][0]},${H}Z`
                  }
                  fill={`url(#g${key})`}
                />

                <path
                  className="line"
                  pathLength="1"
                  d={curve(items)}
                  stroke={color}
                />

                {items.map(([px, py], index) => (
                  <circle
                    key={index}
                    className="pt"
                    cx={px}
                    cy={py}
                    r="3.2"
                    fill={color}
                  >
                    <title>
                      {`${data[index].month}: ${money(data[index][key])}`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

        {data.map((month, index) => (
          <text
            key={month.month}
            x={x(index)}
            y={H + 14}
            textAnchor="middle"
            className="lbl"
          >
            {month.month}
          </text>
        ))}
      </svg>

      <p className="split">
        <span className="in">● Money in</span>
        <span className="out">● Money out</span>
      </p>
    </section>
  );
}

export function PayeePicker({ onPick }) {
  const [payees, setPayees] = useState([]);

  useEffect(() => {
    api('/payees')
      .then(setPayees)
      .catch(() => {});
  }, []);

  if (!payees.length) return null;

  return (
    <label>
      Saved payees
      <select
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            onPick(event.target.value);
          }
        }}
      >
        <option value="">Choose a payee…</option>

        {payees.map((payee) => (
          <option key={payee._id} value={payee.number}>
            {payee.name} · {payee.number}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Payees() {
  const [payees, setPayees] = useState([]);
  const [form, setForm] = useState({ name: '', number: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setPayees(await api('/payees'));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      await api('/payees', form);
      setForm({ name: '', number: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusy(true);

    try {
      await api(`/payees/${id}`, null, 'DELETE');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <form className="panel form" onSubmit={add}>
        <h3>Save a payee</h3>

        <label>
          Name
          <input
            value={form.name}
            onChange={(event) =>
              setForm({ ...form, name: event.target.value })
            }
            maxLength={40}
            required
          />
        </label>

        <label>
          Account number
          <input
            value={form.number}
            onChange={(event) =>
              setForm({ ...form, number: event.target.value })
            }
            inputMode="numeric"
            maxLength={10}
            required
          />
        </label>

        {error && <p className="err" role="alert">{error}</p>}

        <button className="btn" disabled={busy}>
          {busy ? 'Please wait…' : 'Save payee'}
        </button>
      </form>

      <section className="panel">
        <h3>Your payees</h3>

        {payees.length === 0 ? (
          <p className="empty">
            No payees yet. Save the people you pay often.
          </p>
        ) : (
          <ul className="txns">
            {payees.map((payee) => (
              <li key={payee._id}>
                <span className="dot in">
                  {payee.name?.[0] || '?'}
                </span>

                <div>
                  <b>{payee.name}</b>
                  <small>{payee.number}</small>
                </div>

                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() => remove(payee._id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function TwoFA({ enabled, onChange }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = (action) => async (event) => {
    event.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      await action();
      setCode('');
      setPassword('');
      setSetup(null);
      await onChange();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startSetup = async () => {
    setMessage('');
    setBusy(true);

    try {
      setSetup(await api('/2fa/setup', {}));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel form">
      <h3>Two-factor sign-in</h3>

      {!enabled && !setup && (
        <>
          <p>
            Add a 6-digit code from an authenticator app
            every time you sign in.
          </p>

          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={startSetup}
          >
            {busy ? 'Please wait…' : 'Turn on two-factor'}
          </button>
        </>
      )}

      {setup && (
        <form
          className="form"
          onSubmit={run(() => api('/2fa/enable', { code }))}
        >
          <img
            src={setup.qr}
            alt="QR code to scan with your authenticator app"
            width="180"
            height="180"
          />

          <small>
            Can't scan? Enter this key: <code>{setup.secret}</code>
          </small>

          <label>
            Code from the app
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>

          <button className="btn" disabled={busy}>
            {busy ? 'Confirming…' : 'Confirm and turn on'}
          </button>
        </form>
      )}

      {enabled && (
        <form
          className="form"
          onSubmit={run(() =>
            api('/2fa/disable', { code, password })
          )}
        >
          <p className="ok">Two-factor is on.</p>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label>
            Current code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>

          <button className="btn" disabled={busy}>
            {busy ? 'Updating…' : 'Turn off'}
          </button>
        </form>
      )}

      {message && (
        <p className="err" role="alert">{message}</p>
      )}
    </section>
  );
}

export function Freeze({ acct, refresh }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!acct) return;

    setMessage('');
    setBusy(true);

    try {
      await api('/accounts/freeze', { frozen: !acct.frozen });
      await refresh();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel form">
      <h3>Freeze account</h3>

      <p>
        {acct?.frozen
          ? 'Your account is frozen. Money can’t leave or be added.'
          : 'Lost your phone or see something odd? Freeze your account temporarily.'}
      </p>

      {message && (
        <p className="err" role="alert">{message}</p>
      )}

      <button
        type="button"
        className="btn"
        disabled={busy || !acct}
        onClick={toggle}
      >
        {busy
          ? 'Updating…'
          : acct?.frozen
            ? 'Unfreeze account'
            : 'Freeze account'}
      </button>
    </section>
  );
}

export function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setError('');

    try {
      const [statsData, usersData, auditData] = await Promise.all([
        api('/admin/stats'),
        api('/admin/users'),
        api('/admin/audit')
      ]);

      setStats(statsData);
      setUsers(usersData);
      setAudit(auditData);
    } catch (err) {
      setError(err.message || 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (user) => {
    setBusyId(user.id);
    setError('');

    try {
      await api(`/admin/users/${user.id}/freeze`, {
        frozen: !user.frozen
      });

      await load();
    } catch (err) {
      setError(err.message || 'Could not update account.');
    } finally {
      setBusyId(null);
    }
  };

  const cards = stats
    ? [
        ['Customers', stats.users],
        ['Transactions', stats.txns],
        ['Money held', money(stats.total)],
        ['Frozen accounts', stats.frozen]
      ]
    : [];

  return (
    <div className="admin-page">
      {error && (
        <p className="err panel" role="alert">{error}</p>
      )}

      {loading ? (
        <section className="panel" role="status">
          Loading admin dashboard…
        </section>
      ) : (
        <>
          <div className="admin-stats">
            {cards.map(([label, value]) => (
              <section className="panel admin-stat" key={label}>
                <small>{label}</small>
                <h2>{value}</h2>
              </section>
            ))}
          </div>

          <section className="panel admin-customers">
            <div className="admin-heading">
              <h3>Customers</h3>
              <span className="admin-count">{users.length} total</span>
            </div>

            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Account</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        No customers found.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <b>{user.name}</b>
                          {user.role === 'admin' && (
                            <span className="admin-role">Admin</span>
                          )}
                        </td>

                        <td>{user.email}</td>
                        <td className="admin-account">{user.number}</td>
                        <td>{money(user.balance)}</td>

                        <td>
                          <span
                            className={
                              'admin-status ' +
                              (user.frozen ? 'is-frozen' : 'is-active')
                            }
                          >
                            {user.frozen ? 'Frozen' : 'Active'}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busyId !== null}
                            onClick={() => toggle(user)}
                          >
                            {busyId === user.id
                              ? 'Updating…'
                              : user.frozen
                                ? 'Unfreeze'
                                : 'Freeze'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel admin-audit">
            <div className="admin-heading">
              <h3>Audit log</h3>
              <span className="admin-count">{audit.length} records</span>
            </div>

            {audit.length === 0 ? (
              <p className="empty">No audit records yet.</p>
            ) : (
              <ul className="txns admin-audit-list">
                {audit.map((entry, index) => (
                  <li key={entry._id || entry.id || index}>
                    <span className="dot" aria-hidden="true">•</span>

                    <div>
                      <b>{entry.event}</b>
                      <small>
                        {entry.who || 'Actor not recorded'}
                        {' · '}
                        {fmtDate(entry.date)}
                        {entry.ip && ` · ${entry.ip}`}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
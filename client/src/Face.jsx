import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api } from './api.js';

/** Third login step: shown after password + authenticator code when the server answers { needFace: true }. */
export async function faceLogin() {
  const options = await api('/auth/face/options', {});
  const assertion = await startAuthentication({ optionsJSON: options }); // the device asks for Face ID / fingerprint
  return api('/auth/face/verify', assertion);
}

export function FaceStep({ onDone }) {
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { onDone(await faceLogin()); } catch (e) { setErr(e.message || 'Face ID cancelled'); } setBusy(false); };
  return (<div className="card"><h2>Verify it's you</h2><p>Use Face ID (or your device biometrics) to finish signing in.</p>
    <button className="btn" onClick={go} disabled={busy}>{busy ? 'Waiting for Face ID…' : 'Use Face ID'}</button>{err && <p className="error">{err}</p>}</div>);
}

/** Settings card: turn Face ID on/off for the signed-in customer. */
export function FaceSettings({ enabled, onChange }) {
  const [msg, setMsg] = useState('');
  const on = async () => { try { const o = await api('/face/register/options', {}); await api('/face/register/verify', await startRegistration({ optionsJSON: o })); setMsg('Face ID is on'); onChange?.(true); } catch (e) { setMsg(e.message); } };
  const off = async () => { await api('/face/remove', {}); setMsg('Face ID is off'); onChange?.(false); };
  return (<div className="card"><h3>Face ID login</h3><p>{enabled ? 'Active: required at every sign-in.' : 'Add biometric verification to every sign-in.'}</p>
    {enabled ? <button className="btn" onClick={off}>Turn off</button> : <button className="btn" onClick={on}>Turn on Face ID</button>}{msg && <p>{msg}</p>}</div>);
}

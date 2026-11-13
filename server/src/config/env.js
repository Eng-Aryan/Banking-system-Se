// Central configuration: every environment variable is read here, nowhere else.
export const env = {
  get port() { return Number(process.env.PORT) || 5000; },
  get mongoUri() { return process.env.MONGO_URI || 'mongodb://localhost:27017/bank'; },
  get jwtSecret() { return process.env.JWT_SECRET || ''; },
  get encKey() { return process.env.ENC_KEY || ''; },
  get secureCookie() { return process.env.COOKIE_SECURE === 'true'; },
  get rpId() { return process.env.RP_ID || 'localhost'; },
  get rpOrigin() { return process.env.RP_ORIGIN || 'http://localhost:8000'; },
  get adminEmail() { return process.env.ADMIN_EMAIL; },
  get adminPassword() { return process.env.ADMIN_PASSWORD; },
};
export function assertConfig() {
  if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  if (!/^[0-9a-f]{64}$/i.test(env.encKey)) throw new Error('ENC_KEY must be 64 hex characters (openssl rand -hex 32)');
}

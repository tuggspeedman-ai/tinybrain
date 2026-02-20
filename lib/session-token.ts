import crypto from 'crypto';

/**
 * Stateless session tokens — HMAC-signed, self-contained.
 *
 * Vercel serverless functions don't share memory between routes,
 * so we encode all session data directly in the token.  The server
 * validates the token on each request without any database or
 * in-memory lookup.
 */

export interface SessionTokenPayload {
  walletAddress: string;
  depositCents: number;
  createdAt: number;
  nonce: string;
}

const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function getHmacKey(): Buffer {
  const key = process.env.TREASURY_PRIVATE_KEY;
  if (!key) throw new Error('TREASURY_PRIVATE_KEY not set');
  return crypto.createHash('sha256').update(key + ':session-token').digest();
}

function hmacSign(payload: string): string {
  return crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');
}

/** Create a signed session token encoding wallet + deposit info. */
export function createSessionToken(walletAddress: string, depositCents: number): string {
  const payload: SessionTokenPayload = {
    walletAddress,
    depositCents,
    createdAt: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const payloadStr = JSON.stringify(payload);
  const hmac = hmacSign(payloadStr);
  return Buffer.from(JSON.stringify({ p: payloadStr, h: hmac })).toString('base64url');
}

/** Verify and decode a session token.  Returns null if invalid or expired. */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { p: payloadStr, h: hmac } = decoded;

    if (hmac !== hmacSign(payloadStr)) return null;

    const payload: SessionTokenPayload = JSON.parse(payloadStr);

    if (Date.now() - payload.createdAt > SESSION_MAX_AGE_MS) return null;

    return payload;
  } catch {
    return null;
  }
}

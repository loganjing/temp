import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SECRET_KEY = process.env.AUTH_SECRET || randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TokenPayload {
  uid: number;
  exp: number;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  companyId: number;
  departmentId: number | null;
  roles: string[];
}

/**
 * Hashes a password using scrypt with a random salt.
 * Returns "salt:hash" format.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a password against a stored "salt:hash" string.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const sepIndex = stored.indexOf(':');
  if (sepIndex === -1) return false;
  const salt = stored.substring(0, sepIndex);
  const hash = stored.substring(sepIndex + 1);
  const testHash = scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  const testBuf = Buffer.from(testHash);
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}

/**
 * Creates a signed Bearer token for a user ID.
 */
export function createToken(userId: number): string {
  const payload: TokenPayload = { uid: userId, exp: Date.now() + TOKEN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verifies a Bearer token and returns the user ID if valid.
 */
export function verifyToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

/**
 * Extracts the Bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

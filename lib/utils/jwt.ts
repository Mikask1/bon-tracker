import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set.');
}

export const COOKIE_NAME = 'tsh-token';
const EXPIRES_IN = '30d';
export const TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // seconds

export type Role = 'admin' | 'processor';

// Token carries the role. admin = full access, processor = create only.
export function generateToken(role: Role): string {
  return jwt.sign({ app: 'tsh', role }, JWT_SECRET as string, { expiresIn: EXPIRES_IN });
}

// Returns the role for a valid token, else null. Old tokens (no role) → admin.
export function verifyToken(token: string): Role | null {
  try {
    const p = jwt.verify(token, JWT_SECRET as string) as { role?: Role };
    return p.role === 'processor' ? 'processor' : 'admin';
  } catch {
    return null;
  }
}

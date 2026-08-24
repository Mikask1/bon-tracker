import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set.');
}

export const COOKIE_NAME = 'tsh-token';
const EXPIRES_IN = '30d';
export const TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // seconds

// Single shared account — the token is just a signed "logged in" marker.
export function generateToken(): string {
  return jwt.sign({ app: 'tsh' }, JWT_SECRET as string, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET as string);
    return true;
  } catch {
    return false;
  }
}

import type { NextFunction, Request, Response } from 'express';
import { verifyFirebaseIdToken } from '../lib/firebaseAuth.ts';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    emailVerified: boolean;
    idToken: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
      return;
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) {
      res.status(401).json({ error: 'Authentication required. Empty Bearer token.' });
      return;
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded.uid) {
      res.status(401).json({ error: 'Invalid authentication token.' });
      return;
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? '',
      emailVerified: Boolean(decoded.email_verified),
      idToken,
    };

    next();
  } catch (err) {
    console.error('Auth verification error:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, testFirestoreConnection } from '../lib/firebase';
import { ensureUserProfile } from '../services/userService';
import type { UserProfile } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  isAdmin: boolean;
  isVerified: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testFirestoreConnection();

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        try {
          const prof = await ensureUserProfile({
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Store User',
            email: user.email || '',
            photoUrl: user.photoURL || undefined,
          });
          setProfile(prof);
        } catch (err) {
          console.error('Failed to load user profile:', err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  const clearAuthError = () => setAuthError(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Use "Continue with Google" or enable Email/Password under Authentication > Sign-in method.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in popup was closed before completing authentication.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Invalid email or password.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters long.';
    }
    return err instanceof Error ? err.message : 'Authentication failed.';
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = mapAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = mapAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await sendEmailVerification(cred.user);
      setFirebaseUser(cred.user);
    } catch (err) {
      const msg = mapAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const sendResetEmail = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const msg = mapAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const resendVerification = async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  };

  const refreshAuthUser = async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    if (updated && updated.emailVerified) {
      const prof = await ensureUserProfile({
        uid: updated.uid,
        name: updated.displayName || updated.email?.split('@')[0] || 'Store User',
        email: updated.email || '',
        photoUrl: updated.photoURL || undefined,
      });
      setProfile(prof);
    }
  };

  const refreshProfile = async () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) return;
    const prof = await ensureUserProfile({
      uid: auth.currentUser.uid,
      name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Store User',
      email: auth.currentUser.email || '',
      photoUrl: auth.currentUser.photoURL || undefined,
    });
    setProfile(prof);
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        authReady,
        isAdmin: profile?.role === 'ADMIN',
        isVerified: Boolean(firebaseUser?.emailVerified),
        authError,
        clearAuthError,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendResetEmail,
        resendVerification,
        refreshAuthUser,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

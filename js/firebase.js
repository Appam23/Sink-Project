import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCpmk_QVCm7qH5wKFN3yvjQe2xZhEC2vMA',
  authDomain: 'bunk-buddies-dev.firebaseapp.com',
  projectId: 'bunk-buddies-dev',
  storageBucket: 'bunk-buddies-dev.firebasestorage.app',
  messagingSenderId: '610145583525',
  appId: '1:610145583525:web:1cf7b61785165c798c684c',
  measurementId: 'G-YS2S8E8WQ6',
};

let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let initError = null;
let emulatorsConnected = false;
let authPersistenceConfigured = false;
let authPersistencePromise = null;
const AUTH_PERSISTENCE_TIMEOUT_MS = 2500;

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function shouldUseFirebaseEmulators() {
  if (typeof window === 'undefined') {
    return false;
  }

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalHost) {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('useEmulators') === '1') {
    return true;
  }
  if (params.get('useEmulators') === '0') {
    return false;
  }

  try {
    const storedValue = window.localStorage.getItem('useFirebaseEmulators');
    if (storedValue === 'true') return true;
    if (storedValue === 'false') return false;
  } catch {
    // Some mobile/private browsing modes block storage access.
  }

  return false;
}

function connectFirebaseEmulatorsIfNeeded(db, auth) {
  if (emulatorsConnected || !shouldUseFirebaseEmulators()) {
    return;
  }

  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  emulatorsConnected = true;
}

function createFirebaseServices() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  let db;

  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch {
    db = getFirestore(app);
  }

  const auth = getAuth(app);
  connectFirebaseEmulatorsIfNeeded(db, auth);

  return {
    app,
    db,
    auth,
  };
}

export function initializeFirebaseServices() {
  if (firebaseApp && firestoreDb && firebaseAuth) {
    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      error: initError,
    };
  }

  try {
    const services = createFirebaseServices();
    firebaseApp = services.app;
    firestoreDb = services.db;
    firebaseAuth = services.auth;
    initError = null;
  } catch (error) {
    initError = error;
    firebaseApp = null;
    firestoreDb = null;
    firebaseAuth = null;
  }

  return {
    app: firebaseApp,
    db: firestoreDb,
    auth: firebaseAuth,
    error: initError,
  };
}

export function getFirebaseInitializationError() {
  return initError;
}

function getInitializedAuth() {
  const { auth, error } = initializeFirebaseServices();
  if (error || !auth) {
    throw error || new Error('Firebase Auth is not available.');
  }
  return auth;
}

async function ensureAuthPersistence(auth) {
  if (!auth) return;
  if (authPersistenceConfigured) return;
  if (authPersistencePromise) {
    await authPersistencePromise;
    return;
  }

  authPersistencePromise = (async () => {
    const persistenceOptions = [
      browserLocalPersistence,
      browserSessionPersistence,
    ];

    for (const persistence of persistenceOptions) {
      try {
        await withTimeout(setPersistence(auth, persistence), AUTH_PERSISTENCE_TIMEOUT_MS);
        authPersistenceConfigured = true;
        return;
      } catch {
        continue;
      }
    }

    const storageError = new Error('Secure browser storage is unavailable for authentication.');
    storageError.code = 'auth/web-storage-unsupported';
    throw storageError;
  })();

  try {
    await authPersistencePromise;
  } finally {
    authPersistencePromise = null;
  }
}

export async function createFirebaseEmailUser(email, password, displayName = '') {
  const auth = getInitializedAuth();
  await ensureAuthPersistence(auth);
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && credentials && credentials.user) {
    try {
      await updateProfile(credentials.user, { displayName: String(displayName).trim() });
    } catch (error) {
      console.warn('User created, but display name update failed:', error);
    }
  }
  return credentials.user;
}

export async function signInFirebaseEmailUser(email, password) {
  const auth = getInitializedAuth();
  await ensureAuthPersistence(auth);
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return credentials.user;
}

export async function sendFirebasePasswordReset(email) {
  const auth = getInitializedAuth();
  await sendPasswordResetEmail(auth, String(email || '').trim());
}

function getUserIdentifierFromAuthUser(user) {
  if (!user) return null;
  if (user.email) return String(user.email).trim().toLowerCase();
  if (user.uid) return String(user.uid).trim();
  return null;
}

export function getFirebaseAuthCurrentUser() {
  try {
    const auth = getInitializedAuth();
    return auth.currentUser || null;
  } catch {
    return null;
  }
}

export function getFirebaseAuthCurrentUserIdentifier() {
  return getUserIdentifierFromAuthUser(getFirebaseAuthCurrentUser());
}

export async function waitForFirebaseAuthState() {
  const auth = getInitializedAuth();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

export async function signOutFirebaseUser() {
  const auth = getInitializedAuth();
  await signOut(auth);
}

export { firebaseConfig, firebaseApp, firestoreDb, firebaseAuth };
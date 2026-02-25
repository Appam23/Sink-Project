import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

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

  return {
    app,
    db,
    auth: getAuth(app),
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

export async function createFirebaseEmailUser(email, password, displayName = '') {
  const auth = getInitializedAuth();
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && credentials && credentials.user) {
    await updateProfile(credentials.user, { displayName: String(displayName).trim() });
  }
  return credentials.user;
}

export async function signInFirebaseEmailUser(email, password) {
  const auth = getInitializedAuth();
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
import { initializeFirebaseServices } from './firebase.js';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging.js';

const PREFERENCE_KEY_PREFIX = 'sink:notifications:enabled:';
const DEVICE_ID_STORAGE_KEY = 'sink:notifications:device-id';
const VAPID_KEY_STORAGE_KEY = 'sinkFcmVapidKey';
// One-time developer config: set your Firebase Web Push public key here.
// End users should never need to provide this manually.
const DEFAULT_VAPID_KEY = 'BENmimwabWI8AiuPu3_6H3h-D7zHBXI5EB5EyqpemJ2mVXlaJpf0314Dzr3LHU15UhkqjRgkbv-Lf9tMaTZI27I';

let foregroundListenerBound = false;

function getSafeString(value) {
  return String(value || '').trim();
}

function getPreferenceStorageKey(userName, apartmentCode) {
  return `${PREFERENCE_KEY_PREFIX}${getSafeString(apartmentCode)}:${getSafeString(userName).toLowerCase()}`;
}

function getDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;

    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `${Date.now()}-ephemeral-device`;
  }
}

function getPushTokenDocId(userName) {
  const safeUser = encodeURIComponent(getSafeString(userName).toLowerCase() || 'anonymous');
  return `${safeUser}__${getDeviceId()}`;
}

function getConfiguredVapidKey() {
  if (typeof window !== 'undefined' && typeof window.SINK_FCM_VAPID_KEY === 'string') {
    const fromWindow = window.SINK_FCM_VAPID_KEY.trim();
    if (fromWindow) return fromWindow;
  }

  try {
    const fromStorage = window.localStorage.getItem(VAPID_KEY_STORAGE_KEY);
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  } catch {
    // Ignore localStorage access errors.
  }

  if (DEFAULT_VAPID_KEY && DEFAULT_VAPID_KEY.trim()) {
    return DEFAULT_VAPID_KEY.trim();
  }

  return '';
}

export function getResolvedVapidKey() {
  return getConfiguredVapidKey();
}

function isStandaloneDisplayMode() {
  const isStandaloneMedia = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = typeof navigator !== 'undefined' && navigator.standalone === true;
  return isStandaloneMedia || isIosStandalone;
}

function getPushTokenDocRef(db, apartmentCode, userName) {
  return doc(db, 'apartments', apartmentCode, 'pushTokens', getPushTokenDocId(userName));
}

function getPlatformName() {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  return 'web';
}

export function getNotificationsPreference({ userName, apartmentCode }) {
  if (!userName || !apartmentCode) return false;
  try {
    return window.localStorage.getItem(getPreferenceStorageKey(userName, apartmentCode)) === 'true';
  } catch {
    return false;
  }
}

function setNotificationsPreference({ userName, apartmentCode }, enabled) {
  if (!userName || !apartmentCode) return;
  try {
    window.localStorage.setItem(getPreferenceStorageKey(userName, apartmentCode), enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage access errors.
  }
}

export async function getPushAvailability() {
  const pushApiSupported = typeof window !== 'undefined'
    && typeof Notification !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;

  const messagingSupported = pushApiSupported ? await isSupported().catch(() => false) : false;

  return {
    supported: !!(pushApiSupported && messagingSupported),
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    isStandalone: isStandaloneDisplayMode(),
    vapidConfigured: !!getConfiguredVapidKey(),
  };
}

export async function syncAppBadgeCount(count) {
  const normalizedCount = Number(count);

  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
    await clearAppBadgeCount();
    return;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
    try {
      await navigator.setAppBadge(Math.floor(normalizedCount));
    } catch {
      // Ignore unsupported/user-blocked badge calls.
    }
  }
}

export async function clearAppBadgeCount() {
  if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
    try {
      await navigator.clearAppBadge();
    } catch {
      // Ignore unsupported/user-blocked badge calls.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' });
    } catch {
      // Ignore cases where controller is unavailable.
    }
  }
}

async function ensureMessagingRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return registration;
}

export async function enablePushNotifications({ userName, apartmentCode, vapidKey = '' }) {
  if (!userName || !apartmentCode) {
    throw new Error('Notifications require a signed-in user and apartment context.');
  }

  const availability = await getPushAvailability();
  if (!availability.supported) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }

  const configuredVapidKey = getSafeString(vapidKey) || getConfiguredVapidKey();
  if (!configuredVapidKey) {
    throw new Error('Missing FCM Web Push certificate key (VAPID key). Set DEFAULT_VAPID_KEY in js/push_notifications.js.');
  }

  if (typeof Notification === 'undefined') {
    throw new Error('Notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await ensureMessagingRegistration();
  const { app, db, error } = initializeFirebaseServices();
  if (error || !app || !db) {
    throw error || new Error('Firebase is not ready for notifications.');
  }

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: configuredVapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Unable to obtain a push token from Firebase Messaging.');
  }

  const tokenDocRef = getPushTokenDocRef(db, apartmentCode, userName);
  await setDoc(tokenDocRef, {
    userName: getSafeString(userName).toLowerCase(),
    token,
    enabled: true,
    platform: getPlatformName(),
    isStandalone: isStandaloneDisplayMode(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  setNotificationsPreference({ userName, apartmentCode }, true);
  return token;
}

export async function disablePushNotifications({ userName, apartmentCode }) {
  if (!userName || !apartmentCode) return;

  const { app, db, error } = initializeFirebaseServices();
  if (!error && app) {
    try {
      const messaging = getMessaging(app);
      await deleteToken(messaging);
    } catch {
      // Ignore token deletion failures and still disable server-side token mapping.
    }
  }

  if (!error && db) {
    const tokenDocRef = getPushTokenDocRef(db, apartmentCode, userName);
    try {
      await deleteDoc(tokenDocRef);
    } catch {
      // Ignore delete failures; local preference still turns the feature off.
    }
  }

  setNotificationsPreference({ userName, apartmentCode }, false);
  await clearAppBadgeCount();
}

export async function initializePushMessaging({ userName, apartmentCode, onForegroundMessage }) {
  if (!userName || !apartmentCode) return;
  if (!getNotificationsPreference({ userName, apartmentCode })) return;

  const availability = await getPushAvailability();
  if (!availability.supported || availability.permission !== 'granted') return;

  const configuredVapidKey = getConfiguredVapidKey();
  if (!configuredVapidKey) return;

  try {
    await enablePushNotifications({
      userName,
      apartmentCode,
      vapidKey: configuredVapidKey,
    });
  } catch (error) {
    console.warn('Push initialization skipped:', error);
    return;
  }

  if (foregroundListenerBound) return;

  const { app, error } = initializeFirebaseServices();
  if (error || !app) return;

  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    if (typeof onForegroundMessage === 'function') {
      onForegroundMessage(payload);
    }
  });

  foregroundListenerBound = true;
}

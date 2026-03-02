import { initializeFirebaseServices } from './firebase.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

function getNotificationsCollectionRef(apartmentCode) {
  const { db, error } = initializeFirebaseServices();
  if (error || !db || !apartmentCode) {
    throw error || new Error('Notifications are unavailable without Firebase and apartment context.');
  }
  return collection(db, 'apartments', apartmentCode, 'notifications');
}

export async function getUserNotifications(userName, apartmentCode) {
  if (!userName || !apartmentCode) return [];
  const notificationsRef = getNotificationsCollectionRef(apartmentCode);
  const notificationsQuery = query(
    notificationsRef,
    where('userName', '==', userName)
  );
  const snapshot = await getDocs(notificationsQuery);
  return snapshot.docs
    .map((notificationDoc) => ({
      ...(notificationDoc.data() || {}),
      id: notificationDoc.id,
    }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function clearUserNotifications(userName, apartmentCode) {
  if (!userName || !apartmentCode) return;
  const existing = await getUserNotifications(userName, apartmentCode);
  if (!existing.length) return;

  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Notifications are unavailable without Firebase.');
  }

  await Promise.all(existing.map((notification) => deleteDoc(doc(db, 'apartments', apartmentCode, 'notifications', notification.id))));
}

export async function markAllNotificationsRead(userName, apartmentCode) {
  const notifications = await getUserNotifications(userName, apartmentCode);
  if (!notifications.length) return notifications;

  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Notifications are unavailable without Firebase.');
  }

  await Promise.all(notifications.map((notification) => updateDoc(
    doc(db, 'apartments', apartmentCode, 'notifications', notification.id),
    { read: true }
  )));

  return notifications.map((notification) => ({
    ...notification,
    read: true,
  }));
}

export async function addNotificationForUser(userName, apartmentCode, notification) {
  if (!userName || !apartmentCode || !notification) return;
  const notificationsRef = getNotificationsCollectionRef(apartmentCode);
  await addDoc(notificationsRef, {
    userName,
    createdAt: Date.now(),
    read: false,
    ...notification,
  });
}

export function subscribeToUserNotifications(userName, apartmentCode, onChange, onError = null) {
  if (!userName || !apartmentCode || typeof onChange !== 'function') {
    return () => {};
  }

  let notificationsRef;
  try {
    notificationsRef = getNotificationsCollectionRef(apartmentCode);
  } catch (error) {
    if (typeof onError === 'function') onError(error);
    return () => {};
  }

  const notificationsQuery = query(
    notificationsRef,
    where('userName', '==', userName)
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const notifications = snapshot.docs
        .map((notificationDoc) => ({
          ...(notificationDoc.data() || {}),
          id: notificationDoc.id,
        }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

      onChange(notifications);
    },
    (error) => {
      if (typeof onError === 'function') onError(error);
    }
  );
}
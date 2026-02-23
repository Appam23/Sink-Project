import { initializeFirebaseServices } from './firebase.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
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
    where('userName', '==', userName),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(notificationsQuery);
  return snapshot.docs.map((notificationDoc) => ({
    id: notificationDoc.id,
    ...(notificationDoc.data() || {}),
  }));
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
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userName,
    createdAt: Date.now(),
    read: false,
    ...notification,
  });
}
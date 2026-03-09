/* global importScripts, firebase */

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCpmk_QVCm7qH5wKFN3yvjQe2xZhEC2vMA',
  authDomain: 'bunk-buddies-dev.firebaseapp.com',
  projectId: 'bunk-buddies-dev',
  storageBucket: 'bunk-buddies-dev.firebasestorage.app',
  messagingSenderId: '610145583525',
  appId: '1:610145583525:web:1cf7b61785165c798c684c',
  measurementId: 'G-YS2S8E8WQ6',
});

const messaging = firebase.messaging();

async function updateBadgeFromPayload(payload) {
  const data = payload && payload.data ? payload.data : {};
  const notificationData = payload && payload.notification ? payload.notification : {};
  const badgeCount = Number(data.badgeCount || data.unreadCount || notificationData.badge || 0);

  if (!self.registration) return;

  if (!Number.isFinite(badgeCount) || badgeCount <= 0) {
    if (typeof self.registration.clearAppBadge === 'function') {
      try {
        await self.registration.clearAppBadge();
      } catch {
        // Ignore badging failures.
      }
    }
    return;
  }

  if (typeof self.registration.setAppBadge === 'function') {
    try {
      await self.registration.setAppBadge(Math.floor(badgeCount));
    } catch {
      // Ignore badging failures.
    }
  }
}

messaging.onBackgroundMessage(async (payload) => {
  const notification = payload && payload.notification ? payload.notification : {};
  const data = payload && payload.data ? payload.data : {};
  const title = notification.title || data.title || 'Sink';
  const body = notification.body || data.body || 'You have a new update.';
  const link = data.link || 'home.html';

  await updateBadgeFromPayload(payload);

  await self.registration.showNotification(title, {
    body,
    icon: '/Logo.png',
    badge: '/Logo.png',
    data: {
      link,
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetLink = event.notification && event.notification.data && event.notification.data.link
    ? String(event.notification.data.link)
    : 'home.html';

  event.waitUntil((async () => {
    const matchingClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of matchingClients) {
      if ('focus' in client) {
        client.focus();
        if ('navigate' in client) {
          client.navigate(targetLink);
        }
        return;
      }
    }

    if (clients.openWindow) {
      await clients.openWindow(targetLink);
    }
  })());
});

self.addEventListener('message', (event) => {
  const message = event && event.data ? event.data : null;
  if (!message || message.type !== 'CLEAR_BADGE') return;

  if (self.registration && typeof self.registration.clearAppBadge === 'function') {
    event.waitUntil((async () => {
      try {
        await self.registration.clearAppBadge();
      } catch {
        // Ignore badging failures.
      }
    })());
  }
});

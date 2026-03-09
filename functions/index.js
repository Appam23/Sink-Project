const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

function normalizeUserName(value) {
  return String(value || '').trim().toLowerCase();
}

function isTokenInvalid(errorCode) {
  return errorCode === 'messaging/registration-token-not-registered'
    || errorCode === 'messaging/invalid-registration-token';
}

async function getUnreadNotificationCount(apartmentCode, userName) {
  const unreadQuery = db
    .collection('apartments')
    .doc(apartmentCode)
    .collection('notifications')
    .where('userName', '==', userName)
    .where('read', '==', false)
    .count();

  const aggregateSnapshot = await unreadQuery.get();
  const count = Number(aggregateSnapshot.data().count || 0);
  return Number.isFinite(count) ? count : 0;
}

function toAbsoluteOrRelativeLink(linkValue) {
  const fallback = 'home.html';
  const raw = String(linkValue || '').trim();
  return raw || fallback;
}

exports.sendPushOnNotificationCreated = onDocumentCreated(
  {
    document: 'apartments/{apartmentCode}/notifications/{notificationId}',
    region: 'us-central1',
    retry: false,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('Notification trigger fired without snapshot data.');
      return;
    }

    const apartmentCode = String(event.params.apartmentCode || '').trim();
    const notification = snapshot.data() || {};
    const userName = normalizeUserName(notification.userName);

    if (!apartmentCode || !userName) {
      logger.warn('Notification missing apartmentCode or userName.', {
        apartmentCode,
        userName,
      });
      return;
    }

    const tokensSnapshot = await db
      .collection('apartments')
      .doc(apartmentCode)
      .collection('pushTokens')
      .where('userName', '==', userName)
      .where('enabled', '==', true)
      .get();

    if (tokensSnapshot.empty) {
      logger.info('No push tokens found for notification target.', {
        apartmentCode,
        userName,
      });
      return;
    }

    const tokenDocs = tokensSnapshot.docs;
    const tokens = tokenDocs
      .map((docSnap) => String((docSnap.data() || {}).token || '').trim())
      .filter(Boolean);

    if (!tokens.length) {
      logger.info('Token documents found, but no usable tokens available.', {
        apartmentCode,
        userName,
      });
      return;
    }

    const unreadCount = await getUnreadNotificationCount(apartmentCode, userName);
    const messageTitle = 'Sink';
    const messageBody = String(notification.message || 'You have a new update.').trim();
    const link = toAbsoluteOrRelativeLink(notification.link);

    const multicastMessage = {
      tokens,
      notification: {
        title: messageTitle,
        body: messageBody,
      },
      data: {
        apartmentCode,
        notificationId: String(snapshot.id || ''),
        type: String(notification.type || ''),
        link,
        badgeCount: String(Math.max(0, unreadCount)),
      },
      webpush: {
        fcmOptions: {
          link,
        },
        notification: {
          title: messageTitle,
          body: messageBody,
          icon: '/Logo.png',
          badge: '/Logo.png',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(multicastMessage);

    const invalidTokenDocRefs = [];
    response.responses.forEach((sendResult, index) => {
      if (sendResult.success) return;
      const errorCode = sendResult.error && sendResult.error.code ? String(sendResult.error.code) : '';
      if (!isTokenInvalid(errorCode)) return;
      if (!tokenDocs[index]) return;
      invalidTokenDocRefs.push(tokenDocs[index].ref);
    });

    if (invalidTokenDocRefs.length > 0) {
      await Promise.all(invalidTokenDocRefs.map((ref) => ref.delete()));
      logger.info('Removed invalid push token documents.', {
        apartmentCode,
        userName,
        removedCount: invalidTokenDocRefs.length,
      });
    }

    logger.info('Push dispatch completed.', {
      apartmentCode,
      userName,
      sentCount: response.successCount,
      failedCount: response.failureCount,
      unreadCount,
    });
  }
);

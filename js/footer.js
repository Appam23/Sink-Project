// footer.js
import { requireApartmentMembershipAsync } from './auth.js';
import { initializeFirebaseServices } from './firebase.js';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const CHAT_MESSAGE_LISTEN_LIMIT = 180;
let unsubscribeChatUnreadMessages = null;
let unsubscribeChatUnreadState = null;
const chatSeenWriteCache = new Map();

function getChatSeenCacheKey(apartmentCode, userName) {
  return `${apartmentCode}.${userName}`;
}

function getChatReadStateRef(db, apartmentCode, userName) {
  return doc(db, 'apartments', apartmentCode, 'chatReadState', userName);
}

function getCreatedAtMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function markChatAsSeen(apartmentCode, userName, timestampMs = Date.now()) {
  if (!apartmentCode || !userName) return;

  const { db, error } = initializeFirebaseServices();
  if (error || !db) return;

  const key = getChatSeenCacheKey(apartmentCode, userName);
  const numeric = Number(timestampMs);
  const safeTimestamp = Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
  const previousSeen = chatSeenWriteCache.get(key) || 0;
  if (safeTimestamp <= previousSeen) return;

  chatSeenWriteCache.set(key, safeTimestamp);

  try {
    await setDoc(getChatReadStateRef(db, apartmentCode, userName), {
      userName,
      lastSeenAt: safeTimestamp,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (errorWrite) {
    console.warn('Unable to persist chat seen state:', errorWrite);
  }
}

function renderChatUnreadBadge(footer, count) {
  if (!footer) return;
  const msgBtn = footer.querySelector('#footer-message');
  if (!msgBtn) return;
  const badge = msgBtn.querySelector('.chat-unread-badge');
  if (!badge) return;

  const unreadCount = Math.max(0, Number(count || 0));
  if (unreadCount <= 0) {
    badge.classList.add('hidden');
    badge.textContent = '0';
    return;
  }

  badge.classList.remove('hidden');
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
}

function initChatUnreadBadge(footer) {
  if (typeof unsubscribeChatUnreadMessages === 'function') {
    unsubscribeChatUnreadMessages();
    unsubscribeChatUnreadMessages = null;
  }
  if (typeof unsubscribeChatUnreadState === 'function') {
    unsubscribeChatUnreadState();
    unsubscribeChatUnreadState = null;
  }

  requireApartmentMembershipAsync().then((access) => {
    const apartmentCode = access && access.apartmentCode ? access.apartmentCode : null;
    const userName = access && access.currentUser ? access.currentUser : null;
    if (!apartmentCode || !userName) {
      renderChatUnreadBadge(footer, 0);
      return;
    }

    const { db, error } = initializeFirebaseServices();
    if (error || !db) {
      renderChatUnreadBadge(footer, 0);
      return;
    }

    const messagesRef = collection(db, 'apartments', apartmentCode, 'chatMessages');
    const stateRef = getChatReadStateRef(db, apartmentCode, userName);
    const messagesQuery = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(CHAT_MESSAGE_LISTEN_LIMIT)
    );

    let latestLastSeen = 0;
    let latestMessages = [];

    const recomputeUnread = () => {
      let unreadCount = 0;

      latestMessages.forEach((data) => {
        if (String(data.sender || '') === userName) return;

        const createdAtValue = getCreatedAtMillis(data.createdAt);
        if (createdAtValue > latestLastSeen) {
          unreadCount += 1;
        }
      });

      renderChatUnreadBadge(footer, unreadCount);
    };

    unsubscribeChatUnreadState = onSnapshot(stateRef, (snapshot) => {
      const data = snapshot && snapshot.exists() ? (snapshot.data() || {}) : {};
      const seenValue = Number(data.lastSeenAt || 0);
      latestLastSeen = Number.isFinite(seenValue) ? seenValue : 0;

      const cacheKey = getChatSeenCacheKey(apartmentCode, userName);
      const cachedSeen = chatSeenWriteCache.get(cacheKey) || 0;
      if (latestLastSeen > cachedSeen) {
        chatSeenWriteCache.set(cacheKey, latestLastSeen);
      }

      recomputeUnread();
    }, () => {
      latestLastSeen = 0;
      recomputeUnread();
    });

    unsubscribeChatUnreadMessages = onSnapshot(messagesQuery, (snapshot) => {
      latestMessages = snapshot.docs.map((messageDoc) => messageDoc.data() || {});
      recomputeUnread();
    }, () => {
      renderChatUnreadBadge(footer, 0);
    });
  }).catch(() => {
    renderChatUnreadBadge(footer, 0);
  });
}

export function attachFooter(container) {
  if (container && container.classList) {
    container.classList.add('has-footer');
  }

  let footer = container.querySelector('.profile-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'profile-footer';
    footer.innerHTML = `
      <button class="footer-btn" id="footer-home" title="Home">
        <span class="footer-icon"> 
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z"/><path d="M9 22V12h6v10"/></svg>
        </span>
          <span class="footer-label" style="color: #4a90e2;">Home</span>
      </button>
      <button class="footer-btn" id="footer-calendar" title="Calendar">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7ed957" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
        <span class="footer-label" style="color: #7ed957;">Calendar/Event</span>
      </button>
      <button class="footer-btn" id="footer-task" title="Task">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#f5a623" stroke="#e2ded8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2l4-4"/></svg>
        </span>
        <span class="footer-label" style="color: #f5a623;">Task</span>
      </button>
      <button class="footer-btn" id="footer-message" title="Message">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b76cf4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="chat-unread-badge hidden" aria-label="Unread chat messages">0</span>
        </span>
        <span class="footer-label" style="color: #b76cf4;">Message</span>
      </button>
    `;
    container.appendChild(footer);
  }

  const homeBtn = footer.querySelector('#footer-home');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  }

  const calendarBtn = footer.querySelector('#footer-calendar');
  if (calendarBtn) {
    calendarBtn.addEventListener('click', () => {
      window.location.href = 'calendar.html';
    });
  }

  const taskBtn = footer.querySelector('#footer-task');
  if (taskBtn) {
    taskBtn.addEventListener('click', () => {
      window.location.href = 'tasks.html';
    });
  }

  const msgBtn = footer.querySelector('#footer-message');
  if (msgBtn) {
    msgBtn.addEventListener('click', () => {
      window.location.href = 'group_chat.html';
    });
  }

  initChatUnreadBadge(footer);
}

export default attachFooter;

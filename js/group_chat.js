import { requireApartmentMembershipAsync } from './auth.js';
import { initializeFirebaseServices } from './firebase.js';
import { getApartmentProfilesMap } from './profiles.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';

const MAX_IMAGE_DIMENSION = 960;
const MIN_IMAGE_DIMENSION = 480;
const IMAGE_QUALITY = 0.62;
const MIN_IMAGE_QUALITY = 0.4;
const TARGET_IMAGE_DATA_URL_LENGTH = 350000;
const EMERGENCY_MAX_IMAGE_DIMENSION = 420;
const EMERGENCY_MIN_IMAGE_DIMENSION = 320;
const EMERGENCY_IMAGE_QUALITY = 0.34;
const EMERGENCY_MIN_IMAGE_QUALITY = 0.25;
const EMERGENCY_TARGET_IMAGE_DATA_URL_LENGTH = 120000;
const CHAT_MESSAGE_LIMIT = 120;
const CHAT_MAX_STORED_MESSAGES = 500;
const CHAT_PRUNE_MAX_DELETES_PER_SEND = 50;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(dataUrl, outputType = 'image/jpeg', quality = IMAGE_QUALITY, options = {}) {
  return new Promise((resolve) => {
    const {
      maxDimension = MAX_IMAGE_DIMENSION,
      minDimension = MIN_IMAGE_DIMENSION,
      minQuality = MIN_IMAGE_QUALITY,
      targetLength = TARGET_IMAGE_DATA_URL_LENGTH,
      maxAttempts = 7,
    } = options;

    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const normalizedType = outputType && outputType.startsWith('image/') ? 'image/jpeg' : 'image/jpeg';
      const minScale = Math.min(1, minDimension / Math.max(width, height));
      let scale = Math.min(1, maxDimension / Math.max(width, height));
      let currentQuality = quality;
      let bestData = dataUrl;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const compressed = canvas.toDataURL(normalizedType, currentQuality);
        if (compressed.length < bestData.length) {
          bestData = compressed;
        }

        if (bestData.length <= targetLength) break;

        if (scale > minScale + 0.001) {
          scale = Math.max(minScale, scale * 0.82);
        } else if (currentQuality > minQuality) {
          currentQuality = Math.max(minQuality, currentQuality - 0.08);
        } else {
          break;
        }
      }

      resolve(bestData);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function aggressiveCompressImageDataUrl(dataUrl) {
  return compressImageDataUrl(dataUrl, 'image/jpeg', EMERGENCY_IMAGE_QUALITY, {
    maxDimension: EMERGENCY_MAX_IMAGE_DIMENSION,
    minDimension: EMERGENCY_MIN_IMAGE_DIMENSION,
    minQuality: EMERGENCY_MIN_IMAGE_QUALITY,
    targetLength: EMERGENCY_TARGET_IMAGE_DATA_URL_LENGTH,
    maxAttempts: 10,
  });
}

function isFirestoreMessageSizeError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  return code === 'invalid-argument' || code === 'resource-exhausted';
}

async function pruneChatMessagesIfNeeded(messagesCollectionRef) {
  const countSnapshot = await getCountFromServer(messagesCollectionRef);
  const totalMessages = countSnapshot && countSnapshot.data ? countSnapshot.data().count : 0;
  const excessMessages = Number(totalMessages || 0) - CHAT_MAX_STORED_MESSAGES;

  if (excessMessages <= 0) return;

  const pruneAmount = Math.min(excessMessages, CHAT_PRUNE_MAX_DELETES_PER_SEND);
  const oldestMessagesQuery = query(
    messagesCollectionRef,
    orderBy('createdAt', 'asc'),
    limit(pruneAmount)
  );
  const oldestMessagesSnapshot = await getDocs(oldestMessagesQuery);
  if (oldestMessagesSnapshot.empty) return;

  const batch = writeBatch(messagesCollectionRef.firestore);
  oldestMessagesSnapshot.docs.forEach((messageDoc) => {
    batch.delete(messageDoc.ref);
  });
  await batch.commit();
}

async function renderGroupChatPage(container, userName = 'You', apartmentCode = null) {
  // Clear container
  container.innerHTML = '';

  const { db, auth, error: firebaseInitError } = initializeFirebaseServices();
  const messagesCollectionRef = db && apartmentCode
    ? collection(db, 'apartments', apartmentCode, 'chatMessages')
    : null;

  if (!messagesCollectionRef) {
    console.error('Group chat requires Firebase Firestore and a valid apartment context.', firebaseInitError || null);
    alert('Group chat is unavailable until Firebase is connected. Please refresh and sign in again.');
    return;
  }

  // Group chat page structure
  const page = document.createElement('div');
  page.className = 'group-chat-page';
  page.innerHTML = `
    <div class="chat-header">
      <h2>Group Chat</h2>
    </div>
    <div class="chat-box" id="chat-box"></div>
    <form class="chat-input-form" id="chat-input-form">
      <div class="chat-compose-box" id="chat-compose-box">
        <div id="chat-attachment-preview" class="chat-attachment-preview hidden"></div>
        <input type="text" id="chat-message-input" placeholder="Type a message..." />
      </div>
      <input type="file" id="chat-file-input" style="display: none;" />
      <button type="button" id="attach-file-btn">📎</button>
      <button type="submit" id="chat-send-btn">Send</button>
    </form>
    <div id="chat-upload-status" class="chat-upload-status" aria-live="polite"></div>
  `;

  container.appendChild(page);

  // Footer navigation
  import('./footer.js').then(mod => {
    if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);
  });

  // Chat functionality
  const chatBox = page.querySelector('#chat-box');
  const chatForm = page.querySelector('#chat-input-form');
  const messageInput = page.querySelector('#chat-message-input');
  const fileInput = page.querySelector('#chat-file-input');
  const attachFileBtn = page.querySelector('#attach-file-btn');
  const sendBtn = page.querySelector('#chat-send-btn');
  const attachmentPreview = page.querySelector('#chat-attachment-preview');
  const uploadStatus = page.querySelector('#chat-upload-status');
  let messageActionMenu = null;
  let activeMessageForMenu = null;
  let activeMessageBubble = null;

  let pendingAttachmentData = null;
  let pendingAttachmentType = '';
  let pendingAttachmentName = '';

  const profiles = apartmentCode ? await getApartmentProfilesMap(apartmentCode) : {};
  const userProfile = profiles[userName] || {};
  const authDisplayName = auth && auth.currentUser && auth.currentUser.displayName
    ? String(auth.currentUser.displayName).trim()
    : '';

  function formatFallbackName(value) {
    const text = String(value || '').trim();
    if (!text) return 'Roommate';
    const emailPrefix = text.includes('@') ? text.split('@')[0] : text;
    return emailPrefix
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function getProfileDisplayName(profile) {
    if (!profile || typeof profile !== 'object') return '';
    const firstName = profile.firstName ? String(profile.firstName).trim() : '';
    const lastName = profile.lastName ? String(profile.lastName).trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    return '';
  }

  const currentUserDisplayName = getProfileDisplayName(userProfile) || authDisplayName || formatFallbackName(userName);

  let messages = [];
  let unsubscribeMessages = null;

  function getMessageCreatedAtValue(messageData) {
    const createdAt = messageData && messageData.createdAt ? messageData.createdAt : null;
    if (!createdAt) return 0;
    if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
    const numeric = Number(createdAt);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function closeMessageActionMenu() {
    if (!messageActionMenu) return;
    messageActionMenu.classList.add('hidden');
    messageActionMenu.style.left = '';
    messageActionMenu.style.top = '';
    if (activeMessageBubble) {
      activeMessageBubble.classList.remove('message-bubble-active');
      activeMessageBubble = null;
    }
    activeMessageForMenu = null;
  }

  async function editOwnMessage(messageData) {
    if (!messageData || !messageData.id) return;
    const nextText = window.prompt('Edit your message:', messageData.text || '');
    if (nextText === null) return;

    const trimmedText = String(nextText).trim();
    if (!trimmedText && !messageData.attachmentData) {
      alert('Message cannot be empty. Delete it instead.');
      return;
    }

    try {
      await updateDoc(doc(messagesCollectionRef, messageData.id), {
        text: trimmedText,
        editedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Unable to edit message:', error);
      alert('Unable to edit message right now. Please try again.');
    }
  }

  async function deleteOwnMessage(messageData) {
    if (!messageData || !messageData.id) return;
    const confirmDelete = window.confirm('Delete this message? This cannot be undone.');
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(messagesCollectionRef, messageData.id));
    } catch (error) {
      console.error('Unable to delete message:', error);
      alert('Unable to delete message right now. Please try again.');
    }
  }

  function ensureMessageActionMenu() {
    if (messageActionMenu) return messageActionMenu;

    messageActionMenu = document.createElement('div');
    messageActionMenu.className = 'chat-message-action-menu hidden';
    messageActionMenu.innerHTML = `
      <button type="button" class="chat-message-action-btn" data-action="edit">Edit</button>
      <button type="button" class="chat-message-action-btn delete" data-action="delete">Delete</button>
    `;
    document.body.appendChild(messageActionMenu);

    messageActionMenu.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute('data-action');
      if (!action || !activeMessageForMenu) return;

      if (action === 'edit') {
        await editOwnMessage(activeMessageForMenu);
      }
      if (action === 'delete') {
        await deleteOwnMessage(activeMessageForMenu);
      }

      closeMessageActionMenu();
    });

    document.addEventListener('click', (event) => {
      if (!messageActionMenu || messageActionMenu.classList.contains('hidden')) return;
      const target = event.target;
      if (target instanceof Node && messageActionMenu.contains(target)) return;
      closeMessageActionMenu();
    });

    window.addEventListener('resize', closeMessageActionMenu);
    chatBox.addEventListener('scroll', closeMessageActionMenu, { passive: true });

    return messageActionMenu;
  }

  function openMessageActionMenu(messageData, messageBubble) {
    const menu = ensureMessageActionMenu();
    if (activeMessageBubble && activeMessageBubble !== messageBubble) {
      activeMessageBubble.classList.remove('message-bubble-active');
    }
    activeMessageForMenu = messageData;
    activeMessageBubble = messageBubble;
    activeMessageBubble.classList.add('message-bubble-active');

    menu.classList.remove('hidden');
    menu.style.visibility = 'hidden';

    const bubbleRect = messageBubble.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    let left = bubbleRect.left + (bubbleRect.width - menuRect.width) / 2;
    left = Math.max(8, Math.min(left, viewportWidth - menuRect.width - 8));

    let top = bubbleRect.top - menuRect.height - 8;
    if (top < 8) {
      top = bubbleRect.bottom + 8;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  }

  function renderMessages() {
    chatBox.innerHTML = '';
    messages.forEach((msg) => {
      const senderPic = msg.sender === userName
        ? userProfile.picture || DEFAULT_PROFILE_PICTURE
        : profiles[msg.sender]?.picture || DEFAULT_PROFILE_PICTURE;

      const attachmentData = msg.attachmentUrl || msg.attachmentData || msg.file || null;
      const attachmentType = msg.attachmentType || '';
      const attachmentName = msg.attachmentName || 'Attached File';
      const isImageAttachment = Boolean(attachmentData) && attachmentType.startsWith('image/');
      const profileDisplayName = getProfileDisplayName(profiles[msg.sender]);
      const senderLabel = msg.senderDisplayName || profileDisplayName || formatFallbackName(msg.sender);

      const attachmentHtml = attachmentData
        ? (isImageAttachment
          ? `<img src="${attachmentData}" alt="${attachmentName}" style="max-width:220px; width:100%; border-radius:8px;" />`
          : `<a href="${attachmentData}" target="_blank" rel="noopener noreferrer" download="${attachmentName}">${attachmentName}</a>`)
        : '';

      const messageBubble = document.createElement('div');
      messageBubble.className = `message-bubble ${msg.sender === userName ? 'sent' : 'received'}`;
      messageBubble.innerHTML = `
        <img src="${senderPic}" class="message-pic" />
        <div class="message-content">
          <span class="message-sender">${senderLabel}</span>
          ${msg.text ? `<p>${msg.text}</p>` : ''}
          ${attachmentHtml}
        </div>
      `;

      if (msg.sender === userName && msg.id) {
        const openOwnMessageActions = () => {
          openMessageActionMenu({
            id: msg.id,
            text: msg.text,
            attachmentData,
          }, messageBubble);
        };

        messageBubble.addEventListener('dblclick', (event) => {
          event.preventDefault();
          openOwnMessageActions();
        });

        let longPressTimer = null;
        let longPressTriggered = false;

        const clearLongPress = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        messageBubble.addEventListener('touchstart', () => {
          longPressTriggered = false;
          clearLongPress();
          longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            openOwnMessageActions();
          }, 550);
        }, { passive: true });

        messageBubble.addEventListener('touchmove', clearLongPress, { passive: true });
        messageBubble.addEventListener('touchcancel', clearLongPress, { passive: true });
        messageBubble.addEventListener('touchend', (event) => {
          clearLongPress();
          if (longPressTriggered) {
            event.preventDefault();
          }
        });
      }

      chatBox.appendChild(messageBubble);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  const messageQuery = query(
    messagesCollectionRef,
    orderBy('createdAt', 'desc'),
    limit(CHAT_MESSAGE_LIMIT)
  );

  unsubscribeMessages = onSnapshot(messageQuery, (snapshot) => {
    messages = snapshot.docs
      .map((messageDoc) => {
        const data = messageDoc.data() || {};
        return {
          id: messageDoc.id,
          sender: String(data.sender || ''),
          senderDisplayName: String(data.senderDisplayName || ''),
          text: String(data.text || ''),
          attachmentData: data.attachmentData || null,
          attachmentUrl: data.attachmentUrl || null,
          attachmentType: String(data.attachmentType || ''),
          attachmentName: String(data.attachmentName || ''),
          createdAtValue: getMessageCreatedAtValue(data),
        };
      })
      .sort((a, b) => a.createdAtValue - b.createdAtValue);
    renderMessages();
  }, (error) => {
    console.error('Unable to subscribe to chat messages:', error);
  });

  const cleanupListener = () => {
    if (typeof unsubscribeMessages === 'function') {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
  };

  window.addEventListener('pagehide', cleanupListener, { once: true });

  function setUploadState(isBusy, message = '') {
    if (uploadStatus) uploadStatus.textContent = message;
    if (sendBtn) sendBtn.disabled = isBusy;
    if (attachFileBtn) attachFileBtn.disabled = isBusy;
  }

  function clearPendingAttachment(clearInput = false) {
    pendingAttachmentData = null;
    pendingAttachmentType = '';
    pendingAttachmentName = '';
    if (clearInput) fileInput.value = '';
    if (attachmentPreview) {
      attachmentPreview.innerHTML = '';
      attachmentPreview.classList.add('hidden');
    }
  }

  function renderAttachmentPreview() {
    if (!attachmentPreview) return;
    if (!pendingAttachmentData) {
      attachmentPreview.innerHTML = '';
      attachmentPreview.classList.add('hidden');
      return;
    }

    const isImage = pendingAttachmentType.startsWith('image/');
    attachmentPreview.classList.remove('hidden');
    attachmentPreview.innerHTML = isImage
      ? `
        <img src="${pendingAttachmentData}" alt="${pendingAttachmentName || 'selected image'}" class="preview-image" />
      `
      : `
        <div class="preview-file-name">${pendingAttachmentName || 'Attached file'}</div>
      `;
  }

  async function prepareAttachmentFromFile(file) {
    if (!file) {
      clearPendingAttachment(false);
      return;
    }

    try {
      setUploadState(true, 'Processing image...');
      let data = await fileToDataUrl(file);
      const type = file.type || '';
      const name = file.name || 'Attached File';

      if (data && type.startsWith('image/')) {
        setUploadState(true, 'Compressing image...');
        data = await compressImageDataUrl(data, type);
      }

      pendingAttachmentData = data;
      pendingAttachmentType = type;
      pendingAttachmentName = name;
      renderAttachmentPreview();
    } catch (_error) {
      clearPendingAttachment(false);
      alert('Attachment could not be processed. Please try another file.');
    } finally {
      setUploadState(false, '');
    }
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const file = fileInput.files[0];
    if (file && !pendingAttachmentData) {
      await prepareAttachmentFromFile(file);
    }

    const attachmentData = pendingAttachmentData;
    const attachmentType = pendingAttachmentType;
    const attachmentName = pendingAttachmentName;

    if (text || attachmentData) {
      try {
        setUploadState(true, 'Saving message...');
        await addDoc(messagesCollectionRef, {
          sender: userName,
          senderDisplayName: currentUserDisplayName,
          text,
          attachmentData,
          attachmentType,
          attachmentName,
          createdAt: serverTimestamp(),
        });
        await pruneChatMessagesIfNeeded(messagesCollectionRef);
      } catch (error) {
        if (isFirestoreMessageSizeError(error)) {
          setUploadState(false, '');
          alert('Message payload is too large. Please shorten the message or use a smaller attachment.');
          return;
        }

        if (String(error && error.code || '') === 'permission-denied') {
          setUploadState(false, '');
          console.error('Message save or pruning was denied by Firestore rules:', error);
          alert('Your message may have been sent, but auto-cleanup is blocked by Firestore permissions.');
          return;
        }

        setUploadState(false, '');
        console.error('Message save failed:', error);
        alert('Unable to send message right now. Please try again.');
        return;
      }
      setUploadState(false, '');
      messageInput.value = '';
      clearPendingAttachment(true);
    }
  });

  attachFileBtn.addEventListener('click', () => fileInput.click());
  messageInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace') return;
    if (messageInput.value.length > 0) return;
    if (!pendingAttachmentData) return;
    clearPendingAttachment(true);
  });
  fileInput.addEventListener('change', async (event) => {
    const selected = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    await prepareAttachmentFromFile(selected);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('app-container');
  if (container) {
    requireApartmentMembershipAsync().then((access) => {
      if (!access || !access.apartmentCode) return;
      const userName = access.currentUser;
      return renderGroupChatPage(container, userName, access.apartmentCode);
    }).catch((error) => {
      console.error('Unable to load group chat:', error);
      alert('Unable to load group chat right now. Please refresh and try again.');
    });
  }
});
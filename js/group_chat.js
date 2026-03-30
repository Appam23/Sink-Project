import { requireApartmentMembershipAsync } from './auth.js';
import { initializeFirebaseServices } from './firebase.js';
import { markChatAsSeen } from './footer.js';
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

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg?v=20260310';

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
const MESSAGE_REPLY_SWIPE_MIN_DISTANCE_PX = 72;
const MESSAGE_REPLY_MAX_VERTICAL_DRIFT_PX = 64;
const MESSAGE_REPLY_MAX_DURATION_MS = 900;
const SWIPE_BACK_EDGE_PX = 42;
const SWIPE_BACK_MIN_DISTANCE_PX = 90;
const SWIPE_BACK_MAX_VERTICAL_DRIFT_PX = 70;
const SWIPE_BACK_MAX_DURATION_MS = 700;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function renderReactionDisplayWithDelete(reactionDisplay, reactionValue, onDelete) {
  if (!reactionDisplay) return;
  const emoji = String(reactionValue || '').trim();
  reactionDisplay.textContent = '';
  if (!emoji) return;

  const emojiSpan = document.createElement('span');
  emojiSpan.style.fontSize = '22px';
  emojiSpan.style.verticalAlign = 'middle';
  emojiSpan.textContent = emoji;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-reaction-btn';
  deleteBtn.title = 'Delete Reaction';
  deleteBtn.style.marginLeft = '8px';
  deleteBtn.style.fontSize = '16px';
  deleteBtn.style.padding = '2px 6px';
  deleteBtn.style.border = 'none';
  deleteBtn.style.background = '#f8d7da';
  deleteBtn.style.color = '#721c24';
  deleteBtn.style.borderRadius = '4px';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.style.verticalAlign = 'middle';
  deleteBtn.textContent = 'Remove';
  deleteBtn.addEventListener('click', onDelete);

  reactionDisplay.appendChild(emojiSpan);
  reactionDisplay.appendChild(deleteBtn);
}

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
  container.classList.remove('has-footer');
  container.classList.add('group-chat-container');
  markChatAsSeen(apartmentCode, userName);

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
      <button type="button" id="chat-back-btn" class="chat-back-btn" aria-label="Back to home">← Back</button>
      <h2>Group Chat</h2>
    </div>
    <div class="chat-box" id="chat-box"></div>
    <form class="chat-input-form" id="chat-input-form">
      <div class="chat-compose-box" id="chat-compose-box">
        <div id="chat-reply-preview" class="chat-reply-preview hidden">
          <div class="chat-reply-meta">
            <span class="chat-reply-label">Replying to</span>
            <span class="chat-reply-source" id="chat-reply-source"></span>
            <span class="chat-reply-text" id="chat-reply-text"></span>
          </div>
          <button type="button" id="chat-reply-cancel" class="chat-reply-cancel" aria-label="Cancel reply">×</button>
        </div>
        <div id="chat-attachment-preview" class="chat-attachment-preview hidden"></div>
        <input type="text" id="chat-message-input" class="chat-message-input" placeholder="Type a message..." />
      </div>
      <input type="file" id="chat-file-input" style="display: none;" />
      <button type="button" id="attach-file-btn" aria-label="Attach image" title="Attach image">
        <span class="attach-file-icon" aria-hidden="true">🖼️</span>
      </button>
      <button type="submit" id="chat-send-btn">Send</button>
    </form>
    
  `;

  container.appendChild(page);

  // Chat functionality
  const chatBox = page.querySelector('#chat-box');
  const backBtn = page.querySelector('#chat-back-btn');
  const chatForm = page.querySelector('#chat-input-form');
  const messageInput = page.querySelector('#chat-message-input');
  const replyPreview = page.querySelector('#chat-reply-preview');
  const replySource = page.querySelector('#chat-reply-source');
  const replyText = page.querySelector('#chat-reply-text');
  const replyCancelBtn = page.querySelector('#chat-reply-cancel');
  const fileInput = page.querySelector('#chat-file-input');
  const attachFileBtn = page.querySelector('#attach-file-btn');
  const sendBtn = page.querySelector('#chat-send-btn');
  const attachmentPreview = page.querySelector('#chat-attachment-preview');
  const uploadStatus = page.querySelector('#chat-upload-status');
  let messageActionMenu = null;
  let activeMessageForMenu = null;
  let activeMessageBubble = null;

  const previousBodyOverflow = document.body.style.overflow;
  const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
  const previousHtmlOverflow = document.documentElement.style.overflow;
  const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;

  document.body.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.overscrollBehavior = 'none';

  function shouldAllowChatBoxScroll(eventTarget) {
    return eventTarget instanceof Node && chatBox instanceof HTMLElement && chatBox.contains(eventTarget);
  }

  const blockGlobalTouchScroll = (event) => {
    if (shouldAllowChatBoxScroll(event.target)) return;
    event.preventDefault();
  };

  const blockGlobalWheelScroll = (event) => {
    if (shouldAllowChatBoxScroll(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('touchmove', blockGlobalTouchScroll, { passive: false });
  document.addEventListener('wheel', blockGlobalWheelScroll, { passive: false });

  let pendingAttachmentData = null;
  let pendingAttachmentType = '';
  let pendingAttachmentName = '';
  let pendingReply = null;
  let swipeTracking = null;

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  }

  function resetSwipeTracking() {
    swipeTracking = null;
  }

  function navigateBackToHome() {
    window.location.href = 'home.html';
  }

  page.addEventListener('touchstart', (event) => {
    if (!event.touches || event.touches.length !== 1) {
      resetSwipeTracking();
      return;
    }

    const touch = event.touches[0];
    if (touch.clientX > SWIPE_BACK_EDGE_PX) {
      resetSwipeTracking();
      return;
    }

    swipeTracking = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      triggered: false,
    };
  }, { passive: true });

  page.addEventListener('touchmove', (event) => {
    if (!swipeTracking || swipeTracking.triggered) return;
    if (!event.touches || event.touches.length !== 1) {
      resetSwipeTracking();
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeTracking.startX;
    const deltaY = touch.clientY - swipeTracking.startY;

    if (Math.abs(deltaY) > SWIPE_BACK_MAX_VERTICAL_DRIFT_PX) {
      resetSwipeTracking();
      return;
    }

    if (deltaX >= SWIPE_BACK_MIN_DISTANCE_PX) {
      const elapsed = Date.now() - swipeTracking.startTime;
      if (elapsed <= SWIPE_BACK_MAX_DURATION_MS) {
        swipeTracking.triggered = true;
        navigateBackToHome();
      } else {
        resetSwipeTracking();
      }
    }
  }, { passive: true });

  page.addEventListener('touchend', () => {
    resetSwipeTracking();
  }, { passive: true });

  page.addEventListener('touchcancel', () => {
    resetSwipeTracking();
  }, { passive: true });

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
  let keepPinnedToBottom = true;
  let forceScrollToBottomOnNextRender = true;
  let lockBottomUntil = 0;

  function isBottomLockActive() {
    return Date.now() < lockBottomUntil;
  }

  function activateBottomLock(durationMs = 1200) {
    keepPinnedToBottom = true;
    lockBottomUntil = Date.now() + durationMs;
  }

  function isChatNearBottom(thresholdPx = 120) {
    const remaining = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    return remaining <= thresholdPx;
  }

  function scrollChatToBottom() {
    const lastMessage = chatBox.lastElementChild;
    if (lastMessage instanceof HTMLElement) {
      lastMessage.scrollIntoView({ block: 'end' });
    }

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function keepChatAtBottomFor(durationMs = 1200) {
    activateBottomLock(durationMs);
    const startedAt = Date.now();
    const tick = () => {
      chatBox.scrollTop = chatBox.scrollHeight;
      if (Date.now() - startedAt < durationMs) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

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

  function summarizeReplyText(textValue, hasAttachment = false) {
    const baseText = String(textValue || '').trim();
    const compact = baseText.replace(/\s+/g, ' ');
    if (compact) {
      return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
    }
    return hasAttachment ? 'Attachment' : 'Message';
  }

  function renderReplyComposerPreview() {
    if (!replyPreview || !replySource || !replyText) return;
    if (!pendingReply) {
      replyPreview.classList.add('hidden');
      replySource.textContent = '';
      replyText.textContent = '';
      return;
    }

    replyPreview.classList.remove('hidden');
    replySource.textContent = pendingReply.senderLabel || formatFallbackName(pendingReply.sender);
    replyText.textContent = summarizeReplyText(pendingReply.text, pendingReply.hasAttachment);
  }

  function setPendingReplyFromMessage(messageData, senderLabel) {
    if (!messageData || !messageData.id) return;
    pendingReply = {
      id: String(messageData.id),
      sender: String(messageData.sender || ''),
      senderLabel: String(senderLabel || formatFallbackName(messageData.sender || '')),
      text: String(messageData.text || ''),
      hasAttachment: Boolean(messageData.attachmentData || messageData.attachmentUrl || messageData.file),
    };
    renderReplyComposerPreview();
    if (messageInput) messageInput.focus();
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
      const safeAttachmentData = sanitizeFileUrl(attachmentData);
      const isImageAttachment = Boolean(attachmentData) && attachmentType.startsWith('image/');
      const profileDisplayName = getProfileDisplayName(profiles[msg.sender]);
      const senderLabel = msg.senderDisplayName || profileDisplayName || formatFallbackName(msg.sender);
      const replyContext = msg.replyTo && typeof msg.replyTo === 'object' ? msg.replyTo : null;
      const editedLabelHtml = msg.isEdited ? '<span class="message-edited">edited</span>' : '';

      const attachmentHtml = safeAttachmentData
        ? (isImageAttachment
          ? `<img src="${escapeHtml(safeAttachmentData)}" alt="${escapeHtml(attachmentName)}" class="chat-attachment-image" style="max-width:220px; width:100%; border-radius:8px;" />`
          : `<a href="${escapeHtml(safeAttachmentData)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(attachmentName)}">${escapeHtml(attachmentName)}</a>`)
        : '';

      const messageBubble = document.createElement('div');
      messageBubble.className = `message-bubble ${msg.sender === userName ? 'sent' : 'received'}`;
      messageBubble.innerHTML = `
        <img src="${escapeHtml(senderPic)}" class="message-pic" alt="Sender profile picture" />
        <div class="message-content">
          <span class="message-sender">${escapeHtml(senderLabel)}</span>
          ${replyContext ? `<div class="message-reply-context"><span class="message-reply-sender"></span><p class="message-reply-text"></p></div>` : ''}
          ${msg.text ? `<p>${escapeHtml(msg.text)}</p>` : ''}
          ${editedLabelHtml}
          ${attachmentHtml}
          ${msg.sender !== userName ? `<button class="reaction-btn" title="Add Reaction" style="display:none;">😊</button><span class="reaction-display"></span>` : ''}
        </div>
      `;

      // Show reaction button after hover for 1 second
      if (msg.sender !== userName) {
        const reactionBtn = messageBubble.querySelector('.reaction-btn');
        const reactionDisplay = messageBubble.querySelector('.reaction-display');
        let hoverTimer = null;
        // Desktop: show after hover
        messageBubble.addEventListener('mouseenter', () => {
          hoverTimer = setTimeout(() => {
            if (reactionBtn) reactionBtn.style.display = 'inline-block';
          }, 1000);
        });
        messageBubble.addEventListener('mouseleave', () => {
          if (hoverTimer) clearTimeout(hoverTimer);
          if (reactionBtn) reactionBtn.style.display = 'none';
        });
        // Mobile: show on tap or long-press
        let touchTimer = null;
        messageBubble.addEventListener('touchstart', (e) => {
          if (touchTimer) clearTimeout(touchTimer);
          touchTimer = setTimeout(() => {
            if (reactionBtn) reactionBtn.style.display = 'inline-block';
          }, 350); // shorter delay for mobile
        }, { passive: true });
        messageBubble.addEventListener('touchend', () => {
          if (touchTimer) clearTimeout(touchTimer);
        }, { passive: true });
        // Hide button on touch outside
        document.addEventListener('touchstart', (e) => {
          if (reactionBtn && !messageBubble.contains(e.target)) {
            reactionBtn.style.display = 'none';
          }
        }, { passive: true });
        // Show persisted reaction if present
        if (reactionDisplay && msg.reaction) {
          renderReactionDisplayWithDelete(reactionDisplay, msg.reaction, async (e) => {
            e.stopPropagation();
            reactionDisplay.textContent = '';
            if (msg.id) {
              try {
                await updateDoc(doc(messagesCollectionRef, msg.id), { reaction: '' });
              } catch (err) {
                console.error('Failed to delete reaction:', err);
              }
            }
          });
        }
        if (reactionBtn && reactionDisplay) {
          reactionBtn.addEventListener('click', () => {
            // Simple emoji picker
            const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '😊', '😉'];
            const picker = document.createElement('div');
            picker.className = 'emoji-picker';
            picker.style.position = 'absolute';
            picker.style.background = '#fff';
            picker.style.border = '1px solid #ccc';
            picker.style.padding = '4px';
            picker.style.zIndex = 1000;
            emojis.forEach(emoji => {
              const btn = document.createElement('button');
              btn.textContent = emoji;
              btn.style.fontSize = '20px';
              btn.style.margin = '2px';
              btn.addEventListener('click', async () => {
                // Save reaction to Firestore
                if (msg.id) {
                  try {
                    await updateDoc(doc(messagesCollectionRef, msg.id), { reaction: emoji });
                  } catch (err) {
                    console.error('Failed to save reaction:', err);
                  }
                }
                renderReactionDisplayWithDelete(reactionDisplay, emoji, async (e) => {
                  e.stopPropagation();
                  reactionDisplay.textContent = '';
                  // Remove reaction from Firestore
                  if (msg.id) {
                    try {
                      await updateDoc(doc(messagesCollectionRef, msg.id), { reaction: '' });
                    } catch (err) {
                      console.error('Failed to delete reaction:', err);
                    }
                  }
                });
                picker.remove();
              });
              picker.appendChild(btn);
            });
            document.body.appendChild(picker);
            // Position picker near button
            const rect = reactionBtn.getBoundingClientRect();
            picker.style.left = `${rect.left}px`;
            picker.style.top = `${rect.bottom + window.scrollY}px`;
            // Remove picker if clicking outside or touch outside
            const removePicker = (e) => {
              if (!picker.contains(e.target)) picker.remove();
              document.removeEventListener('mousedown', removePicker);
              document.removeEventListener('touchstart', removePicker);
            };
            document.addEventListener('mousedown', removePicker);
            document.addEventListener('touchstart', removePicker);
          });
        }
      }


      if (replyContext) {
        const replySenderElement = messageBubble.querySelector('.message-reply-sender');
        const replyTextElement = messageBubble.querySelector('.message-reply-text');
        const replySenderLabel = String(replyContext.senderLabel || '').trim() || formatFallbackName(replyContext.sender || '');
        const replySummaryText = summarizeReplyText(replyContext.text, Boolean(replyContext.hasAttachment));
        if (replySenderElement) replySenderElement.textContent = replySenderLabel;
        if (replyTextElement) replyTextElement.textContent = replySummaryText;
      }

      let messageSwipeState = null;
      messageBubble.addEventListener('touchstart', (event) => {
        if (!event.touches || event.touches.length !== 1) {
          messageSwipeState = null;
          return;
        }

        const touch = event.touches[0];
        messageSwipeState = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: Date.now(),
          triggered: false,
        };
      }, { passive: true });

      messageBubble.addEventListener('touchmove', (event) => {
        if (!messageSwipeState || messageSwipeState.triggered) return;
        if (!event.touches || event.touches.length !== 1) {
          messageSwipeState = null;
          return;
        }

        const touch = event.touches[0];
        const deltaX = touch.clientX - messageSwipeState.startX;
        const deltaY = touch.clientY - messageSwipeState.startY;

        if (Math.abs(deltaY) > MESSAGE_REPLY_MAX_VERTICAL_DRIFT_PX) {
          messageSwipeState = null;
          return;
        }

        if (deltaX >= MESSAGE_REPLY_SWIPE_MIN_DISTANCE_PX) {
          const elapsed = Date.now() - messageSwipeState.startTime;
          if (elapsed <= MESSAGE_REPLY_MAX_DURATION_MS) {
            messageSwipeState.triggered = true;
            setPendingReplyFromMessage(msg, senderLabel);
          } else {
            messageSwipeState = null;
          }
        }
      }, { passive: true });

      messageBubble.addEventListener('touchend', () => {
        messageSwipeState = null;
      }, { passive: true });

      messageBubble.addEventListener('touchcancel', () => {
        messageSwipeState = null;
      }, { passive: true });

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

      const attachmentImage = messageBubble.querySelector('.chat-attachment-image');
      if (attachmentImage) {
        attachmentImage.addEventListener('load', () => {
          if (keepPinnedToBottom) {
            keepChatAtBottomFor(500);
          }
        });

        if (attachmentImage.complete) {
          if (keepPinnedToBottom) {
            keepChatAtBottomFor(500);
          }
        }
      }

      chatBox.appendChild(messageBubble);
    });

    if (keepPinnedToBottom || forceScrollToBottomOnNextRender) {
      forceScrollToBottomOnNextRender = false;
      keepChatAtBottomFor(1200);
    }
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
          replyTo: data.replyTo && typeof data.replyTo === 'object' ? data.replyTo : null,
          isEdited: Boolean(data.editedAt),
          createdAtValue: getMessageCreatedAtValue(data),
          reaction: typeof data.reaction === 'string' ? data.reaction : '',
        };
      })
      .sort((a, b) => a.createdAtValue - b.createdAtValue);

    const newestMessage = messages.length ? messages[messages.length - 1] : null;
    const newestCreatedAtValue = newestMessage && newestMessage.createdAtValue ? newestMessage.createdAtValue : Date.now();
    markChatAsSeen(apartmentCode, userName, newestCreatedAtValue);

    renderMessages();

    if (keepPinnedToBottom || forceScrollToBottomOnNextRender) {
      setTimeout(() => {
        keepChatAtBottomFor(900);
      }, 80);
    }
  }, (error) => {
    console.error('Unable to subscribe to chat messages:', error);
  });

  const cleanupListener = () => {
    markChatAsSeen(apartmentCode, userName);
    document.removeEventListener('touchmove', blockGlobalTouchScroll);
    document.removeEventListener('wheel', blockGlobalWheelScroll);
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
    if (typeof unsubscribeMessages === 'function') {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
  };

  window.addEventListener('pagehide', cleanupListener, { once: true });

  chatBox.addEventListener('scroll', () => {
    if (isBottomLockActive()) return;
    keepPinnedToBottom = isChatNearBottom();
  }, { passive: true });

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

  if (replyCancelBtn) {
    replyCancelBtn.addEventListener('click', () => {
      pendingReply = null;
      renderReplyComposerPreview();
    });
  }

  renderReplyComposerPreview();

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
      const replyTo = pendingReply
        ? {
            id: pendingReply.id,
            sender: pendingReply.sender,
            senderLabel: pendingReply.senderLabel,
            text: pendingReply.text,
            hasAttachment: Boolean(pendingReply.hasAttachment),
          }
        : null;
      try {
        setUploadState(true, 'Saving message...');
        await addDoc(messagesCollectionRef, {
          sender: userName,
          senderDisplayName: currentUserDisplayName,
          text,
          attachmentData,
          attachmentType,
          attachmentName,
          replyTo,
          createdAt: serverTimestamp(),
        });
        await pruneChatMessagesIfNeeded(messagesCollectionRef);
        forceScrollToBottomOnNextRender = true;
        keepChatAtBottomFor(1200);
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
      pendingReply = null;
      renderReplyComposerPreview();
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
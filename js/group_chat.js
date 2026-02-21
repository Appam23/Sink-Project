import { getApartmentItem, setApartmentItem } from './storage.js';
import { requireApartmentMembership } from './auth.js';

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

function isQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
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

function renderGroupChatPage(container, userName = 'You') {
  // Clear container
  container.innerHTML = '';

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

  let pendingAttachmentData = null;
  let pendingAttachmentType = '';
  let pendingAttachmentName = '';

  const profilesRaw = localStorage.getItem('profiles');
  const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
  const userProfile = profiles[userName] || {};

  const messages = getApartmentItem('groupChatMessages', []);

  function renderMessages() {
    chatBox.innerHTML = '';
    messages.forEach((msg) => {
      const senderPic = msg.sender === userName
        ? userProfile.picture || DEFAULT_PROFILE_PICTURE
        : profiles[msg.sender]?.picture || DEFAULT_PROFILE_PICTURE;

      const attachmentData = msg.attachmentData || msg.file || null;
      const attachmentType = msg.attachmentType || '';
      const attachmentName = msg.attachmentName || 'Attached File';
      const isImageAttachment = Boolean(attachmentData) && attachmentType.startsWith('image/');

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
          ${msg.text ? `<p>${msg.text}</p>` : ''}
          ${attachmentHtml}
        </div>
      `;
      chatBox.appendChild(messageBubble);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  renderMessages();

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
      messages.push({
        sender: userName,
        text,
        attachmentData,
        attachmentType,
        attachmentName,
      });
      try {
        setUploadState(true, 'Saving message...');
        setApartmentItem('groupChatMessages', messages);
      } catch (error) {
        messages.pop();
        if (isQuotaError(error)) {
          const isImageAttachment = attachmentData && attachmentType && attachmentType.startsWith('image/');
          if (isImageAttachment) {
            setUploadState(true, 'Reducing image size...');
            const reducedAttachmentData = await aggressiveCompressImageDataUrl(attachmentData);
            messages.push({
              sender: userName,
              text,
              attachmentData: reducedAttachmentData,
              attachmentType,
              attachmentName,
            });
            try {
              setUploadState(true, 'Saving message...');
              setApartmentItem('groupChatMessages', messages);
              pendingAttachmentData = reducedAttachmentData;
            } catch (retryError) {
              messages.pop();
              setUploadState(false, '');
              if (isQuotaError(retryError)) {
                alert('Storage is almost full on this device. Try removing older image messages or choose a smaller image.');
                return;
              }
              throw retryError;
            }
          } else {
            setUploadState(false, '');
            alert('Storage is almost full on this device. Try removing older image messages.');
            return;
          }
        } else {
          setUploadState(false, '');
          throw error;
        }
      }
      setUploadState(false, '');
      renderMessages();
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
    const access = requireApartmentMembership();
    if (!access || !access.apartmentCode) return;
    const userName = access.currentUser;
    renderGroupChatPage(container, userName);
  }
});
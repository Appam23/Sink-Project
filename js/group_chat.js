import { getApartmentItem, setApartmentItem } from './storage.js';
import { requireApartmentMembership } from './auth.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';

const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;

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

function compressImageDataUrl(dataUrl, outputType = 'image/jpeg', quality = IMAGE_QUALITY) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const normalizedType = outputType && outputType.startsWith('image/') ? outputType : 'image/jpeg';
      const compressed = canvas.toDataURL(normalizedType, quality);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
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
      <input type="text" id="chat-message-input" placeholder="Type a message..." />
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
  const uploadStatus = page.querySelector('#chat-upload-status');

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

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const file = fileInput.files[0];
    let attachmentData = null;
    let attachmentType = '';
    let attachmentName = '';

    if (file) {
      try {
        setUploadState(true, 'Processing image...');
        attachmentData = await fileToDataUrl(file);
        attachmentType = file.type || '';
        attachmentName = file.name || 'Attached File';
        if (attachmentData && attachmentType.startsWith('image/')) {
          setUploadState(true, 'Compressing image...');
          attachmentData = await compressImageDataUrl(attachmentData, attachmentType);
        }
      } catch (_error) {
        attachmentData = null;
      } finally {
        setUploadState(false, '');
      }
    }

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
        setUploadState(false, '');
        if (isQuotaError(error)) {
          alert('This image is too large to save on this device. Please choose a smaller image.');
          return;
        }
        throw error;
      }
      setUploadState(false, '');
      renderMessages();
      messageInput.value = '';
      fileInput.value = '';
    }
  });

  attachFileBtn.addEventListener('click', () => fileInput.click());
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
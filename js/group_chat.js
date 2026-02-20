import { getApartmentItem, setApartmentItem } from './storage.js';
import { requireApartmentMembership } from './auth.js';

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
      <button type="submit">Send</button>
    </form>
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

  const profilesRaw = localStorage.getItem('profiles');
  const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
  const userProfile = profiles[userName] || {};

  const messages = getApartmentItem('groupChatMessages', []);

  function renderMessages() {
    chatBox.innerHTML = '';
    messages.forEach((msg) => {
      const messageBubble = document.createElement('div');
      messageBubble.className = `message-bubble ${msg.sender === userName ? 'sent' : 'received'}`;
      messageBubble.innerHTML = `
        <img src="${msg.sender === userName ? userProfile.picture || 'https://via.placeholder.com/32' : profiles[msg.sender]?.picture || 'https://via.placeholder.com/32'}" class="message-pic" />
        <div class="message-content">
          ${msg.text ? `<p>${msg.text}</p>` : ''}
          ${msg.file ? `<a href="${msg.file}" target="_blank">Attached File</a>` : ''}
        </div>
      `;
      chatBox.appendChild(messageBubble);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  renderMessages();

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const file = fileInput.files[0];
    const fileUrl = file ? URL.createObjectURL(file) : null;

    if (text || file) {
      messages.push({ sender: userName, text, file: fileUrl });
      setApartmentItem('groupChatMessages', messages);
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
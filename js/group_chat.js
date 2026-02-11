import { renderHomePage } from './home.js';
import { getApartmentItem, setApartmentItem } from './storage.js';

export function renderGroupChatPage(container, userName = 'You') {
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
  let footer = container.querySelector('.profile-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'profile-footer';
    footer.innerHTML = `
      <button class="footer-btn" id="footer-home" title="Home"><span class="footer-icon home-icon"></span></button>
      <button class="footer-btn" id="footer-calendar" title="Calendar"><span class="footer-icon calendar-icon"></span></button>
      <button class="footer-btn" id="footer-task" title="Task"><span class="footer-icon task-icon"></span></button>
      <button class="footer-btn" id="footer-chat" title="Group Chat"><span class="footer-icon message-icon"></span></button>
    `;
    container.appendChild(footer);
  }

  // Event listeners for footer navigation
  footer.querySelector('#footer-home').addEventListener('click', () => renderHomePage(container, userName));
  footer.querySelector('#footer-calendar').addEventListener('click', async () => {
    const mod = await import('./calendar.js');
    if (mod && typeof mod.renderCalendarPage === 'function') {
      mod.renderCalendarPage(container);
    }
  });
  footer.querySelector('#footer-task').addEventListener('click', async () => {
    const mod = await import('./tasks.js');
    if (mod && typeof mod.renderTasksPage === 'function') {
      mod.renderTasksPage(container);
    }
  });
  footer.querySelector('#footer-chat').addEventListener('click', () => renderGroupChatPage(container, userName));

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

// footer.js
export function attachFooter(container) {
  let footer = container.querySelector('.profile-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'profile-footer';
    footer.innerHTML = `
      <button class="footer-btn" id="footer-home" title="Home"><span class="footer-icon home-icon"></span></button>
      <button class="footer-btn" id="footer-calendar" title="Calendar"><span class="footer-icon calendar-icon"></span></button>
      <button class="footer-btn" id="footer-task" title="Task"><span class="footer-icon task-icon"></span></button>
      <button class="footer-btn" id="footer-message" title="Message"><span class="footer-icon message-icon"></span></button>
    `;
    container.appendChild(footer);
  }

  const homeBtn = footer.querySelector('#footer-home');
  if (homeBtn) {
    homeBtn.addEventListener('click', async () => {
      const mod = await import('./home.js');
      const cur = localStorage.getItem('currentUser');
      const apt = localStorage.getItem('currentApartment');
      if (mod && typeof mod.renderHomePage === 'function') {
        mod.renderHomePage(container, cur, apt);
      }
    });
  }

  const calendarBtn = footer.querySelector('#footer-calendar');
  if (calendarBtn) {
    calendarBtn.addEventListener('click', async () => {
      const mod = await import('./calendar.js');
      if (mod && typeof mod.renderCalendarPage === 'function') {
        mod.renderCalendarPage(container);
      }
    });
  }

  const taskBtn = footer.querySelector('#footer-task');
  if (taskBtn) {
    taskBtn.addEventListener('click', async () => {
      const mod = await import('./tasks.js');
      if (mod && typeof mod.renderTasksPage === 'function') {
        mod.renderTasksPage(container);
      }
    });
  }

  const msgBtn = footer.querySelector('#footer-message');
  if (msgBtn) {
    msgBtn.addEventListener('click', async () => {
      try {
        const mod = await import('./group_chat.js');
        const cur = localStorage.getItem('currentUser');
        if (mod && typeof mod.renderGroupChatPage === 'function') {
          mod.renderGroupChatPage(container, cur);
        } else {
          console.error('group_chat module missing renderGroupChatPage');
        }
      } catch (err) {
        console.error('Failed to open group chat from footer:', err);
      }
    });
  }
}

export default attachFooter;

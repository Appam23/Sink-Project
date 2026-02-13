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
}

export default attachFooter;

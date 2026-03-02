// footer.js
export function attachFooter(container) {
  let footer = container.querySelector('.profile-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'profile-footer';
    footer.innerHTML = `
      <button class="footer-btn" id="footer-home" title="Home">
        <span class="footer-icon"> 
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z"/><path d="M9 22V12h6v10"/></svg>
        </span>
      </button>
      <button class="footer-btn" id="footer-calendar" title="Calendar">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7ed957" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </span>
      </button>
      <button class="footer-btn" id="footer-task" title="Task">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2l4-4"/></svg>
        </span>
      </button>
      <button class="footer-btn" id="footer-message" title="Message">
        <span class="footer-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b76cf4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
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
}

export default attachFooter;

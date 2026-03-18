export function renderWelcomePage(container, attachWelcomeEvents) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.innerHTML = `
     <img src="Logo.png" alt="Logo" class="logo-img" />
    <h2 id="welcome-title">Welcome!!</h2>
    <div class="welcome-flow" aria-hidden="true">
      <div class="welcome-flow-track">
        <span class="welcome-chip chip-tasks">Tasks</span>
        <span class="welcome-chip chip-calendar">Calendar</span>
        <span class="welcome-chip chip-chat">Chat</span>
        <span class="welcome-chip chip-home">Home</span>
        <span class="welcome-chip chip-tasks">Tasks</span>
        <span class="welcome-chip chip-calendar">Calendar</span>
        <span class="welcome-chip chip-chat">Chat</span>
        <span class="welcome-chip chip-home">Home</span>
      </div>
    </div>
    <button id="show-login" class="main-btn">Log In</button>
    <button id="show-signup" class="main-btn">Sign Up</button>
  `;
  attachWelcomeEvents();
}

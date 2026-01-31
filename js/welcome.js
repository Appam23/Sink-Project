export function renderWelcomePage(container, attachWelcomeEvents) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.innerHTML = `
    <img src="Logo.png" alt="Logo" class="logo-img" />
    <img src="Sink.jpg" alt="Sink Logo" class="welcome-img" />
    <h2 id="welcome-title">Welcome!!</h2>
    <button id="show-login" class="main-btn">Log In</button>
    <button id="show-signup" class="main-btn">Sign Up</button>
  `;
  attachWelcomeEvents();
}

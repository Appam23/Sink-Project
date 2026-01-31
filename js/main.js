import { renderWelcomePage } from './welcome.js';
import { renderLoginForm } from './login.js';
import { renderSignupForm } from './signup.js';

document.addEventListener('DOMContentLoaded', function() {
  const container = document.querySelector('.container');

  function attachWelcomeEvents() {
    const showLoginBtn = document.getElementById('show-login');
    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', () => renderLoginForm(container, renderWelcomePageWithEvents));
    }
    const showSignupBtn = document.getElementById('show-signup');
    if (showSignupBtn) {
      showSignupBtn.addEventListener('click', () => renderSignupForm(container, renderWelcomePageWithEvents));
    }
  }

  function renderWelcomePageWithEvents() {
    renderWelcomePage(container, attachWelcomeEvents);
  }

  renderWelcomePageWithEvents();
});

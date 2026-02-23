import { renderWelcomePage } from './welcome.js';
import { renderLoginForm } from './login.js';
import { renderSignupForm } from './signup.js';

async function bootstrapFirebase() {
  try {
    const { initializeFirebaseServices } = await import('./firebase.js');
    const { error } = initializeFirebaseServices();
    if (error) {
      console.warn('Firebase initialized with errors:', error);
    }
  } catch (error) {
    console.warn('Firebase startup skipped:', error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  bootstrapFirebase();
  const container = document.querySelector('.container');

  function attachWelcomeEvents() {
    const showLoginBtn = document.getElementById('show-login');
    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', () => renderLoginForm(container, renderWelcomePageWithEvents, renderSignupFormWithNav));
    }
    const showSignupBtn = document.getElementById('show-signup');
    if (showSignupBtn) {
      showSignupBtn.addEventListener('click', () => renderSignupForm(container, renderWelcomePageWithEvents, renderLoginFormWithNav));
    }
  }

  function renderSignupFormWithNav() {
    renderSignupForm(container, renderWelcomePageWithEvents, renderLoginFormWithNav);
  }

  function renderLoginFormWithNav() {
    renderLoginForm(container, renderWelcomePageWithEvents, renderSignupFormWithNav);
  }

  function renderWelcomePageWithEvents() {
    renderWelcomePage(container, attachWelcomeEvents);
  }

  if (window.location.hash === '#login') {
    renderLoginFormWithNav();
  } else {
    renderWelcomePageWithEvents();
  }
});

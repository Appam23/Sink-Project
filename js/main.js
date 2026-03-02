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

  function setRoute(hash) {
    const nextHash = String(hash || '').startsWith('#') ? String(hash) : `#${String(hash || '')}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }

  function attachWelcomeEvents() {
    const showLoginBtn = document.getElementById('show-login');
    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', () => renderLoginFormWithNav());
    }
    const showSignupBtn = document.getElementById('show-signup');
    if (showSignupBtn) {
      showSignupBtn.addEventListener('click', () => renderSignupFormWithNav());
    }
  }

  function renderSignupFormWithNav() {
    setRoute('#signup');
    renderSignupForm(container, renderWelcomePageWithEvents, renderLoginFormWithNav);
  }

  function renderLoginFormWithNav() {
    setRoute('#login');
    renderLoginForm(container, renderWelcomePageWithEvents, renderSignupFormWithNav);
  }

  function renderWelcomePageWithEvents() {
    setRoute('#welcome');
    renderWelcomePage(container, attachWelcomeEvents);
  }

  if (window.location.hash === '#login') {
    renderLoginFormWithNav();
  } else if (window.location.hash === '#signup') {
    renderSignupFormWithNav();
  } else {
    renderWelcomePageWithEvents();
  }
});

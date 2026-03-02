import { createFirebaseEmailUser } from './firebase.js';

function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function mapSignupError(error) {
  const code = error && error.code ? String(error.code) : '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Reconnect to the internet and try again.';
  }
  if (code.startsWith('auth/requests-from-referer-')) {
    return 'This local URL is blocked by Firebase Auth. Add localhost and 127.0.0.1 to Authentication > Settings > Authorized domains.';
  }
  if (code === 'auth/network-request-failed' && isLocalDevHost()) {
    return 'Cannot reach Firebase Auth locally. Start emulator with: firebase emulators:start --only auth';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while creating account. Check your connection and try again.';
  }
  if (code === 'auth/email-already-in-use') return 'An account with this email already exists.';
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/weak-password') return 'Password should be at least 6 characters.';
  return error && error.message ? error.message : 'Unable to create account.';
}

export function renderSignupForm(container, renderWelcomePageWithEvents, renderLoginForm) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const form = document.createElement('form');
  form.id = 'signup-form';
  form.innerHTML = `
    <button type="button" id="back-btn">&#8592; Back</button>
    <label for="signup-Name">Name:</label>
    <input type="text" id="signup-name" placeholder="Name" required />
    <hr>
    <label for="signup-email">Email:</label>
    <input type="email" id="signup-email" placeholder="Email" required />
    <hr>
    <label for="signup-password">Password:</label>
    <input type="password" id="signup-password" placeholder="Password" required />
    
    <button type="submit" id="sub-signup" class="main-btn">Sign Up</button>
    <div class="message" id="signup-message"></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
  let isSubmitting = false;
  form.onsubmit = async function(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const message = document.getElementById('signup-message');
    const submitBtn = document.getElementById('sub-signup');

    if (!name || !email || !password) {
      message.innerText = 'Please enter name, email, and password.';
      return;
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Signing Up...';
    message.innerText = '';

    try {
      await createFirebaseEmailUser(email, password, name);
      window.location.href = 'apartment_code.html';
    } catch (error) {
      message.innerText = mapSignupError(error);
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerText = 'Sign Up';
    }
  };
}

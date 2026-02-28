import { sendFirebasePasswordReset, signInFirebaseEmailUser } from './firebase.js';
import { ensureMemberInApartment, findApartmentForUser } from './apartments.js';

function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function mapLoginError(error) {
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
    return 'Network error while logging in. Check your connection and try again.';
  }
  if (code === 'auth/user-not-found') return 'No account found for this email. Please sign up first.';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Incorrect password.';
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/too-many-requests') return 'Too many login attempts. Please try again later.';
  return error && error.message ? error.message : 'Unable to log in right now.';
}

function mapPasswordResetError(error) {
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
    return 'Network error while sending reset email. Check your connection and try again.';
  }
  if (code === 'auth/invalid-email') return 'Please enter a valid email address first.';
  if (code === 'auth/missing-email') return 'Enter your email, then tap Forgot password.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  return error && error.message ? error.message : 'Unable to send reset email right now.';
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function renderLoginForm(container, renderWelcomePageWithEvents, renderSignupForm) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const form = document.createElement('form');
  form.id = 'login-form';
  form.innerHTML = `
    <button type="button" id="back-btn">&#8592; Back</button>
    <h2 id="form-title">Login</h2>
    <label for="login-email">Email:</label>
    <input type="text" id="login-email" placeholder="Email" required />
    <hr/>
    <label for="login-password">Password:</label>
    <input type="password" id="login-password" placeholder="Password" required />
    <button type="submit" id="sub-login" class="main-btn">Login</button>
    <div class="switch-link"><span id="forgot-password" style="color:#102cac;cursor:pointer;text-decoration:underline;">Forgot password?</span></div>
    <div class="message" id="login-message"></div>
    <div class="switch-link">Don't have an account? <span id="to-signup" style="color:#102cac;cursor:pointer;text-decoration:underline;">Sign up here!</span></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
    let isSubmitting = false;
    form.onsubmit = async function(e) {
      e.preventDefault();
      if (isSubmitting) return;

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const message = document.getElementById('login-message');
      const submitBtn = document.getElementById('sub-login');
      if (!email || !password) {
        message.innerText = 'Please enter both email and password.';
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Logging In...';
      message.innerText = '';

      const normalizedEmail = email.toLowerCase();
      let currentUserName = normalizedEmail;

      try {
        const firebaseUser = await signInFirebaseEmailUser(email, password);
        const firebaseDisplayName = firebaseUser && firebaseUser.displayName ? String(firebaseUser.displayName).trim() : '';
        currentUserName = firebaseDisplayName || normalizedEmail;
      } catch (error) {
        message.innerText = mapLoginError(error);
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerText = 'Login';
        return;
      }

      let membership = null;
      try {
        membership = await withTimeout(findApartmentForUser(normalizedEmail), 7000);
        if (!membership && currentUserName && currentUserName !== normalizedEmail) {
          membership = await withTimeout(findApartmentForUser(currentUserName), 7000);
          if (membership && membership.code) {
            try {
              membership = await withTimeout(ensureMemberInApartment(membership.code, normalizedEmail), 7000);
            } catch (_error) {
              // Keep existing membership context if alias update fails.
            }
          }
        }
      } catch (_error) {
        membership = null;
      }

      const hasApartment = !!(membership && membership.code);

      if (hasApartment) {
        window.location.href = 'home.html';
      } else {
        window.location.href = 'apartment_code.html';
      }
    };
  // Add event for sign up link
  const toSignup = form.querySelector('#to-signup');
  if (toSignup && typeof renderSignupForm === 'function') {
    toSignup.onclick = () => renderSignupForm(container, renderWelcomePageWithEvents, renderLoginForm);
  }

  const forgotPassword = form.querySelector('#forgot-password');
  if (forgotPassword) {
    forgotPassword.addEventListener('click', async () => {
      const message = document.getElementById('login-message');
      const email = document.getElementById('login-email').value.trim();
      if (!email) {
        message.innerText = 'Enter your email, then tap Forgot password.';
        return;
      }

      try {
        await sendFirebasePasswordReset(email);
        message.innerText = 'Password reset email sent. Check your inbox.';
      } catch (error) {
        message.innerText = mapPasswordResetError(error);
      }
    });
  }
}

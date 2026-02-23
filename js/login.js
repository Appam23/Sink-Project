import { signInFirebaseEmailUser } from './firebase.js';
import { ensureMemberInApartment, findApartmentForUser } from './apartments.js';

function mapLoginError(error) {
  const code = error && error.code ? String(error.code) : '';
  if (code === 'auth/user-not-found') return 'No account found for this email. Please sign up first.';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Incorrect password.';
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/too-many-requests') return 'Too many login attempts. Please try again later.';
  return error && error.message ? error.message : 'Unable to log in right now.';
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
    <div class="message" id="login-message"></div>
    <div class="switch-link">Don't have an account? <span id="to-signup" style="color:#102cac;cursor:pointer;text-decoration:underline;">Sign up here!</span></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
    form.onsubmit = async function(e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const message = document.getElementById('login-message');

      if (!email || !password) {
        message.innerText = 'Please enter both email and password.';
        return;
      }

      const normalizedEmail = email.toLowerCase();
      let currentUserName = normalizedEmail;

      try {
        const firebaseUser = await signInFirebaseEmailUser(email, password);
        const firebaseDisplayName = firebaseUser && firebaseUser.displayName ? String(firebaseUser.displayName).trim() : '';
        currentUserName = firebaseDisplayName || normalizedEmail;
      } catch (error) {
        message.innerText = mapLoginError(error);
        return;
      }

      let membership = null;
      try {
        membership = await findApartmentForUser(normalizedEmail);
        if (!membership && currentUserName && currentUserName !== normalizedEmail) {
          membership = await findApartmentForUser(currentUserName);
          if (membership && membership.code) {
            try {
              membership = await ensureMemberInApartment(membership.code, normalizedEmail);
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
}

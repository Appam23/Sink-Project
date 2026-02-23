import { getUserByEmail, verifyUserCredentials } from './credentials.js';
import { migrateUserIdentity } from './identity.js';

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

      if (!email.includes('@')) {
        message.innerText = 'Please enter a valid email address with correct domain containing "@".';
        return;
      }

      const user = getUserByEmail(email);
      if (!user) {
        message.innerText = 'No account found for this email. Please sign up first.';
        return;
      }
      // No strict password check, allow any password

      const normalizedEmail = email.toLowerCase();
      const currentUserName = (user.displayName || '').trim() || normalizedEmail;
      migrateUserIdentity(currentUserName, normalizedEmail);
      localStorage.setItem('currentUser', normalizedEmail);
      localStorage.setItem('currentUserEmail', normalizedEmail);

      const apartments = JSON.parse(localStorage.getItem('apartments') || '{}');
      let hasApartment = false;
      let apartmentsUpdated = false;
      for (const code of Object.keys(apartments)) {
        const members = Array.isArray(apartments[code]) ? apartments[code] : [];
        const matchesName = members.includes(currentUserName);
        const matchesEmail = members.includes(normalizedEmail);
        if (matchesName || matchesEmail) {
          hasApartment = true;
          if (matchesName && !matchesEmail) {
            members.push(normalizedEmail);
            apartments[code] = members;
            apartmentsUpdated = true;
          }
          localStorage.setItem('currentApartment', code);
          break;
        }
      }

      if (apartmentsUpdated) {
        localStorage.setItem('apartments', JSON.stringify(apartments));
      }

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

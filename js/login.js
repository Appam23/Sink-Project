import { getUserByEmail, verifyUserCredentials } from './credentials.js';

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

      const user = getUserByEmail(email);
      if (!user) {
        message.innerText = 'No account found for this email. Please sign up first.';
        return;
      }

      const valid = await verifyUserCredentials(email, password);
      if (!valid) {
        message.innerText = 'Incorrect password.';
        return;
      }

      const normalizedEmail = email.toLowerCase();
      localStorage.setItem('currentUser', normalizedEmail);

      const apartments = JSON.parse(localStorage.getItem('apartments') || '{}');
      let hasApartment = false;
      for (const code of Object.keys(apartments)) {
        if (apartments[code].includes(normalizedEmail)) {
          hasApartment = true;
          localStorage.setItem('currentApartment', code);
          break;
        }
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

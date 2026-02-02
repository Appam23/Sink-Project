import { renderProfilePage } from './profile.js';
export function renderLoginForm(container, renderWelcomePageWithEvents, renderSignupForm) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const form = document.createElement('form');
  form.id = 'login-form';
  form.innerHTML = `
    <button type="button" id="back-btn">&#8592; Back</button>
    <h2 id="form-title">Login</h2>
    <input type="text" id="login-email" placeholder="Email" required />
    <input type="password" id="login-password" placeholder="Password" required />
    <button type="submit" id="sub-login" class="main-btn">Login</button>
    <div class="message" id="login-message"></div>
    <div class="switch-link">Don't have an account? <span id="to-signup" style="color:#102cac;cursor:pointer;text-decoration:underline;">Sign up here!</span></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
    form.onsubmit = function(e) {
      e.preventDefault();
      // For now, just use the entered email as the user name
      const email = document.getElementById('login-email').value.trim();
      if (email) {
        renderProfilePage(container, email);
      } else {
        document.getElementById('login-message').innerText = 'Please enter your email.';
      }
    };
  // Add event for sign up link
  const toSignup = form.querySelector('#to-signup');
  if (toSignup && typeof renderSignupForm === 'function') {
    toSignup.onclick = () => renderSignupForm(container, renderWelcomePageWithEvents, renderLoginForm);
  }
}

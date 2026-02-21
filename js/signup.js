import { createUser } from './credentials.js';

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
  form.onsubmit = async function(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const message = document.getElementById('signup-message');

    if (!email || !password) {
      message.innerText = 'Please enter both email and password.';
      return;
    }

    try {
      await createUser(email, password, name);
      localStorage.setItem('currentUser', email.toLowerCase());
      window.location.href = 'apartment_code.html';
    } catch (error) {
      message.innerText = error && error.message ? error.message : 'Unable to create account.';
    }
  };
}

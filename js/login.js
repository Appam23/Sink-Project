export function renderLoginForm(container, renderWelcomePageWithEvents) {
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
    <button type="submit">Login</button>
    <div class="message" id="login-message"></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
  form.onsubmit = function(e) {
    e.preventDefault();
    document.getElementById('login-message').innerText = 'Login attempted!';
  };
}

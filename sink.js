document.addEventListener('DOMContentLoaded', function() {
  const container = document.querySelector('.container');
  const showLoginBtn = document.getElementById('show-login');
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', function() {
      renderLoginForm();
    });
  }
  function renderWelcomePage() {
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.innerHTML = `
      <img src="Logo.png" alt="Logo" class="logo-img" />
      <img src="Sink.jpg" alt="Sink Logo" class="welcome-img" />
      <h2 id="welcome-title">Welcome!!</h2>
      <button id="show-login" class="main-btn">Log In</button>
      <button id="show-signup" class="main-btn">Sign Up</button>
    `;
    attachWelcomeEvents();
  }

  function renderLoginForm() {
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
    form.querySelector('#back-btn').onclick = renderWelcomePage;
    form.onsubmit = function(e) {
      e.preventDefault();
      document.getElementById('login-message').innerText = 'Login attempted!';
    };
  }

  function attachWelcomeEvents() {
    const showLoginBtn = document.getElementById('show-login');
    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', renderLoginForm);
    }
    // You can add similar logic for sign up here if needed
  }

  // Initial page load
  attachWelcomeEvents();
});


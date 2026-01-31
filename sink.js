document.addEventListener('DOMContentLoaded', function() {
  const container = document.querySelector('.container');
  const showLoginBtn = document.getElementById('show-login');
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', function() {
      // Clear container
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      // Create login form
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
      // Back button returns to welcome
      form.querySelector('#back-btn').onclick = function() {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.innerHTML = `
          <img src="Sink.jpg" alt="Sink Logo" style="width: 80px; display: block; margin: 0 auto 16px auto;" />
          <h2 id="welcome-title">Welcome</h2>
          <button id="show-login" class="main-btn">Log In</button>
          <button id="show-signup" class="main-btn">Sign Up</button>
        `;
        // Re-attach login event
        const showLoginBtn2 = document.getElementById('show-login');
        if (showLoginBtn2) {
          showLoginBtn2.addEventListener('click', arguments.callee.caller);
        }
      };
      // (Optional) Add login logic here
      form.onsubmit = function(e) {
        e.preventDefault();
        // Add your login logic here
        document.getElementById('login-message').innerText = 'Login attempted!';
      };
    });
  }
});


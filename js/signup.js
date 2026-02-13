export function renderSignupForm(container, renderWelcomePageWithEvents, renderLoginForm) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const form = document.createElement('form');
  form.id = 'signup-form';
  form.innerHTML = `
    <button type="button" id="back-btn">&#8592; Back</button>
    <input type="text" id="signup-email" placeholder="Email or Phone number" required />
    
    <button type="submit" id="sub-signup" class="main-btn">Sign Up</button>
    <div class="message" id="signup-message"></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
  form.onsubmit = function(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    if (email) {
      localStorage.setItem('currentUser', email);
      window.location.href = 'apartment_code.html';
    } else {
      document.getElementById('signup-message').innerText = 'Please enter your email.';
    }
  };
}

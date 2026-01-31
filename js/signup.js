export function renderSignupForm(container, renderWelcomePageWithEvents) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const form = document.createElement('form');
  form.id = 'signup-form';
  form.innerHTML = `
    <button type="button" id="back-btn">&#8592; Back</button>
    <h2 id="form-title">Sign Up</h2>
    <input type="text" id="signup-name" placeholder="First" required />
    <input type="text" id="signup-name" placeholder="Last" required />
    <input type="text" id="signup-name" placeholder="Age" required />
    <input type="text" id="signup-email" placeholder="Email" required />
    <input type="text" id="Phone" placeholder="Mobile" required />
    <input type="password" id="signup-password" placeholder="Password" required />
    <button type="submit">Sign Up</button>
    <div class="message" id="signup-message"></div>
  `;
  container.appendChild(form);
  form.querySelector('#back-btn').onclick = () => renderWelcomePageWithEvents();
  form.onsubmit = function(e) {
    e.preventDefault();
    document.getElementById('signup-message').innerText = 'Sign up attempted!';
  };
}

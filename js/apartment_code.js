import { renderHomePage } from './home.js';

export function renderApartmentCodePage(container, userName = 'You', renderBack) {
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	const page = document.createElement('div');
	page.className = 'apartment-code-page';
	page.innerHTML = `
		<button type="button" id="back-btn">&#8592; Back</button>
		<h2>Move into an apartment</h2>
		<div class="apartment-option">
			<h3>First to join from your apartment?</h3>
			<p>Responsible to create apartment code.</p>
			<button type="button" class="main-btn" id="create-apartment-code">Create apartment code</button>
			<button type="button" class="main-btn" id="continue-after-create">Continue</button>
			<div class="message" id="created-code"></div>
		</div>

		<div class="apartment-option">
			<h3>Have a code from the roommate?</h3>
			<input type="text" id="join-apartment-code" placeholder="Enter apartment code" />
			<button type="button" class="main-btn" id="join-apartment-btn">Join with code</button>
			<div class="message" id="join-code-message"></div>
		</div>
	`;

	container.appendChild(page);

	const backBtn = page.querySelector('#back-btn');
	if (backBtn) {
		backBtn.addEventListener('click', () => {
			if (typeof renderBack === 'function') {
				renderBack();
			} else {
				window.location.reload();
			}
		});
	}

	const createBtn = page.querySelector('#create-apartment-code');
	const continueBtn = page.querySelector('#continue-after-create');
	const createdCode = page.querySelector('#created-code');
	if (createBtn && createdCode) {
		createBtn.addEventListener('click', () => {
			const code = Math.random().toString(36).slice(2, 8).toUpperCase();
			createdCode.textContent = `Your apartment code: ${code}`;
			// persist new apartment with this user as first member
			const apartmentsRaw = localStorage.getItem('apartments');
			const apartments = apartmentsRaw ? JSON.parse(apartmentsRaw) : {};
			apartments[code] = apartments[code] || [];
			if (!apartments[code].includes(userName)) apartments[code].push(userName);
			localStorage.setItem('apartments', JSON.stringify(apartments));
			localStorage.setItem('currentApartment', code);
			localStorage.setItem('currentUser', userName);
		});
	}
	if (continueBtn) {
		continueBtn.addEventListener('click', () => {
			const txt = createdCode.textContent || '';
			const m = txt.match(/([A-Z0-9]{6})/);
			const code = m ? m[1] : localStorage.getItem('currentApartment');
			renderHomePage(container, userName, code);
		});
	}

	const joinBtn = page.querySelector('#join-apartment-btn');
	const joinInput = page.querySelector('#join-apartment-code');
	const joinMessage = page.querySelector('#join-code-message');
	if (joinBtn && joinInput && joinMessage) {
		joinBtn.addEventListener('click', () => {
			const code = joinInput.value.trim().toUpperCase();
			if (!code) {
				joinMessage.textContent = 'Please enter a code.';
				return;
			}
			const apartmentsRaw = localStorage.getItem('apartments');
			const apartments = apartmentsRaw ? JSON.parse(apartmentsRaw) : {};
			if (!apartments[code]) {
				joinMessage.textContent = 'Apartment code not found.';
				return;
			}
			if (!apartments[code].includes(userName)) apartments[code].push(userName);
			localStorage.setItem('apartments', JSON.stringify(apartments));
			localStorage.setItem('currentApartment', code);
			localStorage.setItem('currentUser', userName);
			joinMessage.textContent = `Joining apartment with code: ${code}`;
			renderHomePage(container, userName, code);
		});
	}
}

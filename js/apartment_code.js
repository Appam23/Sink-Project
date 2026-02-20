import { requireApartmentMembership, getUserApartmentCode } from './auth.js';

const MAX_ROOMMATES = 12;

export function renderApartmentCodePage(container, userName = 'You', renderBack) {
	clearContainer(container);
	const page = createPageStructure();
	container.appendChild(page);
	setupEventListeners(page, container, userName, renderBack);
}

function clearContainer(container) {
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
}

function createPageStructure() {
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
	return page;
}

function setupEventListeners(page, container, userName, renderBack) {
	setupBackButton(page, userName);
	setupCreateCodeSection(page, container, userName);
	setupJoinCodeSection(page, container, userName);
	setupFooterNavigation(page, container, userName);
}

function setupBackButton(page, userName) {
	const backBtn = page.querySelector('#back-btn');
	if (!backBtn) return;

	backBtn.addEventListener('click', () => {
		const apartments = getApartments();
		const apartmentCode = getUserApartmentCode(userName, apartments);
		if (!apartmentCode) {
			window.location.href = 'index.html';
			return;
		}
		window.history.back();
	});
}

function setupCreateCodeSection(page, container, userName) {
	const createBtn = page.querySelector('#create-apartment-code');
	const continueBtn = page.querySelector('#continue-after-create');
	const createdCode = page.querySelector('#created-code');
	// Hide Continue button initially
	if (continueBtn) {
		continueBtn.style.display = 'none';
	}

	  if (createBtn && createdCode && continueBtn) {
		   createBtn.addEventListener('click', () => {
			   const code = generateApartmentCode();
			   createdCode.textContent = `Your apartment code: ${code}`;
			   saveNewApartment(code, userName);
			   createBtn.style.display = 'none';
			   continueBtn.style.display = '';
		   });
	}

	if (continueBtn) {
		continueBtn.addEventListener('click', () => {
			const code = extractCodeFromMessage(createdCode.textContent);
			if (code) {
				window.location.href = 'home.html';
			}
		});
	}
}

function setupJoinCodeSection(page, container, userName) {
	const joinBtn = page.querySelector('#join-apartment-btn');
	const joinInput = page.querySelector('#join-apartment-code');
	const joinMessage = page.querySelector('#join-code-message');

	if (!joinBtn || !joinInput || !joinMessage) return;

	joinBtn.addEventListener('click', () => {
		const code = joinInput.value.trim().toUpperCase();

		if (!code) {
			joinMessage.textContent = 'Please enter a code.';
			return;
		}

		const apartments = getApartments();
		if (!apartments[code]) {
			joinMessage.textContent = 'Apartment code not found.';
			return;
		}

		const isAlreadyMember = apartments[code].includes(userName);
		if (!isAlreadyMember && apartments[code].length >= MAX_ROOMMATES) {
			joinMessage.textContent = 'Sorry! This apartment is full!';
			return;
		}

		if (!isAlreadyMember) {
			apartments[code].push(userName);
		}
		localStorage.setItem('apartments', JSON.stringify(apartments));
		localStorage.setItem('currentApartment', code);
		localStorage.setItem('currentUser', userName);

		joinMessage.textContent = `Joining apartment with code: ${code}`;
		window.location.href = 'home.html';
	});
}

function setupFooterNavigation(page, container, userName) {
	// No footer navigation on apartment code page - this is a temporary page
}

function generateApartmentCode() {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function saveNewApartment(code, userName) {
	const apartments = getApartments();
	const apartmentOwnersRaw = localStorage.getItem('apartmentOwners');
	const apartmentOwners = apartmentOwnersRaw ? JSON.parse(apartmentOwnersRaw) : {};
	apartments[code] = apartments[code] || [];
	if (!apartments[code].includes(userName)) {
		apartments[code].push(userName);
	}
	apartmentOwners[code] = userName;
	localStorage.setItem('apartments', JSON.stringify(apartments));
	localStorage.setItem('apartmentOwners', JSON.stringify(apartmentOwners));
	localStorage.setItem('currentApartment', code);
	localStorage.setItem('currentUser', userName);
}

function getApartments() {
	const apartmentsRaw = localStorage.getItem('apartments');
	return apartmentsRaw ? JSON.parse(apartmentsRaw) : {};
}

function extractCodeFromMessage(message) {
	const match = message.match(/([A-Z0-9]{6})/);
	return match ? match[1] : localStorage.getItem('currentApartment');
}

document.addEventListener('DOMContentLoaded', function() {
	const container = document.getElementById('app-container');
	if (container) {
		const access = requireApartmentMembership({ redirectIfHasApartment: 'home.html' });
		if (!access) return;
		if (access.apartmentCode) return;
		const userName = access.currentUser;
		renderApartmentCodePage(container, userName);
	}
});
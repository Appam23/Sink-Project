import { requireApartmentMembershipAsync } from './auth.js';
import { createApartment, findApartmentForUser, joinApartment } from './apartments.js';

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

	backBtn.addEventListener('click', async () => {
		try {
			const apartment = await findApartmentForUser(userName);
			if (!apartment || !apartment.code) {
				window.location.href = 'index.html';
				return;
			}
			window.history.back();
		} catch (_error) {
			window.location.href = 'index.html';
		}
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
		   createBtn.addEventListener('click', async () => {
			   createBtn.disabled = true;
			   let created = null;
			   for (let attempt = 0; attempt < 8; attempt += 1) {
				   const code = generateApartmentCode();
				   try {
					   await createApartment(code, userName);
					   created = code;
					   break;
				   } catch (error) {
					   if (!String(error && error.message || '').includes('already exists')) {
						   createdCode.textContent = 'Unable to create apartment code right now. Please try again.';
						   createBtn.disabled = false;
						   return;
					   }
				   }
			   }

			   if (!created) {
				   createdCode.textContent = 'Unable to create a unique code right now. Please try again.';
				   createBtn.disabled = false;
				   return;
			   }

			   createdCode.textContent = `Your apartment code: ${created}`;
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

	joinBtn.addEventListener('click', async () => {
		const code = joinInput.value.trim().toUpperCase();

		if (!code) {
			joinMessage.textContent = 'Please enter a code.';
			return;
		}

		try {
			await joinApartment(code, userName, MAX_ROOMMATES);
			joinMessage.textContent = `Joining apartment with code: ${code}`;
			window.location.href = 'home.html';
		} catch (error) {
			const message = String(error && error.message || '').toLowerCase();
			if (message.includes('not found')) {
				joinMessage.textContent = 'Apartment code not found.';
				return;
			}
			if (message.includes('full')) {
				joinMessage.textContent = 'Sorry! This apartment is full!';
				return;
			}
			joinMessage.textContent = 'Unable to join this apartment right now. Please try again.';
		}
	});
}

function setupFooterNavigation(page, container, userName) {
	// No footer navigation on apartment code page - this is a temporary page
}

function generateApartmentCode() {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function extractCodeFromMessage(message) {
	const match = message.match(/([A-Z0-9]{6})/);
	return match ? match[1] : null;
}

document.addEventListener('DOMContentLoaded', async function() {
	const container = document.getElementById('app-container');
	if (container) {
		try {
			const access = await requireApartmentMembershipAsync({ redirectIfHasApartment: 'home.html' });
			if (!access) return;
			if (access.apartmentCode) return;
			const userName = access.currentUser;
			renderApartmentCodePage(container, userName);
		} catch (error) {
			console.error('Unable to load apartment page:', error);
			container.innerHTML = '<div class="message">Unable to load apartment setup right now. Please refresh and try again.</div>';
		}
	}
});
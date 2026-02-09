import { renderProfilePage } from './profile.js';

export function renderHomePage(container, userName = 'You', apartmentCode = null) {
  // Clear container
  container.innerHTML = '';

  // Determine apartment code and members from localStorage
  const apartmentsRaw = localStorage.getItem('apartments');
  const apartments = apartmentsRaw ? JSON.parse(apartmentsRaw) : {};

  let code = apartmentCode;
  let members = [];

  if (!code) {
    // Try to find an apartment that contains this user
    for (const k of Object.keys(apartments)) {
      const arr = apartments[k] || [];
      if (arr.includes(userName)) {
        code = k;
        members = arr;
        break;
      }
    }
  } else {
    members = apartments[code] || [];
  }

  // Exclude the current user from the roommates list
  const currentUser = localStorage.getItem('currentUser') || userName;
  if (members && Array.isArray(members)) {
    members = members.filter((m) => m !== currentUser);
  }

  // Header area
  const page = document.createElement('div');
  page.className = 'home-page';
  page.innerHTML = `
    <div class="home-header">
      <div class="home-left">
        <div class="home-profile-pic">
          <img id="home-profile-pic" src="" alt="Your profile" />
        </div>
        <button id="edit-profile-btn" class="main-btn small">Edit Profile</button>
      </div>
      <div class="home-right">
        <div id="home-username" class="home-username"></div>
      </div>
    </div>

    <div class="home-body">
      <h3>Apartment Code</h3>
      <div id="apartment-code-display" class="apartment-code-display"></div>

      <h3>Roommates</h3>
      <div id="roommates-list" class="roommates-list"></div>
    </div>

    <button id="logout-btn" class="quit-btn logout-bottom-right">Log Out</button>
  `;

  container.appendChild(page);

  // Attach centralized footer (Home/Calendar/Tasks/Message)
  import('./footer.js').then(mod => {
    try {
      if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);

      // After footer is attached, optionally override the Message button to open group chat
      try {
        const footer = container.querySelector('.profile-footer');
        const msgBtn = footer ? footer.querySelector('#footer-message') : null;
        if (msgBtn) {
          msgBtn.addEventListener('click', async () => {
            try {
              const mod2 = await import('./group_chat.js');
              if (mod2 && typeof mod2.renderGroupChatPage === 'function') {
                mod2.renderGroupChatPage(container, userName);
              } else {
                // fallback to profile
                const pmod = await import('./profile.js');
                if (pmod && typeof pmod.renderProfilePage === 'function') pmod.renderProfilePage(container, userName);
              }
            } catch (e) {
              console.error('Failed to open group chat from footer message button:', e);
            }
          });
        }
      } catch (e) {
        console.error('Error wiring footer message button in home.js:', e);
      }

    } catch (err) {
      console.error('Error attaching footer in home.js:', err);
    }
  }).catch(err => console.error('Failed to load footer module in home.js:', err));

  // Load current user's profile picture if available
  const profilesRaw = localStorage.getItem('profiles');
  const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
  const myProfile = profiles[currentUser] || {};

  const formatName = (value) => {
    const trimmed = (value || '').trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const getDisplayName = (profile, fallback) => {
    const first = formatName(profile.firstName);
    const last = formatName(profile.lastName);
    const full = `${first} ${last}`.trim();
    return full || fallback;
  };

  // Set username
  const usernameEl = page.querySelector('#home-username');
  if (usernameEl) usernameEl.textContent = getDisplayName(myProfile, currentUser || userName);
  const myPicEl = page.querySelector('#home-profile-pic');
  if (myPicEl) {
    myPicEl.src = myProfile.picture || 'https://via.placeholder.com/64';
  }

  // Apartment code display
  const codeDisplay = page.querySelector('#apartment-code-display');
  if (codeDisplay) {
    codeDisplay.textContent = code ? code : 'No apartment yet. Please create or join from your profile.';
  }

  // Roommates list
  const listEl = page.querySelector('#roommates-list');
  if (listEl) {
    if (!members || members.length === 0) {
      listEl.innerHTML = '<div class="no-roommates">No roommates yet.</div>';
    } else {
      listEl.innerHTML = '';
      members.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'roommate-row';
        const memberProfile = profiles[m] || {};
        const memberDisplay = getDisplayName(memberProfile, m);
        row.innerHTML = `
          <img src="${memberProfile.picture || 'https://via.placeholder.com/48'}" class="roommate-pic" />
          <div class="roommate-name">${memberDisplay}</div>
        `;
        listEl.appendChild(row);
      });
    }
  }

  // Edit profile button
  const editBtn = page.querySelector('#edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      renderProfilePage(container, userName);
    });
  }

  // Logout button
  const logoutBtn = page.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('currentApartment');
      window.location.href = 'index.html';
    });
  }
}

export default renderHomePage;

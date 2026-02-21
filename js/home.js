import { renderProfilePage } from './profile.js';
import { requireApartmentMembership } from './auth.js';
import { clearUserNotifications, getUserNotifications, markAllNotificationsRead } from './notifications.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';

function parseJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getApartments() {
  return parseJsonStorage('apartments', {});
}

function saveApartments(apartments) {
  localStorage.setItem('apartments', JSON.stringify(apartments));
}

function getApartmentOwners() {
  return parseJsonStorage('apartmentOwners', {});
}

function saveApartmentOwners(owners) {
  localStorage.setItem('apartmentOwners', JSON.stringify(owners));
}

function getApartmentOwner(code, apartments, owners) {
  if (!code) return null;
  const explicitOwner = owners[code];
  if (explicitOwner) return explicitOwner;
  const members = apartments[code] || [];
  return members[0] || null;
}

function getApartmentCodeForUser(userName, apartments) {
  const currentApartment = localStorage.getItem('currentApartment');
  if (currentApartment && Array.isArray(apartments[currentApartment]) && apartments[currentApartment].includes(userName)) {
    return currentApartment;
  }

  for (const code of Object.keys(apartments)) {
    const members = apartments[code] || [];
    if (members.includes(userName)) return code;
  }

  return null;
}

function removeApartmentScopedData(apartmentCode) {
  if (!apartmentCode) return;
  const suffix = `_${apartmentCode}`;
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && key.endsWith(suffix)) {
      localStorage.removeItem(key);
    }
  }
}

function scrubUserFromApartmentData(apartmentCode, userName) {
  if (!apartmentCode || !userName) return;

  const messageKey = `groupChatMessages_${apartmentCode}`;
  const messages = parseJsonStorage(messageKey, []);
  if (Array.isArray(messages)) {
    const filteredMessages = messages.filter((msg) => msg && msg.sender !== userName);
    if (filteredMessages.length > 0) {
      localStorage.setItem(messageKey, JSON.stringify(filteredMessages));
    } else {
      localStorage.removeItem(messageKey);
    }
  }

  const tasksKey = `tasks_${apartmentCode}`;
  const tasks = parseJsonStorage(tasksKey, []);
  if (Array.isArray(tasks)) {
    const filteredTasks = tasks.filter((task) => task && task.assignee !== userName);
    if (filteredTasks.length > 0) {
      localStorage.setItem(tasksKey, JSON.stringify(filteredTasks));
    } else {
      localStorage.removeItem(tasksKey);
    }
  }
}

function removeUserFromApartment(apartmentCode, userName, apartments, owners) {
  const members = apartments[apartmentCode] || [];
  const filteredMembers = members.filter((member) => member !== userName);

  if (filteredMembers.length === 0) {
    delete apartments[apartmentCode];
    delete owners[apartmentCode];
    removeApartmentScopedData(apartmentCode);
    return;
  }

  apartments[apartmentCode] = filteredMembers;
  const currentOwner = getApartmentOwner(apartmentCode, apartments, owners);
  if (currentOwner === userName || !currentOwner) {
    owners[apartmentCode] = filteredMembers[0];
  }
}

function deleteUserAccountData(userName) {
  const apartments = getApartments();
  const owners = getApartmentOwners();

  Object.keys(apartments).forEach((apartmentCode) => {
    const members = apartments[apartmentCode] || [];
    if (!members.includes(userName)) {
      scrubUserFromApartmentData(apartmentCode, userName);
      return;
    }

    removeUserFromApartment(apartmentCode, userName, apartments, owners);
    if (apartments[apartmentCode]) {
      scrubUserFromApartmentData(apartmentCode, userName);
    }
  });

  const profiles = parseJsonStorage('profiles', {});
  if (profiles[userName]) {
    delete profiles[userName];
    localStorage.setItem('profiles', JSON.stringify(profiles));
  }

  saveApartments(apartments);
  saveApartmentOwners(owners);
}

function renderHomePage(container, userName = 'You', apartmentCode = null) {
  // Clear container
  container.innerHTML = '';

  // Determine apartment code and members from localStorage
  const apartments = getApartments();
  const owners = getApartmentOwners();

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
  const apartmentOwner = getApartmentOwner(code, apartments, owners);
  const apartmentMemberCount = Array.isArray(members) ? members.length : 0;
  const canLeaveApartment = apartmentMemberCount > 1;
  const canDeleteApartment = !!code && apartmentOwner === currentUser;

  if (code && apartmentOwner && !owners[code]) {
    owners[code] = apartmentOwner;
    saveApartmentOwners(owners);
  }

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
        <div class="home-user-meta">
          <div id="home-username" class="home-username"></div>
          <button id="notifications-btn" class="notifications-btn" aria-label="Open notifications">
            <span class="notifications-bell">🔔</span>
            <span id="notifications-count" class="notifications-count hidden">0</span>
          </button>
        </div>
      </div>
    </div>

    <div id="notifications-popup" class="notifications-popup hidden" role="dialog" aria-label="Notifications">
      <div class="notifications-popup-header">
        <button id="clear-notifications-btn" type="button" class="clear-notifications-btn">Clear All</button>
      </div>
      <div id="notifications-list" class="notifications-list"></div>
    </div>

    <div class="home-body">
      <h3>Apartment Code</h3>
      <div id="apartment-code-display" class="apartment-code-display"></div>

      <h3>Roommates</h3>
      <div id="roommates-list" class="roommates-list"></div>
    </div>

    <button id="logout-btn" class="quit-btn logout-bottom-right">Log Out</button>

    <button id="settings-btn" class="settings-floating-btn" aria-label="Open settings">
      <svg viewBox="0 0 24 24" class="settings-gear-icon" aria-hidden="true">
        <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.2 7.2 0 0 0-1.69-.98l-.38-2.65a.5.5 0 0 0-.5-.42h-4a.5.5 0 0 0-.5.42L8.11 5.07c-.6.24-1.16.56-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.05.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.53.42 1.1.74 1.69.98l.38 2.65a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.6-.24 1.16-.56 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"></path>
      </svg>
    </button>

    <div id="settings-popup" class="settings-popup hidden" role="dialog" aria-label="Apartment settings">
      <button id="leave-apartment-btn" class="settings-action-btn ${canLeaveApartment ? '' : 'hidden'}">Leave Apartment</button>
      <button id="delete-apartment-btn" class="settings-action-btn quit-btn ${canDeleteApartment ? '' : 'hidden'}">Delete Apartment</button>
      <button id="delete-account-btn" class="settings-action-btn quit-btn">Delete Account</button>
    </div>
  `;

  container.appendChild(page);

  // Attach centralized footer (Home/Calendar/Tasks/Message)
  import('./footer.js').then(mod => {
    try {
      if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);
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

  const getProfileValue = (value) => {
    const normalized = (value || '').toString().trim();
    return normalized || 'Not provided';
  };

  const showRoommateProfilePopup = (memberDisplay, memberProfile = {}) => {
    const overlay = document.createElement('div');
    overlay.className = 'roommate-profile-overlay';
    overlay.innerHTML = `
      <div class="roommate-profile-card" role="dialog" aria-label="Roommate profile">
        <div class="roommate-profile-header">
          <img src="${memberProfile.picture || DEFAULT_PROFILE_PICTURE}" class="roommate-profile-image" alt="${memberDisplay} profile" />
          <div class="roommate-profile-name">${memberDisplay}</div>
        </div>
        <div class="roommate-profile-info">
          <div class="roommate-profile-line"><strong>Bio:</strong> ${getProfileValue(memberProfile.bio)}</div>
          <div class="roommate-profile-line"><strong>Room No.:</strong> ${getProfileValue(memberProfile.roomNumber)}</div>
          <div class="roommate-profile-line"><strong>Phone:</strong> ${getProfileValue(memberProfile.phone)}</div>
        </div>
      </div>
    `;

    const card = overlay.querySelector('.roommate-profile-card');
    if (card) {
      card.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    }

    overlay.addEventListener('click', () => {
      overlay.remove();
    });

    document.body.appendChild(overlay);
  };

  // Set username
  const usernameEl = page.querySelector('#home-username');
  if (usernameEl) usernameEl.textContent = getDisplayName(myProfile, currentUser || userName);
  const myPicEl = page.querySelector('#home-profile-pic');
  if (myPicEl) {
    myPicEl.src = myProfile.picture || DEFAULT_PROFILE_PICTURE;
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
          <img src="${memberProfile.picture || DEFAULT_PROFILE_PICTURE}" class="roommate-pic" />
          <div class="roommate-name">${memberDisplay}</div>
        `;
        row.addEventListener('click', () => {
          showRoommateProfilePopup(memberDisplay, memberProfile);
        });
        listEl.appendChild(row);
      });
    }
  }

  // Edit profile button
  const editBtn = page.querySelector('#edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      window.location.href = 'profile.html';
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

  const settingsBtn = page.querySelector('#settings-btn');
  const settingsPopup = page.querySelector('#settings-popup');
  const leaveApartmentBtn = page.querySelector('#leave-apartment-btn');
  const deleteApartmentBtn = page.querySelector('#delete-apartment-btn');
  const deleteAccountBtn = page.querySelector('#delete-account-btn');
  const notificationsBtn = page.querySelector('#notifications-btn');
  const notificationsPopup = page.querySelector('#notifications-popup');
  const notificationsList = page.querySelector('#notifications-list');
  const notificationsCount = page.querySelector('#notifications-count');
  const clearNotificationsBtn = page.querySelector('#clear-notifications-btn');

  let notifications = getUserNotifications(currentUser, code);

  function renderNotifications() {
    if (!notificationsList || !notificationsCount) return;

    const unreadCount = notifications.filter((notification) => !notification.read).length;
    if (unreadCount > 0) {
      notificationsCount.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      notificationsCount.classList.remove('hidden');
    } else {
      notificationsCount.classList.add('hidden');
    }

    if (notifications.length === 0) {
      notificationsList.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
      return;
    }

    notificationsList.innerHTML = '';
    notifications.forEach((notification) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'notification-item';
      item.textContent = notification.message || 'New notification';
      item.addEventListener('click', () => {
        const target = notification.link || 'home.html';
        window.location.href = target;
      });
      notificationsList.appendChild(item);
    });
  }

  renderNotifications();

  if (settingsBtn && settingsPopup) {
    settingsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      settingsPopup.classList.toggle('hidden');
      if (notificationsPopup) notificationsPopup.classList.add('hidden');
    });

    settingsPopup.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', () => {
      settingsPopup.classList.add('hidden');
      if (notificationsPopup) notificationsPopup.classList.add('hidden');
    });
  }

  if (notificationsBtn && notificationsPopup) {
    notificationsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      notifications = markAllNotificationsRead(currentUser, code);
      renderNotifications();
      notificationsPopup.classList.toggle('hidden');
      if (settingsPopup) settingsPopup.classList.add('hidden');
    });

    notificationsPopup.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', () => {
      clearUserNotifications(currentUser, code);
      notifications = [];
      renderNotifications();
    });
  }

  if (leaveApartmentBtn) {
    leaveApartmentBtn.addEventListener('click', () => {
      if (!code) {
        alert('You are not currently in an apartment.');
        return;
      }

      if (!canLeaveApartment) {
        alert('You cannot leave when you are the only roommate. Delete apartment instead.');
        return;
      }

      const shouldLeave = window.confirm('Leave this apartment? You can join another apartment later with a code.');
      if (!shouldLeave) return;

      const apartmentsState = getApartments();
      const ownersState = getApartmentOwners();
      const userApartmentCode = getApartmentCodeForUser(currentUser, apartmentsState);
      if (!userApartmentCode || !apartmentsState[userApartmentCode]) {
        localStorage.removeItem('currentApartment');
        window.location.href = 'apartment_code.html';
        return;
      }

      removeUserFromApartment(userApartmentCode, currentUser, apartmentsState, ownersState);
      saveApartments(apartmentsState);
      saveApartmentOwners(ownersState);
      localStorage.removeItem('currentApartment');
      window.location.href = 'apartment_code.html';
    });
  }

  if (deleteApartmentBtn) {
    deleteApartmentBtn.addEventListener('click', () => {
      const apartmentsState = getApartments();
      const ownersState = getApartmentOwners();
      const userApartmentCode = getApartmentCodeForUser(currentUser, apartmentsState);
      const owner = getApartmentOwner(userApartmentCode, apartmentsState, ownersState);

      if (!userApartmentCode || !apartmentsState[userApartmentCode]) {
        alert('No apartment found to delete.');
        return;
      }

      if (owner !== currentUser) {
        alert('Only the apartment creator can delete this apartment.');
        return;
      }

      const shouldDelete = window.confirm('Delete this apartment for everyone? This removes all apartment data and cannot be undone.');
      if (!shouldDelete) return;

      delete apartmentsState[userApartmentCode];
      delete ownersState[userApartmentCode];
      removeApartmentScopedData(userApartmentCode);
      saveApartments(apartmentsState);
      saveApartmentOwners(ownersState);
      localStorage.removeItem('currentApartment');
      window.location.href = 'apartment_code.html';
    });
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', () => {
      const shouldDelete = window.confirm('Delete your account permanently? This will remove your profile and apartment membership data.');
      if (!shouldDelete) return;

      deleteUserAccountData(currentUser);
      localStorage.removeItem('currentApartment');
      localStorage.removeItem('currentUser');
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('app-container');
  if (container) {
    const access = requireApartmentMembership();
    if (!access || !access.apartmentCode) return;
    const userName = access.currentUser;
    const apartmentCode = access.apartmentCode;
    renderHomePage(container, userName, apartmentCode);
  }
});

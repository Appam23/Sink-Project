import { requireApartmentMembershipAsync } from './auth.js';
import { clearUserNotifications, markAllNotificationsRead, subscribeToUserNotifications } from './notifications.js';
import { deleteUserProfile, getApartmentProfilesMap, saveUserProfile } from './profiles.js';
import { getFirebaseAuthCurrentUser, signOutFirebaseUser } from './firebase.js';
import {
  deleteApartmentByOwner,
  getApartmentByCode,
  leaveApartment,
  removeUserFromAllApartments,
} from './apartments.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';

async function deleteUserAccountData(userName, apartmentCode = null) {
  await removeUserFromAllApartments(userName);

  if (apartmentCode) {
    try {
      await deleteUserProfile(apartmentCode, userName);
    } catch (error) {
      console.warn('Unable to delete Firestore profile during account cleanup:', error);
    }
  }
}

async function renderHomePage(container, userName = 'You', apartmentCode = null, apartmentData = null) {
  // Clear container
  container.innerHTML = '';

  const code = apartmentCode;
  let members = Array.isArray(apartmentData && apartmentData.members) ? [...apartmentData.members] : [];

  // Exclude the current user from the roommates list
  const currentUser = userName;
  const apartmentOwner = apartmentData && apartmentData.owner ? apartmentData.owner : null;
  const apartmentMemberCount = Array.isArray(members) ? members.length : 0;
  const canLeaveApartment = apartmentMemberCount > 1;
  const canDeleteApartment = !!code && apartmentOwner === currentUser;

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
  const profiles = code ? await getApartmentProfilesMap(code) : {};
  const myProfile = profiles[currentUser] || {};
  const authUser = getFirebaseAuthCurrentUser();
  const signupDisplayName = authUser && authUser.displayName ? String(authUser.displayName).trim() : '';

  if (code && currentUser && signupDisplayName && !myProfile.firstName && !myProfile.lastName) {
    const nameParts = signupDisplayName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || signupDisplayName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    myProfile.firstName = firstName;
    myProfile.lastName = lastName;
    profiles[currentUser] = myProfile;

    saveUserProfile(code, currentUser, {
      firstName,
      lastName,
    }).catch((error) => {
      console.warn('Unable to persist signup display name to profile:', error);
    });
  }

  const formatName = (value) => {
    const trimmed = (value || '').trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const getDisplayName = (profile, fallback) => {
    const first = formatName(profile.firstName);
    const last = formatName(profile.lastName);
    const full = `${first} ${last}`.trim();
    if (full) return full;

    const fallbackValue = String(fallback || '').trim();
    if (!fallbackValue) return 'Roommate';
    const base = fallbackValue.includes('@') ? fallbackValue.split('@')[0] : fallbackValue;
    return formatName(base) || 'Roommate';
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
  if (usernameEl) usernameEl.textContent = getDisplayName(myProfile, signupDisplayName || currentUser || userName);
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
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOutFirebaseUser();
      } catch (error) {
        console.error('Failed to sign out:', error);
      }
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

  let notifications = [];
  let unsubscribeNotifications = null;

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

  unsubscribeNotifications = subscribeToUserNotifications(
    currentUser,
    code,
    (nextNotifications) => {
      notifications = Array.isArray(nextNotifications) ? nextNotifications : [];
      renderNotifications();
    },
    (error) => {
      console.error('Unable to subscribe to notifications:', error);
    }
  );

  const cleanupNotifications = () => {
    if (typeof unsubscribeNotifications === 'function') {
      unsubscribeNotifications();
      unsubscribeNotifications = null;
    }
  };
  window.addEventListener('pagehide', cleanupNotifications, { once: true });

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
    notificationsBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      notificationsPopup.classList.toggle('hidden');
      if (settingsPopup) settingsPopup.classList.add('hidden');

      try {
        notifications = await markAllNotificationsRead(currentUser, code);
        renderNotifications();
      } catch (error) {
        console.error('Unable to mark notifications as read:', error);
      }
    });

    notificationsPopup.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', async () => {
      try {
        await clearUserNotifications(currentUser, code);
        notifications = [];
        renderNotifications();
      } catch (error) {
        console.error('Unable to clear notifications:', error);
        alert('Unable to clear notifications right now. Please try again.');
      }
    });
  }

  if (leaveApartmentBtn) {
    leaveApartmentBtn.addEventListener('click', async () => {
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

      try {
        await leaveApartment(code, currentUser);
        window.location.href = 'apartment_code.html';
      } catch (error) {
        console.error('Failed to leave apartment:', error);
        alert('Unable to leave apartment right now. Please try again.');
      }
    });
  }

  if (deleteApartmentBtn) {
    deleteApartmentBtn.addEventListener('click', async () => {
      if (!code) {
        alert('No apartment found to delete.');
        return;
      }

      if (apartmentOwner !== currentUser) {
        alert('Only the apartment creator can delete this apartment.');
        return;
      }

      const shouldDelete = window.confirm('Delete this apartment for everyone? This removes all apartment data and cannot be undone.');
      if (!shouldDelete) return;

      try {
        await deleteApartmentByOwner(code, currentUser);
        window.location.href = 'apartment_code.html';
      } catch (error) {
        console.error('Failed to delete apartment:', error);
        alert(error && error.message ? error.message : 'Unable to delete apartment right now.');
      }
    });
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      const shouldDelete = window.confirm('Delete your account permanently? This will remove your profile and apartment membership data.');
      if (!shouldDelete) return;

      await deleteUserAccountData(currentUser, code);
      try {
        await signOutFirebaseUser();
      } catch (error) {
        console.error('Failed to sign out after account data cleanup:', error);
      }
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const container = document.getElementById('app-container');
  if (container) {
    const access = await requireApartmentMembershipAsync();
    if (!access || !access.apartmentCode) return;
    const userName = access.currentUser;
    const apartmentCode = access.apartmentCode;
    const apartmentData = await getApartmentByCode(apartmentCode);
    renderHomePage(container, userName, apartmentCode, apartmentData).catch((error) => {
      console.error('Unable to render home page:', error);
      alert('Unable to load home page right now. Please refresh and try again.');
    });
  }
});

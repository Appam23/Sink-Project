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
  container.classList.add('home-container');

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

    <div id="home-onboarding-modal" class="home-onboarding-modal hidden" role="dialog" aria-modal="true" aria-label="Bunk Buddies walkthrough">
      <div class="home-onboarding-panel">
        <div class="home-onboarding-topbar">
          <div id="home-onboarding-progress" class="home-onboarding-progress">1 / 4</div>
          <button type="button" id="home-onboarding-skip" class="home-onboarding-skip">Skip</button>
        </div>

        <div class="home-onboarding-slide">
          <h2 id="home-onboarding-title">Welcome to Bunk Buddies!</h2>
          <p id="home-onboarding-subtitle" class="home-onboarding-intro"></p>

          <div class="home-onboarding-spotlight">
            <div class="home-onboarding-spotlight-text">
              <h4 id="home-onboarding-feature-title"></h4>
              <p id="home-onboarding-feature-description"></p>
            </div>
            <div id="home-onboarding-feature-icon" class="home-onboarding-feature-icon" aria-hidden="true"></div>
          </div>

          <div id="home-onboarding-visual" class="home-onboarding-visual"></div>
        </div>

        <div id="home-onboarding-dots" class="home-onboarding-dots" aria-label="Walkthrough progress"></div>

        <div class="home-onboarding-actions">
          <button type="button" id="home-onboarding-back" class="home-onboarding-btn secondary">Back</button>
          <button type="button" id="home-onboarding-next" class="home-onboarding-btn primary">Next</button>
        </div>
      </div>
    </div>

    <button id="logout-btn" class="quit-btn logout-bottom-right">Log Out</button>

    <button id="settings-btn" class="settings-floating-btn" aria-label="Open settings">
      <svg viewBox="0 0 24 24" class="settings-gear-icon" aria-hidden="true">
        <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.2 7.2 0 0 0-1.69-.98l-.38-2.65a.5.5 0 0 0-.5-.42h-4a.5.5 0 0 0-.5.42L8.11 5.07c-.6.24-1.16.56-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.05.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.53.42 1.1.74 1.69.98l.38 2.65a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.6-.24 1.16-.56 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"></path>
      </svg>
    </button>

    <div id="settings-popup" class="settings-popup hidden" role="dialog" aria-label="Apartment settings">
      <button id="replay-onboarding-btn" class="settings-action-btn">Replay Walkthrough</button>
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
  const replayOnboardingBtn = page.querySelector('#replay-onboarding-btn');
  const leaveApartmentBtn = page.querySelector('#leave-apartment-btn');
  const deleteApartmentBtn = page.querySelector('#delete-apartment-btn');
  const deleteAccountBtn = page.querySelector('#delete-account-btn');
  const notificationsBtn = page.querySelector('#notifications-btn');
  const notificationsPopup = page.querySelector('#notifications-popup');
  const notificationsList = page.querySelector('#notifications-list');
  const notificationsCount = page.querySelector('#notifications-count');
  const clearNotificationsBtn = page.querySelector('#clear-notifications-btn');
  const onboardingModal = page.querySelector('#home-onboarding-modal');
  const onboardingTitle = page.querySelector('#home-onboarding-title');
  const onboardingSubtitle = page.querySelector('#home-onboarding-subtitle');
  const onboardingFeatureTitle = page.querySelector('#home-onboarding-feature-title');
  const onboardingFeatureDescription = page.querySelector('#home-onboarding-feature-description');
  const onboardingFeatureIcon = page.querySelector('#home-onboarding-feature-icon');
  const onboardingVisual = page.querySelector('#home-onboarding-visual');
  const onboardingProgress = page.querySelector('#home-onboarding-progress');
  const onboardingDots = page.querySelector('#home-onboarding-dots');
  const onboardingSkipBtn = page.querySelector('#home-onboarding-skip');
  const onboardingBackBtn = page.querySelector('#home-onboarding-back');
  const onboardingNextBtn = page.querySelector('#home-onboarding-next');

  let notifications = [];
  let unsubscribeNotifications = null;
  let onboardingIndex = 0;
  let onboardingMarkedSeen = !!myProfile.onboardingSeen;

  const getOnboardingIconMarkup = (key) => {
    if (key === 'calendar') {
      return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7ed957" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    }
    if (key === 'tasks') {
      return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" fill="#f5a623" stroke="#f5a623"/><path d="M9 12l2 2l4-4" stroke="#ffffff"/></svg>';
    }
    if (key === 'chat') {
      return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#b76cf4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
    return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#47d9ca" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  };

  const onboardingSlides = [
    {
      title: 'Welcome to Bunk Buddies!',
      subtitle: 'Bunk Buddies helps roommates stay organized with one shared place for planning, tasks, and communication.',
      featureTitle: 'What You Can Do',
      featureDescription: 'Use the quick walkthrough to see the three main features your apartment will use daily.',
      icon: 'welcome',
      visualHtml: `
        <div class="onboarding-mock-overview">
          <div class="onboarding-pill">Plan together</div>
          <div class="onboarding-pill">Share tasks</div>
          <div class="onboarding-pill">Stay in sync</div>
        </div>
      `,
    },
    {
      title: 'Calendar Feature',
      subtitle: 'Track events, schedules, and important dates so everyone stays on the same page.',
      featureTitle: 'Calendar',
      featureDescription: 'Add shared events and quickly see what is happening this week.',
      icon: 'calendar',
      visualHtml: `
        <div class="onboarding-mock-calendar">
          <div class="onboarding-mock-calendar-head"></div>
          <div class="onboarding-mock-calendar-grid">
            <span></span><span class="active"></span><span></span><span></span>
            <span></span><span></span><span class="active"></span><span></span>
          </div>
        </div>
      `,
    },
    {
      title: 'Task Feature',
      subtitle: 'Split chores and to-dos clearly, so everyone knows what to do next.',
      featureTitle: 'Tasks',
      featureDescription: 'Mark work as done and keep a visible list of what still needs attention.',
      icon: 'tasks',
      visualHtml: `
        <div class="onboarding-mock-tasks">
          <div class="task-row done"><span class="task-check"></span><span>Take out trash</span></div>
          <div class="task-row"><span class="task-check"></span><span>Kitchen cleanup</span></div>
          <div class="task-row"><span class="task-check"></span><span>Restock supplies</span></div>
        </div>
      `,
    },
    {
      title: 'Chat Feature',
      subtitle: 'Use group chat for quick updates, reminders, and apartment coordination.',
      featureTitle: 'Chat',
      featureDescription: 'Drop a fast message when plans change or when you need a roommate response.',
      icon: 'chat',
      visualHtml: `
        <div class="onboarding-mock-chat">
          <div class="bubble left">Movie night at 8?</div>
          <div class="bubble right">Works for me.</div>
          <div class="bubble left">Awesome, see you then.</div>
        </div>
      `,
    },
  ];

  function closeOnboarding() {
    if (onboardingModal) {
      onboardingModal.classList.add('hidden');
    }
  }

  async function markOnboardingSeenOnFirstOpen() {
    if (onboardingMarkedSeen || !code || !currentUser) return;
    onboardingMarkedSeen = true;
    myProfile.onboardingSeen = true;

    try {
      await saveUserProfile(code, currentUser, { onboardingSeen: true });
    } catch (error) {
      console.warn('Unable to save onboarding state:', error);
    }
  }

  function renderOnboardingDots() {
    if (!onboardingDots) return;
    onboardingDots.innerHTML = '';

    onboardingSlides.forEach((_, idx) => {
      const dot = document.createElement('span');
      dot.className = `home-onboarding-dot${idx === onboardingIndex ? ' active' : ''}`;
      onboardingDots.appendChild(dot);
    });
  }

  function renderOnboardingSlide() {
    const slide = onboardingSlides[onboardingIndex];
    if (!slide) return;

    if (onboardingTitle) onboardingTitle.textContent = slide.title;
    if (onboardingSubtitle) onboardingSubtitle.textContent = slide.subtitle;
    if (onboardingFeatureTitle) onboardingFeatureTitle.textContent = slide.featureTitle;
    if (onboardingFeatureDescription) onboardingFeatureDescription.textContent = slide.featureDescription;
    if (onboardingFeatureIcon) onboardingFeatureIcon.innerHTML = getOnboardingIconMarkup(slide.icon);
    if (onboardingVisual) onboardingVisual.innerHTML = slide.visualHtml;
    if (onboardingProgress) onboardingProgress.textContent = `${onboardingIndex + 1} / ${onboardingSlides.length}`;

    if (onboardingBackBtn) {
      onboardingBackBtn.disabled = onboardingIndex === 0;
    }

    if (onboardingNextBtn) {
      onboardingNextBtn.textContent = onboardingIndex === onboardingSlides.length - 1 ? 'Finish' : 'Next';
    }

    renderOnboardingDots();
  }

  function openOnboarding({ isReplay = false } = {}) {
    if (!onboardingModal) return;
    onboardingIndex = 0;
    renderOnboardingSlide();
    onboardingModal.classList.remove('hidden');

    if (!isReplay) {
      markOnboardingSeenOnFirstOpen();
    }
  }

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

  if (replayOnboardingBtn) {
    replayOnboardingBtn.addEventListener('click', () => {
      if (settingsPopup) settingsPopup.classList.add('hidden');
      openOnboarding({ isReplay: true });
    });
  }

  if (onboardingSkipBtn) {
    onboardingSkipBtn.addEventListener('click', () => {
      closeOnboarding();
    });
  }

  if (onboardingBackBtn) {
    onboardingBackBtn.addEventListener('click', () => {
      if (onboardingIndex <= 0) return;
      onboardingIndex -= 1;
      renderOnboardingSlide();
    });
  }

  if (onboardingNextBtn) {
    onboardingNextBtn.addEventListener('click', () => {
      const isLastSlide = onboardingIndex >= onboardingSlides.length - 1;
      if (isLastSlide) {
        closeOnboarding();
        return;
      }
      onboardingIndex += 1;
      renderOnboardingSlide();
    });
  }

  const shouldShowOnboarding = !myProfile.onboardingSeen;
  if (shouldShowOnboarding) {
    openOnboarding();
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

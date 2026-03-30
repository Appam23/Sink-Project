import { requireApartmentMembershipAsync } from './auth.js';
import { clearUserNotifications, markAllNotificationsRead, subscribeToUserNotifications } from './notifications.js';
import { deleteUserProfile, getApartmentProfilesMap, saveUserProfile } from './profiles.js';
import { getFirebaseAuthCurrentUser, signOutFirebaseUser } from './firebase.js';
import {
  clearAppBadgeCount,
  disablePushNotifications,
  enablePushNotifications,
  getNotificationsPreference,
  getPushAvailability,
  getResolvedVapidKey,
  initializePushMessaging,
  syncAppBadgeCount,
} from './push_notifications.js';
import {
  deleteApartmentByOwner,
  getApartmentByCode,
  leaveApartment,
  removeUserFromAllApartments,
} from './apartments.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg?v=20260310';

function extractSvgPayload(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith('data:image/svg+xml')) return '';

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) return '';

  const header = trimmed.slice(0, commaIndex).toLowerCase();
  const payload = trimmed.slice(commaIndex + 1);

  try {
    if (header.includes(';base64')) {
      return atob(payload).toLowerCase();
    }
    return decodeURIComponent(payload).toLowerCase();
  } catch {
    return payload.toLowerCase();
  }
}

function isLegacyDefaultProfilePicture(value) {
  const normalized = value && typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized.startsWith('data:image/svg+xml')) return false;

  const svgPayload = extractSvgPayload(value);
  const content = `${normalized}\n${svgPayload}`;

  const hasLegacyColor =
    content.includes('#7abdb4') ||
    content.includes('%237abdb4') ||
    content.includes('#e9f7f5') ||
    content.includes('%23e9f7f5') ||
    content.includes('#d7f0ec') ||
    content.includes('%23d7f0ec');

  if (hasLegacyColor) return true;

  // Fallback structural match for legacy default SVG variants.
  return (
    content.includes('viewbox="0 0 128 128"') &&
    content.includes('cx="64"') &&
    content.includes('cy="50"') &&
    content.includes('d="m24 112c4-22 20-34 40-34s36 12 40 34"')
  );
}

function isSvgDataUrl(value) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image/svg+xml');
}

function isDefaultProfileReference(value) {
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase().includes('default-profile');
}

function resolveProfilePictureSrc(value) {
  if (isLegacyDefaultProfilePicture(value) || isSvgDataUrl(value) || isDefaultProfileReference(value)) {
    return DEFAULT_PROFILE_PICTURE;
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || DEFAULT_PROFILE_PICTURE;
}

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
  document.body.classList.add('home-page-active');
  document.documentElement.classList.add('home-page-active');

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
        <div id="home-username" class="home-username"></div>
        <button id="edit-profile-btn" class="main-btn small">Edit Profile</button>
      </div>
      <div class="home-right">
        <div class="home-user-meta">
          <div class="home-top-actions">
            <button id="notifications-btn" class="notifications-btn" aria-label="Open notifications">
              <span class="notifications-bell">🔔</span>
              <span id="notifications-count" class="notifications-count hidden">0</span>
            </button>
            <button id="settings-btn" class="settings-floating-btn" aria-label="Open settings">
              <svg viewBox="0 0 16 16" class="settings-gear-icon" aria-hidden="true">
                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zm5.754 3.246a5.754 5.754 0 0 0-.094-1.022l1.14-.89a.5.5 0 0 0 .121-.638l-1.08-1.87a.5.5 0 0 0-.607-.22l-1.343.54a5.792 5.792 0 0 0-1.77-1.022l-.204-1.43A.5.5 0 0 0 9.423 1H6.577a.5.5 0 0 0-.494.426l-.204 1.43a5.792 5.792 0 0 0-1.77 1.022l-1.343-.54a.5.5 0 0 0-.607.22l-1.08 1.87a.5.5 0 0 0 .121.638l1.14.89a5.754 5.754 0 0 0 0 2.044l-1.14.89a.5.5 0 0 0-.121.638l1.08 1.87a.5.5 0 0 0 .607.22l1.343-.54c.531.438 1.134.79 1.77 1.022l.204 1.43a.5.5 0 0 0 .494.426h2.846a.5.5 0 0 0 .494-.426l.204-1.43a5.792 5.792 0 0 0 1.77-1.022l1.343.54a.5.5 0 0 0 .607-.22l1.08-1.87a.5.5 0 0 0-.121-.638l-1.14-.89c.061-.335.094-.677.094-1.022z"></path>
                <circle class="settings-gear-hole" cx="8" cy="8" r="2"></circle>
              </svg>
            </button>
          </div>
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

    <div id="settings-popup" class="settings-popup hidden" role="dialog" aria-label="Apartment settings">
      <button id="notifications-toggle-btn" class="settings-action-btn">Notifications: Off</button>
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

  if (code) {
    const cleanupPromises = [];
    Object.entries(profiles).forEach(([memberName, profile]) => {
      if (!profile || (!isLegacyDefaultProfilePicture(profile.picture) && !isSvgDataUrl(profile.picture) && !isDefaultProfileReference(profile.picture))) return;

      profile.picture = DEFAULT_PROFILE_PICTURE;
      cleanupPromises.push(
        saveUserProfile(code, memberName, { picture: DEFAULT_PROFILE_PICTURE })
      );
    });

    if (cleanupPromises.length) {
      Promise.allSettled(cleanupPromises).then((results) => {
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length) {
          console.warn('Some legacy profile picture cleanups failed:', failed);
        }
      });
    }
  }

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
          <img src="${resolveProfilePictureSrc(memberProfile.picture)}" class="roommate-profile-image" alt="${memberDisplay} profile" />
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
    myPicEl.src = resolveProfilePictureSrc(myProfile.picture);
  }

  // Apartment code display
  const codeDisplay = page.querySelector('#apartment-code-display');
  if (codeDisplay) {
    if (!code) {
      codeDisplay.textContent = 'No apartment yet. Please create or join from your profile.';
    } else {
      codeDisplay.innerHTML = `
        <div class="apartment-code-display-row">
          <span class="apartment-code-value">${code}</span>
          <button type="button" id="share-apartment-code-btn" class="apartment-code-share-btn">Share Code</button>
        </div>
      `;

      const shareCodeBtn = codeDisplay.querySelector('#share-apartment-code-btn');
      if (shareCodeBtn) {
        shareCodeBtn.addEventListener('click', async () => {
          const shareText = `Join my apartment on Bunk Buddies with code: ${code}`;

          if (navigator.share) {
            try {
              await navigator.share({
                title: 'Bunk Buddies Apartment Invite',
                text: shareText,
              });
              return;
            } catch (error) {
              // User-cancelled shares should not trigger fallback alerts.
              if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
                return;
              }
            }
          }

          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(code);
              alert('Apartment code copied. Paste it into your message app.');
              return;
            } catch (_error) {
              // Continue to manual fallback.
            }
          }

          window.prompt('Copy and share this apartment code:', code);
        });
      }
    }
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
          <img src="${resolveProfilePictureSrc(memberProfile.picture)}" class="roommate-pic" />
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
  const notificationsToggleBtn = page.querySelector('#notifications-toggle-btn');
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
  let notificationsEnabled = getNotificationsPreference({ userName: currentUser, apartmentCode: code });
  let pushAvailability = {
    supported: false,
    permission: 'default',
    isStandalone: false,
    vapidConfigured: false,
  };

  async function syncExternalBadge(unreadCount) {
    if (document.visibilityState === 'visible') {
      await clearAppBadgeCount();
      return;
    }
    await syncAppBadgeCount(unreadCount);
  }

  function renderNotificationsToggleLabel() {
    if (!notificationsToggleBtn) return;

    if (!pushAvailability.supported) {
      notificationsToggleBtn.textContent = 'Notifications: Unsupported';
      notificationsToggleBtn.disabled = true;
      return;
    }

    notificationsToggleBtn.disabled = false;
    notificationsToggleBtn.textContent = notificationsEnabled
      ? 'Notifications: On'
      : 'Notifications: Off';
  }

  async function initializePushNotifications() {
    try {
      pushAvailability = await getPushAvailability();
    } catch {
      pushAvailability = {
        supported: false,
        permission: 'default',
        isStandalone: false,
        vapidConfigured: false,
      };
    }

    renderNotificationsToggleLabel();

    if (!notificationsEnabled) {
      await clearAppBadgeCount();
      return;
    }

    await initializePushMessaging({
      userName: currentUser,
      apartmentCode: code,
      onForegroundMessage: async () => {
        await syncExternalBadge(notifications.filter((notification) => !notification.read).length);
      },
    });
  }

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
    return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#59B9FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  };

  const onboardingSlides = [
    {
      title: 'Welcome to Bunk Buddies!',
      subtitle: 'Everything important for your apartment now lives in one clean home hub.',
      featureTitle: 'Home Dashboard',
      featureDescription: 'Quickly see your profile, apartment code, roommates, and top actions in one place.',
      icon: 'welcome',
      visualHtml: `
        <div class="onboarding-mock-home">
          <div class="onboarding-home-top">
            <div class="onboarding-home-user">
              <span class="onboarding-home-avatar"></span>
              <div class="onboarding-home-name-lines">
                <span></span>
                <span></span>
              </div>
            </div>
            <div class="onboarding-home-actions">
              <span></span>
              <span></span>
            </div>
          </div>
          <div class="onboarding-home-code-card">
            <div class="onboarding-home-code-row">
              <span class="onboarding-home-code-label"></span>
              <span class="onboarding-home-share-btn"></span>
            </div>
            <div class="onboarding-home-roommates">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
        </div>
      `,
    },
    {
      title: 'Calendar & Events',
      subtitle: 'Switch views, add events fast, and keep everyone synced on timing.',
      featureTitle: 'Calendar Page',
      featureDescription: 'Month/day controls and event cards make planning clearer at a glance.',
      icon: 'calendar',
      visualHtml: `
        <div class="onboarding-mock-calendar-wrap">
          <div class="onboarding-calendar-toolbar">
            <span class="onboarding-calendar-chip"></span>
            <span class="onboarding-calendar-chip active"></span>
          </div>
          <div class="onboarding-mock-calendar-grid">
            <span></span><span></span><span class="active"></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span class="active"></span><span></span><span></span>
          </div>
          <div class="onboarding-calendar-event-card">
            <span></span>
            <span></span>
          </div>
        </div>
      `,
    },
    {
      title: 'Tasks That Stay Clear',
      subtitle: 'Assign chores, track due dates, and close work without confusion.',
      featureTitle: 'Tasks Page',
      featureDescription: 'Cards keep status, assignee, and completion state easy to scan.',
      icon: 'tasks',
      visualHtml: `
        <div class="onboarding-mock-tasks">
          <div class="onboarding-task-item done">
            <span class="onboarding-task-check"></span>
            <span class="onboarding-task-line"></span>
            <span class="onboarding-task-tag"></span>
          </div>
          <div class="onboarding-task-item">
            <span class="onboarding-task-check"></span>
            <span class="onboarding-task-line"></span>
            <span class="onboarding-task-tag"></span>
          </div>
          <div class="onboarding-task-item">
            <span class="onboarding-task-check"></span>
            <span class="onboarding-task-line short"></span>
            <span class="onboarding-task-tag"></span>
          </div>
        </div>
      `,
    },
    {
      title: 'Group Chat That Flows',
      subtitle: 'Share quick updates, reply in context, and keep apartment conversations moving.',
      featureTitle: 'Chat Page',
      featureDescription: 'Modern message bubbles and quick compose keep communication lightweight.',
      icon: 'chat',
      visualHtml: `
        <div class="onboarding-mock-chat-view">
          <div class="onboarding-chat-header">
            <span class="onboarding-chat-back"></span>
          </div>
          <div class="onboarding-chat-bubble left">Movie night at 8?</div>
          <div class="onboarding-chat-bubble right">Works for me.</div>
          <div class="onboarding-chat-bubble left">Perfect, see you then.</div>
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
    syncExternalBadge(unreadCount).catch((error) => {
      console.warn('Unable to sync app badge count:', error);
    });

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
    document.body.classList.remove('home-page-active');
    document.documentElement.classList.remove('home-page-active');
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

  if (notificationsToggleBtn) {
    notificationsToggleBtn.addEventListener('click', async () => {
      if (!pushAvailability.supported) {
        alert('Push notifications are not supported on this device/browser.');
        return;
      }

      if (notificationsEnabled) {
        try {
          await disablePushNotifications({ userName: currentUser, apartmentCode: code });
          notificationsEnabled = false;
          renderNotificationsToggleLabel();
          return;
        } catch (error) {
          console.error('Unable to disable push notifications:', error);
          alert('Unable to turn notifications off right now. Please try again.');
          return;
        }
      }

      const configuredVapidKey = getResolvedVapidKey();
      if (!configuredVapidKey) {
        alert('Missing Firebase Web Push certificate key. Ask admin to set DEFAULT_VAPID_KEY in js/push_notifications.js.');
        return;
      }

      try {
        await enablePushNotifications({
          userName: currentUser,
          apartmentCode: code,
          vapidKey: configuredVapidKey,
        });
        notificationsEnabled = true;
        renderNotificationsToggleLabel();
      } catch (error) {
        console.error('Unable to enable push notifications:', error);
        const fallbackMessage = 'Unable to turn notifications on. Make sure notification permissions are allowed.';
        alert(error && error.message ? error.message : fallbackMessage);
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearAppBadgeCount().catch(() => {});
      return;
    }

    const unreadCount = notifications.filter((notification) => !notification.read).length;
    syncAppBadgeCount(unreadCount).catch(() => {});
  });

  window.addEventListener('focus', () => {
    clearAppBadgeCount().catch(() => {});
  });

  initializePushNotifications().catch((error) => {
    console.warn('Push notification initialization failed:', error);
  });
}

document.addEventListener('DOMContentLoaded', async function() {
  const container = document.getElementById('app-container');
  if (!container) return;

  try {
    const access = await requireApartmentMembershipAsync();
    if (!access || !access.apartmentCode) return;

    const userName = access.currentUser;
    const apartmentCode = access.apartmentCode;
    const apartmentData = await getApartmentByCode(apartmentCode);
    await renderHomePage(container, userName, apartmentCode, apartmentData);
  } catch (error) {
    console.error('Unable to render home page:', error);
    container.innerHTML = '<div class="message">Unable to load home page right now. Please refresh and try again.</div>';
    alert('Unable to load home page right now. Please refresh and try again.');
  }
});

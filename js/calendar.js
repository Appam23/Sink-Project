import { requireApartmentMembershipAsync } from './auth.js';
import { addNotificationForUser } from './notifications.js';
import { initializeFirebaseServices } from './firebase.js';
import { getApartmentProfilesMap } from './profiles.js';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const EVENTS_QUERY_LIMIT = 180;
const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg?v=20260310';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function notifyRoommatesAboutNewEvent(eventName, actorUser, apartmentCode, members = []) {
  if (!apartmentCode || !Array.isArray(members)) return;

  const message = `${actorUser} added a new event: ${eventName}`;
  const notificationWrites = members.map((member) => {
    if (member === actorUser) return;
    return addNotificationForUser(member, apartmentCode, {
      type: 'event',
      message,
      link: 'calendar.html',
    });
  });
  await Promise.all(notificationWrites.filter(Boolean));
}

function toDisplayName(value) {
  const input = String(value || '').trim();
  if (!input) return 'Roommate';
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function getActorDisplayName(actorUser) {
  const { auth } = initializeFirebaseServices();
  const authDisplayName = auth && auth.currentUser && auth.currentUser.displayName
    ? String(auth.currentUser.displayName).trim()
    : '';
  if (authDisplayName) return authDisplayName;

  const fallback = String(actorUser || '').trim();
  const base = fallback.includes('@') ? fallback.split('@')[0] : fallback;
  return toDisplayName(base);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function toDisplayDateFromIso(isoDate) {
  if (!isIsoDate(isoDate)) return '';
  const [, monthText, dayText] = String(isoDate).split('-');
  return `${monthText}/${dayText}`;
}

function toDisplayTimeFrom24h(time24) {
  const value = String(time24 || '').trim();
  if (!/^\d{2}:\d{2}$/.test(value)) return '';
  const parsed = new Date(`2000-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function toDateInputFromEvent(eventData = {}) {
  if (isIsoDate(eventData.dateISO)) return String(eventData.dateISO);

  const dayKey = String(eventData.date || '').trim();
  const match = dayKey.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return '';

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const currentYear = new Date().getFullYear();
  return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toTimeInputFromEvent(eventData = {}) {
  const normalized = String(eventData.time24 || '').trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;

  const parsed = new Date(`2000-01-01 ${String(eventData.time || '').trim()}`);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

async function renderCalendarPage(container, apartmentCode, currentUser, apartmentMembers = []) {
  // Clear container
  container.innerHTML = '';
  container.classList.add('calendar-container');

  const { db, error: firebaseInitError } = initializeFirebaseServices();
  const eventsCollectionRef = db && apartmentCode
    ? collection(db, 'apartments', apartmentCode, 'events')
    : null;

  if (!eventsCollectionRef) {
    console.error('Calendar requires Firebase Firestore and a valid apartment context.', firebaseInitError || null);
    alert('Calendar is unavailable until Firebase is connected. Please refresh and sign in again.');
    return;
  }

  // Calendar page structure
  const page = document.createElement('div');
  page.className = 'calendar-page';
  page.innerHTML = `
    <div class="calendar-topbar">
      <div class="calendar-view-controls">
        <label for="calendar-view-select" class="calendar-view-label">View</label>
        <select id="calendar-view-select" class="calendar-view-select" aria-label="Calendar view">
          <option value="Month" selected>Month</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Previous">Previous</option>
        </select>
      </div>
      <h2>Calendar</h2>
    </div>
    <div id="calendar-view-content" class="calendar-view-content"></div>
    <button id="add-event-btn" class="add-event-btn" title="Add Event">+</button>
  `;

  container.appendChild(page);

  const viewSelect = page.querySelector('#calendar-view-select');
  const viewContent = page.querySelector('#calendar-view-content');

  // Render events
  let events = [];
  let unsubscribeEvents = null;
  let currentView = 'Month';
  let profilesByUser = {};

  const now = new Date();
  const todayKey = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const todayMonthNumber = now.getMonth() + 1;
  let selectedDayKey = todayKey;
  let selectedMonthAnchor = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    profilesByUser = await getApartmentProfilesMap(apartmentCode);
  } catch (error) {
    profilesByUser = {};
    console.warn('Unable to load attendee profile photos:', error);
  }

  function getProfilePictureForUser(userId) {
    const profile = profilesByUser && userId ? profilesByUser[userId] : null;
    const image = profile && profile.picture ? String(profile.picture).trim() : '';
    return image || DEFAULT_PROFILE_PICTURE;
  }

  function getDisplayNameForUser(userId) {
    const profile = profilesByUser && userId ? profilesByUser[userId] : null;
    const first = profile && profile.firstName ? String(profile.firstName).trim() : '';
    const last = profile && profile.lastName ? String(profile.lastName).trim() : '';
    const fullName = `${first} ${last}`.trim();
    if (fullName) return fullName;

    const fallback = String(userId || '').trim();
    if (!fallback) return 'Roommate';
    const base = fallback.includes('@') ? fallback.split('@')[0] : fallback;
    return toDisplayName(base);
  }

  function getAttendeeUsers(eventData) {
    if (!eventData || !Array.isArray(eventData.attendees)) return [];
    const unique = new Set();
    eventData.attendees.forEach((userId) => {
      const normalized = String(userId || '').trim();
      if (!normalized) return;
      unique.add(normalized);
    });
    return Array.from(unique);
  }

  function getCreatedAtValue(eventData) {
    const createdAt = eventData && eventData.createdAt ? eventData.createdAt : null;
    if (!createdAt) return 0;
    if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
    const numeric = Number(createdAt);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizeMonthDay(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return '';
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return '';
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  }

  function toDaySortValue(dayKey) {
    const normalized = normalizeMonthDay(dayKey);
    if (!normalized) return Number.MAX_SAFE_INTEGER;
    const [month, day] = normalized.split('/').map(Number);
    return (month * 100) + day;
  }

  function getTimeSortValue(timeText) {
    const parsed = new Date(`2000-01-01 ${String(timeText || '').trim()}`);
    if (Number.isNaN(parsed.getTime())) return Number.MAX_SAFE_INTEGER;
    return (parsed.getHours() * 60) + parsed.getMinutes();
  }

  function normalizeIsoDate(value) {
    const iso = String(value || '').trim();
    return isIsoDate(iso) ? iso : '';
  }

  function normalizeTime24(value) {
    const time24 = String(value || '').trim();
    if (/^\d{2}:\d{2}$/.test(time24)) return time24;

    const parsed = new Date(`2000-01-01 ${String(value || '').trim()}`);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }

  function getEventStartMillis(eventData) {
    const dateIso = normalizeIsoDate(eventData.dateISO) || toDateInputFromEvent(eventData);
    const time24 = normalizeTime24(eventData.time24) || normalizeTime24(eventData.time);
    if (!dateIso || !time24) return Number.NaN;

    const parsed = new Date(`${dateIso}T${time24}:00`);
    const millis = parsed.getTime();
    return Number.isFinite(millis) ? millis : Number.NaN;
  }

  function getEventsForDay(dayKey) {
    const normalized = normalizeMonthDay(dayKey);
    if (!normalized) return [];
    return events
      .filter((event) => normalizeMonthDay(event.date) === normalized)
      .slice()
      .sort((a, b) => {
        const timeDiff = getTimeSortValue(a.time) - getTimeSortValue(b.time);
        if (timeDiff !== 0) return timeDiff;
        return a.createdAtValue - b.createdAtValue;
      });
  }

  function renderEventRows(listContainer, eventItems, emptyMessage = 'No events yet. Add one to get started!') {
    if (!listContainer) return;
    if (!Array.isArray(eventItems) || eventItems.length === 0) {
      listContainer.innerHTML = `<div class="no-events">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    listContainer.innerHTML = '';
    eventItems.forEach((event) => {
      const canManageEvent = !!event.createdBy && event.createdBy === currentUser;
      const eventRow = document.createElement('div');
      eventRow.className = 'event-row';
      eventRow.innerHTML = `
        <div class="event-date">${escapeHtml(event.date)}</div>
        <div class="event-details">
          <div class="event-name">${escapeHtml(event.name)}</div>
          <div class="event-location">${escapeHtml(event.room)}</div>
          <div class="event-attendees" aria-label="Attendees"></div>
          <div class="event-attendees-popover hidden" role="status" aria-live="polite"></div>
        </div>
        <div class="event-time">
          <div>${escapeHtml(event.time)}</div>
          <button type="button" class="attend-event-btn">Attend</button>
          ${canManageEvent ? `
            <div class="event-actions-menu">
              <button
                type="button"
                class="event-actions-toggle"
                aria-label="Open event actions"
                aria-haspopup="true"
                aria-expanded="false"
              >
                &middot;&middot;&middot;
              </button>
              <div class="event-actions-dropdown hidden" role="menu" aria-label="Event actions">
                <button type="button" class="edit-event-btn" role="menuitem">Edit</button>
                <button type="button" class="delete-event-btn" role="menuitem">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;

      const attendeeUsers = getAttendeeUsers(event);
      const attendeeDisplayNames = attendeeUsers.map((userId) => getDisplayNameForUser(userId));
      const attendeesContainer = eventRow.querySelector('.event-attendees');
      const attendeePopover = eventRow.querySelector('.event-attendees-popover');

      const hideAllPopovers = () => {
        const rows = listContainer.querySelectorAll('.event-attendees-popover');
        rows.forEach((el) => el.classList.add('hidden'));
      };

      const hideAllActionMenus = () => {
        const dropdowns = listContainer.querySelectorAll('.event-actions-dropdown');
        dropdowns.forEach((el) => el.classList.add('hidden'));

        const toggles = listContainer.querySelectorAll('.event-actions-toggle');
        toggles.forEach((toggle) => {
          toggle.setAttribute('aria-expanded', 'false');
        });
      };

      const togglePopover = () => {
        if (!attendeePopover || attendeeDisplayNames.length === 0) return;
        const wasHidden = attendeePopover.classList.contains('hidden');
        hideAllPopovers();
        attendeePopover.textContent = `Going: ${attendeeDisplayNames.join(', ')}`;
        if (wasHidden) {
          attendeePopover.classList.remove('hidden');
        }
      };

      if (attendeesContainer && attendeesContainer.dataset.popoverBound !== 'true') {
        attendeesContainer.dataset.popoverBound = 'true';
        attendeesContainer.addEventListener('click', (eventClick) => {
          eventClick.stopPropagation();
        });
      }

      if (listContainer && listContainer.dataset.popoverDismissBound !== 'true') {
        listContainer.dataset.popoverDismissBound = 'true';
        listContainer.addEventListener('click', () => {
          hideAllPopovers();
          hideAllActionMenus();
        });
      }

      const actionsToggle = eventRow.querySelector('.event-actions-toggle');
      const actionsDropdown = eventRow.querySelector('.event-actions-dropdown');
      if (actionsToggle && actionsDropdown) {
        actionsToggle.addEventListener('click', (eventClick) => {
          eventClick.stopPropagation();
          const shouldOpen = actionsDropdown.classList.contains('hidden');
          hideAllActionMenus();
          if (shouldOpen) {
            actionsDropdown.classList.remove('hidden');
            actionsToggle.setAttribute('aria-expanded', 'true');
          }
        });

        actionsDropdown.addEventListener('click', (eventClick) => {
          eventClick.stopPropagation();
        });
      }

      if (attendeesContainer) {
        attendeesContainer.innerHTML = '';
        if (attendeeUsers.length === 0) {
          const emptyText = document.createElement('span');
          emptyText.className = 'event-attendees-empty';
          emptyText.textContent = 'No one attending yet';
          attendeesContainer.appendChild(emptyText);
        } else {
          const visibleAttendees = attendeeUsers.slice(0, 4);
          visibleAttendees.forEach((attendeeUser) => {
            const avatarButton = document.createElement('button');
            avatarButton.type = 'button';
            avatarButton.className = 'event-attendee-avatar-btn';
            avatarButton.setAttribute('aria-label', 'Show attendee names');

            const avatar = document.createElement('img');
            avatar.className = 'event-attendee-avatar';
            avatar.src = getProfilePictureForUser(attendeeUser);
            avatar.alt = 'Attending user';
            avatar.title = getDisplayNameForUser(attendeeUser);
            avatarButton.appendChild(avatar);
            avatarButton.addEventListener('click', (eventClick) => {
              eventClick.stopPropagation();
              togglePopover();
            });

            attendeesContainer.appendChild(avatarButton);
          });

          const remainingCount = attendeeUsers.length - visibleAttendees.length;
          if (remainingCount > 0) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'event-attendees-more';
            more.textContent = `+${remainingCount}`;
            more.title = `${remainingCount} more attending`;
            more.addEventListener('click', (eventClick) => {
              eventClick.stopPropagation();
              togglePopover();
            });
            attendeesContainer.appendChild(more);
          }
        }
      }

      const attendBtn = eventRow.querySelector('.attend-event-btn');
      if (attendBtn) {
        const isAttending = attendeeUsers.includes(currentUser);
        attendBtn.textContent = isAttending ? 'Leave' : 'Attend';
        attendBtn.title = isAttending ? 'Tap to stop attending this event' : 'Tap to attend this event';
        if (isAttending) {
          attendBtn.classList.add('active');
        }

        attendBtn.addEventListener('click', async () => {
          attendBtn.disabled = true;
          try {
            await updateDoc(doc(eventsCollectionRef, event.id), {
              attendees: isAttending ? arrayRemove(currentUser) : arrayUnion(currentUser),
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            console.error('Unable to update attendance:', error);
            alert('Unable to update attendance right now. Please try again.');
          } finally {
            attendBtn.disabled = false;
          }
        });
      }

      const editBtn = eventRow.querySelector('.edit-event-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          hideAllActionMenus();
          showEventModal(container, eventsCollectionRef, currentUser, null, apartmentCode, apartmentMembers, event);
        });
      }

      const deleteBtn = eventRow.querySelector('.delete-event-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          hideAllActionMenus();
          try {
            await deleteDoc(doc(eventsCollectionRef, event.id));
          } catch (error) {
            console.error('Unable to delete event:', error);
            alert('Unable to delete this event right now. Please try again.');
          }
        });
      }

      listContainer.appendChild(eventRow);
    });
  }

  function renderPreviousEventRows(listContainer, eventItems, emptyMessage = 'No previous events yet.') {
    if (!listContainer) return;
    if (!Array.isArray(eventItems) || eventItems.length === 0) {
      listContainer.innerHTML = `<div class="no-events">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    listContainer.innerHTML = '';
    eventItems.forEach((event) => {
      const attendeeUsers = getAttendeeUsers(event);
      const attendeeDisplayNames = attendeeUsers.map((userId) => getDisplayNameForUser(userId));
      const attendeeSummary = attendeeDisplayNames.length > 0
        ? attendeeDisplayNames.join(', ')
        : 'No attendees';

      const eventRow = document.createElement('div');
      eventRow.className = 'event-row previous-event-row';
      eventRow.innerHTML = `
        <div class="event-date">${escapeHtml(event.date)}</div>
        <div class="event-details">
          <div class="event-name">${escapeHtml(event.name)}</div>
          <div class="event-location">${escapeHtml(event.room)}</div>
          <div class="event-attendees-empty">Attended: ${escapeHtml(attendeeSummary)}</div>
        </div>
        <div class="event-time">
          <div>${escapeHtml(event.time)}</div>
        </div>
      `;

      listContainer.appendChild(eventRow);
    });
  }

  function getUpcomingEvents() {
    const nowMillis = Date.now();
    return events
      .filter((event) => {
        if (!Number.isFinite(event.startAtValue)) return true;
        return event.startAtValue >= nowMillis;
      })
      .slice()
      .sort((a, b) => {
        const aStart = Number.isFinite(a.startAtValue) ? a.startAtValue : Number.MAX_SAFE_INTEGER;
        const bStart = Number.isFinite(b.startAtValue) ? b.startAtValue : Number.MAX_SAFE_INTEGER;
        if (aStart !== bStart) return aStart - bStart;
        return a.createdAtValue - b.createdAtValue;
      });
  }

  function getPreviousEvents() {
    const nowMillis = Date.now();
    return events
      .filter((event) => Number.isFinite(event.startAtValue) && event.startAtValue < nowMillis)
      .slice()
      .sort((a, b) => {
        if (a.startAtValue !== b.startAtValue) return b.startAtValue - a.startAtValue;
        return b.createdAtValue - a.createdAtValue;
      });
  }

  function renderUpcomingView() {
    if (!viewContent) return;
    const list = document.createElement('div');
    list.className = 'events-list';
    renderEventRows(list, getUpcomingEvents(), 'No upcoming events yet. Add one to get started!');
    viewContent.innerHTML = '';
    viewContent.appendChild(list);
  }

  function renderPreviousView() {
    if (!viewContent) return;
    const list = document.createElement('div');
    list.className = 'events-list';
    renderPreviousEventRows(list, getPreviousEvents(), 'No previous events yet.');

    viewContent.innerHTML = '';
    viewContent.appendChild(list);
  }

  function renderMonthView() {
    if (!viewContent) return;

    const month = selectedMonthAnchor.getMonth();
    const year = selectedMonthAnchor.getFullYear();
    const monthNumber = month + 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const monthLabel = selectedMonthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const selectedMonthNumber = Number(String(selectedDayKey || '').split('/')[0] || 0);
    const isCurrentMonth = monthNumber === todayMonthNumber;
    const activeDayKeyForPanel = selectedMonthNumber === monthNumber
      ? selectedDayKey
      : (isCurrentMonth ? todayKey : '');

    const dayCounts = new Map();
    events.forEach((event) => {
      const key = normalizeMonthDay(event.date);
      if (!key) return;
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    });

    const monthView = document.createElement('div');
    monthView.className = 'calendar-month-view';
    monthView.innerHTML = `
      <div class="calendar-month-header">
        <button type="button" class="calendar-month-nav" id="calendar-prev-month" aria-label="Previous month">‹</button>
        <div class="calendar-month-title">${escapeHtml(monthLabel)}</div>
        <button type="button" class="calendar-month-nav" id="calendar-next-month" aria-label="Next month">›</button>
      </div>
      <div class="calendar-month-grid" id="calendar-month-grid"></div>
      <div class="calendar-month-day-events" id="calendar-month-day-events"></div>
    `;

    const grid = monthView.querySelector('#calendar-month-grid');
    const dayEvents = monthView.querySelector('#calendar-month-day-events');
    const prevMonthBtn = monthView.querySelector('#calendar-prev-month');
    const nextMonthBtn = monthView.querySelector('#calendar-next-month');

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        selectedMonthAnchor = new Date(year, month - 1, 1);
        renderMonthView();
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        selectedMonthAnchor = new Date(year, month + 1, 1);
        renderMonthView();
      });
    }

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekdayNames.forEach((name) => {
      const headerCell = document.createElement('div');
      headerCell.className = 'calendar-weekday';
      headerCell.textContent = name;
      grid.appendChild(headerCell);
    });

    for (let i = 0; i < firstWeekday; i += 1) {
      const spacer = document.createElement('div');
      spacer.className = 'calendar-day-spacer';
      grid.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayKey = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
      const count = dayCounts.get(dayKey) || 0;
      const isTodayCell = dayKey === todayKey;
      const isSelectedCell = dayKey === selectedDayKey;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `calendar-day-cell${count > 0 ? ' has-events' : ''}${isTodayCell ? ' today' : ''}${isSelectedCell ? ' selected' : ''}`;
      const eventLabel = `${count} event${count === 1 ? '' : 's'}`;
      cell.setAttribute('aria-label', count > 0 ? `${dayKey} - ${eventLabel}` : dayKey);
      cell.innerHTML = `
        <span class="calendar-day-number">${day}</span>
        ${count > 0 ? `<span class="calendar-day-count">${count}</span>` : ''}
        ${count > 0 ? '<span class="calendar-day-marker" aria-hidden="true"></span>' : ''}
      `;

      cell.addEventListener('click', () => {
        selectedDayKey = dayKey;
        renderMonthView();
      });

      grid.appendChild(cell);
    }

    const dayTitle = document.createElement('div');
    dayTitle.className = 'calendar-day-title';
    dayTitle.textContent = activeDayKeyForPanel
      ? `Events for ${activeDayKeyForPanel}`
      : 'Select a day to view events';

    const dayList = document.createElement('div');
    dayList.className = 'events-list month-day-events-list';
    renderEventRows(
      dayList,
      activeDayKeyForPanel ? getEventsForDay(activeDayKeyForPanel) : [],
      activeDayKeyForPanel ? `No events on ${activeDayKeyForPanel}.` : 'No day selected.'
    );

    dayEvents.appendChild(dayTitle);
    dayEvents.appendChild(dayList);

    viewContent.innerHTML = '';
    viewContent.appendChild(monthView);
  }

  function renderCurrentView() {
    if (!viewSelect) return;

    currentView = viewSelect.value || 'Month';
    if (currentView === 'Previous') {
      renderPreviousView();
      return;
    }

    if (currentView === 'Month') {
      renderMonthView();
      return;
    }

    renderUpcomingView();
  }

  const eventsQuery = query(
    eventsCollectionRef,
    orderBy('createdAt', 'desc'),
    limit(EVENTS_QUERY_LIMIT)
  );

  unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
    events = snapshot.docs
      .map((eventDoc) => {
        const data = eventDoc.data() || {};
        return {
          id: eventDoc.id,
          name: String(data.name || ''),
          date: String(data.date || ''),
          time: String(data.time || ''),
          room: String(data.room || ''),
          createdBy: String(data.createdBy || ''),
          dateISO: String(data.dateISO || ''),
          time24: String(data.time24 || ''),
          attendees: Array.isArray(data.attendees) ? data.attendees : [],
          startAtValue: getEventStartMillis(data),
          createdAtValue: getCreatedAtValue(data),
        };
      })
      .sort((a, b) => a.createdAtValue - b.createdAtValue);

    if (!normalizeMonthDay(selectedDayKey)) {
      selectedDayKey = todayKey;
    }

    renderCurrentView();
  }, (error) => {
    console.error('Unable to subscribe to events:', error);
  });

  if (viewSelect) {
    viewSelect.addEventListener('change', () => {
      renderCurrentView();
    });
  }

  const cleanupListener = () => {
    if (typeof unsubscribeEvents === 'function') {
      unsubscribeEvents();
      unsubscribeEvents = null;
    }
  };
  window.addEventListener('pagehide', cleanupListener, { once: true });

  // Add event button
  const addBtn = page.querySelector('#add-event-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showEventModal(container, eventsCollectionRef, currentUser, null, apartmentCode, apartmentMembers, null);
    });
  }

  // Footer navigation
  import('./footer.js').then(mod => {
    if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('app-container');
  if (container) {
    requireApartmentMembershipAsync().then((access) => {
      if (!access || !access.apartmentCode) return;
      const apartmentMembers = access.apartment && Array.isArray(access.apartment.members) ? access.apartment.members : [];
      return renderCalendarPage(container, access.apartmentCode, access.currentUser, apartmentMembers);
    }).catch((error) => {
      console.error('Unable to load calendar:', error);
      alert('Unable to load calendar right now. Please refresh and try again.');
    });
  }
});

function showEventModal(
  container,
  eventsCollectionRef,
  currentUser,
  onSaved,
  apartmentCode = null,
  apartmentMembers = [],
  eventToEdit = null
) {
  const isEditMode = !!(eventToEdit && eventToEdit.id);
  const now = new Date();
  const todayDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedRoom = String(eventToEdit && eventToEdit.room ? eventToEdit.room : '');
  const knownRooms = ['Kitchen', 'Living Room', 'Bathroom'];
  const usesCustomRoom = !!selectedRoom && !knownRooms.includes(selectedRoom);
  const initialRoomChoice = usesCustomRoom ? 'Custom' : selectedRoom;

  const initialDateValue = toDateInputFromEvent(eventToEdit || {});
  const initialTimeValue = toTimeInputFromEvent(eventToEdit || {});

  const modal = document.createElement('div');
  modal.className = 'event-modal';
  modal.innerHTML = `
    <div class="event-modal-content">
      <button id="close-modal" class="close-modal">&times;</button>
      <h3>${isEditMode ? 'Edit Event' : 'Add Event'}</h3>
      <form id="event-form">
        <label>Event Name:</label>
        <input type="text" id="event-name" placeholder="Event name" value="${escapeAttr(eventToEdit && eventToEdit.name ? eventToEdit.name : '')}" required />
        
        <label>Date:</label>
        <input type="date" id="event-date" value="${escapeAttr(initialDateValue)}" min="${escapeAttr(todayDateIso)}" required />
        
        <label>Time:</label>
        <input type="time" id="event-time" value="${escapeAttr(initialTimeValue)}" required />
        
        <label>Room:</label>
        <select id="event-room" required>
          <option value="">Select a room</option>
          <option value="Kitchen" ${initialRoomChoice === 'Kitchen' ? 'selected' : ''}>Kitchen</option>
          <option value="Living Room" ${initialRoomChoice === 'Living Room' ? 'selected' : ''}>Living Room</option>
          <option value="Bathroom" ${initialRoomChoice === 'Bathroom' ? 'selected' : ''}>Bathroom</option>
          <option value="Custom" ${initialRoomChoice === 'Custom' ? 'selected' : ''}>Custom</option>
        </select>
        
        <input type="text" id="event-custom-room" placeholder="Enter custom room name" value="${escapeAttr(usesCustomRoom ? selectedRoom : '')}" style="display:${initialRoomChoice === 'Custom' ? 'block' : 'none'};" ${initialRoomChoice === 'Custom' ? 'required' : ''} />
        
        <button type="submit" class="main-btn">${isEditMode ? 'Save Changes' : 'Add Event'}</button>
      </form>
    </div>
  `;

  container.appendChild(modal);

  // Close modal
  const closeBtn = modal.querySelector('#close-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Show/hide custom room input
  const roomSelect = modal.querySelector('#event-room');
  const customRoomInput = modal.querySelector('#event-custom-room');
  if (roomSelect && customRoomInput) {
    roomSelect.addEventListener('change', (e) => {
      if (e.target.value === 'Custom') {
        customRoomInput.style.display = 'block';
        customRoomInput.required = true;
      } else {
        customRoomInput.style.display = 'none';
        customRoomInput.required = false;
      }
    });
  }

  // Handle form submission
  const form = modal.querySelector('#event-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = modal.querySelector('#event-name');
      const dateInput = modal.querySelector('#event-date');
      const timeInput = modal.querySelector('#event-time');
      const roomInput = modal.querySelector('#event-room');
      const customRoomInputEl = modal.querySelector('#event-custom-room');

      const name = nameInput ? nameInput.value.trim() : '';
      const date = dateInput ? dateInput.value : '';
      const time = timeInput ? timeInput.value : '';
      const room = roomInput ? roomInput.value : '';
      const customRoom = customRoomInputEl ? customRoomInputEl.value.trim() : '';
      
      if (!name || !date || !time || !room) {
        alert('Please fill in all fields.');
        return;
      }

      if (date < todayDateIso) {
        alert('Please choose today or a future date. Past dates are not allowed.');
        return;
      }

      if (room === 'Custom' && !customRoom) {
        alert('Please enter a custom room name.');
        return;
      }
      
      const finalRoom = room === 'Custom' ? customRoom : room;
      const displayDate = toDisplayDateFromIso(date);
      const displayTime = toDisplayTimeFrom24h(time);

      if (!displayDate || !displayTime) {
        alert('Please provide a valid date and time.');
        return;
      }

      const newEvent = {
        name,
        date: displayDate,
        time: displayTime,
        room: finalRoom,
        dateISO: date,
        time24: time,
      };

      try {
        if (isEditMode && eventToEdit && eventToEdit.id) {
          await updateDoc(doc(eventsCollectionRef, eventToEdit.id), {
            ...newEvent,
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(eventsCollectionRef, {
            ...newEvent,
            createdBy: currentUser,
            attendees: [],
            createdAt: serverTimestamp(),
          });
          await notifyRoommatesAboutNewEvent(newEvent.name, getActorDisplayName(currentUser), apartmentCode, apartmentMembers);
        }

        modal.remove();
        if (typeof onSaved === 'function') {
          await onSaved();
        }
      } catch (error) {
        console.error(`Unable to ${isEditMode ? 'edit' : 'add'} event:`, error);
        alert(`Unable to ${isEditMode ? 'save changes' : 'add event'} right now. Please try again.`);
      }
    });
  }

  // Click outside modal to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

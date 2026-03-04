import { requireApartmentMembershipAsync } from './auth.js';
import { addNotificationForUser } from './notifications.js';
import { initializeFirebaseServices } from './firebase.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const EVENTS_QUERY_LIMIT = 180;

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
          <option value="List">List</option>
          <option value="Month">Month</option>
          <option value="Day">Day</option>
        </select>
        <select id="calendar-day-select" class="calendar-day-select hidden" aria-label="Select day"></select>
      </div>
      <h2>Calendar</h2>
    </div>
    <div id="calendar-view-content" class="calendar-view-content"></div>
    <button id="add-event-btn" class="add-event-btn" title="Add Event">+</button>
  `;

  container.appendChild(page);

  const viewSelect = page.querySelector('#calendar-view-select');
  const daySelect = page.querySelector('#calendar-day-select');
  const viewContent = page.querySelector('#calendar-view-content');

  // Render events
  let events = [];
  let unsubscribeEvents = null;
  let currentView = 'List';

  const now = new Date();
  const todayKey = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const todayMonthNumber = now.getMonth() + 1;
  let selectedDayKey = todayKey;
  let selectedMonthAnchor = new Date(now.getFullYear(), now.getMonth(), 1);

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
      listContainer.innerHTML = `<div class="no-events">${emptyMessage}</div>`;
      return;
    }

    listContainer.innerHTML = '';
    eventItems.forEach((event) => {
      const eventRow = document.createElement('div');
      eventRow.className = 'event-row';
      eventRow.innerHTML = `
        <div class="event-date">${event.date}</div>
        <div class="event-details">
          <div class="event-name">${event.name}</div>
          <div class="event-location">${event.room}</div>
        </div>
        <div class="event-time">
          <div>${event.time}</div>
          <button type="button" class="delete-event-btn">Delete</button>
        </div>
      `;

      const deleteBtn = eventRow.querySelector('.delete-event-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
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

  function syncDaySelectOptions() {
    if (!daySelect) return;

    const countsByDay = new Map();
    events.forEach((event) => {
      const key = normalizeMonthDay(event.date);
      if (!key) return;
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });

    if (!countsByDay.has(selectedDayKey)) {
      countsByDay.set(selectedDayKey, 0);
    }
    if (countsByDay.size === 0) {
      countsByDay.set(todayKey, 0);
      selectedDayKey = todayKey;
    }

    const sortedKeys = Array.from(countsByDay.keys()).sort((a, b) => toDaySortValue(a) - toDaySortValue(b));

    daySelect.innerHTML = '';
    sortedKeys.forEach((key) => {
      const opt = document.createElement('option');
      const count = countsByDay.get(key) || 0;
      opt.value = key;
      opt.textContent = count > 0 ? `${key} (${count})` : key;
      daySelect.appendChild(opt);
    });

    if (!sortedKeys.includes(selectedDayKey)) {
      selectedDayKey = sortedKeys[0];
    }
    daySelect.value = selectedDayKey;
  }

  function renderListView() {
    if (!viewContent) return;
    const list = document.createElement('div');
    list.className = 'events-list';
    renderEventRows(list, events, 'No events yet. Add one to get started!');
    viewContent.innerHTML = '';
    viewContent.appendChild(list);
  }

  function renderDayView() {
    if (!viewContent) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-day-view';

    const title = document.createElement('div');
    title.className = 'calendar-day-title';
    title.textContent = `Events for ${selectedDayKey}`;
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'events-list day-events-list';
    renderEventRows(list, getEventsForDay(selectedDayKey), `No events on ${selectedDayKey}.`);
    wrapper.appendChild(list);

    viewContent.innerHTML = '';
    viewContent.appendChild(wrapper);
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
        <div class="calendar-month-title">${monthLabel}</div>
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
        syncDaySelectOptions();
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
    if (!viewSelect || !daySelect) return;

    currentView = viewSelect.value || 'List';
    if (currentView === 'Day') {
      daySelect.classList.remove('hidden');
      syncDaySelectOptions();
      renderDayView();
      return;
    }

    daySelect.classList.add('hidden');
    if (currentView === 'Month') {
      renderMonthView();
      return;
    }

    renderListView();
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

  if (daySelect) {
    daySelect.addEventListener('change', (event) => {
      const nextKey = normalizeMonthDay(event.target.value);
      if (!nextKey) return;
      selectedDayKey = nextKey;

      const [monthText] = nextKey.split('/');
      const monthNumber = Number(monthText || 0);
      if (Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
        selectedMonthAnchor = new Date(selectedMonthAnchor.getFullYear(), monthNumber - 1, 1);
      }

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
      showAddEventModal(container, eventsCollectionRef, currentUser, null, apartmentCode, apartmentMembers);
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

function showAddEventModal(container, eventsCollectionRef, currentUser, onSaved, apartmentCode = null, apartmentMembers = []) {
  const modal = document.createElement('div');
  modal.className = 'event-modal';
  modal.innerHTML = `
    <div class="event-modal-content">
      <button id="close-modal" class="close-modal">&times;</button>
      <h3>Add Event</h3>
      <form id="event-form">
        <label>Event Name:</label>
        <input type="text" id="event-name" placeholder="Event name" required />
        
        <label>Date:</label>
        <input type="date" id="event-date" required />
        
        <label>Time:</label>
        <input type="time" id="event-time" required />
        
        <label>Room:</label>
        <select id="event-room" required>
          <option value="">Select a room</option>
          <option value="Kitchen">Kitchen</option>
          <option value="Living Room">Living Room</option>
          <option value="Bathroom">Bathroom</option>
          <option value="Custom">Custom</option>
        </select>
        
        <input type="text" id="event-custom-room" placeholder="Enter custom room name" style="display:none;" />
        
        <button type="submit" class="main-btn">Add Event</button>
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
      
      const name = document.getElementById('event-name').value.trim();
      const date = document.getElementById('event-date').value;
      const time = document.getElementById('event-time').value;
      const room = document.getElementById('event-room').value;
      const customRoom = document.getElementById('event-custom-room').value.trim();
      
      if (!name || !date || !time || !room) {
        alert('Please fill in all fields.');
        return;
      }
      
      const finalRoom = room === 'Custom' ? customRoom : room;
      
      // Format date for display (MM/DD)
      const dateObj = new Date(date);
      const displayDate = (dateObj.getMonth() + 1).toString().padStart(2, '0') + '/' + dateObj.getDate().toString().padStart(2, '0');
      
      // Format time for display (HH:MM AM/PM)
      const timeObj = new Date(`2000-01-01T${time}`);
      const displayTime = timeObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      const newEvent = {
        name: name,
        date: displayDate,
        time: displayTime,
        room: finalRoom
      };

      try {
        await addDoc(eventsCollectionRef, {
          ...newEvent,
          createdBy: currentUser,
          createdAt: serverTimestamp(),
        });
        await notifyRoommatesAboutNewEvent(newEvent.name, getActorDisplayName(currentUser), apartmentCode, apartmentMembers);
        modal.remove();
        if (typeof onSaved === 'function') {
          await onSaved();
        }
      } catch (error) {
        console.error('Unable to add event:', error);
        alert('Unable to add event right now. Please try again.');
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

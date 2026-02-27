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
    <h2>Calendar</h2>
    <div id="events-list" class="events-list"></div>
    <button id="add-event-btn" class="add-event-btn" title="Add Event">+</button>
  `;

  container.appendChild(page);

  // Render events
  const eventsList = page.querySelector('#events-list');
  let events = [];
  let unsubscribeEvents = null;

  function getCreatedAtValue(eventData) {
    const createdAt = eventData && eventData.createdAt ? eventData.createdAt : null;
    if (!createdAt) return 0;
    if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
    const numeric = Number(createdAt);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function renderEventsList() {
    if (!eventsList) return;
    if (events.length === 0) {
      eventsList.innerHTML = '<div class="no-events">No events yet. Add one to get started!</div>';
      return;
    }

    eventsList.innerHTML = '';
    events.forEach((event) => {
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

        eventsList.appendChild(eventRow);
      });
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

    renderEventsList();
  }, (error) => {
    console.error('Unable to subscribe to events:', error);
  });

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

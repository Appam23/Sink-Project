import { getApartmentItem, setApartmentItem } from './storage.js';

export function renderCalendarPage(container) {
  // Clear container
  container.innerHTML = '';

  // Calendar page structure
  const page = document.createElement('div');
  page.className = 'calendar-page';
  page.innerHTML = `
    <h2>Calendar</h2>
    <div id="events-list" class="events-list"></div>
    <button id="add-event-btn" class="add-event-btn" title="Add Event">+</button>
  `;

  container.appendChild(page);

  // Load events scoped to the current apartment
  const events = getApartmentItem('calendarEvents', []);

  // Render events
  const eventsList = page.querySelector('#events-list');
  if (eventsList) {
    if (events.length === 0) {
      eventsList.innerHTML = '<div class="no-events">No events yet. Add one to get started!</div>';
    } else {
      eventsList.innerHTML = '';
      events.forEach((event, index) => {
        const eventRow = document.createElement('div');
        eventRow.className = 'event-row';
        eventRow.innerHTML = `
          <div class="event-date">${event.date}</div>
          <div class="event-details">
            <div class="event-name">${event.name}</div>
            <div class="event-location">${event.room}</div>
          </div>
          <div class="event-time">${event.time}</div>
        `;
        eventsList.appendChild(eventRow);
      });
    }
  }

  // Add event button
  const addBtn = page.querySelector('#add-event-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showAddEventModal(container, events);
    });
  }

  // Footer navigation
  import('./footer.js').then(mod => {
    if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);
  });
}

function showAddEventModal(container, events) {
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
    form.addEventListener('submit', (e) => {
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
      
      events.push(newEvent);
      setApartmentItem('calendarEvents', events);
      
      modal.remove();
      renderCalendarPage(container);
    });
  }

  // Click outside modal to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// footer wiring is centralized in js/footer.js

export default renderCalendarPage;

// events.js

// Array to store events
let events = [];

// Function to add a new event
function addEvent(title, date, startTime, endTime, location) {
    const eventDateTime = new Date(`${date}T${startTime}`);
    const currentDateTime = new Date();

    // Exclude past events
    if (eventDateTime < currentDateTime) {
        alert("Cannot add an event in the past.");
        return;
    }

    const event = {
        title,
        date,
        startTime,
        endTime,
        location,
    };

    events.push(event);
    sortEvents();
    renderEvents();
}

// Function to sort events by closest upcoming date and time
function sortEvents() {
    events.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime}`);
        const dateB = new Date(`${b.date}T${b.startTime}`);
        return dateA - dateB;
    });
}

// Function to render events on the page
function renderEvents() {
    const eventsList = document.getElementById("events-list");
    eventsList.innerHTML = ""; // Clear the list

    events.forEach(event => {
        const eventItem = document.createElement("div");
        eventItem.className = "event-item";

        const title = document.createElement('h3');
        title.textContent = String(event.title || '');

        const date = document.createElement('p');
        date.textContent = `Date: ${String(event.date || '')}`;

        const time = document.createElement('p');
        time.textContent = `Time: ${String(event.startTime || '')} - ${String(event.endTime || '')}`;

        const location = document.createElement('p');
        location.textContent = `Location: ${String(event.location || '')}`;

        eventItem.appendChild(title);
        eventItem.appendChild(date);
        eventItem.appendChild(time);
        eventItem.appendChild(location);

        eventsList.appendChild(eventItem);
    });
}

// Event listener for the form submission
document.getElementById("event-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const title = document.getElementById("event-title").value;
    const date = document.getElementById("event-date").value;
    const startTime = document.getElementById("event-start-time").value;
    const endTime = document.getElementById("event-end-time").value;
    const location = document.getElementById("event-location").value;

    addEvent(title, date, startTime, endTime, location);

    // Clear the form
    e.target.reset();
});

// Navigation links (example)
document.getElementById("home-link").addEventListener("click", function () {
    window.location.href = "home.html";
});

document.getElementById("about-link").addEventListener("click", function () {
    window.location.href = "about.html";
});
// Function to add optional details to an event
function addOptionalDetails(eventId, details) {
    const event = events.find((e, index) => index === eventId);
    if (event) {
        event.details = details;
        renderEvents();
    } else {
        alert("Event not found.");
    }
}

// Example usage: Adding optional details to an event
document.getElementById("add-details-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const eventId = parseInt(document.getElementById("event-id").value, 10);
    const details = document.getElementById("event-details").value;

    addOptionalDetails(eventId, details);

    // Clear the form
    e.target.reset();
});

document.getElementById("footer-message").addEventListener("click", async () => {
  const mod = await import('./group_chat.js');
  if (mod && typeof mod.renderGroupChatPage === 'function') {
    mod.renderGroupChatPage(document.querySelector('.container'));
  }
});
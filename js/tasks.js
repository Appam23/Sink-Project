// tasks.js
import { requireApartmentMembershipAsync } from './auth.js';
import { addNotificationForUser } from './notifications.js';
import { initializeFirebaseServices } from './firebase.js';
import { getApartmentProfilesMap } from './profiles.js';
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

const MAX_IMAGE_DIMENSION = 960;
const MIN_IMAGE_DIMENSION = 480;
const IMAGE_QUALITY = 0.62;
const MIN_IMAGE_QUALITY = 0.4;
const TARGET_IMAGE_DATA_URL_LENGTH = 350000;
const EMERGENCY_MAX_IMAGE_DIMENSION = 420;
const EMERGENCY_MIN_IMAGE_DIMENSION = 320;
const EMERGENCY_IMAGE_QUALITY = 0.34;
const EMERGENCY_MIN_IMAGE_QUALITY = 0.25;
const EMERGENCY_TARGET_IMAGE_DATA_URL_LENGTH = 120000;
const TASKS_QUERY_LIMIT = 180;

function isQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(dataUrl, outputType = 'image/jpeg', quality = IMAGE_QUALITY, options = {}) {
  return new Promise((resolve) => {
    const {
      maxDimension = MAX_IMAGE_DIMENSION,
      minDimension = MIN_IMAGE_DIMENSION,
      minQuality = MIN_IMAGE_QUALITY,
      targetLength = TARGET_IMAGE_DATA_URL_LENGTH,
      maxAttempts = 7,
    } = options;

    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const normalizedType = outputType && outputType.startsWith('image/') ? 'image/jpeg' : 'image/jpeg';
      const minScale = Math.min(1, minDimension / Math.max(width, height));
      let scale = Math.min(1, maxDimension / Math.max(width, height));
      let currentQuality = quality;
      let bestData = dataUrl;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const compressed = canvas.toDataURL(normalizedType, currentQuality);
        if (compressed.length < bestData.length) {
          bestData = compressed;
        }

        if (bestData.length <= targetLength) break;

        if (scale > minScale + 0.001) {
          scale = Math.max(minScale, scale * 0.82);
        } else if (currentQuality > minQuality) {
          currentQuality = Math.max(minQuality, currentQuality - 0.08);
        } else {
          break;
        }
      }

      resolve(bestData);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function aggressiveCompressImageDataUrl(dataUrl) {
  return compressImageDataUrl(dataUrl, 'image/jpeg', EMERGENCY_IMAGE_QUALITY, {
    maxDimension: EMERGENCY_MAX_IMAGE_DIMENSION,
    minDimension: EMERGENCY_MIN_IMAGE_DIMENSION,
    minQuality: EMERGENCY_MIN_IMAGE_QUALITY,
    targetLength: EMERGENCY_TARGET_IMAGE_DATA_URL_LENGTH,
    maxAttempts: 10,
  });
}

async function renderTasksPage(container, access) {
  container.innerHTML = '';
  container.classList.add('tasks-container');

  const currentUser = access && access.currentUser ? access.currentUser : 'You';
  const apartmentCode = access && access.apartmentCode ? access.apartmentCode : null;
  const members = (access && access.apartment && Array.isArray(access.apartment.members)) ? access.apartment.members : [];

  const profiles = apartmentCode ? await getApartmentProfilesMap(apartmentCode) : {};

  const authDisplayName = (() => {
    const { auth } = initializeFirebaseServices();
    const displayName = auth && auth.currentUser && auth.currentUser.displayName
      ? String(auth.currentUser.displayName).trim()
      : '';
    return displayName;
  })();

  function toDisplayName(value) {
    const input = String(value || '').trim();
    if (!input) return 'Roommate';
    return input.charAt(0).toUpperCase() + input.slice(1);
  }

  function getAssigneeDisplayName(memberId) {
    const profileFirstName = (profiles[memberId] && profiles[memberId].firstName) ? String(profiles[memberId].firstName).trim() : '';
    if (profileFirstName) return toDisplayName(profileFirstName);

    if (String(memberId || '').includes('@')) {
      return toDisplayName(String(memberId).split('@')[0]);
    }
    return toDisplayName(memberId);
  }

  function getActorDisplayName() {
    const actorProfile = profiles[currentUser] || {};
    const profileFirstName = actorProfile.firstName ? String(actorProfile.firstName).trim() : '';
    const profileLastName = actorProfile.lastName ? String(actorProfile.lastName).trim() : '';
    const profileFullName = `${profileFirstName} ${profileLastName}`.trim();
    if (profileFullName) return profileFullName;
    if (authDisplayName) return authDisplayName;

    const fallback = String(currentUser || 'Roommate');
    const emailPrefix = fallback.includes('@') ? fallback.split('@')[0] : fallback;
    return toDisplayName(emailPrefix);
  }

  const actorDisplayName = getActorDisplayName();

  if (members && !members.includes(currentUser)) members.push(currentUser);

  const page = document.createElement('div');
  page.className = 'tasks-page';
  page.innerHTML = `
    <div class="tasks-header">
      <h2>Tasks / Chores</h2>
      <div class="tasks-subtitle">Apartment: ${apartmentCode || 'No apartment'}</div>
    </div>
    <div class="tasks-body">
      <div class="task-column" data-room="Kitchen">
        <div class="task-column-header"><h3>Kitchen</h3></div>
        <div class="task-list" id="kitchen-list"></div>
      </div>

      <div class="task-column" data-room="Living Room">
        <div class="task-column-header"><h3>Living Room</h3></div>
        <div class="task-list" id="livingroom-list"></div>
      </div>

      <div class="task-column" data-room="Bathroom">
        <div class="task-column-header"><h3>Bathroom</h3></div>
        <div class="task-list" id="bathroom-list"></div>
      </div>

      <div class="task-column" data-room="Other">
        <div class="task-column-header"><h3>Other</h3></div>
        <div class="task-list" id="other-list"></div>
      </div>
    </div>
    <button id="add-task-btn" class="add-event-btn" title="Add Task">+</button>
  `;

  container.appendChild(page);

  // Modal for adding tasks (reuse event modal styles)
  const modal = document.createElement('div');
  modal.className = 'event-modal hidden';
  modal.innerHTML = `
    <div class="event-modal-content">
      <button id="close-modal" class="close-modal">&times;</button>
      <h3>Add Task</h3>
      <form id="event-form">
        <label>Task Name:</label>
        <input type="text" id="task-name" placeholder="Task name" required />

        <label>Date:</label>
        <input type="date" id="task-date" required />

        <label>Time:</label>
        <input type="time" id="task-time" />

        <label>Room:</label>
        <select id="task-room" required>
          <option value="">Select a room</option>
          <option value="Kitchen">Kitchen</option>
          <option value="Living Room">Living Room</option>
          <option value="Bathroom">Bathroom</option>
          <option value="Other">Other</option>
          <option value="Custom">Custom</option>
        </select>

        <input type="text" id="task-custom-room" placeholder="Enter custom room name" style="display:none;" />

        <label>Assign to:</label>
        <select id="task-assignee"></select>

        <label>Image (optional):</label>
        <input type="file" id="task-image" accept="image/*" />
        <img id="task-image-preview" src="" alt="preview" style="display:none; max-width:100%; margin-top:8px; border-radius:6px;" />

        <button type="submit" class="main-btn">Create</button>
      </form>
    </div>
  `;
  container.appendChild(modal);

  // Build assignee options
  const assigneeSelect = modal.querySelector('#task-assignee');
  assigneeSelect.innerHTML = '';
  const everyoneOpt = document.createElement('option');
  everyoneOpt.value = 'Everyone';
  everyoneOpt.textContent = 'Everyone';
  assigneeSelect.appendChild(everyoneOpt);

  const uniqueMembers = Array.from(new Set(members || []));
  uniqueMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = getAssigneeDisplayName(m);
    assigneeSelect.appendChild(opt);
  });

  // Image upload handling
  const imageInput = modal.querySelector('#task-image');
  let imageData = null;
  const imagePreview = modal.querySelector('#task-image-preview');
  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const rawDataUrl = await fileToDataUrl(file);
          imageData = await compressImageDataUrl(rawDataUrl, file.type);
          if (imagePreview) {
            imagePreview.src = imageData;
            imagePreview.style.display = 'block';
          }
        } catch (_error) {
          imageData = null;
          if (imagePreview) imagePreview.style.display = 'none';
          alert('Image could not be processed. Please try another image.');
        }
      } else {
        imageData = null;
        if (imagePreview) imagePreview.style.display = 'none';
      }
    });
  }

  const { db, error: firebaseInitError } = initializeFirebaseServices();
  const tasksCollectionRef = db && apartmentCode
    ? collection(db, 'apartments', apartmentCode, 'tasks')
    : null;

  if (!tasksCollectionRef) {
    console.error('Tasks require Firebase Firestore and a valid apartment context.', firebaseInitError || null);
    alert('Tasks are unavailable until Firebase is connected. Please refresh and sign in again.');
    return;
  }

  let tasks = [];
  let unsubscribeTasks = null;

  function getCreatedAtValue(taskData) {
    const createdAt = taskData && taskData.createdAt ? taskData.createdAt : null;
    if (!createdAt) return 0;
    if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
    const numeric = Number(createdAt);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  async function createTask(room, title, date, time, assignee, assigneeName, image) {
    const taskPayload = {
      room,
      title,
      date,
      time,
      assignee,
      assigneeName: assigneeName || '',
      image: image || null,
      createdBy: currentUser,
    };

    const taskRef = await addDoc(tasksCollectionRef, {
      ...taskPayload,
      createdAt: serverTimestamp(),
    });
    return taskRef.id;
  }

  async function notifyTaskAssigned(taskTitle, assignee, taskId) {
    if (!apartmentCode || !taskTitle || !taskId) return;

    if (assignee === 'Everyone') {
      const writePromises = uniqueMembers.map((member) => {
        if (member === currentUser) return;
        return addNotificationForUser(member, apartmentCode, {
          type: 'task',
          message: `${actorDisplayName} assigned a task to everyone: ${taskTitle}`,
          link: `tasks.html?taskId=${taskId}`,
        });
      });
      await Promise.all(writePromises.filter(Boolean));
      return;
    }

    if (!assignee || assignee === currentUser) return;
    await addNotificationForUser(assignee, apartmentCode, {
      type: 'task',
      message: `${actorDisplayName} assigned you a task: ${taskTitle}`,
      link: `tasks.html?taskId=${taskId}`,
    });
  }

  function toggleComplete(id) {
    // Deprecated: tasks are removed on completion. Use deleteTask instead.
    deleteTask(id);
  }

  async function deleteTask(id) {
    const normalizedId = String(id);
    await deleteDoc(doc(tasksCollectionRef, normalizedId));
  }

  function showImageModal(src) {
    if (!src) return;
    const m = document.createElement('div');
    m.className = 'event-modal';
    m.innerHTML = `
      <div class="event-modal-content">
        <button id="close-img-modal" class="close-modal">&times;</button>
        <img src="${src}" class="image-view" alt="Task image" />
      </div>
    `;
    container.appendChild(m);
    const closeBtn = m.querySelector('#close-img-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => m.remove());
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  }

  function renderTasks() {
    const rooms = {
      'Kitchen': page.querySelector('#kitchen-list'),
      'Living Room': page.querySelector('#livingroom-list'),
      'Bathroom': page.querySelector('#bathroom-list'),
      'Other': page.querySelector('#other-list'),
    };

    Object.values(rooms).forEach(r => r.innerHTML = '');

    tasks.forEach(task => {
      const row = document.createElement('div');
      row.className = 'event-row task-row';
      row.setAttribute('data-task-id', String(task.id));
      const thumbHtml = task.image ? `<img class="task-thumb" src="${task.image}" alt="thumb"/>` : '';
      const viewBtnHtml = task.image ? `<button class="view-btn">View</button>` : '';
      const assigneeLabel = task.assigneeName || getAssigneeDisplayName(task.assignee);
      row.innerHTML = `
        <div class="event-date"><div class="due-label">Due by</div><div class="due-date">${task.date}</div></div>
        <div class="event-details">
          ${thumbHtml}
          <div class="event-name">${task.title}</div>
          <div class="event-location">${task.room} • ${assigneeLabel}</div>
        </div>
        <div class="event-time">
          ${task.time}
          <div style="margin-top:8px;">${viewBtnHtml} <button class="complete-btn">Complete</button></div>
        </div>
      `;

      const btn = row.querySelector('.complete-btn');
      btn.addEventListener('click', () => {
        deleteTask(task.id).catch((error) => {
          console.error('Task delete failed:', error);
          alert('Unable to complete this task right now. Please try again.');
        });
      });

      const viewBtn = row.querySelector('.view-btn');
      if (viewBtn) viewBtn.addEventListener('click', () => showImageModal(task.image));

      const list = rooms[task.room] || rooms['Other'];
      list.appendChild(row);
    });

    // For each room, if no tasks were appended, show a helpful message
    Object.keys(rooms).forEach((roomName) => {
      const list = rooms[roomName];
      if (!list.hasChildNodes()) {
        const msg = document.createElement('div');
        msg.className = 'no-tasks';
        msg.textContent = 'no tasks yet';
        list.appendChild(msg);
      }
    });

    const params = new URLSearchParams(window.location.search);
    const targetTaskId = params.get('taskId');
    if (targetTaskId) {
      const targetTask = page.querySelector(`.task-row[data-task-id="${targetTaskId}"]`);
      if (targetTask) {
        targetTask.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetTask.classList.add('task-target');
        setTimeout(() => targetTask.classList.remove('task-target'), 1800);
      }
    }
  }

  const tasksQuery = query(
    tasksCollectionRef,
    orderBy('createdAt', 'desc'),
    limit(TASKS_QUERY_LIMIT)
  );

  unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
    tasks = snapshot.docs
      .map((taskDoc) => {
        const data = taskDoc.data() || {};
        return {
          id: taskDoc.id,
          room: String(data.room || 'Other'),
          title: String(data.title || ''),
          date: String(data.date || ''),
          time: String(data.time || ''),
          assignee: String(data.assignee || ''),
          assigneeName: String(data.assigneeName || ''),
          image: data.image || data.imageUrl || null,
          createdAtValue: getCreatedAtValue(data),
        };
      })
      .sort((a, b) => a.createdAtValue - b.createdAtValue);

    renderTasks();
  }, (error) => {
    console.error('Unable to subscribe to tasks:', error);
  });

  const cleanupListener = () => {
    if (typeof unsubscribeTasks === 'function') {
      unsubscribeTasks();
      unsubscribeTasks = null;
    }
  };
  window.addEventListener('pagehide', cleanupListener, { once: true });

  // Add button (single floating) — open modal when clicked
  let lastRoom = 'Other';
  const addBtn = page.querySelector('#add-task-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      // reset modal fields
      modal.querySelector('#task-name').value = '';
      modal.querySelector('#task-date').value = '';
      modal.querySelector('#task-time').value = '';
      modal.querySelector('#task-room').value = lastRoom;
      modal.querySelector('#task-custom-room').style.display = 'none';
      modal.querySelector('#task-custom-room').required = false;
      modal.querySelector('#task-assignee').value = currentUser;
      // reset image input/preview
      if (imageInput) {
        imageInput.value = '';
        imageData = null;
      }
      if (imagePreview) imagePreview.style.display = 'none';
      modal.classList.remove('hidden');
    });
  }

  // Modal close button hides modal
  const closeBtn = modal.querySelector('#close-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  // Show/hide custom room input
  const roomSelect = modal.querySelector('#task-room');
  const customRoomInput = modal.querySelector('#task-custom-room');
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

  // Handle form submit (uses event-form id for consistent styling)
  const form = modal.querySelector('#event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#task-name').value.trim();
    const date = modal.querySelector('#task-date').value;
    const time = modal.querySelector('#task-time').value;
    let room = modal.querySelector('#task-room').value;
    const custom = modal.querySelector('#task-custom-room').value.trim();
    const assignee = modal.querySelector('#task-assignee').value;
    const assigneeName = assignee === 'Everyone' ? 'Everyone' : getAssigneeDisplayName(assignee);
    if (room === 'Custom') room = custom || 'Other';

    // Format date and time for display similar to calendar
    const dateObj = new Date(date);
    const displayDate = isNaN(dateObj.getTime()) ? date : ((dateObj.getMonth() + 1).toString().padStart(2, '0') + '/' + dateObj.getDate().toString().padStart(2, '0'));
    const timeObj = new Date(`2000-01-01T${time}`);
    const displayTime = isNaN(timeObj.getTime()) ? time : timeObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    let imageToSave = imageData;
    try {
      const createdTaskId = await createTask(room, name, displayDate, displayTime, assignee, assigneeName, imageToSave);
      await notifyTaskAssigned(name, assignee, createdTaskId);
      modal.classList.add('hidden');
    } catch (error) {
      if (isQuotaError(error) && imageToSave) {
        try {
          imageToSave = await aggressiveCompressImageDataUrl(imageToSave);
          if (imagePreview) {
            imagePreview.src = imageToSave;
            imagePreview.style.display = 'block';
          }
          imageData = imageToSave;
          const createdTaskId = await createTask(room, name, displayDate, displayTime, assignee, assigneeName, imageToSave);
          await notifyTaskAssigned(name, assignee, createdTaskId);
          modal.classList.add('hidden');
          return;
        } catch (retryError) {
          if (isQuotaError(retryError)) {
            alert('Storage is almost full on this device. Try removing older images or choose a much smaller image.');
            return;
          }
          throw retryError;
        }
      }

      if (isQuotaError(error)) {
        alert('Storage is almost full on this device. Try removing older images.');
        return;
      }
      console.error('Task creation failed:', error);
      alert('Unable to create task right now. Please try again.');
    }
  });

  // Click outside modal to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Attach centralized footer
  import('./footer.js').then(mod => {
    if (mod && typeof mod.attachFooter === 'function') mod.attachFooter(container);
  });

  renderTasks();
}

document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('app-container');
  if (container) {
    requireApartmentMembershipAsync().then((access) => {
      if (!access || !access.apartmentCode) return;
      return renderTasksPage(container, access);
    }).catch((error) => {
      console.error('Unable to render tasks page:', error);
      alert('Unable to load tasks right now. Please refresh and try again.');
    });
  }
});

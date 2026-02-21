function parseJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function replaceInList(list, oldValue, newValue) {
  if (!Array.isArray(list)) return [];
  const replaced = list.map((item) => (item === oldValue ? newValue : item));
  return Array.from(new Set(replaced.filter(Boolean)));
}

function migrateApartments(oldName, newName) {
  const apartments = parseJsonStorage('apartments', {});
  let changed = false;

  Object.keys(apartments).forEach((code) => {
    const members = apartments[code] || [];
    if (members.includes(oldName)) {
      apartments[code] = replaceInList(members, oldName, newName);
      changed = true;
    }
  });

  if (changed) {
    saveJsonStorage('apartments', apartments);
  }
}

function migrateApartmentOwners(oldName, newName) {
  const owners = parseJsonStorage('apartmentOwners', {});
  let changed = false;

  Object.keys(owners).forEach((code) => {
    if (owners[code] === oldName) {
      owners[code] = newName;
      changed = true;
    }
  });

  if (changed) {
    saveJsonStorage('apartmentOwners', owners);
  }
}

function migrateProfiles(oldName, newName) {
  const profiles = parseJsonStorage('profiles', {});
  if (!profiles[oldName]) return;

  if (!profiles[newName]) {
    profiles[newName] = profiles[oldName];
  }
  delete profiles[oldName];
  saveJsonStorage('profiles', profiles);
}

function migrateTasks(oldName, newName) {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('tasks_')) continue;

    const tasks = parseJsonStorage(key, []);
    if (!Array.isArray(tasks)) continue;

    let changed = false;
    const updated = tasks.map((task) => {
      if (task && task.assignee === oldName) {
        changed = true;
        return { ...task, assignee: newName };
      }
      return task;
    });

    if (changed) {
      saveJsonStorage(key, updated);
    }
  }
}

function migrateGroupChatMessages(oldName, newName) {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('groupChatMessages_')) continue;

    const messages = parseJsonStorage(key, []);
    if (!Array.isArray(messages)) continue;

    let changed = false;
    const updated = messages.map((message) => {
      if (message && message.sender === oldName) {
        changed = true;
        return { ...message, sender: newName };
      }
      return message;
    });

    if (changed) {
      saveJsonStorage(key, updated);
    }
  }
}

function migrateNotificationKeys(oldName, newName) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }

  keys.forEach((key) => {
    const prefix = 'notifications_';
    if (!key.startsWith(prefix)) return;
    const suffix = `_${oldName}`;
    if (!key.endsWith(suffix)) return;

    const newKey = key.slice(0, key.length - oldName.length) + newName;
    const oldNotifications = parseJsonStorage(key, []);
    const existingNotifications = parseJsonStorage(newKey, []);
    const merged = [...oldNotifications, ...existingNotifications];

    saveJsonStorage(newKey, merged);
    localStorage.removeItem(key);
  });
}

export function migrateUserIdentity(oldIdentifierInput, newIdentifierInput) {
  const previous = String(oldIdentifierInput || '').trim();
  const next = String(newIdentifierInput || '').trim();

  if (!previous || !next || previous === next) return false;

  migrateApartments(previous, next);
  migrateApartmentOwners(previous, next);
  migrateProfiles(previous, next);
  migrateTasks(previous, next);
  migrateGroupChatMessages(previous, next);
  migrateNotificationKeys(previous, next);
  return true;
}

export function syncCurrentUserIdentity(newNameInput) {
  const previous = (localStorage.getItem('currentUser') || '').trim();
  const next = String(newNameInput || '').trim();

  if (!next) return previous;
  if (previous && previous !== next) {
    migrateUserIdentity(previous, next);
  }
  localStorage.setItem('currentUser', next);
  return next;
}

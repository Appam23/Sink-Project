const USERS_KEY = 'sinkUsers';

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function getUsersMap() {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveUsersMap(map) {
  localStorage.setItem(USERS_KEY, JSON.stringify(map || {}));
}

async function hashText(value) {
  const text = String(value || '');
  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `fallback_${hash}`;
}

export function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const users = getUsersMap();
  return users[normalized] || null;
}

export async function createUser(email, password, displayName = '') {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error('Email is required.');
  }
  if (!password) {
    throw new Error('Password is required.');
  }

  const users = getUsersMap();
  if (users[normalized]) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashText(password);
  users[normalized] = {
    email: normalized,
    displayName: String(displayName || '').trim(),
    passwordHash,
    createdAt: Date.now(),
  };
  saveUsersMap(users);
  return users[normalized];
}

export async function verifyUserCredentials(email, password) {
  const user = getUserByEmail(email);
  if (!user) return false;
  const passwordHash = await hashText(password);
  return user.passwordHash === passwordHash;
}

export function updateUserDisplayName(email, displayName) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const users = getUsersMap();
  const user = users[normalized];
  if (!user) return false;

  user.displayName = String(displayName || '').trim();
  users[normalized] = user;
  saveUsersMap(users);
  return true;
}

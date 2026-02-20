function parseJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getNotificationKey(apartmentCode, userName) {
  return `notifications_${apartmentCode}_${userName}`;
}

export function getUserNotifications(userName, apartmentCode) {
  if (!userName || !apartmentCode) return [];
  return parseJsonStorage(getNotificationKey(apartmentCode, userName), []);
}

export function saveUserNotifications(userName, apartmentCode, notifications) {
  if (!userName || !apartmentCode) return;
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  localStorage.setItem(getNotificationKey(apartmentCode, userName), JSON.stringify(safeNotifications));
}

export function clearUserNotifications(userName, apartmentCode) {
  if (!userName || !apartmentCode) return;
  localStorage.removeItem(getNotificationKey(apartmentCode, userName));
}

export function markAllNotificationsRead(userName, apartmentCode) {
  const notifications = getUserNotifications(userName, apartmentCode);
  if (!notifications.length) return notifications;
  const updated = notifications.map((notification) => ({
    ...notification,
    read: true,
  }));
  saveUserNotifications(userName, apartmentCode, updated);
  return updated;
}

export function addNotificationForUser(userName, apartmentCode, notification) {
  if (!userName || !apartmentCode || !notification) return;
  const existing = getUserNotifications(userName, apartmentCode);
  existing.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    read: false,
    ...notification,
  });
  saveUserNotifications(userName, apartmentCode, existing);
}
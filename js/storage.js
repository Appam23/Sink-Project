// storage.js
// Helper utilities to scope localStorage keys to the current apartment.
export function apartmentKey(baseKey) {
  const apt = localStorage.getItem('currentApartment') || 'GLOBAL';
  return `${baseKey}_${apt}`;
}

export function getApartmentItem(key, defaultValue = null) {
  const k = apartmentKey(key);
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : defaultValue;
}

export function setApartmentItem(key, value) {
  const k = apartmentKey(key);
  localStorage.setItem(k, JSON.stringify(value));
}

export function removeApartmentItem(key) {
  const k = apartmentKey(key);
  localStorage.removeItem(k);
}

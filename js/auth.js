function parseJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getCurrentUser() {
  return localStorage.getItem('currentUser');
}

export function getApartments() {
  return parseJsonStorage('apartments', {});
}

export function getUserApartmentCode(userName, apartments = getApartments()) {
  if (!userName) return null;

  const currentApartment = localStorage.getItem('currentApartment');
  if (
    currentApartment &&
    Array.isArray(apartments[currentApartment]) &&
    apartments[currentApartment].includes(userName)
  ) {
    return currentApartment;
  }

  for (const code of Object.keys(apartments)) {
    const members = apartments[code] || [];
    if (members.includes(userName)) return code;
  }

  return null;
}

export function requireLogin(redirectTo = 'index.html') {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    window.location.href = redirectTo;
    return null;
  }
  return currentUser;
}

export function requireApartmentMembership(options = {}) {
  const {
    redirectIfNoLogin = 'index.html',
    redirectIfNoApartment = 'apartment_code.html',
    redirectIfHasApartment = null,
  } = options;

  const currentUser = requireLogin(redirectIfNoLogin);
  if (!currentUser) return null;

  const apartments = getApartments();
  const apartmentCode = getUserApartmentCode(currentUser, apartments);

  if (!apartmentCode) {
    if (window.location.pathname && !window.location.pathname.endsWith(redirectIfNoApartment)) {
      window.location.href = redirectIfNoApartment;
    }
    return { currentUser, apartmentCode: null, apartments };
  }

  if (localStorage.getItem('currentApartment') !== apartmentCode) {
    localStorage.setItem('currentApartment', apartmentCode);
  }

  if (redirectIfHasApartment && window.location.pathname.endsWith('apartment_code.html')) {
    window.location.href = redirectIfHasApartment;
    return { currentUser, apartmentCode, apartments };
  }

  return { currentUser, apartmentCode, apartments };
}

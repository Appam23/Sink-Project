import { findApartmentForUser } from './apartments.js';
import { getFirebaseAuthCurrentUserIdentifier, waitForFirebaseAuthState } from './firebase.js';

export function getCurrentUser() {
  return getFirebaseAuthCurrentUserIdentifier();
}

export function requireLogin(redirectTo = 'index.html') {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    window.location.href = redirectTo;
    return null;
  }
  return currentUser;
}

export async function requireLoginAsync(redirectTo = 'index.html') {
  try {
    await waitForFirebaseAuthState();
  } catch {
    window.location.href = redirectTo;
    return null;
  }
  const currentUser = getCurrentUser();
  if (!currentUser) {
    window.location.href = redirectTo;
    return null;
  }
  return currentUser;
}


export async function requireApartmentMembershipAsync(options = {}) {
  const {
    redirectIfNoLogin = 'index.html',
    redirectIfNoApartment = 'apartment_code.html',
    redirectIfHasApartment = null,
  } = options;

  const currentUser = await requireLoginAsync(redirectIfNoLogin);
  if (!currentUser) return null;

  let apartment = null;
  try {
    apartment = await findApartmentForUser(currentUser);
  } catch (_error) {
    apartment = null;
  }
  const apartmentCode = apartment && apartment.code ? apartment.code : null;

  if (!apartmentCode) {
    if (window.location.pathname && !window.location.pathname.endsWith(redirectIfNoApartment)) {
      window.location.href = redirectIfNoApartment;
    }
    return { currentUser, apartmentCode: null, apartment: null };
  }

  if (redirectIfHasApartment && window.location.pathname.endsWith('apartment_code.html')) {
    window.location.href = redirectIfHasApartment;
    return { currentUser, apartmentCode, apartment };
  }

  return { currentUser, apartmentCode, apartment };
}

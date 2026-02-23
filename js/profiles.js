import { initializeFirebaseServices } from './firebase.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

function getProfilesCollectionRef(apartmentCode) {
  const { db, error } = initializeFirebaseServices();
  if (error || !db || !apartmentCode) {
    throw error || new Error('Profiles are unavailable without Firebase and apartment context.');
  }
  return collection(db, 'apartments', apartmentCode, 'profiles');
}

export async function getApartmentProfilesMap(apartmentCode) {
  const profilesRef = getProfilesCollectionRef(apartmentCode);
  const snapshot = await getDocs(profilesRef);
  const map = {};
  snapshot.docs.forEach((profileDoc) => {
    map[profileDoc.id] = profileDoc.data() || {};
  });
  return map;
}

export async function getUserProfile(apartmentCode, userName) {
  if (!apartmentCode || !userName) return null;
  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Profiles are unavailable without Firebase.');
  }
  const profileRef = doc(db, 'apartments', apartmentCode, 'profiles', userName);
  const snapshot = await getDoc(profileRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() || null;
}

export async function saveUserProfile(apartmentCode, userName, profileData) {
  if (!apartmentCode || !userName) {
    throw new Error('Apartment and user are required to save profile.');
  }
  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Profiles are unavailable without Firebase.');
  }

  const payload = {
    ...(profileData || {}),
    updatedAt: Date.now(),
  };
  const profileRef = doc(db, 'apartments', apartmentCode, 'profiles', userName);
  await setDoc(profileRef, payload, { merge: true });
}

export async function deleteUserProfile(apartmentCode, userName) {
  if (!apartmentCode || !userName) return;
  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Profiles are unavailable without Firebase.');
  }

  const profileRef = doc(db, 'apartments', apartmentCode, 'profiles', userName);
  await deleteDoc(profileRef);
}
import { initializeFirebaseServices } from './firebase.js';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

function getDbOrThrow() {
  const { db, error } = initializeFirebaseServices();
  if (error || !db) {
    throw error || new Error('Firebase is not available.');
  }
  return db;
}

function normalizeUserName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMembers(members) {
  if (!Array.isArray(members)) return [];
  return Array.from(new Set(members.map(normalizeUserName).filter(Boolean)));
}

export async function getApartmentByCode(apartmentCode) {
  if (!apartmentCode) return null;
  const db = getDbOrThrow();
  const apartmentRef = doc(db, 'apartments', String(apartmentCode).toUpperCase());
  const snapshot = await getDoc(apartmentRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() || {};
  return {
    code: snapshot.id,
    members: normalizeMembers(data.members),
    owner: normalizeUserName(data.owner),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function findApartmentForUser(userName) {
  const normalized = normalizeUserName(userName);
  if (!normalized) return null;

  const db = getDbOrThrow();
  const apartmentsRef = collection(db, 'apartments');
  const membershipsQuery = query(apartmentsRef, where('members', 'array-contains', normalized));
  const snapshot = await getDocs(membershipsQuery);
  const first = snapshot.docs[0];
  if (!first) return null;

  const data = first.data() || {};
  return {
    code: first.id,
    members: normalizeMembers(data.members),
    owner: normalizeUserName(data.owner),
  };
}

export async function createApartment(apartmentCode, ownerUserName) {
  const code = String(apartmentCode || '').trim().toUpperCase();
  const owner = normalizeUserName(ownerUserName);
  if (!code || !owner) {
    throw new Error('Apartment code and owner are required.');
  }

  const db = getDbOrThrow();
  const apartmentRef = doc(db, 'apartments', code);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(apartmentRef);
    if (existing.exists()) {
      throw new Error('Apartment code already exists.');
    }
    const now = Date.now();
    transaction.set(apartmentRef, {
      code,
      owner,
      members: [owner],
      createdAt: now,
      updatedAt: now,
    });
  });

  return { code, owner, members: [owner] };
}

export async function joinApartment(apartmentCode, userName, maxRoommates = 12) {
  const code = String(apartmentCode || '').trim().toUpperCase();
  const normalizedUser = normalizeUserName(userName);
  if (!code || !normalizedUser) {
    throw new Error('Apartment code and user are required.');
  }

  const db = getDbOrThrow();
  const apartmentRef = doc(db, 'apartments', code);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) {
      throw new Error('Apartment code not found.');
    }

    const data = snapshot.data() || {};
    const members = normalizeMembers(data.members);
    const alreadyMember = members.includes(normalizedUser);
    if (!alreadyMember && members.length >= maxRoommates) {
      throw new Error('Apartment is full.');
    }

    const nextMembers = alreadyMember ? members : [...members, normalizedUser];
    transaction.update(apartmentRef, {
      members: nextMembers,
      updatedAt: Date.now(),
    });

    return {
      code,
      owner: normalizeUserName(data.owner),
      members: nextMembers,
      alreadyMember,
    };
  });
}

export async function ensureMemberInApartment(apartmentCode, userName) {
  return joinApartment(apartmentCode, userName, Number.MAX_SAFE_INTEGER);
}

export async function leaveApartment(apartmentCode, userName) {
  const code = String(apartmentCode || '').trim().toUpperCase();
  const normalizedUser = normalizeUserName(userName);
  if (!code || !normalizedUser) return { deleted: false, code: null };

  const db = getDbOrThrow();
  const apartmentRef = doc(db, 'apartments', code);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) {
      return { deleted: false, code, members: [] };
    }

    const data = snapshot.data() || {};
    const members = normalizeMembers(data.members).filter((member) => member !== normalizedUser);
    if (members.length === 0) {
      transaction.delete(apartmentRef);
      return { deleted: true, code, members: [] };
    }

    const currentOwner = normalizeUserName(data.owner);
    const nextOwner = currentOwner && members.includes(currentOwner) ? currentOwner : members[0];
    transaction.update(apartmentRef, {
      members,
      owner: nextOwner,
      updatedAt: Date.now(),
    });

    return {
      deleted: false,
      code,
      members,
      owner: nextOwner,
    };
  });
}

export async function deleteApartmentByOwner(apartmentCode, actingUserName) {
  const code = String(apartmentCode || '').trim().toUpperCase();
  const actingUser = normalizeUserName(actingUserName);
  if (!code || !actingUser) {
    throw new Error('Apartment code and acting user are required.');
  }

  const db = getDbOrThrow();
  const apartmentRef = doc(db, 'apartments', code);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(apartmentRef);
    if (!snapshot.exists()) {
      throw new Error('No apartment found to delete.');
    }
    const data = snapshot.data() || {};
    const owner = normalizeUserName(data.owner);
    if (!owner || owner !== actingUser) {
      throw new Error('Only the apartment owner can delete this apartment.');
    }
    transaction.delete(apartmentRef);
  });
}

export async function removeUserFromAllApartments(userName) {
  const normalizedUser = normalizeUserName(userName);
  if (!normalizedUser) return;

  const apartment = await findApartmentForUser(normalizedUser);
  if (!apartment || !apartment.code) return;
  await leaveApartment(apartment.code, normalizedUser);
}

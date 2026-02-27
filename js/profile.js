import { requireApartmentMembershipAsync } from './auth.js';
import { getUserProfile, saveUserProfile } from './profiles.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';
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

function isFirestoreMessageSizeError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  return code === 'invalid-argument' || code === 'resource-exhausted';
}

export async function renderProfilePage(container, userName = 'You', apartmentCode = null) {
  // Clear container
  container.innerHTML = '';

  // Profile form HTML
  const profileDiv = document.createElement('div');
  profileDiv.className = 'profile-page';
  profileDiv.innerHTML = `
    <form class="profile-form" autocomplete="off">
      <div class="profile-pic-wrapper">
        <div class="profile-pic-container">
          <img src="" alt="Profile Picture" class="profile-pic" id="profile-pic-preview" />
          <span class="profile-pic-icon" id="profile-pic-icon">📷</span>
        </div>
        <input type="file" accept="image/*" id="profile-pic-input" style="display:none;" />
        <button type="button" class="upload-btn" id="profile-pic-trigger">Upload Picture</button>
      </div>
      <div class="profile-fields">
        <input type="text" id="first-name" class="profile-input" placeholder="First Name" />
        <input type="text" id="last-name" class="profile-input" placeholder="Last Name" />
        <input type="text" id="age" class="profile-input" placeholder="Age" />
        <input type="text" id="Apartment-No" class="profile-input" placeholder="Apt. No." />
        <input type="text" id="Room-Number" class="profile-input" placeholder="Room No." />
        <input type="text" id="Phone-Number" class="profile-input" placeholder="Phone Number" />
        <textarea id="Bio" class="profile-input bio-input" placeholder="Something about yourself..."></textarea>
        <button type="button" id="back-to-apartment-btn" class="main-btn">Back</button>
        <button type="submit" id="save-profile-btn" class="main-btn">Save Profile</button>
      </div>
      
    </form>
  `;
  container.appendChild(profileDiv);

  // Profile picture elements (ensure available before submit handler)
  const picInput = profileDiv.querySelector('#profile-pic-input');
  const picPreview = profileDiv.querySelector('#profile-pic-preview');
  const iconSpan = profileDiv.querySelector('#profile-pic-icon');
  if (picPreview) {
    picPreview.src = DEFAULT_PROFILE_PICTURE;
  }

  // Prefill from stored profiles if available
  const currentUserKey = userName;
  let existing = {};
  if (apartmentCode && currentUserKey) {
    try {
      existing = await getUserProfile(apartmentCode, currentUserKey) || {};
    } catch (error) {
      console.error('Unable to load profile:', error);
    }
  }
  if (existing) {
    const first = existing.firstName || '';
    const last = existing.lastName || '';
    const age = existing.age || '';
    const apt = existing.apartmentNo || '';
    const room = existing.roomNumber || '';
    const phone = existing.phone || '';
    const bio = existing.bio || '';
    document.getElementById('first-name').value = first;
    document.getElementById('last-name').value = last;
    document.getElementById('age').value = age;
    document.getElementById('Apartment-No').value = apt;
    document.getElementById('Room-Number').value = room;
    document.getElementById('Phone-Number').value = phone;
    document.getElementById('Bio').value = bio;
    if (existing.picture) {
      picPreview.src = existing.picture;
      if (iconSpan) iconSpan.style.display = 'none';
    } else if (iconSpan) {
      iconSpan.style.display = 'block';
    }
  }

  const backToApartmentBtn = profileDiv.querySelector('#back-to-apartment-btn');
  if (backToApartmentBtn) {
    backToApartmentBtn.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  }

  const profileForm = profileDiv.querySelector('.profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const firstNameInput = document.getElementById('first-name').value.trim();
      const currentUser = userName;

      const profileData = {
        firstName: firstNameInput,
        lastName: document.getElementById('last-name').value.trim(),
        age: document.getElementById('age').value.trim(),
        apartmentNo: document.getElementById('Apartment-No').value.trim(),
        roomNumber: document.getElementById('Room-Number').value.trim(),
        phone: document.getElementById('Phone-Number').value.trim(),
        bio: document.getElementById('Bio').value.trim(),
        picture: picPreview ? picPreview.src : ''
      };
      if (!apartmentCode) {
        alert('No apartment context found for this profile. Please rejoin your apartment and try again.');
        return;
      }

      try {
        await saveUserProfile(apartmentCode, currentUser, profileData);
      } catch (error) {
        const hasDataUrlPicture = typeof profileData.picture === 'string' && profileData.picture.startsWith('data:image/');
        if (isFirestoreMessageSizeError(error) && hasDataUrlPicture) {
          try {
            profileData.picture = await aggressiveCompressImageDataUrl(profileData.picture);
            if (picPreview) picPreview.src = profileData.picture;
            await saveUserProfile(apartmentCode, currentUser, profileData);
          } catch (retryError) {
            console.error('Unable to save profile after aggressive compression:', retryError);
            alert('That photo is still too large to save. Please choose a smaller image.');
            return;
          }
        } else {
          console.error('Unable to save profile:', error);
          alert('Unable to save your profile right now. Please try again.');
          return;
        }
      }

      window.location.href = 'home.html';
    });
  }

  // Profile picture upload/preview (picInput and picPreview declared above)
  if (picInput && picPreview) {
    picInput.addEventListener('change', async function (e) {
      const file = e.target.files[0];
      if (file) {
        try {
          let imageData = await fileToDataUrl(file);
          imageData = await compressImageDataUrl(imageData, file.type);
          picPreview.src = imageData;
          if (iconSpan) iconSpan.style.display = 'none';
        } catch (_error) {
          alert('Image could not be processed. Please try another image.');
        }
      }
    });
    const uploadBtn2 = profileDiv.querySelector('#profile-pic-trigger');
    if (uploadBtn2) {
      uploadBtn2.addEventListener('click', function () {
        picInput.value = '';
        picInput.click();
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('app-container');
  if (container) {
    requireApartmentMembershipAsync().then((access) => {
      if (!access || !access.apartmentCode) return;
      const userName = access.currentUser;
      return renderProfilePage(container, userName, access.apartmentCode);
    }).catch((error) => {
      console.error('Unable to render profile page:', error);
      alert('Unable to open profile right now. Please refresh and try again.');
    });
  }
});
import { requireApartmentMembershipAsync } from './auth.js';
import { getUserProfile, saveUserProfile } from './profiles.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg';

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
        <label class="upload-label">
          <input type="file" accept="image/*" class="upload-input" id="profile-pic-input" style="display:none;" />
          <span class="upload-btn">Upload Picture</span>
        </label>
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
        <button type="button" id="quit-profile-btn" class="quit-btn">Quit</button>
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

      await saveUserProfile(apartmentCode, currentUser, profileData);

      window.location.href = 'home.html';
    });
  }

  // Quit button
  const quitBtn = profileDiv.querySelector('.quit-btn');
  if (quitBtn) {
    quitBtn.addEventListener('click', function () {
      window.location.href = 'index.html';
    });
  }

  // Profile picture upload/preview (picInput and picPreview declared above)
  if (picInput && picPreview) {
    picInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          picPreview.src = ev.target.result;
          if (iconSpan) iconSpan.style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });
    const uploadBtn2 = profileDiv.querySelector('.upload-btn');
    if (uploadBtn2) {
      uploadBtn2.addEventListener('click', function (e) {
        e.preventDefault();
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
import { renderApartmentCodePage } from './apartment_code.js';

export function renderProfilePage(container, userName = 'You') {
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
        <input type="text" id="first-name" class="profile-input" placeholder="First Name" required />
        <input type="text" id="last-name" class="profile-input" placeholder="Last Name" required />
        <input type="text" id="age" class="profile-input" placeholder="Age" required />
        <input type="text" id="Apartment-No" class="profile-input" placeholder="Apt. No." required />
        <input type="text" id="Room-Number" class="profile-input" placeholder="Room No." required />
        <input type="text" id="Phone-Number" class="profile-input" placeholder="Phone Number" required />
        <textarea id="Bio" class="profile-input bio-input" placeholder="Something about yourself..." required></textarea>
        <button type="button" id="back-to-apartment-btn" class="main-btn">Back</button>
        <button type="submit" id="save-profile-btn" class="main-btn">Save Profile</button>
        <button type="button" id="quit-profile-btn" class="quit-btn">Quit</button>
      </div>
      
    </form>
  `;
  container.appendChild(profileDiv);

  const backToApartmentBtn = profileDiv.querySelector('#back-to-apartment-btn');
  if (backToApartmentBtn) {
    backToApartmentBtn.addEventListener('click', () => {
      renderApartmentCodePage(container, userName);
    });
  }

  const profileForm = profileDiv.querySelector('.profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (profileForm.checkValidity()) {
        alert('Profile saved successfully!');
      } else {
        profileForm.reportValidity();
      }
    });
  }

  // Quit button
  const quitBtn = profileDiv.querySelector('.quit-btn');
  if (quitBtn) {
    quitBtn.addEventListener('click', function () {
      if (window.renderWelcomePage) {
        window.renderWelcomePage(container, () => {});
      } else if (typeof renderWelcomePage === 'function') {
        renderWelcomePage(container, () => {});
      } else {
        window.location.reload();
      }
    });
  }

  // Profile picture upload/preview
  const picInput = profileDiv.querySelector('#profile-pic-input');
  const picPreview = profileDiv.querySelector('#profile-pic-preview');
  if (picInput && picPreview) {
    picInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          picPreview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
    const uploadBtn = profileDiv.querySelector('.upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function (e) {
        e.preventDefault();
        picInput.click();
      });
    }
    // Hide icon when image is uploaded
    picInput.addEventListener('change', function () {
      const iconSpan = profileDiv.querySelector('#profile-pic-icon');
      if (picPreview.src) {
        iconSpan.style.display = 'none';
      }
    });
  }

 
  // Footer with icons
  let footer = container.querySelector('.profile-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'profile-footer';
    footer.innerHTML = `
      <button class="footer-btn" title="Home"><span class="footer-icon home-icon"></span></button>
      <button class="footer-btn" title="Calendar"><span class="footer-icon calendar-icon"></span></button>
      <button class="footer-btn" title="Task"><span class="footer-icon task-icon"></span></button>
      <button class="footer-btn" title="Message"><span class="footer-icon message-icon"></span></button>
    `;
    container.appendChild(footer);
  }
}

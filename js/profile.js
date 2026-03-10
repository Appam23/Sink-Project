import { requireApartmentMembershipAsync } from './auth.js';
import { getUserProfile, saveUserProfile } from './profiles.js';

const DEFAULT_PROFILE_PICTURE = 'assets/default-profile.svg?v=20260310';
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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = dataUrl;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
    <div id="profile-crop-modal" class="profile-crop-modal hidden" role="dialog" aria-modal="true" aria-label="Crop profile picture">
      <div class="profile-crop-panel">
        <h3>Crop Picture</h3>
        <canvas id="profile-crop-canvas" class="profile-crop-canvas" width="280" height="280"></canvas>
        <p class="profile-crop-hint">Pinch to zoom and drag with one finger to position your photo.</p>
        <div class="profile-crop-actions">
          <button type="button" id="profile-crop-cancel" class="profile-crop-btn secondary">Cancel</button>
          <button type="button" id="profile-crop-apply" class="profile-crop-btn primary">Use Photo</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(profileDiv);

  // Profile picture elements (ensure available before submit handler)
  const picInput = profileDiv.querySelector('#profile-pic-input');
  const picPreview = profileDiv.querySelector('#profile-pic-preview');
  const iconSpan = profileDiv.querySelector('#profile-pic-icon');
  const cropModal = profileDiv.querySelector('#profile-crop-modal');
  const cropCanvas = profileDiv.querySelector('#profile-crop-canvas');
  const cropApplyBtn = profileDiv.querySelector('#profile-crop-apply');
  const cropCancelBtn = profileDiv.querySelector('#profile-crop-cancel');
  const cropCanvasContext = cropCanvas ? cropCanvas.getContext('2d') : null;
  const MIN_CROP_ZOOM = 1;
  const MAX_CROP_ZOOM = 3.2;
  const cropState = {
    image: null,
    baseScale: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  const activePointers = new Map();
  const dragState = {
    pointerId: null,
    lastX: 0,
    lastY: 0,
  };
  const pinchState = {
    lastCenterX: 0,
    lastCenterY: 0,
    lastDistance: 0,
    active: false,
  };

  function getCropMetrics() {
    if (!cropCanvas || !cropState.image) {
      return { scale: 1, maxPanX: 0, maxPanY: 0, canvasSize: 0 };
    }
    const canvasSize = cropCanvas.width;
    const scale = cropState.baseScale * cropState.zoom;
    const drawnWidth = cropState.image.naturalWidth * scale;
    const drawnHeight = cropState.image.naturalHeight * scale;
    const maxPanX = Math.max(0, (drawnWidth - canvasSize) / 2);
    const maxPanY = Math.max(0, (drawnHeight - canvasSize) / 2);
    return { scale, maxPanX, maxPanY, canvasSize };
  }

  function clampPanWithinBounds() {
    const { maxPanX, maxPanY } = getCropMetrics();
    cropState.panX = maxPanX > 0 ? clamp(cropState.panX, -maxPanX, maxPanX) : 0;
    cropState.panY = maxPanY > 0 ? clamp(cropState.panY, -maxPanY, maxPanY) : 0;
  }

  function drawCropPreview() {
    if (!cropCanvas || !cropCanvasContext || !cropState.image) return;
    clampPanWithinBounds();
    const { scale, canvasSize } = getCropMetrics();

    cropCanvasContext.clearRect(0, 0, canvasSize, canvasSize);
    cropCanvasContext.fillStyle = '#f0f4f4';
    cropCanvasContext.fillRect(0, 0, canvasSize, canvasSize);

    cropCanvasContext.save();
    cropCanvasContext.translate((canvasSize / 2) + cropState.panX, (canvasSize / 2) + cropState.panY);
    cropCanvasContext.scale(scale, scale);
    cropCanvasContext.drawImage(
      cropState.image,
      -cropState.image.naturalWidth / 2,
      -cropState.image.naturalHeight / 2
    );
    cropCanvasContext.restore();
  }

  function getCanvasPointFromClient(clientX, clientY) {
    if (!cropCanvas) return { x: 0, y: 0 };
    const rect = cropCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: cropCanvas.width / 2, y: cropCanvas.height / 2 };
    }
    const x = ((clientX - rect.left) / rect.width) * cropCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * cropCanvas.height;
    return { x, y };
  }

  function getPointerDistanceAndCenter() {
    const points = Array.from(activePointers.values());
    if (points.length < 2) {
      return { distance: 0, centerX: 0, centerY: 0 };
    }
    const p1 = points[0];
    const p2 = points[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return {
      distance: Math.hypot(dx, dy),
      centerX: (p1.x + p2.x) / 2,
      centerY: (p1.y + p2.y) / 2,
    };
  }

  function applyZoomAroundPoint(targetZoom, focalX, focalY) {
    const nextZoom = clamp(targetZoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
    const prevScale = cropState.baseScale * cropState.zoom;
    const nextScale = cropState.baseScale * nextZoom;

    if (!prevScale || !Number.isFinite(prevScale) || !Number.isFinite(nextScale)) {
      return;
    }

    const canvasCenterX = cropCanvas ? cropCanvas.width / 2 : 0;
    const canvasCenterY = cropCanvas ? cropCanvas.height / 2 : 0;
    const relativeX = focalX - canvasCenterX;
    const relativeY = focalY - canvasCenterY;
    const ratio = nextScale / prevScale;

    cropState.panX = ((1 - ratio) * relativeX) + (ratio * cropState.panX);
    cropState.panY = ((1 - ratio) * relativeY) + (ratio * cropState.panY);
    cropState.zoom = nextZoom;
    clampPanWithinBounds();
  }

  function onCropPointerDown(event) {
    if (!cropCanvas || !cropState.image) return;
    if (typeof event.button === 'number' && event.button !== 0) return;

    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    activePointers.set(event.pointerId, point);

    try {
      cropCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that do not support pointer capture.
    }

    if (activePointers.size === 1) {
      dragState.pointerId = event.pointerId;
      dragState.lastX = point.x;
      dragState.lastY = point.y;
      pinchState.active = false;
    } else if (activePointers.size >= 2) {
      const pinchMetrics = getPointerDistanceAndCenter();
      pinchState.lastDistance = pinchMetrics.distance;
      pinchState.lastCenterX = pinchMetrics.centerX;
      pinchState.lastCenterY = pinchMetrics.centerY;
      pinchState.active = pinchMetrics.distance > 0;
      dragState.pointerId = null;
    }

    event.preventDefault();
  }

  function onCropPointerMove(event) {
    if (!cropCanvas || !cropState.image) return;
    if (!activePointers.has(event.pointerId)) return;

    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    activePointers.set(event.pointerId, point);

    if (activePointers.size >= 2) {
      const pinchMetrics = getPointerDistanceAndCenter();
      if (pinchState.active && pinchState.lastDistance > 0 && pinchMetrics.distance > 0) {
        const zoomRatio = pinchMetrics.distance / pinchState.lastDistance;
        const proposedZoom = cropState.zoom * zoomRatio;
        applyZoomAroundPoint(proposedZoom, pinchMetrics.centerX, pinchMetrics.centerY);
        cropState.panX += pinchMetrics.centerX - pinchState.lastCenterX;
        cropState.panY += pinchMetrics.centerY - pinchState.lastCenterY;
        clampPanWithinBounds();
        drawCropPreview();
      }

      pinchState.lastDistance = pinchMetrics.distance;
      pinchState.lastCenterX = pinchMetrics.centerX;
      pinchState.lastCenterY = pinchMetrics.centerY;
      pinchState.active = pinchMetrics.distance > 0;
      event.preventDefault();
      return;
    }

    if (dragState.pointerId === event.pointerId) {
      cropState.panX += point.x - dragState.lastX;
      cropState.panY += point.y - dragState.lastY;
      dragState.lastX = point.x;
      dragState.lastY = point.y;
      clampPanWithinBounds();
      drawCropPreview();
      event.preventDefault();
    }
  }

  function onCropPointerUpOrCancel(event) {
    if (!activePointers.has(event.pointerId)) return;

    activePointers.delete(event.pointerId);
    if (dragState.pointerId === event.pointerId) {
      dragState.pointerId = null;
    }

    if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.entries())[0];
      if (remaining) {
        dragState.pointerId = remaining[0];
        dragState.lastX = remaining[1].x;
        dragState.lastY = remaining[1].y;
      }
      pinchState.active = false;
    } else {
      pinchState.active = false;
      if (activePointers.size === 0) {
        dragState.pointerId = null;
      }
    }
  }

  async function openCropModal(dataUrl) {
    if (!cropModal || !cropCanvas || !cropCanvasContext) {
      throw new Error('Crop controls unavailable.');
    }

    const image = await loadImageFromDataUrl(dataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new Error('Invalid image dimensions.');
    }

    cropState.image = image;
    cropState.baseScale = Math.max(cropCanvas.width / width, cropCanvas.height / height);
    cropState.zoom = MIN_CROP_ZOOM;
    cropState.panX = 0;
    cropState.panY = 0;
    activePointers.clear();
    dragState.pointerId = null;
    pinchState.active = false;
    drawCropPreview();
    cropModal.classList.remove('hidden');
  }

  function closeCropModal() {
    if (!cropModal) return;
    cropModal.classList.add('hidden');
    cropState.image = null;
    activePointers.clear();
    dragState.pointerId = null;
    pinchState.active = false;
    if (picInput) picInput.value = '';
  }

  async function getCroppedDataUrl(outputSize = 512) {
    if (!cropState.image || !cropCanvas) {
      throw new Error('No image selected for crop.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Image crop is not supported on this device.');
    }

    const { scale } = getCropMetrics();
    clampPanWithinBounds();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.save();
    ctx.translate((outputSize / 2) + ((cropState.panX / cropCanvas.width) * outputSize), (outputSize / 2) + ((cropState.panY / cropCanvas.height) * outputSize));
    ctx.scale(scale * (outputSize / cropCanvas.width), scale * (outputSize / cropCanvas.height));
    ctx.drawImage(
      cropState.image,
      -cropState.image.naturalWidth / 2,
      -cropState.image.naturalHeight / 2
    );
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.9);
  }
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
    if (cropCanvas) {
      cropCanvas.addEventListener('pointerdown', onCropPointerDown);
      cropCanvas.addEventListener('pointermove', onCropPointerMove);
      cropCanvas.addEventListener('pointerup', onCropPointerUpOrCancel);
      cropCanvas.addEventListener('pointercancel', onCropPointerUpOrCancel);
      cropCanvas.addEventListener('pointerleave', onCropPointerUpOrCancel);
    }

    if (cropCancelBtn) {
      cropCancelBtn.addEventListener('click', () => {
        closeCropModal();
      });
    }

    if (cropApplyBtn) {
      cropApplyBtn.addEventListener('click', async () => {
        try {
          let croppedImageData = await getCroppedDataUrl(512);
          croppedImageData = await compressImageDataUrl(croppedImageData, 'image/jpeg');
          picPreview.src = croppedImageData;
          if (iconSpan) iconSpan.style.display = 'none';
          closeCropModal();
        } catch (_error) {
          alert('Unable to crop this image. Please try another one.');
        }
      });
    }

    picInput.addEventListener('change', async function (e) {
      const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
      if (file) {
        try {
          const imageData = await fileToDataUrl(file);
          await openCropModal(imageData);
        } catch (_error) {
          alert('Image could not be processed. Please try another image.');
          if (picInput) picInput.value = '';
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
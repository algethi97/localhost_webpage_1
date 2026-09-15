// 사진 업로드 및 갤러리 렌더링 스크립트

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("photo-file-input");
  const previewBar = document.getElementById("file-preview-bar");
  const selectedFileName = document.getElementById("selected-file-name");
  const selectedFileSize = document.getElementById("selected-file-size");
  const uploadBtn = document.getElementById("upload-btn");
  const galleryGrid = document.getElementById("gallery-grid");
  const photoCount = document.getElementById("photo-count");
  const lightboxModal = document.getElementById("lightbox-modal");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const lightboxClose = document.getElementById("lightbox-close");

  let currentSelectedFile = null;
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];

  // 1. 갤러리 목록 불러오기
  async function loadPhotos() {
    try {
      const response = await fetch("/api/photos");
      if (!response.ok) throw new Error("사진 목록을 불러오지 못했습니다.");
      
      const photos = await response.json();
      renderGallery(photos);
    } catch (error) {
      console.error(error);
      galleryGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">⚠️</div>
          <p>사진 목록을 불러오는 중 오류가 발생했습니다.</p>
        </div>
      `;
    }
  }

  // 2. 갤러리 화면 렌더링
  function renderGallery(photos) {
    photoCount.textContent = `${photos.length}장의 사진`;

    if (photos.length === 0) {
      galleryGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🏞️</div>
          <p>아직 등록된 사진이 없습니다. 첫 번째 사진을 올려보세요!</p>
        </div>
      `;
      return;
    }

    galleryGrid.innerHTML = photos.map(photo => createPhotoCardHTML(photo)).join("");
    attachCardEvents();
  }

  // 3. 개별 사진 카드 HTML 생성
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function createPhotoCardHTML(photo) {
    const safeName = escapeHTML(photo.original_name);
    return `
      <div class="gallery-card" data-url="${photo.url}" data-name="${safeName}">
        <div class="gallery-img-wrapper">
          <img src="${photo.url}" alt="${safeName}" class="gallery-img" loading="lazy">
        </div>
        <div class="gallery-info">
          <div class="gallery-date">🕒 ${photo.created_at}</div>
        </div>
      </div>
    `;
  }

  // 4. 사진 카드 클릭 시 확대 보기 모달 연결
  function attachCardEvents() {
    galleryGrid.querySelectorAll(".gallery-card").forEach(card => {
      card.addEventListener("click", () => {
        const url = card.getAttribute("data-url");
        const name = card.getAttribute("data-name");
        openLightbox(url, name);
      });
    });
  }

  function openLightbox(url, name) {
    if (!lightboxModal) return;
    lightboxImg.src = url;
    lightboxCaption.textContent = name;
    lightboxModal.classList.add("active");
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove("active");
    lightboxImg.src = "";
  }

  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeLightbox);
  }
  if (lightboxModal) {
    lightboxModal.addEventListener("click", (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  // 5. 파일 검증 함수 (JPG / PNG 전용)
  function validateAndSelectFile(file) {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));

    if (!isValid) {
      alert("❌ 허용되지 않는 파일 형식입니다.\nJPG 및 PNG 이미지 파일만 업로드할 수 있습니다.");
      resetFileInput();
      return;
    }

    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
      alert("❌ 파일 용량이 너무 큽니다. (최대 10MB 이하만 가능)");
      resetFileInput();
      return;
    }

    currentSelectedFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
    previewBar.style.display = "flex";
  }

  function resetFileInput() {
    currentSelectedFile = null;
    fileInput.value = "";
    previewBar.style.display = "none";
  }

  // 6. 드롭존 및 파일 선택 이벤트
  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      validateAndSelectFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  });

  // 7. 사진 파일 서버 업로드
  uploadBtn.addEventListener("click", async () => {
    if (!currentSelectedFile) {
      alert("업로드할 사진 파일을 선택해주세요.");
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = "업로드 중...";

    const formData = new FormData();
    formData.append("file", currentSelectedFile);

    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "사진 업로드에 실패했습니다.");
      }

      const newPhoto = await response.json();

      // UI 초기화
      resetFileInput();

      // 갤러리 최상단에 새 사진 카드 추가
      const emptyState = galleryGrid.querySelector(".empty-state");
      if (emptyState) {
        galleryGrid.innerHTML = "";
      }

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = createPhotoCardHTML(newPhoto);
      const newCard = tempDiv.firstElementChild;
      newCard.style.animation = "fadeIn 0.5s ease-out";
      
      // 모달 클릭 이벤트 연결
      newCard.addEventListener("click", () => {
        openLightbox(newPhoto.url, newPhoto.original_name);
      });

      galleryGrid.prepend(newCard);

      // 개수 갱신
      const currentCount = galleryGrid.querySelectorAll(".gallery-card").length;
      photoCount.textContent = `${currentCount}장의 사진`;

      alert("🎉 사진이 성공적으로 업로드되었습니다!");

    } catch (error) {
      alert(`오류: ${error.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "사진 올리기";
    }
  });

  // 초기 사진 목록 로드
  loadPhotos();
});


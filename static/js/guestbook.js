// 방명록 비동기 통신 및 인터랙션 스크립트

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("guestbook-form");
  const authorInput = document.getElementById("author-input");
  const messageInput = document.getElementById("message-input");
  const submitBtn = document.getElementById("submit-btn");
  const guestbookList = document.getElementById("guestbook-list");
  const entryCount = document.getElementById("entry-count");

  // 1. 방명록 목록 불러오기
  async function loadGuestbook() {
    try {
      const response = await fetch("/api/guestbook");
      if (!response.ok) throw new Error("방명록을 불러오지 못했습니다.");
      
      const entries = await response.json();
      renderGuestbook(entries);
    } catch (error) {
      console.error(error);
      guestbookList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>방명록을 불러오는 중 오류가 발생했습니다.</p>
        </div>
      `;
    }
  }

  // 2. 방명록 목록 화면 렌더링
  function renderGuestbook(entries) {
    entryCount.textContent = `${entries.length}개의 글`;

    if (entries.length === 0) {
      guestbookList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>아직 작성된 방명록이 없습니다. 첫 번째 발자취를 남겨보세요!</p>
        </div>
      `;
      return;
    }

    guestbookList.innerHTML = entries.map(entry => createEntryHTML(entry)).join("");
  }

  // 3. 개별 방명록 카드 HTML 생성 (XSS 방지 escape 적용)
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function createEntryHTML(entry) {
    const safeAuthor = escapeHTML(entry.author || "익명");
    const safeContent = escapeHTML(entry.content);

    return `
      <article class="guestbook-item" data-id="${entry.id}">
        <div class="item-top">
          <span class="item-author">👤 ${safeAuthor}</span>
          <span class="item-date">${entry.created_at}</span>
        </div>
        <div class="item-content">${safeContent}</div>
      </article>
    `;
  }

  const charCount = document.getElementById("char-count");
  const honeypotWebsite = document.getElementById("honeypot-website");

  // 실시간 글자 수 카운팅
  if (messageInput && charCount) {
    messageInput.addEventListener("input", () => {
      const len = messageInput.value.length;
      charCount.textContent = len;
      if (len >= 500) {
        charCount.style.color = "#dc2626";
        charCount.style.fontWeight = "700";
      } else {
        charCount.style.color = "var(--text-muted)";
        charCount.style.fontWeight = "normal";
      }
    });
  }

  // 4. 새 방명록 전송 함수
  async function submitGuestbook() {
    const content = messageInput.value.trim();
    if (!content) {
      alert("메시지 내용을 입력해주세요!");
      messageInput.focus();
      return;
    }

    if (content.length > 500) {
      alert("메시지는 최대 500자까지 작성할 수 있습니다.");
      return;
    }

    const author = authorInput.value.trim() || "익명";
    const website = honeypotWebsite ? honeypotWebsite.value : "";

    // 버튼 비활성화 (중복 제출 방지)
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";

    try {
      const response = await fetch("/api/guestbook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ author, content, website })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "방명록 등록에 실패했습니다.");
      }

      const newEntry = await response.json();

      // 입력창 비우기 및 포커스, 글자수 리셋
      messageInput.value = "";
      if (charCount) {
        charCount.textContent = "0";
        charCount.style.color = "var(--text-muted)";
      }
      
      // 화면 목록 최상단에 즉시 추가
      const emptyState = guestbookList.querySelector(".empty-state");
      if (emptyState) {
        guestbookList.innerHTML = "";
      }

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = createEntryHTML(newEntry);
      const newCard = tempDiv.firstElementChild;
      
      // 등장 애니메이션 효과
      newCard.style.animation = "fadeIn 0.4s ease-out";
      guestbookList.prepend(newCard);

      // 개수 업데이트
      const currentCount = guestbookList.querySelectorAll(".guestbook-item").length;
      entryCount.textContent = `${currentCount}개의 글`;

    } catch (error) {
      alert(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
    }
  }

  // 5. 폼 제출 이벤트
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuestbook();
  });

  // 6. 엔터(Enter) 키 즉시 전송 핸들러
  // - Shift + Enter : 줄바꿈(개행) 허용
  // - 단독 Enter : 즉시 전송
  // - 한글 조합 중(isComposing) 엔터 시 중복 전송 방지
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing) {
        return; // 한글 조합 중에는 전송하지 않음
      }
      e.preventDefault(); // 기본 개행 방지
      submitGuestbook();
    }
  });

  // 페이지 진입 시 초기 목록 불러오기
  loadGuestbook();
});


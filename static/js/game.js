// ==========================================================================
// 만다린 게임 (Mandarin Puzzle) - 코어 로직 & Supabase 연동 모듈 (game.js)
// 사과게임 모티브, Pop 오디오 신디사이저, 마우스/터치 드래그, Top 5 실시간 랭킹
// 보안 강화: IIFE 캡슐화, 허니팟 스팸 차단, 세션 무결성 검증, XSS 원천 차단
// ==========================================================================

(() => {
  'use strict';

  const SUPABASE_CONFIG = {
    url: 'https://fspkdczsrfoyebznfkwr.supabase.co',
    key: 'sb_publishable_oZWWsYIiUzSB6-9F5I5bdw_sLakHhyW'
  };

  const BOARD_COLS = 17;
  const BOARD_ROWS = 10;
  const TOTAL_TILES = BOARD_COLS * BOARD_ROWS; // 170
  const GAME_DURATION = 120; // 120초
  const SUBMIT_COOLDOWN_MS = 10000; // 도배 방지 10초 쿨다운

  // ==========================================================================
  // Web Audio API 기반 Pop 사운드 효과음 엔진 (SoundManager)
  // ==========================================================================
  class SoundManager {
    constructor() {
      this.audioCtx = null;
      this.isMuted = localStorage.getItem('mandarin_muted') === 'true';
    }

    // 브라우저 정책 준수: 사용자 첫 제스처 시 AudioContext 초기화
    initContext() {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem('mandarin_muted', this.isMuted);
      return this.isMuted;
    }

    // 귤이 톡! 터지는 상큼한 Pop 사운드 (850Hz -> 160Hz 급속 스윕)
    playPop(pitchModifier = 1.0) {
      if (this.isMuted) return;
      this.initContext();
      if (!this.audioCtx) return;

      try {
        const ctx = this.audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        osc.type = 'sine';
        const startFreq = 850 * pitchModifier;
        const endFreq = 160 * pitchModifier;

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {
        // 사운드 오류는 게임 진행을 방해하지 않음
      }
    }

    // 합계 10 달성 축하 화음 비프 (Pop과 함께 연출)
    playSuccessChime() {
      if (this.isMuted) return;
      this.initContext();
      if (!this.audioCtx) return;

      try {
        const ctx = this.audioCtx;
        const notes = [523.25, 659.25]; // C5, E5
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const now = ctx.currentTime + (i * 0.04);

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.12);
        });
      } catch (e) {}
    }

    // 게임 종료 차임
    playGameOver() {
      if (this.isMuted) return;
      this.initContext();
      if (!this.audioCtx) return;

      try {
        const ctx = this.audioCtx;
        const notes = [440, 392, 349.23]; // A4, G4, F4
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = ctx.currentTime + (idx * 0.12);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.25, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + 0.25);
        });
      } catch (e) {}
    }
  }

  // ==========================================================================
  // 모듈 내부 은닉 상태 변수 (콘솔 직접 접근 차단)
  // ==========================================================================
  let supabaseClient = null;
  const soundManager = new SoundManager();

  let tilesData = []; // { index, row, col, value, isCleared, el }
  let isGameRunning = false;
  let score = 0;
  let remainingCount = TOTAL_TILES;
  let timeLeft = GAME_DURATION;
  let timerInterval = null;
  let gameStartTime = null;

  // 보안 및 어뷰징 방지 플래그
  let hasSubmittedThisGame = false;
  let lastSubmitTimestamp = 0;

  // 드래그 상태
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let selectedTileIndexes = new Set();
  let cachedTileRects = []; // 성능 최적화를 위한 바운딩 캐시

  // ==========================================================================
  // 초기화 (DOMContentLoaded)
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Supabase 클라이언트 초기화
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    } else {
      console.error('Supabase SDK 로드 실패');
    }

    // 2. DOM 엘리먼트 바인딩 및 이벤트 초기화
    initDomEvents();

    // 3. 사운드 아이콘 초기 상태 반영
    updateSoundIcon();

    // 4. 사이드 Top 5 실시간 랭킹 불러오기
    fetchTop5Scores();

    // 5. 이전 닉네임 복원
    const savedNick = localStorage.getItem('mandarin_player_nickname');
    const nickInput = document.getElementById('player-nickname');
    if (savedNick && nickInput) {
      nickInput.value = savedNick;
      const countEl = document.getElementById('nickname-count');
      if (countEl) countEl.textContent = savedNick.length;
    }

    // 6. 보드 사전 생성 (시작 전 오버레이 뒤에 귤 타일을 미리 채워 레이아웃 크기 유지 및 시각적 완성도 보장)
    generateBoard();
    requestAnimationFrame(() => {
      cacheTileBoundingBoxes();
    });

    // 7. 첫 제스처 시 Web Audio API 안전 언락
    window.addEventListener('pointerdown', () => {
      soundManager.initContext();
    }, { once: true });
  });

  // ==========================================================================
  // DOM 이벤트 바인딩
  // ==========================================================================
  function initDomEvents() {
    const btnStartRestart = document.getElementById('btn-start-restart');
    const btnOverlayStart = document.getElementById('btn-overlay-start');
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const btnRefreshRanking = document.getElementById('btn-refresh-ranking');
    const btnModalRestart = document.getElementById('btn-modal-restart');
    const scoreSubmitForm = document.getElementById('score-submit-form');
    const nicknameInput = document.getElementById('player-nickname');
    const nicknameCount = document.getElementById('nickname-count');
    const boardContainer = document.getElementById('board-container');

    // 시작 / 재시작 버튼
    if (btnStartRestart) {
      btnStartRestart.addEventListener('click', () => {
        soundManager.initContext();
        if (!isGameRunning) {
          startGame();
        } else {
          if (confirm('게임을 다시 시작하시겠습니까? 현재 진행 상황은 초기화됩니다.')) {
            startGame();
          }
        }
      });
    }

    if (btnOverlayStart) {
      btnOverlayStart.addEventListener('click', () => {
        soundManager.initContext();
        startGame();
      });
    }

    // 사운드 토글
    if (btnSoundToggle) {
      btnSoundToggle.addEventListener('click', () => {
        soundManager.initContext();
        soundManager.toggleMute();
        updateSoundIcon();
        showToast(soundManager.isMuted ? '🔇 효과음이 꺼졌습니다.' : '🔊 효과음이 켜졌습니다.');
      });
    }

    // 랭킹 새로고침
    if (btnRefreshRanking) {
      btnRefreshRanking.addEventListener('click', () => {
        fetchTop5Scores(true);
      });
    }

    // 모달 재시작
    if (btnModalRestart) {
      btnModalRestart.addEventListener('click', () => {
        closeModal();
        startGame();
      });
    }

    // 닉네임 글자수 카운팅
    if (nicknameInput && nicknameCount) {
      nicknameInput.addEventListener('input', () => {
        nicknameCount.textContent = nicknameInput.value.length;
      });
    }

    // 점수 등록 폼 제출
    if (scoreSubmitForm) {
      scoreSubmitForm.addEventListener('submit', handleScoreSubmit);
    }

    // 드래그 제스처 바인딩 (마우스 & 터치)
    initDragEvents(boardContainer);

    // 윈도우 리사이즈 시 타일 바운딩 캐시 재계산
    window.addEventListener('resize', debounce(() => {
      cacheTileBoundingBoxes();
    }, 150));
  }

  function updateSoundIcon() {
    const soundIcon = document.getElementById('sound-icon');
    if (soundIcon) {
      soundIcon.textContent = soundManager.isMuted ? '🔇' : '🔊';
    }
  }

  // ==========================================================================
  // 게임 라이프사이클 (시작, 타이머, 종료)
  // ==========================================================================
  function startGame() {
    isGameRunning = true;
    score = 0;
    remainingCount = TOTAL_TILES;
    timeLeft = GAME_DURATION;
    gameStartTime = Date.now();
    hasSubmittedThisGame = false; // 새 게임 세션 등록 플래그 리셋

    // 오버레이 및 모달 숨김
    document.getElementById('game-start-overlay').style.display = 'none';
    closeModal();

    // 버튼 텍스트 변경
    document.getElementById('btn-action-text').textContent = '🔄 다시 시작';

    // HUD 갱신
    updateHud();

    // 보드 새로 생성
    generateBoard();

    // 타일 상대 좌표 캐싱
    requestAnimationFrame(() => {
      cacheTileBoundingBoxes();
    });

    // 타이머 가동
    if (timerInterval) clearInterval(timerInterval);
    const gaugeBar = document.getElementById('timer-gauge-bar');
    const timerBox = document.querySelector('.timer-box');
    if (gaugeBar) gaugeBar.style.width = '100%';
    if (timerBox) timerBox.classList.remove('time-warning');

    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft < 0) {
        timeLeft = 0;
        clearInterval(timerInterval);
        endGame(false);
        return;
      }

      // 게이지 바 계산
      const percentage = (timeLeft / GAME_DURATION) * 100;
      if (gaugeBar) gaugeBar.style.width = `${percentage}%`;

      // 10초 이하 경고 연출
      if (timeLeft <= 10 && timerBox) {
        timerBox.classList.add('time-warning');
      }

      const timerVal = document.getElementById('hud-timer');
      if (timerVal) {
        timerVal.innerHTML = `${timeLeft}<span class="stat-unit">s</span>`;
      }
    }, 1000);
  }

  function endGame(isClear = false) {
    if (!isGameRunning) return;
    isGameRunning = false;
    if (timerInterval) clearInterval(timerInterval);

    soundManager.playGameOver();

    // 모달 데이터 채우기
    const playDuration = Math.max(1, Math.min(GAME_DURATION, Math.round((Date.now() - gameStartTime) / 1000)));
    const harvestedCount = TOTAL_TILES - remainingCount;

    // 올클리어 보너스 (최대 220점)
    let finalScore = score;
    if (isClear) {
      finalScore += 50; // 올클리어 보너스 50점
      score = finalScore;
      document.getElementById('modal-result-emoji').textContent = '👑';
      document.getElementById('modal-result-title').textContent = '대단합니다! ALL CLEAR!';
      document.getElementById('modal-result-subtitle').textContent = '170개의 귤을 모두 수확했습니다! (+50점 보너스)';
    } else {
      document.getElementById('modal-result-emoji').textContent = '⏰';
      document.getElementById('modal-result-title').textContent = 'TIME OVER!';
      document.getElementById('modal-result-subtitle').textContent = '제한 시간이 종료되었습니다. 수고하셨습니다!';
    }

    document.getElementById('modal-final-score').textContent = `${finalScore}점`;
    document.getElementById('modal-harvested-count').textContent = `${harvestedCount}개`;
    document.getElementById('modal-play-time').textContent = `${playDuration}초`;

    // 등록 버튼 초기화
    const submitBtn = document.getElementById('btn-submit-score');
    if (submitBtn) {
      submitBtn.disabled = false;
      const textEl = submitBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = '🏆 랭킹 등록하기';
    }

    // 내 최근 점수 위젯 갱신
    updateMyLastScore(finalScore);

    // 모달 노출
    const modal = document.getElementById('game-modal');
    if (modal) {
      modal.style.display = 'flex';
      const nickInput = document.getElementById('player-nickname');
      if (nickInput) {
        setTimeout(() => nickInput.focus(), 200);
      }
    }

    document.getElementById('btn-action-text').textContent = '🎮 게임 시작';
  }

  function closeModal() {
    const modal = document.getElementById('game-modal');
    if (modal) modal.style.display = 'none';
  }

  function updateHud() {
    const scoreVal = document.getElementById('hud-score');
    const remainingVal = document.getElementById('hud-remaining');
    const timerVal = document.getElementById('hud-timer');

    if (scoreVal) scoreVal.innerHTML = `${score}<span class="stat-unit">점</span>`;
    if (remainingVal) remainingVal.innerHTML = `${remainingCount}<span class="stat-unit">개</span>`;
    if (timerVal) timerVal.innerHTML = `${timeLeft}<span class="stat-unit">s</span>`;
  }

  // ==========================================================================
  // 보드 생성 알고리즘 (17x10 = 170개 만다린 타일)
  // ==========================================================================
  function generateBoard() {
    const board = document.getElementById('mandarin-board');
    board.innerHTML = '';
    tilesData = [];
    selectedTileIndexes.clear();

    // 1~9 사이의 숫자를 무작위 배정
    const fragment = document.createDocumentFragment();

    for (let idx = 0; idx < TOTAL_TILES; idx++) {
      const row = Math.floor(idx / BOARD_COLS);
      const col = idx % BOARD_COLS;
      const val = Math.floor(Math.random() * 9) + 1;

      const tileEl = document.createElement('div');
      tileEl.className = 'mandarin-tile';
      tileEl.dataset.index = idx;
      tileEl.dataset.row = row;
      tileEl.dataset.col = col;
      tileEl.dataset.val = val;

      tileEl.innerHTML = `
        <img src="/static/images/mandarin.png" alt="귤" class="tile-bg-mandarin" draggable="false">
        <span class="tile-number">${val}</span>
      `;

      fragment.appendChild(tileEl);

      tilesData.push({
        index: idx,
        row,
        col,
        value: val,
        isCleared: false,
        el: tileEl
      });
    }

    board.appendChild(fragment);
  }

  // 성능 최적화: boardContainer 기준으로 타일 BoundingBox 캐싱
  function cacheTileBoundingBoxes() {
    const container = document.getElementById('board-container');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    cachedTileRects = tilesData.map((tile) => {
      if (tile.isCleared) return null;
      const r = tile.el.getBoundingClientRect();
      return {
        left: r.left - containerRect.left,
        top: r.top - containerRect.top,
        right: r.right - containerRect.left,
        bottom: r.bottom - containerRect.top,
        width: r.width,
        height: r.height
      };
    });
  }

  // ==========================================================================
  // 드래그 인터랙션 & 합계 10 판정 (Desktop Mouse & Mobile Touch 지원)
  // ==========================================================================
  function initDragEvents(boardContainer) {
    const selectionBox = document.getElementById('selection-box');
    const sumBadge = document.getElementById('sum-badge');
    const sumBadgeVal = document.getElementById('sum-badge-val');

    function getPointerPos(e) {
      const containerRect = boardContainer.getBoundingClientRect();
      let clientX, clientY;

      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: clientX - containerRect.left,
        y: clientY - containerRect.top,
        rawClientX: clientX,
        rawClientY: clientY
      };
    }

    // 드래그 시작 핸들러
    function onDragStart(e) {
      if (!isGameRunning) return;
      // 터치 시 스크롤 방지
      if (e.type === 'touchstart') {
        e.preventDefault();
      }

      isDragging = true;
      const pos = getPointerPos(e);
      dragStartX = pos.x;
      dragStartY = pos.y;

      selectionBox.style.display = 'block';
      selectionBox.style.left = `${dragStartX}px`;
      selectionBox.style.top = `${dragStartY}px`;
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
      selectionBox.classList.remove('is-ten');

      sumBadge.style.display = 'block';
      sumBadge.classList.remove('is-ten');
      sumBadgeVal.textContent = '0';

      selectedTileIndexes.clear();
      updateTileSelection(dragStartX, dragStartY, dragStartX, dragStartY);
    }

    // 드래그 이동 핸들러
    function onDragMove(e) {
      if (!isDragging || !isGameRunning) return;
      if (e.type === 'touchmove') {
        e.preventDefault();
      }

      const pos = getPointerPos(e);
      const curX = pos.x;
      const curY = pos.y;

      const left = Math.min(dragStartX, curX);
      const top = Math.min(dragStartY, curY);
      const width = Math.abs(curX - dragStartX);
      const height = Math.abs(curY - dragStartY);

      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;

      // 합계 배지 위치
      sumBadge.style.left = `${curX + 15}px`;
      sumBadge.style.top = `${curY - 30}px`;

      // 타일 충돌 검사 및 합계 산출
      updateTileSelection(left, top, left + width, top + height);
    }

    // 드래그 종료 핸들러
    function onDragEnd(e) {
      if (!isDragging) return;
      isDragging = false;

      selectionBox.style.display = 'none';
      selectionBox.classList.remove('is-ten');
      sumBadge.style.display = 'none';
      sumBadge.classList.remove('is-ten');

      if (!isGameRunning) {
        clearSelectionVisuals();
        return;
      }

      // 합계 검사
      let sum = 0;
      const targets = [];
      selectedTileIndexes.forEach((idx) => {
        const tile = tilesData[idx];
        if (tile && !tile.isCleared) {
          sum += tile.value;
          targets.push(tile);
        }
      });

      if (sum === 10 && targets.length > 0) {
        // 🍊 성공: 합계가 10!
        handleSuccessClear(targets);
      } else {
        // 실패: 합이 10이 아님 -> Shake 연출 후 선택 해제
        if (targets.length > 0) {
          targets.forEach((t) => {
            t.el.classList.add('shake-fail');
            setTimeout(() => {
              t.el.classList.remove('shake-fail');
              t.el.classList.remove('selected');
              t.el.classList.remove('is-ten');
            }, 300);
          });
        }
      }

      selectedTileIndexes.clear();
    }

    // 타일 충돌 검사 함수 (AABB 박스 충돌)
    function updateTileSelection(boxLeft, boxTop, boxRight, boxBottom) {
      let currentSum = 0;
      const newlySelected = new Set();

      for (let i = 0; i < TOTAL_TILES; i++) {
        const tile = tilesData[i];
        if (!tile || tile.isCleared) continue;

        const rect = cachedTileRects[i];
        if (!rect) continue;

        const isOverlap =
          rect.right > boxLeft &&
          rect.left < boxRight &&
          rect.bottom > boxTop &&
          rect.top < boxBottom;

        if (isOverlap) {
          newlySelected.add(i);
          currentSum += tile.value;
        }
      }

      // 클래스 토글
      for (let i = 0; i < TOTAL_TILES; i++) {
        const tile = tilesData[i];
        if (!tile || tile.isCleared) continue;

        const isNowSelected = newlySelected.has(i);
        if (isNowSelected) {
          tile.el.classList.add('selected');
        } else {
          tile.el.classList.remove('selected');
          tile.el.classList.remove('is-ten');
        }
      }

      selectedTileIndexes = newlySelected;

      // 합계 10 도달 여부 시각화
      if (currentSum === 10) {
        selectionBox.classList.add('is-ten');
        sumBadge.classList.add('is-ten');
        sumBadgeVal.textContent = '10 ✨';
        selectedTileIndexes.forEach((idx) => {
          tilesData[idx].el.classList.add('is-ten');
        });
      } else {
        selectionBox.classList.remove('is-ten');
        sumBadge.classList.remove('is-ten');
        sumBadgeVal.textContent = currentSum;
        selectedTileIndexes.forEach((idx) => {
          tilesData[idx].el.classList.remove('is-ten');
        });
      }
    }

    function clearSelectionVisuals() {
      tilesData.forEach((t) => {
        if (t && t.el) {
          t.el.classList.remove('selected', 'is-ten', 'shake-fail');
        }
      });
      selectedTileIndexes.clear();
    }

    // 마우스 이벤트 등록
    boardContainer.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    // 터치 이벤트 등록 (모바일)
    boardContainer.addEventListener('touchstart', onDragStart, { passive: false });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchcancel', onDragEnd);
  }

  // ==========================================================================
  // 합계 10 완성 시 타일 제거 & Pop 애니메이션 & 스코어링
  // ==========================================================================
  function handleSuccessClear(targetTiles) {
    const count = targetTiles.length;
    score += count;
    remainingCount -= count;

    // 1. Pop 사운드 효과음 재생
    soundManager.playPop(1.0 + (count * 0.05));
    soundManager.playSuccessChime();

    // 2. 중심 좌표 계산 (boardContainer 기준)
    let sumX = 0;
    let sumY = 0;
    const container = document.getElementById('board-container');
    const containerRect = container.getBoundingClientRect();

    targetTiles.forEach((tile) => {
      tile.isCleared = true;
      cachedTileRects[tile.index] = null;

      const r = tile.el.getBoundingClientRect();
      sumX += (r.left + r.width / 2) - containerRect.left;
      sumY += (r.top + r.height / 2) - containerRect.top;

      // 통통 튀며 터지는 팝 애니메이션 적용
      tile.el.classList.remove('selected', 'is-ten');
      tile.el.classList.add('clearing-pop');

      setTimeout(() => {
        tile.el.classList.remove('clearing-pop');
        tile.el.classList.add('cleared');
      }, 280);
    });

    const centerX = sumX / count;
    const centerY = sumY / count;

    // 3. 플로팅 스코어 이펙트 (+N)
    spawnFloatingScore(centerX, centerY, `+${count}`);

    // 4. HUD 업데이트
    updateHud();

    // 5. 올클리어 체크 (귤이 0개 남음)
    if (remainingCount <= 0) {
      endGame(true);
    }
  }

  // 플로팅 점수 텍스트 생성
  function spawnFloatingScore(x, y, text) {
    const container = document.getElementById('board-container');
    const floatEl = document.createElement('div');
    floatEl.className = 'floating-score';
    floatEl.textContent = text;
    floatEl.style.left = `${x}px`;
    floatEl.style.top = `${y}px`;

    container.appendChild(floatEl);

    setTimeout(() => {
      if (floatEl.parentNode) {
        floatEl.parentNode.removeChild(floatEl);
      }
    }, 800);
  }

  // ==========================================================================
  // Supabase 랭킹 시스템 (사이드 Top 5 조회 및 신규 기록 등록)
  // ==========================================================================
  async function fetchTop5Scores(isManual = false) {
    if (!supabaseClient) return;

    const skeleton = document.getElementById('leaderboard-skeleton');
    const top5List = document.getElementById('top5-list');
    const emptyView = document.getElementById('top5-empty');
    const refreshBtn = document.getElementById('btn-refresh-ranking');

    if (refreshBtn) refreshBtn.classList.add('spinning');
    if (skeleton) skeleton.style.display = 'flex';
    if (top5List) top5List.style.display = 'none';
    if (emptyView) emptyView.style.display = 'none';

    try {
      const { data, error } = await supabaseClient
        .from('mandarin-game_scores')
        .select('id, nickname, score, remaining_count, play_time, created_at')
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) throw error;

      renderTop5List(data || []);
      if (isManual) {
        showToast('명예의 전당(Top 5)이 갱신되었습니다. ✨');
      }
    } catch (err) {
      console.error('Top 5 불러오기 실패:', err);
      if (isManual) {
        showToast('랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      if (skeleton) skeleton.style.display = 'none';
      if (refreshBtn) {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
      }
    }
  }

  // XSS 원천 차단: DOM 생성 및 textContent 바인딩
  function renderTop5List(scores) {
    const top5List = document.getElementById('top5-list');
    const emptyView = document.getElementById('top5-empty');

    if (!scores || scores.length === 0) {
      if (top5List) top5List.style.display = 'none';
      if (emptyView) emptyView.style.display = 'block';
      return;
    }

    if (emptyView) emptyView.style.display = 'none';
    if (top5List) {
      top5List.style.display = 'flex';
      top5List.innerHTML = '';

      scores.forEach((item, index) => {
        const rank = index + 1;
        const li = document.createElement('li');
        li.className = `top5-item rank-${rank}`;
        li.dataset.recordId = item.id;

        // 좌측 순위 및 닉네임 그룹
        const rankCol = document.createElement('div');
        rankCol.className = 'top5-rank-col';

        // 메달/배지
        const badgeSpan = document.createElement('span');
        if (rank === 1) {
          badgeSpan.className = 'rank-badge gold';
          badgeSpan.textContent = '🥇 1st';
        } else if (rank === 2) {
          badgeSpan.className = 'rank-badge silver';
          badgeSpan.textContent = '🥈 2nd';
        } else if (rank === 3) {
          badgeSpan.className = 'rank-badge bronze';
          badgeSpan.textContent = '🥉 3rd';
        } else {
          badgeSpan.className = 'rank-badge normal';
          badgeSpan.textContent = `${rank}th`;
        }
        rankCol.appendChild(badgeSpan);

        // 플레이어 정보 (textContent로 XSS 원천 차단)
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = item.nickname || '익명';
        nameSpan.setAttribute('title', item.nickname || '익명');

        const timeSpan = document.createElement('span');
        timeSpan.className = 'record-time';
        timeSpan.textContent = formatTimeAgo(item.created_at);

        playerInfo.appendChild(nameSpan);
        playerInfo.appendChild(timeSpan);
        rankCol.appendChild(playerInfo);

        // 우측 스코어 그룹
        const scoreCol = document.createElement('div');
        scoreCol.className = 'top5-score-col';

        const scoreValSpan = document.createElement('span');
        scoreValSpan.className = 'score-val';
        scoreValSpan.textContent = String(item.score);

        const scoreUnitSpan = document.createElement('span');
        scoreUnitSpan.className = 'score-unit';
        scoreUnitSpan.textContent = '점';

        scoreCol.appendChild(scoreValSpan);
        scoreCol.appendChild(scoreUnitSpan);

        li.appendChild(rankCol);
        li.appendChild(scoreCol);
        top5List.appendChild(li);
      });
    }
  }

  // 점수 등록 핸들러 (어뷰징 방지, 허니팟, 중복 방지)
  async function handleScoreSubmit(e) {
    e.preventDefault();
    if (!supabaseClient) {
      showToast('데이터베이스에 연결할 수 없습니다.');
      return;
    }

    // 1. 봇 허니팟 검증 (hidden 필드에 값이 입력되어 있으면 매크로로 간주하고 차단)
    const honeypot = document.getElementById('honeypot-game-website');
    if (honeypot && honeypot.value.trim() !== '') {
      console.warn('Bot detected by honeypot.');
      closeModal();
      return;
    }

    // 2. 1게임 1회 등록 원칙 (중복 등록 차단)
    if (hasSubmittedThisGame) {
      showToast('이미 이번 게임의 점수가 등록되었습니다. 새 게임에 도전해 보세요!');
      closeModal();
      return;
    }

    // 3. 도배 방지 쿨다운 검증 (10초)
    const now = Date.now();
    if (now - lastSubmitTimestamp < SUBMIT_COOLDOWN_MS) {
      const waitSec = Math.ceil((SUBMIT_COOLDOWN_MS - (now - lastSubmitTimestamp)) / 1000);
      showToast(`도배 방지를 위해 ${waitSec}초 후에 다시 시도해 주세요.`);
      return;
    }

    const nickInput = document.getElementById('player-nickname');
    const submitBtn = document.getElementById('btn-submit-score');
    const rawNickname = (nickInput.value || '').trim();

    // 4. 닉네임 유효성 검사
    if (!rawNickname || rawNickname.length < 1) {
      showToast('닉네임을 1글자 이상 입력해 주세요.');
      nickInput.focus();
      return;
    }

    if (rawNickname.length > 20) {
      showToast('닉네임은 최대 20자까지 가능합니다.');
      return;
    }

    // 5. 점수 및 플레이 시간 무결성 검증
    if (score < 0 || score > 220) {
      showToast('비정상적인 점수 데이터입니다.');
      return;
    }

    const playDuration = Math.max(1, Math.min(GAME_DURATION, Math.round((Date.now() - (gameStartTime || Date.now())) / 1000)));

    // 버튼 로딩 상태
    setButtonLoading(submitBtn, true);

    try {
      const { data, error } = await supabaseClient
        .from('mandarin-game_scores')
        .insert([
          {
            nickname: rawNickname,
            score: score,
            remaining_count: remainingCount,
            play_time: playDuration
          }
        ])
        .select();

      if (error) throw error;

      hasSubmittedThisGame = true; // 이번 세션 등록 완료
      lastSubmitTimestamp = Date.now();

      // 로컬 스토리지에 마지막 닉네임 저장
      localStorage.setItem('mandarin_player_nickname', rawNickname);

      showToast(`🎉 ${rawNickname}님의 점수(${score}점)가 명예의 전당에 등록되었습니다!`);
      closeModal();

      // 사이드 Top 5 즉각 갱신
      await fetchTop5Scores();

      // 등록된 기록이 5위 내에 있다면 하이라이트
      if (data && data[0]) {
        highlightLeaderboardItem(data[0].id);
      }
    } catch (err) {
      console.error('점수 등록 오류:', err);
      showToast('점수 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function highlightLeaderboardItem(recordId) {
    setTimeout(() => {
      const el = document.querySelector(`.top5-item[data-record-id="${recordId}"]`);
      if (el) {
        el.classList.add('newly-ranked');
        soundManager.playSuccessChime();
      }
    }, 200);
  }

  function updateMyLastScore(scoreVal) {
    const card = document.getElementById('my-last-score-card');
    const scoreEl = document.getElementById('my-last-score');
    if (card && scoreEl) {
      scoreEl.textContent = String(scoreVal);
      card.style.display = 'block';
    }
  }

  // ==========================================================================
  // 유틸리티 함수
  // ==========================================================================
  function setButtonLoading(button, isLoading) {
    if (!button) return;
    const textEl = button.querySelector('.btn-text');
    const loaderEl = button.querySelector('.btn-loader');

    button.disabled = isLoading;
    if (isLoading) {
      if (textEl) textEl.style.display = 'none';
      if (loaderEl) loaderEl.style.display = 'inline-block';
    } else {
      if (textEl) textEl.style.display = 'inline';
      if (loaderEl) loaderEl.style.display = 'none';
    }
  }

  function showToast(msg) {
    const container = document.getElementById('game-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.textContent = msg;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return '방금 전';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}일 전`;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
})();

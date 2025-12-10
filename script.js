// ===== 환경 =====
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJnzGLudNkwinjSCL78wciFhZplXciJwbQo5VcRnm_8rxbbmnW5CDn2yzKgw1pNWFKdw/exec';
const PRICE = { adult: 7000, youth: 5000 };
const STORAGE_KEY = 'jb-reserve-draft-v2'; // v2: UI 변경 반영

// ===== 유틸 =====
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };
const fmt = n => Number(n).toLocaleString();

function nearest20Slot(base = new Date()) {
  // UI선택 제거 → 제출 시 자동으로 가장 가까운 20분 슬롯(±3분 허용)
  const slots = [0, 20, 40];
  const d = new Date(base);
  let h = d.getHours(), m = d.getMinutes();
  let chosen = slots.find(s => m <= s + 3);
  if (chosen === undefined) { h = (h + 1) % 24; chosen = 0; }
  return `${String(h).padStart(2, '0')}:${String(chosen).padStart(2, '0')}`;
}

function saveDraft(obj) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {} }
function loadDraft() { try { const t = localStorage.getItem(STORAGE_KEY); return t ? JSON.parse(t) : null; } catch { return null; } }
function showSnack(msg, type = 'info', ms = 1800) {
  const el = $('#snackbar');
  el.textContent = msg;
  el.className = `snackbar ${type} show`;
  $('#liveRegion').textContent = msg;
  setTimeout(() => el.classList.remove('show'), ms);
}

// ===== 메인 =====
document.addEventListener('DOMContentLoaded', () => {
  const form = $('#reservationForm');
  const result = $('#result');
  const submitBtn = $('#submitBtn');
  const priceText = $('#priceText');
  const priceDetail = $('#priceDetail');
  const roomButtons = $$('.room-buttons .seg');
  const roomInput = $('#roomSize');
  const diffButtons = $$('.difficulty-buttons .diff');
  const diffInput = $('#difficulty');

  const summaryCount = $('#summaryCount');
  const summaryDiff = $('#summaryDiff');
  const summaryRoom = $('#summaryRoom');
  const summaryHint = $('#summaryHint');
  const roomBadges = $$('[data-room-badge]');

  let manualRoomSelected = false;
  let manualDiffSelected = false;

  // 가격 표시
  function syncPrice() {
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const adultAmt = adult * PRICE.adult;
    const youthAmt = youth * PRICE.youth;
    const total = adultAmt + youthAmt;
    priceText.textContent = fmt(total);
    priceDetail.textContent = `성인 ${adult} × ${fmt(PRICE.adult)} + 청소년 ${youth} × ${fmt(PRICE.youth)}`;
  }

  // 상단 요약 동기화
  function syncSummary(messageOverride) {
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const total = adult + youth;

    summaryCount.textContent = `${total}명`;

    const selectedDiff = Array.from(diffButtons).find(b => b.classList.contains('selected'));
    if (selectedDiff) {
      const label = selectedDiff.querySelector('.label')?.textContent || '선택됨';
      summaryDiff.textContent = label;
    } else {
      summaryDiff.textContent = '미선택';
    }

    const selectedRoom = Array.from(roomButtons).find(b => b.classList.contains('selected'));
    if (selectedRoom) {
      const text = selectedRoom.firstChild.textContent.trim();
      summaryRoom.textContent = text || '선택됨';
    } else {
      summaryRoom.textContent = '미선택';
    }

    if (messageOverride) {
      summaryHint.textContent = messageOverride;
      return;
    }

    if (total <= 0) {
      summaryHint.textContent = '먼저 인원 수를 선택하시면, 난이도와 방을 자동으로 추천해 드려요 🙌';
    } else if (!selectedDiff && !selectedRoom) {
      summaryHint.textContent = '인원 기준으로 곧 난이도와 방을 추천해 드릴게요.';
    } else if (!selectedDiff) {
      summaryHint.textContent = '난이도를 선택하거나 추천 난이도를 확인해 주세요 🙂';
    } else if (!selectedRoom) {
      summaryHint.textContent = '추천 방을 그대로 사용하시거나, 원하시는 방을 골라주세요.';
    } else {
      summaryHint.textContent = '선택하신 정보로 바로 예약 진행 가능합니다. 아래 [최종 완료]를 눌러 주세요 🙏';
    }
  }

  function clearRoomBadges() {
    roomBadges.forEach(b => { b.textContent = ''; b.classList.remove('seg__badge--active'); });
  }

  function setRoomBadge(value) {
    clearRoomBadges();
    const badge = document.querySelector(`[data-room-badge="${value}"]`);
    if (badge) {
      badge.textContent = '⭐ 추천';
      badge.classList.add('seg__badge--active');
    }
  }

  // 방/난이도 선택 공통 처리
  function applyRoomSelection(btn, fromAuto = false) {
    roomButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
    roomInput.value = btn.dataset.value;
    if (!fromAuto) manualRoomSelected = true;
    vibrate(10);
    updateDraft();
    syncSummary();
  }

  function applyDiffSelection(btn, fromAuto = false) {
    diffButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
    diffInput.value = btn.dataset.value;
    if (!fromAuto) manualDiffSelected = true;
    vibrate(10);
    updateDraft();
    syncSummary();
  }

  // 인원 기준 자동 추천
  function autoRecommend() {
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const total = adult + youth;

    clearRoomBadges();

    if (total <= 0) {
      // 인원이 없으면 자동 추천 X
      syncSummary();
      return;
    }

    // ---- 난이도 자동 추천 ----
    if (!manualDiffSelected) {
      let diffValue = 'ㅂ베이직'; // 기본 베이직

      if (total <= 3 && adult <= 1) {
        diffValue = 'ㅂ베이직';          // 아주 처음 / 가족 위주
      } else if (total <= 5) {
        diffValue = 'ㅇ이지';            // 인원 좀 있고, 적당히 도전
      } else if (total <= 8) {
        diffValue = 'ㄴ노멀';            // 인원 많고, 운동 좀 하는 팀
      } else {
        diffValue = 'ㅎ하드';            // 진짜 좀 하겠다 싶을 때
      }

      const btn = Array.from(diffButtons).find(b => b.dataset.value === diffValue);
      if (btn) {
        applyDiffSelection(btn, true);
        syncSummary('인원 수를 기준으로 추천 난이도를 자동으로 설정했어요 🙂');
      }
    }

    // ---- 방 자동 추천 ----
    if (!manualRoomSelected) {
      let roomValue = 'C2';

      if (total <= 3) {
        roomValue = 'C2';         // 1~3인: 소형
      } else if (total <= 5) {
        roomValue = 'A1';         // 4~5인: 중형
      } else {
        roomValue = 'B1';         // 6인 이상: 대형
      }

      const btn = Array.from(roomButtons).find(b => b.dataset.value === roomValue);
      if (btn) {
        applyRoomSelection(btn, true);
        setRoomBadge(roomValue);
        summaryHint.textContent = `현재 인원 (${total}명)에 맞춰 [${btn.firstChild.textContent.trim()}] 방을 추천드렸어요 ⭐`;
      }
    } else {
      // 손님이 직접 방을 고른 경우에도 "어떤 방이 적당한지" 시각적으로만 추천
      let recommendForBadge = null;
      if (total <= 3) recommendForBadge = 'C2';
      else if (total <= 5) recommendForBadge = 'A1';
      else recommendForBadge = 'B1';
      if (recommendForBadge) setRoomBadge(recommendForBadge);
    }

    syncSummary();
  }

  // 방/난이도 선택 토글
  roomButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyRoomSelection(btn, false);
    });
  });

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyDiffSelection(btn, false);
    });
  });

  // 인원 카운터 +/-
  function adjustCount(id, delta) {
    const inp = document.getElementById(id);
    const v = Math.max(0, (Number(inp.value) || 0) + delta);
    inp.value = v;
    vibrate(8);
    syncPrice();
    autoRecommend();
    updateDraft();
  }
  $$('.btn-ghost.minus').forEach(b => b.addEventListener('click', () => adjustCount(b.dataset.target, -1)));
  $$('.btn-ghost.plus').forEach(b => b.addEventListener('click', () => adjustCount(b.dataset.target, 1)));
  $('#adultCount').addEventListener('input', () => { syncPrice(); autoRecommend(); updateDraft(); });
  $('#youthCount').addEventListener('input', () => { syncPrice(); autoRecommend(); updateDraft(); });

  // 팀명 자동 생성
  const teamNameList = ['순대','떡볶이','대박','제로콜라','불고기와퍼','보노보노','요리왕비룡','검정고무신','도라에몽',
    '런닝맨','호빵맨','괴짜가족','우르사','쿠쿠다스','갈비탕','돼지국밥','순대국','파리지옥',
    '은하철도999','아이언맨','호나우딩요','독수리슛','번개슛','피구왕통키','도깨비슛'];
  $('#generateTeamNameBtn').addEventListener('click', () => {
    const rand = teamNameList[Math.floor(Math.random() * teamNameList.length)];
    $('#teamName').value = rand;
    vibrate(10);
    updateDraft();
    syncSummary();
  });

  // 차량번호 숫자 4자리 제한
  $('#vehicle').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    updateDraft();
  });

  syncPrice();
  syncSummary();

  // Draft 복원
  (function restore() {
    const d = loadDraft();
    if (!d) return;
    if (d.roomSize) {
      const btn = Array.from(roomButtons).find(b => b.dataset.value === d.roomSize);
      if (btn) applyRoomSelection(btn, false);
    }
    if (d.difficulty) {
      const btn = Array.from(diffButtons).find(b => b.dataset.value === d.difficulty);
      if (btn) applyDiffSelection(btn, false);
    }
    if (Number.isFinite(d.adultCount)) $('#adultCount').value = d.adultCount;
    if (Number.isFinite(d.youthCount)) $('#youthCount').value = d.youthCount;
    if (d.teamName) $('#teamName').value = d.teamName;
    if (d.vehicle) $('#vehicle').value = d.vehicle;
    syncPrice();
    autoRecommend(); // 복원된 인원 기반으로 추천 뱃지만 갱신
    syncSummary();
  })();

  function updateDraft() {
    saveDraft({
      roomSize: roomInput.value || '',
      difficulty: diffInput.value || '',
      adultCount: Number($('#adultCount').value || 0),
      youthCount: Number($('#youthCount').value || 0),
      teamName: ($('#teamName').value || '').trim(),
      vehicle: ($('#vehicle').value || '').trim()
    });
  }

  // 검증
  function validate() {
    const room = roomInput.value;
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const team = ($('#teamName').value || '').trim();
    const diff = diffInput.value;

    if (!room) return '방을 선택해주세요.';
    if (adult + youth <= 0) return '인원 수를 입력해주세요.';
    if (!team) return '팀명을 입력해주세요.';
    if (!diff) return '난이도를 선택해주세요.';
    return '';
  }

  // 전송 (타임아웃+재시도)
  async function sendPayload(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      return true;
    } catch (e) {
      clearTimeout(timer);
      try {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return true;
      } catch (e2) {
        try {
          const ok = navigator.sendBeacon?.(SCRIPT_URL, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
          return !!ok;
        } catch { return false; }
      }
    }
  }

  // 제출
  submitBtn.addEventListener('click', async () => {
    const msg = validate();
    if (msg) { showSnack(msg, 'warn'); vibrate(20); return; }

    // UI 선택은 제거했지만, 서버에는 가장 가까운 20분 슬롯을 보냄
    const slotStr = nearest20Slot(new Date());
    $('#walkInTime').value = slotStr;

    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const payload = {
      walkInTime: slotStr,
      roomSize: roomInput.value,
      teamName: ($('#teamName').value || '').trim(),
      difficulty: diffInput.value,
      totalCount: adult + youth,
      youthCount: youth,
      vehicle: ($('#vehicle').value || '').trim()
    };

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    const ok = await sendPayload(payload);
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;

    const adultAmt = adult * PRICE.adult;
    const youthAmt = youth * PRICE.youth;
    const totalAmt = adultAmt + youthAmt;

    if (ok) {
      vibrate(15);
      result.hidden = false;
      result.innerHTML =
        `✅ <strong>전송 완료!</strong><br>` +
        `<strong>총 금액: ${fmt(totalAmt)}원</strong><br>` +
        `성인 ${adult}명 × ${fmt(PRICE.adult)}원 = ${fmt(adultAmt)}원<br>` +
        `청소년 ${youth}명 × ${fmt(PRICE.youth)}원 = ${fmt(youthAmt)}원`;

      showSnack('예약 정보가 전송되었습니다.', 'ok', 2000);

      // --- 전체 리셋 ---
      form.reset();                     // 입력값 초기화
      $('#walkInTime').value = '';      // 숨김값도 초기화
      // 선택 토글 해제
      roomButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
      diffButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
      $('#roomSize').value = '';
      $('#difficulty').value = '';
      manualRoomSelected = false;
      manualDiffSelected = false;
      clearRoomBadges();
      // 가격 영역 초기화
      priceText.textContent = '0';
      priceDetail.textContent = `성인 0 × ${fmt(PRICE.adult)} + 청소년 0 × ${fmt(PRICE.youth)}`;
      // draft 삭제
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      // 요약 초기화
      syncSummary('새로 예약을 시작할 수 있어요. 인원을 다시 선택해 주세요 😄');
    } else {
      showSnack('전송에 실패했습니다. 네트워크 상태를 확인 후 다시 시도해주세요.', 'error', 2500);
    }

  });
});

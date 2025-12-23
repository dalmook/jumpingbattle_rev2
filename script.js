// ===== 환경 =====
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJnzGLudNkwinjSCL78wciFhZplXciJwbQo5VcRnm_8rxbbmnW5CDn2yzKgw1pNWFKdw/exec';
const PRICE = { adult: 7000, youth: 5000 };
const STORAGE_KEY = 'jb-reserve-draft-v3'; // v3: 디자인/UX 개선 반영

// ===== 유틸 =====
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };
const fmt = n => Number(n).toLocaleString();

function nearest20Slot(base = new Date()) {
  const slots = [0, 20, 40];
  const d = new Date(base);
  let h = d.getHours(), m = d.getMinutes();
  let chosen = slots.find(s => m <= s + 3);
  if (chosen === undefined) { h = (h + 1) % 24; chosen = 0; }
  return `${String(h).padStart(2, '0')}:${String(chosen).padStart(2, '0')}`;
}

function saveDraft(obj) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {} }
function loadDraft() { try { const t = localStorage.getItem(STORAGE_KEY); return t ? JSON.parse(t) : null; } catch { return null; } }
function clearDraft(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function showSnack(msg, type = 'info', ms = 1800) {
  const el = $('#snackbar');
  el.textContent = msg;
  el.className = `snackbar ${type} show`;
  $('#liveRegion').textContent = msg;
  setTimeout(() => el.classList.remove('show'), ms);
}

function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// ===== 메인 =====
document.addEventListener('DOMContentLoaded', () => {
  const form = $('#reservationForm');
  const result = $('#result');
  const submitBtn = $('#submitBtn');
  const resetBtn = $('#resetBtn');

  const priceText = $('#priceText');
  const priceDetail = $('#priceDetail');
  const summaryText = $('#summaryText');

  const roomButtons = $$('.room-buttons .seg');
  const roomInput = $('#roomSize');

  const diffButtons = $$('.difficulty-buttons .diff');
  const diffInput = $('#difficulty');

  const stepperFill = $('#stepperFill');
  const dots = $$('.dot');
function syncStickybarHeight(){
  const bar = document.querySelector('.stickybar');
  if (!bar) return;
  document.documentElement.style.setProperty('--stickybar-h', `${bar.offsetHeight}px`);
}

syncStickybarHeight();
window.addEventListener('resize', syncStickybarHeight);
  // 팀명 자동 생성
  const teamNameList = [
    '순대','떡볶이','대박','제로콜라','불고기와퍼','보노보노','요리왕비룡','검정고무신','도라에몽',
    '런닝맨','호빵맨','괴짜가족','우르사','쿠쿠다스','갈비탕','돼지국밥','순대국','파리지옥',
    '은하철도999','아이언맨','호나우딩요','독수리슛','번개슛','피구왕통키','도깨비슛'
  ];
  const teamPrefix = ['점핑', '번쩍', '퐁당', '쌩쌩', '두근', '말랑', '깡총', '폭주'];

  function makeTeamName(){
    const base = pick(teamNameList);
    const pre = pick(teamPrefix);
    // 너무 길어지면 prefix 없이
    const name = (pre + base).slice(0, 20);
    return name;
  }
  function scrollToField(el) {
  // 키보드 올라오는 타이밍 때문에 살짝 딜레이
  setTimeout(() => {
    const offset = 150; // stickybar + 여유
    const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, 220);
}

['vehicle', 'teamName', 'adultCount', 'youthCount'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('focus', () => scrollToField(el));
});
  // 방/난이도 선택 토글
  roomButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      roomButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      roomInput.value = btn.dataset.value;
      vibrate(10);
      refresh();
    });
  });

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      diffInput.value = btn.dataset.value;
      vibrate(10);
      refresh();
    });
  });

  // 인원 카운터 +/-
  function adjustCount(id, delta) {
    const inp = document.getElementById(id);
    const v = Math.max(0, (Number(inp.value) || 0) + delta);
    inp.value = v;
    vibrate(8);
    refresh();
  }
  $$('.btn-ghost.minus').forEach(b => b.addEventListener('click', () => adjustCount(b.dataset.target, -1)));
  $$('.btn-ghost.plus').forEach(b => b.addEventListener('click', () => adjustCount(b.dataset.target, 1)));

  $('#adultCount').addEventListener('input', refresh);
  $('#youthCount').addEventListener('input', refresh);

  // 팀명 자동 생성/추천
  $('#generateTeamNameBtn').addEventListener('click', () => {
    $('#teamName').value = makeTeamName();
    vibrate(10);
    refresh();
  });
  $('#suggestBtn').addEventListener('click', () => {
    const t = $('#teamName').value.trim();
    if (!t) {
      $('#teamName').value = makeTeamName();
      showSnack('추천 팀명 넣어드렸어요! 😆', 'ok', 1400);
    } else {
      showSnack('팀명 너무 좋아요! 그대로 가도 OK 👌', 'ok', 1400);
    }
    vibrate(10);
    refresh();
  });

  $('#teamName').addEventListener('input', refresh);

  // 차량번호 숫자 4자리 제한
  $('#vehicle').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    refresh();
  });

  // 가격 표시
  function syncPrice() {
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const adultAmt = adult * PRICE.adult;
    const youthAmt = youth * PRICE.youth;
    const total = adultAmt + youthAmt;
    priceText.textContent = fmt(total);
    priceDetail.textContent = `성인 ${adult} × ${fmt(PRICE.adult)} + 청소년 ${youth} × ${fmt(PRICE.youth)}`;
  syncStickybarHeight(); // ✅ 추가
  }

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

  function computeProgress() {
    const room = !!roomInput.value;
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const people = (adult + youth) > 0;
    const team = ($('#teamName').value || '').trim().length > 0;
    const diff = !!diffInput.value;
    // 4개 체크포인트: 방/인원+팀명/난이도/차량(선택이라 진행도에는 미반영)
    const done = [room, (people && team), diff].filter(Boolean).length;
    // 0~3 단계 -> 0~100
    const pct = Math.round((done / 3) * 100);
    return { done, pct, room, people, team, diff };
  }

  function updateStepper() {
    const { done, pct } = computeProgress();
    stepperFill.style.width = `${pct}%`;
    dots.forEach((d, i) => {
      d.classList.toggle('on', i < Math.max(1, done + 1)); // 시작점도 켜지게
    });
  }

  function updateSummary() {
    const room = roomInput.value ? `방: ${roomInput.value}` : '방: 미선택';
    const diff = diffInput.value ? `난이도: ${diffInput.value.replace(/^[ㄱ-ㅎ]/, '')}` : '난이도: 미선택';
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const people = (adult + youth) > 0 ? `인원: ${adult + youth}명 (성인 ${adult}, 청소년 ${youth})` : '인원: 0명';
    summaryText.textContent = `${room} · ${diff} · ${people}`;
  }

  function isReadyToSubmit() {
    const room = roomInput.value;
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    const team = ($('#teamName').value || '').trim();
    const diff = diffInput.value;
    return !!room && (adult + youth > 0) && !!team && !!diff;
  }

  function refresh() {
    syncPrice();
    updateDraft();
    updateStepper();
    updateSummary();
    submitBtn.disabled = !isReadyToSubmit();
  }

  // Draft 복원
  (function restore() {
    const d = loadDraft();
    if (!d) { refresh(); return; }

    if (d.roomSize) {
      const btn = Array.from(roomButtons).find(b => b.dataset.value === d.roomSize);
      if (btn) btn.click();
      else roomInput.value = d.roomSize;
    }
    if (d.difficulty) {
      const btn = Array.from(diffButtons).find(b => b.dataset.value === d.difficulty);
      if (btn) btn.click();
      else diffInput.value = d.difficulty;
    }
    if (Number.isFinite(d.adultCount)) $('#adultCount').value = d.adultCount;
    if (Number.isFinite(d.youthCount)) $('#youthCount').value = d.youthCount;
    if (d.teamName) $('#teamName').value = d.teamName;
    if (d.vehicle) $('#vehicle').value = d.vehicle;

    // 버튼 클릭 복원 과정에서 refresh가 호출될 수 있으니 마지막에 한번 더
    refresh();
  })();

  // 검증
  function validate() {
    if (!roomInput.value) return '방을 선택해주세요.';
    const adult = Number($('#adultCount').value || 0);
    const youth = Number($('#youthCount').value || 0);
    if (adult + youth <= 0) return '인원 수를 입력해주세요.';
    if (!($('#teamName').value || '').trim()) return '팀명을 입력해주세요.';
    if (!diffInput.value) return '난이도를 선택해주세요.';
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

  // 전체 리셋
  function hardReset() {
    form.reset();
    $('#walkInTime').value = '';

    roomButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
    diffButtons.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
    roomInput.value = '';
    diffInput.value = '';

    clearDraft();

    result.hidden = true;
    result.innerHTML = '';

    refresh();
  }

  resetBtn.addEventListener('click', () => {
    hardReset();
    showSnack('입력값을 초기화했어요 🙂', 'ok', 1400);
    vibrate(12);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 제출
  submitBtn.addEventListener('click', async () => {
    const msg = validate();
    if (msg) { showSnack(msg, 'warn'); vibrate(20); return; }

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
    submitBtn.disabled = !isReadyToSubmit(); // 다시 상태 반영

    if (ok) {
      vibrate(15);
      result.hidden = false;
      result.innerHTML = `✅ <strong>전송 완료!</strong><br>예약 정보가 정상 전송되었습니다 🎉`;
      showSnack('예약 정보가 전송되었습니다.', 'ok', 2000);

      // 성공 후 리셋
      hardReset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showSnack('전송에 실패했습니다. 네트워크 상태 확인 후 다시 시도해주세요.', 'error', 2500);
      submitBtn.disabled = false;
    }
  });

  // 첫 로드
  refresh();
});

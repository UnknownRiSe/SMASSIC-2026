// ============================================================
// CBT SMASSIC 2026 — SISWA CLIENT
// Features: Image in options, BSK (complex true/false), proper zoom
// ============================================================
const SUPABASE_URL = 'https://wwchdqtqakpbjswkavnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rwPcbkV7Y6Fi1AKCET40Yg_ae7HGaZr';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE ============
let currentSiswa = null;
let currentMapel = '';
let soalList = [];
let jawaban = {};
let flagged = {};
let currentIndex = 0;
let violations = 0;
let lastViolationTime = 0;
let timerInterval = null;
let heartbeatInterval = null;
let warningChannel = null;
let examActive = false;
let examSubmitted = false;
let isBlocked = false;
let clientBlocked = false;
let waktuMulai = '';
let sisaDetik = 0;
let acListenersAttached = false;
const DEFAULT_DURASI = 90;

// Anti-cheat state
let windowSizeCheckInterval = null;
let focusLostCount = 0;
let mouseLeaveCount = 0;
let lastMouseLeaveTime = 0;
let resizeDebounce = null;
let isZoomingImage = false;

// Zoom state
let zoomScale = 1;
let zoomPanX = 0;
let zoomPanY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTouchDist = 0;

const MAPEL_LIST = [
  { nama: 'Biologi', icon: '🧬', color: '#10b981' },
  { nama: 'Matematika', icon: '📐', color: '#3b82f6' },
  { nama: 'IPA', icon: '🔬', color: '#8b5cf6' },
  { nama: 'IPS', icon: '🌍', color: '#f59e0b' }
];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  showPage('loginPage');
  initZoomHandlers();
  try {
    const saved = localStorage.getItem('cbt_siswa');
    if (saved) {
      currentSiswa = JSON.parse(saved);
      loadViolationsLocal();
      if (violations >= 3) { showBlocked(); return; }
      showPage('mapelPage');
      renderMapelButtons();
    }
  } catch (e) { showPage('loginPage'); }
  document.getElementById('inputNIS').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('inputPassword').focus(); });
  document.getElementById('inputPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ============ RENDER MATH ============
function renderMath(el) {
  if (!el) return;
  const tryRender = () => {
    if (window.renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } else { setTimeout(tryRender, 200); }
  };
  tryRender();
}

// ============ PAGES ============
function showPage(id) {
  ['loginPage', 'mapelPage', 'examPage', 'resultPage'].forEach(p => {
    document.getElementById(p).style.display = (p === id) ? 'flex' : 'none';
  });
  if (id !== 'examPage') examActive = false;
}

function showL() { document.getElementById('loader').classList.add('active'); }
function hideL() { document.getElementById('loader').classList.remove('active'); }

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

function togglePw() {
  const inp = document.getElementById('inputPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ============ LOGIN ============
async function doLogin() {
  const nis = document.getElementById('inputNIS').value.trim();
  const pw = document.getElementById('inputPassword').value.trim();
  const alertEl = document.getElementById('loginAlert');
  alertEl.classList.remove('show');
  if (!nis || !pw) {
    alertEl.textContent = 'NIS dan Password wajib diisi!';
    alertEl.classList.add('show');
    return;
  }
  document.getElementById('btnLogin').disabled = true;
  showL();
  try {
    const { data, error } = await sb.from('SISWA').select('NIS, Password, Nama, Sekolah, Status').eq('NIS', nis).eq('Password', pw).maybeSingle();
    hideL();
    document.getElementById('btnLogin').disabled = false;
    if (error || !data) { alertEl.textContent = 'NIS atau Password salah!'; alertEl.classList.add('show'); return; }
    const status = (data.Status || '').toUpperCase();
    if (status === 'KICKED') { alertEl.textContent = 'Anda dikeluarkan. Hubungi pengawas.'; alertEl.classList.add('show'); return; }
    if (status === 'BLOCKED') { alertEl.textContent = 'Akun DIBLOKIR. Hubungi pengawas.'; alertEl.classList.add('show'); return; }
    if (status === 'SELESAI') { alertEl.textContent = 'Anda sudah menyelesaikan ujian.'; alertEl.classList.add('show'); return; }
    await sb.from('SISWA').update({ Status: 'ONLINE', Last_Heartbeat: new Date().toISOString() }).eq('NIS', nis);
    currentSiswa = { NIS: data.NIS, Nama: data.Nama, Sekolah: data.Sekolah || '' };
    localStorage.setItem('cbt_siswa', JSON.stringify(currentSiswa));
    violations = 0; clientBlocked = false; isBlocked = false; clearViolationsLocal();
    toast('Login berhasil! Selamat datang, ' + data.Nama, 'success');
    showPage('mapelPage');
    renderMapelButtons();
  } catch (e) {
    hideL(); document.getElementById('btnLogin').disabled = false;
    alertEl.textContent = 'Kesalahan: ' + e.message; alertEl.classList.add('show');
  }
}

function doLogout() {
  if (examActive) { toast('Selesaikan ujian terlebih dahulu!', 'warning'); return; }
  if (currentSiswa) sb.from('SISWA').update({ Status: 'OFFLINE' }).eq('NIS', currentSiswa.NIS).then(() => {});
  unsubscribeWarning(); fullResetState();
  localStorage.removeItem('cbt_siswa'); currentSiswa = null; showPage('loginPage');
}

// ============ RECHECK BLOCK/KICK ============
async function recheckBlock() {
  if (!currentSiswa) { location.reload(); return; }
  const btn = document.getElementById('recheckBlockBtn');
  btn.disabled = true; btn.textContent = '🔄 Mengecek...';
  try {
    const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).maybeSingle();
    btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status';
    if (data && (data.Status || '').toUpperCase() === 'BLOCKED') {
      document.getElementById('recheckInfo').textContent = 'Masih diblokir. (' + new Date().toLocaleTimeString('id-ID') + ')';
    } else {
      fullResetState(); document.getElementById('blockedOverlay').classList.remove('active');
      toast('Akun diaktivasi!', 'success'); showPage('loginPage');
      document.getElementById('inputNIS').value = currentSiswa.NIS;
      currentSiswa = null; localStorage.removeItem('cbt_siswa');
    }
  } catch (e) { btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status'; }
}

async function recheckKick() {
  if (!currentSiswa) { location.reload(); return; }
  const btn = document.getElementById('recheckKickBtn');
  btn.disabled = true; btn.textContent = '🔄 Mengecek...';
  try {
    const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).maybeSingle();
    btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status';
    if (data && (data.Status || '').toUpperCase() === 'KICKED') {
      document.getElementById('recheckKickInfo').textContent = 'Masih dikeluarkan. (' + new Date().toLocaleTimeString('id-ID') + ')';
    } else {
      fullResetState(); document.getElementById('kickedOverlay').classList.remove('active');
      toast('Akun diaktivasi!', 'success'); showPage('loginPage');
      document.getElementById('inputNIS').value = currentSiswa.NIS;
      currentSiswa = null; localStorage.removeItem('cbt_siswa');
    }
  } catch (e) { btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status'; }
}

// ============ FULL RESET ============
function fullResetState() {
  examActive = false; examSubmitted = false; isBlocked = false; clientBlocked = false;
  violations = 0; currentMapel = ''; soalList = []; jawaban = {}; flagged = {}; currentIndex = 0;
  focusLostCount = 0; mouseLeaveCount = 0;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (windowSizeCheckInterval) { clearInterval(windowSizeCheckInterval); windowSizeCheckInterval = null; }
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  if (currentSiswa) clearViolationsLocal();
  document.getElementById('blockedOverlay').classList.remove('active');
  document.getElementById('kickedOverlay').classList.remove('active');
  document.getElementById('cheatOverlay').classList.remove('active');
}

// ============ MAPEL SELECT ============
function renderMapelButtons() {
  if (!currentSiswa) return;
  document.getElementById('mapelWelcome').textContent = 'Selamat Datang, ' + currentSiswa.Nama;
  const container = document.getElementById('mapelButtons');
  container.innerHTML = MAPEL_LIST.map(m => `
    <button class="mapel-btn" onclick="startExam('${m.nama}')">
      <div class="mapel-icon" style="background:${m.color}15;color:${m.color}">${m.icon}</div>
      <div class="mapel-info">
        <div class="mapel-name">${m.nama}</div>
        <div class="mapel-sub">Mulai ujian ${m.nama}</div>
      </div>
      <span style="color:var(--gray)">→</span>
    </button>
  `).join('');
}

// ============ START EXAM ============
async function startExam(mapel) {
  currentMapel = mapel;
  showL();
  try {
    let durasi = DEFAULT_DURASI * 60;
    let shouldShuffle = true;
    try {
      const { data: peng } = await sb.from('PENGATURAN').select('Durasi_menit, Status_ujian, Waktu_mulai, Waktu_selesai, Acak_soal').eq('Mapel', mapel).maybeSingle();
      if (peng) {
        if (peng.Status_ujian === 'SELESAI') { hideL(); toast('Ujian ' + mapel + ' sudah berakhir.', 'error'); return; }
        if (peng.Status_ujian === 'BELUM') { hideL(); toast('Ujian ' + mapel + ' belum dimulai.', 'warning'); return; }
        shouldShuffle = peng.Acak_soal !== false;
        if (peng.Waktu_selesai) {
          const remaining = Math.max(0, Math.floor((new Date(peng.Waktu_selesai).getTime() - Date.now()) / 1000));
          if (remaining <= 0) { hideL(); toast('Waktu ujian habis.', 'error'); return; }
          durasi = remaining;
        } else { durasi = (peng.Durasi_menit || DEFAULT_DURASI) * 60; }
      }
    } catch (e) {}

    const { data: existing } = await sb.from('HASIL').select('id').eq('NIS', currentSiswa.NIS).eq('Mapel', mapel).maybeSingle();
    if (existing) { hideL(); toast('Anda sudah mengerjakan ujian ' + mapel, 'warning'); return; }

    const { data: soalRaw, error: soalErr } = await sb.from('SOAL')
      .select('No, Soal, Opsi_A, Opsi_B, Opsi_C, Opsi_D, Opsi_E, Kunci, Bobot, Tipe, Gambar, Gambar_A, Gambar_B, Gambar_C, Gambar_D, Gambar_E, Sub_soal, Mapel')
      .eq('Mapel', mapel).order('No', { ascending: true });

    if (soalErr || !soalRaw || !soalRaw.length) { hideL(); toast('Soal tidak ditemukan.', 'error'); return; }

    let finalSoal = [...soalRaw];
    if (shouldShuffle) {
      for (let j = finalSoal.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [finalSoal[j], finalSoal[k]] = [finalSoal[k], finalSoal[j]];
      }
    }
    hideL();
    initExam(mapel, finalSoal, durasi);
  } catch (e) { hideL(); toast('Gagal: ' + e.message, 'error'); }
}

// ============ INIT EXAM ============
function initExam(mapel, soal, durasiDetik) {
  soalList = soal;
  examSubmitted = false; isBlocked = false; clientBlocked = false;
  if (violations >= 3) { showBlocked(); return; }

  const saved = loadJawabanLocal();
  if (saved && saved.mapel === mapel) {
    jawaban = saved.jawaban || {}; flagged = saved.flagged || {};
    currentIndex = saved.currentIndex || 0;
    waktuMulai = saved.waktuMulai || new Date().toISOString();
    if (saved.sisaDetik && saved.time) {
      sisaDetik = Math.max(0, saved.sisaDetik - Math.floor((Date.now() - saved.time) / 1000));
    } else { sisaDetik = durasiDetik; }
  } else {
    jawaban = {}; flagged = {}; currentIndex = 0;
    waktuMulai = new Date().toISOString(); sisaDetik = durasiDetik;
  }

  document.getElementById('examMapelBadge').textContent = mapel;
  document.getElementById('examStudentName').textContent = currentSiswa.Nama + ' (' + currentSiswa.NIS + ')';
  showPage('examPage');
  examActive = false;
  buildGrid(); renderSoal(currentIndex); startTimer(); startHeartbeat(); subscribeWarning();
  if (!acListenersAttached) { setupAntiCheat(); acListenersAttached = true; }
  startWindowSizeMonitor();
  sb.from('SISWA').update({ Status: 'ONLINE' }).eq('NIS', currentSiswa.NIS).then(() => {});
  requestFS();
  setTimeout(() => {
    if (!examSubmitted && !isBlocked && !clientBlocked) examActive = true;
  }, 3000);
  if (sisaDetik <= 0) { toast('Waktu habis!', 'warning'); doSubmit(true); }
}

function requestFS() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) {}
}

// ============ ZOOM SYSTEM (PROPER PINCH/SCROLL ZOOM) ============
function initZoomHandlers() {
  const overlay = document.getElementById('imgZoomOverlay');
  const container = document.getElementById('zoomContainer');
  const img = document.getElementById('zoomImg');

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeZoom();
  });

  document.getElementById('zoomCloseBtn').addEventListener('click', () => closeZoom());
  document.getElementById('zoomInBtn').addEventListener('click', () => { zoomScale = Math.min(5, zoomScale * 1.3); applyZoomTransform(); });
  document.getElementById('zoomOutBtn').addEventListener('click', () => { zoomScale = Math.max(0.3, zoomScale / 1.3); applyZoomTransform(); });
  document.getElementById('zoomResetBtn').addEventListener('click', () => { zoomScale = 1; zoomPanX = 0; zoomPanY = 0; applyZoomTransform(); });

  // Mouse wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoomScale = Math.max(0.3, Math.min(5, zoomScale * delta));
    applyZoomTransform();
  }, { passive: false });

  // Mouse drag
  container.addEventListener('mousedown', (e) => {
    if (zoomScale <= 1) return;
    isDragging = true; dragStartX = e.clientX - zoomPanX; dragStartY = e.clientY - zoomPanY;
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    zoomPanX = e.clientX - dragStartX; zoomPanY = e.clientY - dragStartY;
    applyZoomTransform();
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    const container = document.getElementById('zoomContainer');
    if (container) container.style.cursor = zoomScale > 1 ? 'grab' : 'zoom-in';
  });

  // Touch pinch zoom
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    } else if (e.touches.length === 1 && zoomScale > 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX - zoomPanX;
      dragStartY = e.touches[0].clientY - zoomPanY;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastTouchDist > 0) {
        zoomScale = Math.max(0.3, Math.min(5, zoomScale * (dist / lastTouchDist)));
        applyZoomTransform();
      }
      lastTouchDist = dist;
    } else if (e.touches.length === 1 && isDragging) {
      zoomPanX = e.touches[0].clientX - dragStartX;
      zoomPanY = e.touches[0].clientY - dragStartY;
      applyZoomTransform();
    }
  }, { passive: false });

  container.addEventListener('touchend', () => { isDragging = false; lastTouchDist = 0; });

  // Double-tap to zoom
  let lastTap = 0;
  container.addEventListener('touchend', (e) => {
    if (e.touches.length > 0) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      if (zoomScale > 1) { zoomScale = 1; zoomPanX = 0; zoomPanY = 0; }
      else { zoomScale = 2.5; }
      applyZoomTransform();
    }
    lastTap = now;
  });

  // Double-click to zoom
  container.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (zoomScale > 1) { zoomScale = 1; zoomPanX = 0; zoomPanY = 0; }
    else { zoomScale = 2.5; }
    applyZoomTransform();
  });
}

function applyZoomTransform() {
  const img = document.getElementById('zoomImg');
  const container = document.getElementById('zoomContainer');
  img.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale})`;
  container.style.cursor = zoomScale > 1 ? 'grab' : 'zoom-in';
  document.getElementById('zoomLevelDisplay').textContent = Math.round(zoomScale * 100) + '%';
}

function zoomImg(src) {
  if (!src) return;
  isZoomingImage = true;
  zoomScale = 1; zoomPanX = 0; zoomPanY = 0;
  const img = document.getElementById('zoomImg');
  img.src = src;
  img.style.transform = 'translate(0,0) scale(1)';
  document.getElementById('zoomLevelDisplay').textContent = '100%';
  document.getElementById('imgZoomOverlay').classList.add('active');
}

function closeZoom() {
  document.getElementById('imgZoomOverlay').classList.remove('active');
  setTimeout(() => { isZoomingImage = false; }, 500);
}

// ============ GRID ============
function buildGrid() {
  const grid = document.getElementById('soalGrid');
  grid.innerHTML = soalList.map((s, i) => `<div class="soal-num" onclick="goToSoal(${i})">${i + 1}</div>`).join('');
  updateGrid();
}

function updateGrid() {
  const nums = document.querySelectorAll('.soal-num');
  let answered = 0, unanswered = 0, flagCount = 0;
  nums.forEach((el, i) => {
    const s = soalList[i];
    el.className = 'soal-num';
    if (i === currentIndex) el.classList.add('active');
    const tipe = (s.Tipe || 'PG').toUpperCase();
    let hasAnswer = false;
    if (tipe === 'BSK') {
      const subs = s.Sub_soal || [];
      hasAnswer = subs.some(sub => {
        const key = s.No + '_' + sub.label;
        return (jawaban[key] || '').toString().trim() !== '';
      });
    } else {
      const ans = (jawaban[s.No] || jawaban[String(s.No)] || '').toString().trim();
      hasAnswer = ans !== '';
    }
    if (hasAnswer) { el.classList.add('answered'); answered++; } else { unanswered++; }
    if (flagged[s.No]) { el.classList.add('flagged'); flagCount++; }
  });
  document.getElementById('stAnswered').textContent = answered;
  document.getElementById('stUnanswered').textContent = unanswered;
  document.getElementById('stFlagged').textContent = flagCount;
  const vb = document.getElementById('violationBadge');
  if (violations > 0) { vb.className = 'violation-badge warn'; vb.textContent = '⚠️ ' + violations + '/3'; }
  else { vb.className = 'violation-badge clean'; vb.textContent = '✅ Bersih'; }
}

// ============ RENDER SOAL (PG, BS, IS, BSK) ============
function renderSoal(index) {
  if (index < 0 || index >= soalList.length) return;
  currentIndex = index;
  const s = soalList[index];
  const tipe = (s.Tipe || 'PG').toUpperCase();
  const card = document.getElementById('questionCard');

  const tipeBadges = {
    PG: ['Pilihan Ganda', 'tipe-pg'],
    BS: ['Benar / Salah', 'tipe-bs'],
    IS: ['Isian Singkat', 'tipe-is'],
    BSK: ['Benar / Salah Kompleks', 'tipe-bsk']
  };
  const [tipeLabel, tipeClass] = tipeBadges[tipe] || tipeBadges.PG;

  // Main image
  let imgHtml = '';
  if (s.Gambar && s.Gambar.trim()) {
    imgHtml = buildZoomableImg(s.Gambar.trim(), 'Gambar soal');
  }

  let optionsHtml = '';

  if (tipe === 'PG') {
    const currentAnswer = (jawaban[s.No] || jawaban[String(s.No)] || '').toString();
    const options = [];
    if (s.Opsi_A) options.push({ key: 'A', text: s.Opsi_A, img: s.Gambar_A });
    if (s.Opsi_B) options.push({ key: 'B', text: s.Opsi_B, img: s.Gambar_B });
    if (s.Opsi_C) options.push({ key: 'C', text: s.Opsi_C, img: s.Gambar_C });
    if (s.Opsi_D) options.push({ key: 'D', text: s.Opsi_D, img: s.Gambar_D });
    if (s.Opsi_E) options.push({ key: 'E', text: s.Opsi_E, img: s.Gambar_E });

    optionsHtml = `<div class="options-list">${options.map(o => {
      let optImgHtml = '';
      if (o.img && o.img.trim()) {
        optImgHtml = `<div class="option-img-wrap">
          <img src="${esc(o.img.trim())}" alt="Opsi ${o.key}" class="option-img" data-zoomsrc="${esc(o.img.trim())}"
            onerror="this.style.display='none'">
        </div>`;
      }
      return `<div class="option-item${currentAnswer.toUpperCase() === o.key ? ' selected' : ''}" onclick="selectAnswer('${s.No}','${o.key}')">
        <div class="option-letter">${o.key}</div>
        <div class="option-content">
          <div class="option-text">${esc(o.text)}</div>
          ${optImgHtml}
        </div>
      </div>`;
    }).join('')}</div>`;

  } else if (tipe === 'BS') {
    const currentAnswer = (jawaban[s.No] || jawaban[String(s.No)] || '').toString();
    optionsHtml = `<div class="bs-options">
      <div class="bs-option${currentAnswer.toUpperCase() === 'BENAR' ? ' selected' : ''}" onclick="selectAnswer('${s.No}','Benar')">
        <div class="bs-icon">✅</div> Benar
      </div>
      <div class="bs-option${currentAnswer.toUpperCase() === 'SALAH' ? ' selected' : ''}" onclick="selectAnswer('${s.No}','Salah')">
        <div class="bs-icon">❌</div> Salah
      </div>
    </div>`;

  } else if (tipe === 'IS') {
    const currentAnswer = (jawaban[s.No] || jawaban[String(s.No)] || '').toString();
    optionsHtml = `<div class="isian-group">
      <div class="isian-label">Ketik jawaban Anda:</div>
      <input type="text" class="isian-input" id="isianInput" value="${esc(currentAnswer)}"
        placeholder="Ketik jawaban di sini..." oninput="selectAnswer('${s.No}', this.value)"
        autocomplete="off" spellcheck="false">
    </div>`;

  } else if (tipe === 'BSK') {
    // Complex True/False - table format
    const subs = s.Sub_soal || [];
    const totalBobot = subs.reduce((sum, sub) => sum + (sub.bobot || 1), 0);
    optionsHtml = `<div class="bsk-container">
      <div class="bsk-header">
        <span class="bsk-title">Tentukan Benar atau Salah untuk setiap pernyataan</span>
        <span class="bsk-bobot">Total bobot: ${totalBobot}</span>
      </div>
      <table class="bsk-table">
        <thead>
          <tr>
            <th class="bsk-th-no">No</th>
            <th class="bsk-th-text">Pernyataan</th>
            <th class="bsk-th-answer">Benar</th>
            <th class="bsk-th-answer">Salah</th>
            <th class="bsk-th-bobot">Bobot</th>
          </tr>
        </thead>
        <tbody>
          ${subs.map((sub, idx) => {
            const key = s.No + '_' + sub.label;
            const ans = (jawaban[key] || '').toString().toUpperCase();
            return `<tr class="bsk-row">
              <td class="bsk-cell-no">${sub.label || String.fromCharCode(97 + idx)}</td>
              <td class="bsk-cell-text">${esc(sub.text)}</td>
              <td class="bsk-cell-radio">
                <div class="bsk-radio ${ans === 'BENAR' ? 'selected benar' : ''}" onclick="selectBSKAnswer('${s.No}','${sub.label}','Benar')">
                  ${ans === 'BENAR' ? '✅' : '○'}
                </div>
              </td>
              <td class="bsk-cell-radio">
                <div class="bsk-radio ${ans === 'SALAH' ? 'selected salah' : ''}" onclick="selectBSKAnswer('${s.No}','${sub.label}','Salah')">
                  ${ans === 'SALAH' ? '❌' : '○'}
                </div>
              </td>
              <td class="bsk-cell-bobot">${sub.bobot || 1}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  card.innerHTML = `
    <div class="question-header">
      <div class="question-num-wrap">
        <div class="question-num">${index + 1}</div>
        <div class="question-total">dari ${soalList.length} soal</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span class="tipe-badge ${tipeClass}">${tipeLabel}</span>
        ${s.Bobot && s.Bobot > 1 ? '<span class="tipe-badge" style="background:#fef3c7;color:#92400e">Bobot ' + s.Bobot + '</span>' : ''}
      </div>
    </div>
    <div class="question-text" id="qText">${esc(s.Soal)}</div>
    ${imgHtml}
    ${optionsHtml}
  `;

  setTimeout(() => {
    renderMath(document.getElementById('qText'));
    document.querySelectorAll('.option-text').forEach(el => renderMath(el));
    document.querySelectorAll('.bsk-cell-text').forEach(el => renderMath(el));
    // Bind all zoomable images
    card.querySelectorAll('[data-zoomsrc]').forEach(img => {
      img.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        zoomImg(this.getAttribute('data-zoomsrc'));
      });
    });
    card.querySelectorAll('.img-zoom-trigger').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        zoomImg(this.getAttribute('data-src'));
      });
    });
  }, 50);

  updateGrid(); updateFlagButton(); updateNavButtons();
  if (tipe === 'IS') setTimeout(() => { const inp = document.getElementById('isianInput'); if (inp) inp.focus(); }, 100);
}

function buildZoomableImg(src, alt) {
  return `<div class="question-img-wrap">
    <img src="${esc(src)}" alt="${esc(alt)}" class="question-img" data-zoomsrc="${esc(src)}"
      onerror="this.parentElement.innerHTML='<div style=\\'color:var(--danger);padding:12px\\'>⚠️ Gambar gagal dimuat</div>'">
    <button type="button" class="img-zoom-trigger" data-src="${esc(src)}">🔍 Klik untuk memperbesar</button>
  </div>`;
}

function selectAnswer(no, val) {
  jawaban[no] = val;
  saveJawabanLocal();
  const tipe = (soalList[currentIndex]?.Tipe || 'PG').toUpperCase();
  if (tipe !== 'IS') renderSoal(currentIndex);
  else updateGrid();
}

function selectBSKAnswer(soalNo, subLabel, val) {
  const key = soalNo + '_' + subLabel;
  jawaban[key] = val;
  saveJawabanLocal();
  renderSoal(currentIndex);
}

// ============ NAVIGATION ============
function goToSoal(i) { renderSoal(i); document.getElementById('soalSidebar').classList.remove('show'); }
function prevSoal() { if (currentIndex > 0) { renderSoal(currentIndex - 1); saveJawabanLocal(); } }
function nextSoal() { if (currentIndex < soalList.length - 1) { renderSoal(currentIndex + 1); saveJawabanLocal(); } }

function updateNavButtons() {
  document.getElementById('btnPrev').disabled = currentIndex === 0;
  const btnNext = document.getElementById('btnNext');
  if (currentIndex === soalList.length - 1) {
    btnNext.innerHTML = '📤 Kumpulkan'; btnNext.className = 'btn-nav submit';
    btnNext.onclick = () => openSubmitModal(); btnNext.disabled = false;
  } else {
    btnNext.innerHTML = 'Selanjutnya →'; btnNext.className = 'btn-nav';
    btnNext.onclick = () => nextSoal(); btnNext.disabled = false;
  }
}

function toggleFlag() {
  const s = soalList[currentIndex]; if (!s) return;
  flagged[s.No] = !flagged[s.No]; saveJawabanLocal(); updateGrid(); updateFlagButton();
}

function updateFlagButton() {
  const s = soalList[currentIndex];
  const btn = document.getElementById('btnFlag');
  if (s && flagged[s.No]) { btn.classList.add('active'); btn.textContent = '🚩 Ditandai'; }
  else { btn.classList.remove('active'); btn.textContent = '🚩 Tandai'; }
}

function toggleNavPanel() { document.getElementById('soalSidebar').classList.toggle('show'); }

// ============ TIMER ============
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    sisaDetik--;
    updateTimerDisplay();
    if (sisaDetik <= 0) { clearInterval(timerInterval); toast('⏰ Waktu habis!', 'warning'); doSubmit(true); }
    if (sisaDetik % 10 === 0) saveJawabanLocal();
  }, 1000);
}

function updateTimerDisplay() {
  const box = document.getElementById('timerBox');
  const h = Math.floor(Math.max(0, sisaDetik) / 3600);
  const m = Math.floor((Math.max(0, sisaDetik) % 3600) / 60);
  const s = Math.max(0, sisaDetik) % 60;
  box.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  box.classList.remove('warning', 'danger');
  if (sisaDetik <= 60) box.classList.add('danger');
  else if (sisaDetik <= 300) box.classList.add('warning');
}

// ============ HEARTBEAT ============
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (examSubmitted || isBlocked || !examActive || !currentSiswa) return;
    try {
      await sb.from('SISWA').update({ Last_Heartbeat: new Date().toISOString() }).eq('NIS', currentSiswa.NIS);
      const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).maybeSingle();
      if (data) {
        const st = (data.Status || '').toUpperCase();
        if (st === 'KICKED') {
          examActive = false; examSubmitted = true;
          clearInterval(timerInterval); clearInterval(heartbeatInterval);
          document.getElementById('kickedOverlay').classList.add('active'); return;
        }
        if (st === 'BLOCKED') { showBlocked(); return; }
      }
    } catch (e) {}
  }, 30000);
}

function showBlocked() {
  if (isBlocked) return;
  isBlocked = true; clientBlocked = true; examSubmitted = true; examActive = false;
  clearInterval(timerInterval); clearInterval(heartbeatInterval);
  if (windowSizeCheckInterval) { clearInterval(windowSizeCheckInterval); windowSizeCheckInterval = null; }
  document.getElementById('blockedOverlay').classList.add('active');
}

// ============ WARNING SYSTEM ============
function subscribeWarning() {
  unsubscribeWarning();
  if (!currentSiswa) return;
  warningChannel = sb.channel('warn-' + currentSiswa.NIS);
  warningChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'PERINGATAN', filter: `NIS=eq.${currentSiswa.NIS}` }, (payload) => {
    const w = payload.new;
    if (w && !w.Dibaca) showWarningPopup(w);
  });
  warningChannel.subscribe();
  checkUnreadWarnings();
}
function unsubscribeWarning() { if (warningChannel) { sb.removeChannel(warningChannel); warningChannel = null; } }

async function checkUnreadWarnings() {
  if (!currentSiswa) return;
  try {
    const { data } = await sb.from('PERINGATAN').select('*').eq('NIS', currentSiswa.NIS).eq('Dibaca', false).order('Timestamp', { ascending: false }).limit(1);
    if (data && data.length > 0) showWarningPopup(data[0]);
  } catch (e) {}
}

function showWarningPopup(warning) {
  const overlay = document.getElementById('warningOverlay');
  const level = (warning.Level || 'YELLOW').toUpperCase();
  overlay.className = 'warning-overlay active ' + level.toLowerCase();
  const icons = { YELLOW: '🟡', ORANGE: '🟠', RED: '🔴' };
  const titles = { YELLOW: 'Peringatan Kuning', ORANGE: 'Peringatan Oranye', RED: '🚨 PERINGATAN MERAH' };
  document.getElementById('warnIcon').textContent = icons[level] || '⚠️';
  document.getElementById('warnTitle').textContent = titles[level] || 'PERINGATAN';
  document.getElementById('warnMsg').textContent = warning.Pesan || 'Anda mendapat peringatan dari pengawas.';
  overlay.dataset.warningId = warning.id;
}

async function dismissWarning() {
  const overlay = document.getElementById('warningOverlay');
  const id = overlay.dataset.warningId;
  overlay.classList.remove('active');
  if (id) { try { await sb.from('PERINGATAN').update({ Dibaca: true }).eq('id', parseInt(id)); } catch (e) {} }
}

// ============ ANTI-CHEAT ============
function setupAntiCheat() {
  document.addEventListener('copy', e => { if (!examActive) return; e.preventDefault(); reportCheat('Copy', 'Mencoba menyalin'); });
  document.addEventListener('cut', e => { if (!examActive) return; e.preventDefault(); reportCheat('Cut', 'Mencoba memotong'); });
  document.addEventListener('paste', e => {
    if (!examActive) return;
    const isIsian = e.target && (e.target.id === 'isianInput' || e.target.classList.contains('isian-input'));
    if (!isIsian) { e.preventDefault(); reportCheat('Paste', 'Mencoba menempel'); }
  });
  document.addEventListener('contextmenu', e => { if (!examActive) return; e.preventDefault(); reportCheat('Klik Kanan', 'Menu konteks'); });
  document.addEventListener('keydown', e => {
    if (!examActive) return;
    const isIsian = e.target && (e.target.id === 'isianInput' || e.target.classList.contains('isian-input'));
    if (e.ctrlKey && !e.shiftKey && 'cvxauspi'.includes(e.key.toLowerCase())) {
      if (isIsian && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'v')) return;
      e.preventDefault(); reportCheat('Shortcut', 'Ctrl+' + e.key.toUpperCase()); return false;
    }
    if (e.key === 'F12') { e.preventDefault(); reportCheat('DevTools', 'F12'); return false; }
    if (e.ctrlKey && e.shiftKey && 'ijc'.includes(e.key.toLowerCase())) { e.preventDefault(); reportCheat('DevTools', 'Ctrl+Shift+' + e.key.toUpperCase()); return false; }
    if (e.key === 'PrintScreen') { e.preventDefault(); reportCheat('Screenshot', 'PrintScreen'); blurContent(); return false; }
    if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); reportCheat('Screenshot', 'Win+Shift+S'); blurContent(); return false; }
    if (e.altKey && e.key === 'Tab') { e.preventDefault(); reportCheat('Alt+Tab', 'Pindah aplikasi'); return false; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return false; }
  });

  const handleFS = () => {
    if (!examActive || examSubmitted || isBlocked || clientBlocked || isZoomingImage) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      reportCheat('Keluar Fullscreen', 'Fullscreen exit');
      setTimeout(() => { if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS(); }, 1500);
    }
  };
  document.addEventListener('fullscreenchange', handleFS);
  document.addEventListener('webkitfullscreenchange', handleFS);

  document.addEventListener('visibilitychange', () => {
    if (!examActive || examSubmitted || isBlocked || isZoomingImage) return;
    if (document.hidden) reportCheat('Ganti Tab', 'Tab disembunyikan');
  });

  window.addEventListener('blur', () => {
    if (!examActive || examSubmitted || isBlocked || isZoomingImage) return;
    setTimeout(() => {
      if (!document.hasFocus() && examActive && !examSubmitted && !isBlocked && !isZoomingImage)
        reportCheat('Focus Lost', 'Jendela kehilangan fokus');
    }, 500);
  });

  document.addEventListener('mouseleave', (e) => {
    if (!examActive || examSubmitted || isBlocked || isZoomingImage) return;
    const now = Date.now();
    if (now - lastMouseLeaveTime < 10000) return;
    if (e.clientY <= 5) {
      lastMouseLeaveTime = now; mouseLeaveCount++;
      if (mouseLeaveCount >= 3) { reportCheat('Mouse Leave', 'Kursor meninggalkan area'); mouseLeaveCount = 0; }
    }
  });

  document.addEventListener('dragstart', e => e.preventDefault());
  document.addEventListener('selectstart', e => {
    if (examActive) {
      const isIsian = e.target && (e.target.id === 'isianInput' || e.target.classList.contains('isian-input'));
      if (!isIsian) e.preventDefault();
    }
  });

  window.addEventListener('resize', () => {
    if (!examActive || examSubmitted || isBlocked || clientBlocked || isZoomingImage) return;
    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      const notFS = !document.fullscreenElement && !document.webkitFullscreenElement;
      const ratio = window.innerWidth / screen.width;
      if (notFS && ratio < 0.68 && screen.width > 500) {
        reportCheat('Resize/Split', 'Ukuran jendela berubah drastis');
        setTimeout(() => { if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS(); }, 1000);
      }
    }, 1000);
  });
}

function startWindowSizeMonitor() {
  if (windowSizeCheckInterval) clearInterval(windowSizeCheckInterval);
  windowSizeCheckInterval = setInterval(() => {
    if (!examActive || examSubmitted || isBlocked || clientBlocked || isZoomingImage) return;
    const wR = window.innerWidth / screen.width;
    const hR = window.innerHeight / screen.height;
    const notFS = !document.fullscreenElement && !document.webkitFullscreenElement;
    if (notFS && (wR < 0.68 || hR < 0.68) && screen.width > 500) {
      reportCheat('Layar Belah', 'Split screen terdeteksi');
      setTimeout(() => { if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS(); }, 1000);
    }
  }, 3000);
}

function blurContent() {
  const eb = document.querySelector('.exam-body');
  if (eb) { eb.classList.add('content-blurred'); setTimeout(() => eb.classList.remove('content-blurred'), 3000); }
}

async function reportCheat(jenis, detail) {
  if (!examActive || examSubmitted || isBlocked || clientBlocked || !currentSiswa) return;
  const now = Date.now();
  if (now - lastViolationTime < 5000) return;
  lastViolationTime = now;
  violations++;
  saveViolationsLocal();
  try {
    await fetch(SUPABASE_URL + '/rest/v1/KECURANGAN', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ NIS: currentSiswa.NIS, Nama: currentSiswa.Nama, Jenis: jenis, Detail: detail, Timestamp: new Date().toISOString() })
    });
  } catch (e) {}
  if (violations >= 3) {
    clientBlocked = true; examActive = false;
    document.getElementById('cheatMsg').textContent = detail + '. Pelanggaran ke-3! Akun diblokir.';
    document.getElementById('cheatCount').textContent = 'Pelanggaran ke-' + violations + ' - DIBLOKIR';
    document.getElementById('cheatOverlay').classList.add('active');
    try {
      await fetch(SUPABASE_URL + '/rest/v1/SISWA?NIS=eq.' + encodeURIComponent(currentSiswa.NIS), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ Status: 'BLOCKED' })
      });
    } catch (e) {}
    setTimeout(() => { document.getElementById('cheatOverlay').classList.remove('active'); showBlocked(); }, 2500);
    return;
  }
  document.getElementById('cheatMsg').textContent = detail + '. Dicatat dan dilaporkan.';
  document.getElementById('cheatCount').textContent = 'Pelanggaran ke-' + violations + ' dari 3';
  document.getElementById('cheatOverlay').classList.add('active');
  updateGrid();
}

function dismissCheat() {
  document.getElementById('cheatOverlay').classList.remove('active');
  if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS();
}

// ============ SUBMIT ============
function openSubmitModal() {
  const total = soalList.length;
  let answered = 0, unanswered = 0, flagCount = 0;
  soalList.forEach(s => {
    const tipe = (s.Tipe || 'PG').toUpperCase();
    let hasAns = false;
    if (tipe === 'BSK') {
      const subs = s.Sub_soal || [];
      hasAns = subs.some(sub => (jawaban[s.No + '_' + sub.label] || '').toString().trim() !== '');
    } else {
      hasAns = (jawaban[s.No] || jawaban[String(s.No)] || '').toString().trim() !== '';
    }
    if (hasAns) answered++; else unanswered++;
    if (flagged[s.No]) flagCount++;
  });
  document.getElementById('submitSummary').innerHTML =
    '<strong>' + answered + '</strong> dari <strong>' + total + '</strong> soal dijawab.' +
    (unanswered > 0 ? '<br><span style="color:var(--danger)">⚠️ ' + unanswered + ' soal belum dijawab!</span>' : '') +
    (flagCount > 0 ? '<br><span style="color:var(--warning)">🚩 ' + flagCount + ' soal ditandai ragu</span>' : '') +
    '<br>Jawaban <strong>tidak dapat diubah</strong> setelah dikumpulkan.';
  document.getElementById('submitModal').classList.add('active');
}

function closeSubmitModal() { document.getElementById('submitModal').classList.remove('active'); }

async function doSubmit(auto) {
  if (examSubmitted) return;
  examSubmitted = true; examActive = false;
  document.getElementById('submitModal').classList.remove('active');
  clearInterval(timerInterval); clearInterval(heartbeatInterval);
  if (windowSizeCheckInterval) { clearInterval(windowSizeCheckInterval); windowSizeCheckInterval = null; }
  showL();

  let benar = 0, salah = 0, kosong = 0, totalSkor = 0;
  const jawabanRinci = {};

  soalList.forEach(soal => {
    const noStr = String(soal.No);
    const tipe = (soal.Tipe || 'PG').toUpperCase();

    if (tipe === 'BSK') {
      const subs = soal.Sub_soal || [];
      const subAnswers = {};
      subs.forEach(sub => {
        const key = soal.No + '_' + sub.label;
        const ans = (jawaban[key] || '').toString().trim();
        subAnswers[sub.label] = ans;
        const kunci = (sub.kunci || '').trim();
        const bobot = sub.bobot || 1;
        if (!ans) { kosong++; }
        else if (ans.toUpperCase() === kunci.toUpperCase()) { benar++; totalSkor += bobot; }
        else { salah++; }
      });
      jawabanRinci[noStr] = subAnswers;
    } else {
      const jawabanSiswa = (jawaban[soal.No] || jawaban[noStr] || '').toString().trim();
      const kunci = (soal.Kunci || '').trim();
      const bobot = soal.Bobot || 1;
      jawabanRinci[noStr] = jawabanSiswa;
      if (!jawabanSiswa) { kosong++; }
      else {
        let isCorrect = false;
        if (tipe === 'PG') isCorrect = jawabanSiswa.toUpperCase() === kunci.toUpperCase();
        else if (tipe === 'BS') isCorrect = jawabanSiswa.toUpperCase() === kunci.toUpperCase();
        else if (tipe === 'IS') isCorrect = jawabanSiswa.toLowerCase() === kunci.toLowerCase();
        if (isCorrect) { benar++; totalSkor += bobot; } else { salah++; }
      }
    }
  });

  const payload = {
    NIS: currentSiswa.NIS, Nama: currentSiswa.Nama, Sekolah: currentSiswa.Sekolah || '',
    Mapel: currentMapel, Jawaban_rinci: jawabanRinci, Waktu_mulai: waktuMulai,
    Waktu_selesai: new Date().toISOString(), Skor: totalSkor,
    Jawaban_benar: benar, Jawaban_salah: salah, Kosong: kosong
  };

  let success = false;
  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/HASIL', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (response.ok || response.status === 201) success = true;
    else throw new Error('HTTP ' + response.status);
  } catch (fetchErr) {
    try {
      const { error } = await sb.from('HASIL').insert([payload]);
      if (!error) success = true;
    } catch (sbErr) {}
  }

  if (success) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/SISWA?NIS=eq.' + encodeURIComponent(currentSiswa.NIS), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ Status: 'SELESAI' })
      });
    } catch (e) {}
    hideL(); clearJawabanLocal(); clearViolationsLocal(); unsubscribeWarning();
    localStorage.removeItem('cbt_siswa'); showPage('resultPage');
    try { document.exitFullscreen(); } catch (e) {}
    toast('✅ Jawaban berhasil dikumpulkan!', 'success');
  } else {
    hideL(); toast('❌ Gagal submit. Coba lagi.', 'error');
    examSubmitted = false; examActive = true;
  }
}

// ============ LOCAL STORAGE ============
function saveJawabanLocal() {
  if (!currentSiswa || !currentMapel) return;
  try {
    localStorage.setItem('cbt_jawaban_' + currentSiswa.NIS + '_' + currentMapel, JSON.stringify({
      mapel: currentMapel, jawaban, flagged, currentIndex, sisaDetik, waktuMulai, time: Date.now()
    }));
  } catch (e) {}
}
function loadJawabanLocal() {
  if (!currentSiswa || !currentMapel) return null;
  try {
    const s = localStorage.getItem('cbt_jawaban_' + currentSiswa.NIS + '_' + currentMapel);
    if (!s) return null;
    const d = JSON.parse(s);
    if (Date.now() - d.time > 10800000) return null;
    return d;
  } catch (e) { return null; }
}
function clearJawabanLocal() {
  if (!currentSiswa || !currentMapel) return;
  try { localStorage.removeItem('cbt_jawaban_' + currentSiswa.NIS + '_' + currentMapel); } catch (e) {}
}
function saveViolationsLocal() { if (!currentSiswa) return; try { localStorage.setItem('v_count_' + currentSiswa.NIS, violations.toString()); } catch (e) {} }
function loadViolationsLocal() { if (!currentSiswa) return; try { const c = localStorage.getItem('v_count_' + currentSiswa.NIS); if (c) violations = parseInt(c); } catch (e) {} }
function clearViolationsLocal() { if (!currentSiswa) return; try { localStorage.removeItem('v_count_' + currentSiswa.NIS); } catch (e) {} }

// ============ HELPERS ============
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ============ NAV GUARDS ============
history.pushState(null, null, location.href);
window.addEventListener('popstate', () => history.pushState(null, null, location.href));
window.addEventListener('beforeunload', e => {
  if (currentSiswa && !examSubmitted && examActive) { e.preventDefault(); e.returnValue = 'Ujian berlangsung!'; return e.returnValue; }
});

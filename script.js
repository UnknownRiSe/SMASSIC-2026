// ============================================================
// CBT SMASSIC 2026 - STUDENT CLIENT (FIXED v2)
// Fix: Hapus .select() dari insert HASIL untuk mengatasi
//      "expected JSON array" error
// ============================================================

// ============ SUPABASE CONFIG ============
const SUPABASE_URL = 'https://wwchdqtqakpbjswkavnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rwPcbkV7Y6Fi1AKCET40Yg_ae7HGaZr';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE VARIABLES ============
let currentSiswa = null;
let currentMapel = '';
let soalList = [];
let jawaban = {};
let flagged = {};
let currentIndex = 0;
let violations = 0;
let timerInterval = null;
let remainingSeconds = 0;
let waktuMulai = '';
let heartbeatInterval = null;
let examSubmitted = false;
let isBlocked = false;
let clientBlocked = false;
let lastVT = 0;
let timerSaveCounter = 0;
let examActive = false;
let acListenersAttached = false;
const DEFAULT_DURASI = 90;

// ============ UTILITY FUNCTIONS ============
function toast(m, t) {
  const c = document.getElementById('toastC');
  const d = document.createElement('div');
  d.className = 'toast ' + (t || 'info');
  d.textContent = m;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3100);
}

function showL() {
  document.getElementById('loadOv').classList.add('active');
}

function hideL() {
  document.getElementById('loadOv').classList.remove('active');
}

function showPage(id) {
  const pages = ['loginPage', 'mapelPage', 'examPage', 'resultPage'];
  pages.forEach(p => document.getElementById(p).style.display = 'none');
  const el = document.getElementById(id);
  el.style.display = (id === 'examPage') ? 'block' : 'flex';
  if (id !== 'examPage') examActive = false;
}

function pad(n) {
  return n < 10 ? '0' + n : n;
}

// ============ LOCAL STORAGE HELPERS ============
function saveJawabanLocal() {
  if (!currentSiswa || !currentMapel) return;
  try {
    localStorage.setItem('jawaban_' + currentSiswa.NIS + '_' + currentMapel, JSON.stringify({
      jawaban, flagged, currentIndex, remainingSeconds, waktuMulai, time: Date.now()
    }));
  } catch (e) { }
}

function loadJawabanLocal() {
  if (!currentSiswa || !currentMapel) return null;
  try {
    const s = localStorage.getItem('jawaban_' + currentSiswa.NIS + '_' + currentMapel);
    if (!s) return null;
    const d = JSON.parse(s);
    if (Date.now() - d.time > 10800000) return null;
    return d;
  } catch (e) { return null; }
}

function clearJawabanLocal() {
  if (!currentSiswa || !currentMapel) return;
  try { localStorage.removeItem('jawaban_' + currentSiswa.NIS + '_' + currentMapel); } catch (e) { }
}

function saveViolationsLocal() {
  if (!currentSiswa) return;
  try { localStorage.setItem('v_count_' + currentSiswa.NIS, violations.toString()); } catch (e) { }
}

function loadViolationsLocal() {
  if (!currentSiswa) return;
  try {
    const c = localStorage.getItem('v_count_' + currentSiswa.NIS);
    if (c) violations = parseInt(c);
  } catch (e) { }
}

function clearViolationsLocal() {
  if (!currentSiswa) return;
  try { localStorage.removeItem('v_count_' + currentSiswa.NIS); } catch (e) { }
}

// ============ FULL RESET STATE ============
function fullResetState() {
  examActive = false;
  examSubmitted = false;
  isBlocked = false;
  clientBlocked = false;
  violations = 0;
  lastVT = 0;
  currentMapel = '';
  soalList = [];
  jawaban = {};
  flagged = {};
  currentIndex = 0;

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch (e) { }

  if (currentSiswa) clearViolationsLocal();

  document.getElementById('blockedOverlay').classList.remove('active');
  document.getElementById('kickedOverlay').classList.remove('active');
  document.getElementById('cheatOverlay').classList.remove('active');
}

// ============ LOGIN ============
async function doLogin() {
  const nis = document.getElementById('inNIS').value.trim();
  const pass = document.getElementById('inPass').value.trim();
  const err = document.getElementById('loginErr');

  if (!nis || !pass) {
    err.textContent = 'NIS dan Password wajib diisi!';
    err.classList.add('show');
    return;
  }

  document.getElementById('btnLogin').disabled = true;
  showL();

  try {
    const { data, error } = await sb
      .from('SISWA')
      .select('NIS, Password, Nama, Sekolah, Status')
      .eq('NIS', nis)
      .eq('Password', pass)
      .single();

    hideL();
    document.getElementById('btnLogin').disabled = false;

    if (error || !data) {
      err.textContent = 'NIS atau Password salah!';
      err.classList.add('show');
      return;
    }

    const status = (data.Status || '').toUpperCase();
    if (status === 'KICKED') {
      err.textContent = 'Anda dikeluarkan dari ujian. Hubungi pengawas.';
      err.classList.add('show'); return;
    }
    if (status === 'BLOCKED') {
      err.textContent = 'Akun DIBLOKIR. Hubungi pengawas.';
      err.classList.add('show'); return;
    }
    if (status === 'SELESAI') {
      err.textContent = 'Anda sudah menyelesaikan ujian.';
      err.classList.add('show'); return;
    }

    await sb
      .from('SISWA')
      .update({ Status: 'ONLINE', Last_Heartbeat: new Date().toISOString() })
      .eq('NIS', nis);

    currentSiswa = { NIS: data.NIS, Nama: data.Nama, Sekolah: data.Sekolah || '' };
    localStorage.setItem('cbt_siswa', JSON.stringify(currentSiswa));

    violations = 0;
    clientBlocked = false;
    isBlocked = false;
    examActive = false;
    clearViolationsLocal();
    saveViolationsLocal();

    err.classList.remove('show');
    toast('Login berhasil!', 'success');
    loadMapel();

  } catch (e) {
    hideL();
    document.getElementById('btnLogin').disabled = false;
    err.textContent = 'Terjadi kesalahan: ' + e.message;
    err.classList.add('show');
  }
}

document.getElementById('inPass').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
document.getElementById('inNIS').onkeydown = function (e) { if (e.key === 'Enter') document.getElementById('inPass').focus(); };

// ============ RECHECK BLOCK ============
async function recheckBlock() {
  if (!currentSiswa) { location.reload(); return; }
  const btn = document.getElementById('recheckBlockBtn');
  btn.disabled = true; btn.textContent = '🔄 Mengecek...';
  document.getElementById('recheckInfo').textContent = '';
  try {
    const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).single();
    btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status';
    if (data && (data.Status || '').toUpperCase() === 'BLOCKED') {
      document.getElementById('recheckInfo').textContent = 'Masih DIBLOKIR. (' + new Date().toLocaleTimeString('id-ID') + ')';
    } else {
      fullResetState(); toast('Akun diaktivasi!', 'success'); showPage('loginPage');
      document.getElementById('inNIS').value = currentSiswa.NIS;
      currentSiswa = null; localStorage.removeItem('cbt_siswa');
    }
  } catch (e) { btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status'; }
}

// ============ RECHECK KICK ============
async function recheckKick() {
  if (!currentSiswa) { location.reload(); return; }
  const btn = document.getElementById('recheckKickBtn');
  btn.disabled = true; btn.textContent = '🔄 Mengecek...';
  document.getElementById('recheckKickInfo').textContent = '';
  try {
    const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).single();
    btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status';
    if (data && (data.Status || '').toUpperCase() === 'KICKED') {
      document.getElementById('recheckKickInfo').textContent = 'Masih dikeluarkan. (' + new Date().toLocaleTimeString('id-ID') + ')';
    } else {
      fullResetState(); toast('Akun diaktivasi!', 'success'); showPage('loginPage');
      document.getElementById('inNIS').value = currentSiswa.NIS;
      currentSiswa = null; localStorage.removeItem('cbt_siswa');
    }
  } catch (e) { btn.disabled = false; btn.textContent = '🔄 Cek Ulang Status'; }
}

// ============ LOAD MAPEL ============
async function loadMapel() {
  showL();
  try {
    const { data, error } = await sb.from('SOAL').select('Mapel');
    hideL();
    if (error || !data || data.length === 0) { toast('Belum ada soal', 'warning'); return; }

    const mapelSet = new Set();
    data.forEach(row => { if (row.Mapel) mapelSet.add(row.Mapel); });
    const mapelArr = Array.from(mapelSet);
    if (mapelArr.length === 0) { toast('Belum ada soal', 'warning'); return; }

    document.getElementById('welcomeNm').textContent = 'Selamat Datang, ' + currentSiswa.Nama;
    const list = document.getElementById('mapelList');
    list.innerHTML = '';
    mapelArr.forEach(m => {
      const d = document.createElement('div');
      d.className = 'mapel-item';
      d.innerHTML = '<span>📚 ' + m + '</span><span>→</span>';
      d.onclick = () => startExam(m);
      list.appendChild(d);
    });
    showPage('mapelPage');
  } catch (e) { hideL(); toast('Gagal memuat: ' + e.message, 'error'); }
}

// ============ START EXAM ============
async function startExam(mapel) {
  currentMapel = mapel;
  showL();
  try {
    const { data, error } = await sb
      .from('SOAL')
      .select('No, Soal, Opsi_A, Opsi_B, Opsi_C, Opsi_D, Opsi_E, Gambar, Mapel')
      .eq('Mapel', mapel)
      .order('No', { ascending: true });

    hideL();
    if (error || !data || data.length === 0) { toast('Soal tidak ditemukan', 'error'); return; }

    const shuffled = [...data];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    initExam(mapel, shuffled, DEFAULT_DURASI);
  } catch (e) { hideL(); toast('Gagal memuat soal: ' + e.message, 'error'); }
}

function initExam(mapel, soal, durasi) {
  soalList = soal;
  examSubmitted = false;
  isBlocked = false;
  clientBlocked = false;

  if (violations >= 3) { showBlocked(); return; }

  const saved = loadJawabanLocal();
  if (saved) {
    jawaban = saved.jawaban || {};
    flagged = saved.flagged || {};
    currentIndex = saved.currentIndex || 0;
    waktuMulai = saved.waktuMulai || new Date().toISOString();
    const elapsed = Math.floor((Date.now() - saved.time) / 1000);
    remainingSeconds = (saved.remainingSeconds || (durasi * 60)) - elapsed;
    if (remainingSeconds < 0) remainingSeconds = 0;
    toast('Sesi dipulihkan! ' + Object.keys(jawaban).length + ' jawaban.', 'success');
  } else {
    jawaban = {}; flagged = {}; currentIndex = 0;
    waktuMulai = new Date().toISOString();
    remainingSeconds = (durasi || DEFAULT_DURASI) * 60;
  }

  document.getElementById('examMapel').textContent = mapel;
  document.getElementById('examNm').textContent = currentSiswa.Nama;
  document.getElementById('examNIS').textContent = 'NIS: ' + currentSiswa.NIS;

  showPage('examPage');
  examActive = false;
  buildGrid(); renderQ(); startTimer(); startHB();
  if (!acListenersAttached) { activateAC(); acListenersAttached = true; }

  sb.from('SISWA').update({ Status: 'ONLINE' }).eq('NIS', currentSiswa.NIS).then(() => { });
  requestFS();

  setTimeout(() => {
    if (!examSubmitted && !isBlocked && !clientBlocked) examActive = true;
  }, 3000);

  if (remainingSeconds <= 0) { toast('Waktu habis!', 'warning'); doSubmit(true); }
}

function requestFS() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { }
}

// ============ TIMER ============
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updTimer();
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updTimer();
    if (remainingSeconds <= 0) { clearInterval(timerInterval); toast('Waktu habis!', 'warning'); doSubmit(true); }
  }, 1000);
}

function updTimer() {
  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = remainingSeconds % 60;
  document.getElementById('timerDisp').textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
  const b = document.getElementById('timerBox');
  b.className = 'timer';
  if (remainingSeconds <= 300) b.className = 'timer danger';
  else if (remainingSeconds <= 600) b.className = 'timer warning';
  timerSaveCounter++;
  if (timerSaveCounter >= 10) { timerSaveCounter = 0; saveJawabanLocal(); }
}

// ============ HEARTBEAT ============
function startHB() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (examSubmitted || isBlocked || !examActive || !currentSiswa) return;
    try {
      await sb.from('SISWA').update({ Last_Heartbeat: new Date().toISOString() }).eq('NIS', currentSiswa.NIS);
      const { data } = await sb.from('SISWA').select('Status').eq('NIS', currentSiswa.NIS).single();
      if (data) {
        const st = (data.Status || '').toUpperCase();
        if (st === 'KICKED') {
          examActive = false; examSubmitted = true;
          clearInterval(timerInterval); clearInterval(heartbeatInterval);
          document.getElementById('kickedOverlay').classList.add('active'); return;
        }
        if (st === 'BLOCKED') { showBlocked(); return; }
      }
    } catch (e) { }
  }, 30000);
}

function showBlocked() {
  if (isBlocked) return;
  isBlocked = true; clientBlocked = true; examSubmitted = true; examActive = false;
  clearInterval(timerInterval); clearInterval(heartbeatInterval);
  document.getElementById('blockedOverlay').classList.add('active');
}

// ============ QUESTION GRID ============
function buildGrid() {
  const g = document.getElementById('qGrid');
  g.innerHTML = '';
  soalList.forEach((_, idx) => {
    const b = document.createElement('button');
    b.className = 'qb'; b.textContent = idx + 1;
    b.onclick = () => { currentIndex = idx; renderQ(); document.getElementById('qSb').classList.remove('mob'); };
    g.appendChild(b);
  });
  updGrid();
}

function updGrid() {
  const g = document.getElementById('qGrid');
  if (!g) return;
  const bs = g.children;
  let ans = 0, unans = 0, fl = 0;
  for (let i = 0; i < bs.length; i++) {
    bs[i].className = 'qb';
    if (i === currentIndex) bs[i].className += ' active';
    if (jawaban[soalList[i].No]) { bs[i].className += ' answered'; ans++; } else unans++;
    if (flagged[i]) { bs[i].className += ' flagged'; fl++; }
  }
  document.getElementById('stAns').textContent = ans;
  document.getElementById('stUnans').textContent = unans;
  document.getElementById('stFlag').textContent = fl;
  const vb = document.getElementById('vBadge');
  if (violations > 0) { vb.className = 'vb warn'; vb.textContent = '⚠️ ' + violations + '/3'; }
  else { vb.className = 'vb clean'; vb.textContent = '🟢 Bersih'; }
}

// ============ RENDER QUESTION ============
function renderQ() {
  const s = soalList[currentIndex];
  const opts = [
    { l: 'A', t: s.Opsi_A }, { l: 'B', t: s.Opsi_B },
    { l: 'C', t: s.Opsi_C }, { l: 'D', t: s.Opsi_D }
  ];
  if (s.Opsi_E) opts.push({ l: 'E', t: s.Opsi_E });

  const sel = jawaban[s.No] || '';
  const iF = flagged[currentIndex];

  let gambarHTML = '';
  if (s.Gambar && s.Gambar.trim() !== '') {
    gambarHTML = `<div class="qimg">
      <img src="${s.Gambar}" alt="Gambar Soal"
        onclick="zoomImg('${s.Gambar}')"
        onerror="this.parentElement.innerHTML='<div style=\\'color:var(--d);padding:12px\\'> Gambar gagal dimuat</div>'">
      <div class="hint">Klik gambar untuk memperbesar</div>
    </div>`;
  }

  let optsHTML = '';
  opts.forEach(o => {
    optsHTML += `<div class="oitem${sel === o.l ? ' selected' : ''}" onclick="selOpt('${s.No}','${o.l}')">
      <div class="ol">${o.l}</div>
      <div class="ot">${o.t || ''}</div>
    </div>`;
  });

  let navHTML = `<div class="qnav">
    <button class="nbtn" onclick="prevQ()" ${currentIndex === 0 ? 'disabled' : ''}>← Sebelumnya</button>`;
  if (currentIndex === soalList.length - 1) {
    navHTML += `<button class="nbtn submit" onclick="showSubmitModal()">📤 Kumpulkan</button>`;
  } else {
    navHTML += `<button class="nbtn" onclick="nextQ()">Selanjutnya →</button>`;
  }
  navHTML += '</div>';

  document.getElementById('qContent').innerHTML = `
    <div class="qcard">
      <div class="qheader">
        <div class="qnum">
          <div class="num">${currentIndex + 1}</div>
          <div class="lbl">dari ${soalList.length} soal</div>
        </div>
        <button class="fbtn${iF ? ' flagged' : ''}" onclick="toggleFlag(${currentIndex})">
          🚩 ${iF ? 'Ditandai' : 'Tandai'}
        </button>
      </div>
      <div class="qtext">${s.Soal}</div>
      ${gambarHTML}
      <div class="olist">${optsHTML}</div>
    </div>
    ${navHTML}`;
  updGrid();
}

function zoomImg(src) {
  document.getElementById('zoomImg').src = src;
  document.getElementById('imgZoom').classList.add('active');
}

function nextQ() {
  if (currentIndex < soalList.length - 1) { currentIndex++; saveJawabanLocal(); renderQ(); }
}

function prevQ() {
  if (currentIndex > 0) { currentIndex--; saveJawabanLocal(); renderQ(); }
}

function selOpt(no, l) {
  jawaban[no] = l; saveJawabanLocal(); renderQ();
}

function toggleFlag(i) {
  flagged[i] = !flagged[i]; saveJawabanLocal(); renderQ();
}

// ============ SUBMIT ============
function showSubmitModal() {
  const t = soalList.length;
  const a = Object.keys(jawaban).length;
  const u = t - a;
  document.getElementById('submitInfo').innerHTML =
    '<strong>' + a + '</strong> dari <strong>' + t + '</strong> soal dijawab.' +
    (u > 0 ? '<br><span style="color:var(--d)">⚠️ Masih ada <strong>' + u + '</strong> soal belum dijawab!</span>' : '') +
    '<br>Jawaban <strong>tidak dapat diubah</strong>.';
  document.getElementById('submitModal').classList.add('active');
}

// ✅ FIXED: Hapus .select() dari insert untuk mengatasi "expected JSON array"
async function doSubmit(auto) {
  if (examSubmitted) return;
  examSubmitted = true;
  examActive = false;

  document.getElementById('submitModal').classList.remove('active');
  clearInterval(timerInterval);
  clearInterval(heartbeatInterval);
  showL();

  try {
    // Build jawaban rinci
    const jawabanRinci = {};
    Object.keys(jawaban).forEach(noSoal => {
      jawabanRinci[noSoal.toString()] = jawaban[noSoal];
    });

    const insertData = {
      NIS: currentSiswa.NIS,
      Nama: currentSiswa.Nama,
      Sekolah: currentSiswa.Sekolah || '',
      Mapel: currentMapel,
      Jawaban_rinci: jawabanRinci,
      Waktu_mulai: waktuMulai,
      Waktu_selesai: new Date().toISOString(),
      Skor: 0,
      Jawaban_benar: 0,
      Jawaban_salah: 0
    };

    console.log('[SUBMIT] Inserting:', JSON.stringify(insertData));

    // ✅ FIX: Tanpa .select() — langsung insert saja
    const { error } = await sb
      .from('HASIL')
      .insert([insertData]);

    if (error) throw error;

    // Update status ke SELESAI
    await sb
      .from('SISWA')
      .update({ Status: 'SELESAI' })
      .eq('NIS', currentSiswa.NIS);

    hideL();
    clearJawabanLocal();
    clearViolationsLocal();
    localStorage.removeItem('cbt_siswa');
    showPage('resultPage');
    try { document.exitFullscreen(); } catch (e) { }

  } catch (e) {
    console.error('[SUBMIT] Error:', e);
    hideL();
    toast('Gagal submit: ' + (e.message || 'Unknown error'), 'error');
    examSubmitted = false;
    examActive = true;
  }
}

// ============ ANTI CHEAT ============
function activateAC() {
  document.addEventListener('copy', function (e) { if (!examActive) return; e.preventDefault(); reportCheat('Ganti Tab', 'Copy attempt'); });
  document.addEventListener('cut', function (e) { if (!examActive) return; e.preventDefault(); reportCheat('Ganti Tab', 'Cut attempt'); });
  document.addEventListener('paste', function (e) { if (!examActive) return; e.preventDefault(); reportCheat('Ganti Tab', 'Paste attempt'); });
  document.addEventListener('contextmenu', function (e) { if (!examActive) return; e.preventDefault(); reportCheat('Klik Kanan', 'Right click'); });

  document.addEventListener('keydown', function (e) {
    if (!examActive) return;
    if (e.ctrlKey && 'cvxauspi'.indexOf(e.key.toLowerCase()) >= 0) { e.preventDefault(); reportCheat('Shortcut Keyboard', 'Ctrl+' + e.key.toUpperCase()); return false; }
    if (e.key === 'F12') { e.preventDefault(); reportCheat('DevTools', 'F12'); return false; }
    if (e.ctrlKey && e.shiftKey && 'ijc'.indexOf(e.key.toLowerCase()) >= 0) { e.preventDefault(); reportCheat('DevTools', 'Ctrl+Shift+' + e.key.toUpperCase()); return false; }
    if (e.key === 'PrintScreen') { e.preventDefault(); reportCheat('Screenshot', 'PrintScreen'); return false; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return false; }
  });

  function handleFS() {
    if (!examActive || examSubmitted || isBlocked || clientBlocked) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      reportCheat('Keluar Fullscreen', 'Fullscreen exit');
      setTimeout(() => { if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS(); }, 1500);
    }
  }
  document.addEventListener('fullscreenchange', handleFS);
  document.addEventListener('webkitfullscreenchange', handleFS);

  document.addEventListener('visibilitychange', function () {
    if (!examActive || examSubmitted || isBlocked) return;
    if (document.hidden) reportCheat('Ganti Tab', 'Tab hidden');
  });

  window.addEventListener('blur', function () {
    if (!examActive || examSubmitted || isBlocked) return;
    reportCheat('Focus Lost', 'Window blur');
  });

  document.addEventListener('mouseleave', function () {
    if (!examActive || examSubmitted || isBlocked) return;
    reportCheat('Mouse Leave', 'Cursor left');
  });

  document.addEventListener('dragstart', function (e) { e.preventDefault(); });
  document.addEventListener('selectstart', function (e) { if (examActive) e.preventDefault(); });
}

// ✅ Insert kecurangan tanpa .select()
async function reportCheat(jenis, detail) {
  if (!examActive || examSubmitted || isBlocked || clientBlocked || !currentSiswa) return;

  const now = Date.now();
  if (now - lastVT < 5000) return;
  lastVT = now;

  violations++;

  try {
    const { error } = await sb
      .from('KECURANGAN')
      .insert([{
        NIS: currentSiswa.NIS,
        Nama: currentSiswa.Nama,
        Jenis: jenis,
        Timestamp: new Date().toISOString()
      }]);

    if (error) {
      console.error('[CHEAT] Insert error:', error);
    } else {
      console.log('[CHEAT] Logged:', jenis, detail);
    }
  } catch (e) {
    console.error('[CHEAT] Exception:', e);
  }

  if (violations >= 3) {
    clientBlocked = true;
    examActive = false;
    saveViolationsLocal();

    document.getElementById('cheatMsg').textContent = detail + '. Pelanggaran ke-3! Akun diblokir.';
    document.getElementById('cheatCount').textContent = 'Pelanggaran ke-' + violations + ' - DIBLOKIR';
    document.getElementById('cheatOverlay').classList.add('active');

    try {
      await sb.from('SISWA').update({ Status: 'BLOCKED' }).eq('NIS', currentSiswa.NIS);
    } catch (e) { }

    setTimeout(() => {
      document.getElementById('cheatOverlay').classList.remove('active');
      showBlocked();
    }, 2000);
    return;
  }

  document.getElementById('cheatMsg').textContent = detail + '. Dicatat dan dilaporkan ke pengawas.';
  document.getElementById('cheatCount').textContent = 'Pelanggaran ke-' + violations + ' dari 3';
  document.getElementById('cheatOverlay').classList.add('active');
  updGrid();
  saveViolationsLocal();
}

function dismissCheat() {
  document.getElementById('cheatOverlay').classList.remove('active');
  if (examActive && !examSubmitted && !isBlocked && !clientBlocked) requestFS();
}

// ============ NAVIGATION GUARDS ============
history.pushState(null, null, location.href);
window.addEventListener('popstate', function () { history.pushState(null, null, location.href); });
window.addEventListener('beforeunload', function (e) {
  if (currentSiswa && !examSubmitted && examActive) {
    e.preventDefault(); e.returnValue = 'Ujian sedang berlangsung!'; return e.returnValue;
  }
});

// ============ INIT ============
showPage('loginPage');

// ===================== KONFIGURASI =====================
const SUPABASE_URL = 'https://rmqctfoclqigwsbbxqiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtcWN0Zm9jbHFpZ3dzYmJ4cWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxODU1MDAsImV4cCI6MjA2NDc2MTUwMH0.UuBOYVhiPMfiDcwVJPDkEelFRBp1PfZM9i_iGt3O_Lg';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== STATE =====================
let currentSiswa = null;
let currentMapel = '';
let soalList = [];
let jawaban = {};
let currentSoalIndex = 0;
let examActive = false;
let examSubmitted = false;
let waktuMulai = '';
let timerInterval = null;
let sisaDetik = 0;
let heartbeatInterval = null;
let violations = { outOfFocus: 0, copyPaste: 0, devTools: 0, multipleLogin: 0 };
let maxViolations = 15;
let warningShown = {};
let violationThresholds = [3, 5, 8, 10, 13, 15];
let isSubmittingViolation = false;

// ===================== UTILITAS =====================
function showL() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideL() { document.getElementById('loadingOverlay').classList.remove('active'); }
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 4000);
}
function formatTimer(s) {
  const m = Math.floor(s / 60);
  const d = s % 60;
  return `${String(m).padStart(2, '0')}:${String(d).padStart(2, '0')}`;
}

// ===================== LOCAL STORAGE =====================
function saveJawabanLocal() {
  localStorage.setItem('cbt_jawaban_' + currentSiswa.NIS + '_' + currentMapel, JSON.stringify(jawaban));
}
function loadJawabanLocal() {
  const d = localStorage.getItem('cbt_jawaban_' + currentSiswa.NIS + '_' + currentMapel);
  if (d) jawaban = JSON.parse(d);
}
function clearJawabanLocal() {
  localStorage.removeItem('cbt_jawaban_' + (currentSiswa ? currentSiswa.NIS : '') + '_' + currentMapel);
}
function saveViolationsLocal() {
  localStorage.setItem('cbt_violations_' + currentSiswa.NIS, JSON.stringify(violations));
}
function loadViolationsLocal() {
  const d = localStorage.getItem('cbt_violations_' + currentSiswa.NIS);
  if (d) violations = JSON.parse(d);
}
function clearViolationsLocal() {
  localStorage.removeItem('cbt_violations_' + (currentSiswa ? currentSiswa.NIS : ''));
}

// ===================== LOGIN =====================
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const nis = document.getElementById('nisInput').value.trim();
  const nama = document.getElementById('namaInput').value.trim();
  if (!nis || !nama) return toast('Isi NIS dan Nama', 'error');
  showL();
  try {
    const { data, error } = await sb.from('SISWA').select('*').eq('NIS', nis).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) { hideL(); return toast('NIS tidak ditemukan', 'error'); }
    if (data.Nama.trim().toLowerCase() !== nama.trim().toLowerCase()) {
      hideL(); return toast('Nama tidak cocok', 'error');
    }
    if (data.Status === 'SELESAI') {
      hideL(); return toast('Anda sudah menyelesaikan ujian', 'error');
    }
    currentSiswa = data;
    localStorage.setItem('cbt_siswa', JSON.stringify(data));
    await sb.from('SISWA').update({ Status: 'AKTIF', Login_at: new Date().toISOString() }).eq('NIS', nis);
    hideL();
    showMapelSelection();
  } catch (err) {
    hideL();
    toast('Gagal login: ' + (err.message || err), 'error');
  }
});

// ===================== PILIH MAPEL =====================
async function showMapelSelection() {
  showPage('mapelPage');
  document.getElementById('welcomeNama').textContent = currentSiswa.Nama;
  showL();
  try {
    const { data, error } = await sb.from('SOAL').select('Mapel');
    if (error) throw error;
    const mapels = [...new Set(data.map(d => d.Mapel))].sort();
    const container = document.getElementById('mapelList');
    container.innerHTML = '';
    mapels.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'mapel-btn';
      btn.textContent = m;
      btn.onclick = () => pilihMapel(m);
      container.appendChild(btn);
    });
    hideL();
  } catch (err) {
    hideL();
    toast('Gagal memuat mapel: ' + err.message, 'error');
  }
}

async function pilihMapel(mapel) {
  currentMapel = mapel;
  showL();
  try {
    // Cek apakah siswa sudah submit mapel ini
    const { data: hasilExist } = await sb.from('HASIL')
      .select('id')
      .eq('NIS', currentSiswa.NIS)
      .eq('Mapel', mapel)
      .limit(1)
      .maybeSingle();
    if (hasilExist) {
      hideL();
      return toast('Anda sudah mengerjakan mapel ini', 'error');
    }
    // Ambil soal
    const { data: soalData, error } = await sb.from('SOAL')
      .select('*')
      .eq('Mapel', mapel)
      .order('Nomor', { ascending: true });
    if (error) throw error;
    if (!soalData || soalData.length === 0) {
      hideL();
      return toast('Belum ada soal untuk mapel ini', 'error');
    }
    soalList = soalData;
    jawaban = {};
    loadJawabanLocal();
    hideL();
    showKonfirmasi();
  } catch (err) {
    hideL();
    toast('Gagal memuat soal: ' + err.message, 'error');
  }
}

// ===================== KONFIRMASI MULAI =====================
function showKonfirmasi() {
  document.getElementById('konfMapel').textContent = currentMapel;
  document.getElementById('konfJumlah').textContent = soalList.length;
  const totalMenit = soalList.length > 0 ? (soalList[0].Durasi || 60) : 60;
  document.getElementById('konfWaktu').textContent = totalMenit + ' menit';
  showPage('konfirmasiPage');
}

function mulaiUjian() {
  examActive = true;
  examSubmitted = false;
  waktuMulai = new Date().toISOString();
  currentSoalIndex = 0;
  violations = { outOfFocus: 0, copyPaste: 0, devTools: 0, multipleLogin: 0 };
  loadViolationsLocal();
  const totalMenit = soalList.length > 0 ? (soalList[0].Durasi || 60) : 60;
  sisaDetik = totalMenit * 60;
  showPage('examPage');
  renderSoal();
  renderNavButtons();
  startTimer();
  startHeartbeat();
  enableAntiCheat();
  try { document.documentElement.requestFullscreen(); } catch (e) { }
}

// ===================== RENDER SOAL =====================
function renderSoal() {
  const soal = soalList[currentSoalIndex];
  document.getElementById('soalNomor').textContent = `Soal ${soal.Nomor} / ${soalList.length}`;
  document.getElementById('soalMapel').textContent = currentMapel;

  // Render gambar soal jika ada
  const imgContainer = document.getElementById('soalImageContainer');
  if (soal.Gambar_soal) {
    imgContainer.innerHTML = `<img src="${soal.Gambar_soal}" alt="Gambar Soal" class="soal-image" onclick="openImageModal(this.src)">`;
    imgContainer.style.display = 'block';
  } else {
    imgContainer.innerHTML = '';
    imgContainer.style.display = 'none';
  }

  document.getElementById('soalTeks').textContent = soal.Soal;
  const opsiContainer = document.getElementById('opsiContainer');
  opsiContainer.innerHTML = '';
  ['A', 'B', 'C', 'D', 'E'].forEach(huruf => {
    const teks = soal['Opsi_' + huruf];
    if (!teks) return;
    const btn = document.createElement('button');
    btn.className = 'opsi-btn' + (jawaban[soal.Nomor] === huruf ? ' selected' : '');
    btn.innerHTML = `<span class="opsi-huruf">${huruf}</span><span>${teks}</span>`;
    btn.onclick = () => pilihOpsi(soal.Nomor, huruf);
    opsiContainer.appendChild(btn);
  });
  updateNavButtons();
}

function pilihOpsi(nomor, huruf) {
  jawaban[nomor] = huruf;
  saveJawabanLocal();
  renderSoal();
  renderNavButtons();
}

// ===================== IMAGE MODAL =====================
function openImageModal(src) {
  document.getElementById('modalImage').src = src;
  document.getElementById('imageModal').classList.add('active');
}
function closeImageModal() {
  document.getElementById('imageModal').classList.remove('active');
}

// ===================== NAVIGASI =====================
function prevSoal() {
  if (currentSoalIndex > 0) { currentSoalIndex--; renderSoal(); }
}
function nextSoal() {
  if (currentSoalIndex < soalList.length - 1) { currentSoalIndex++; renderSoal(); }
}
function goToSoal(i) {
  currentSoalIndex = i;
  renderSoal();
  // Close navigation panel on mobile
  document.getElementById('navPanel').classList.remove('open');
}

function renderNavButtons() {
  const c = document.getElementById('navButtons');
  c.innerHTML = '';
  soalList.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (jawaban[s.Nomor] ? ' answered' : '') + (i === currentSoalIndex ? ' current' : '');
    btn.textContent = s.Nomor;
    btn.onclick = () => goToSoal(i);
    c.appendChild(btn);
  });
  updateJumlahTerjawab();
}

function updateJumlahTerjawab() {
  const dijawab = Object.keys(jawaban).length;
  const el = document.getElementById('answeredCount');
  if (el) el.textContent = `${dijawab} / ${soalList.length} terjawab`;
}

function updateNavButtons() {
  document.getElementById('prevBtn').disabled = currentSoalIndex === 0;
  document.getElementById('nextBtn').disabled = currentSoalIndex === soalList.length - 1;
}

function toggleNavPanel() {
  document.getElementById('navPanel').classList.toggle('open');
}

// ===================== TIMER =====================
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    sisaDetik--;
    updateTimerDisplay();
    if (sisaDetik <= 0) {
      clearInterval(timerInterval);
      toast('Waktu habis! Auto-submit...', 'error');
      doSubmit(true);
    }
  }, 1000);
}
function updateTimerDisplay() {
  const el = document.getElementById('timer');
  el.textContent = formatTimer(sisaDetik);
  if (sisaDetik <= 300) el.classList.add('warning');
  else el.classList.remove('warning');
}

// ===================== HEARTBEAT =====================
function startHeartbeat() {
  heartbeatInterval = setInterval(async () => {
    if (!examActive) return;
    try {
      await sb.from('SISWA').update({ Last_seen: new Date().toISOString() }).eq('NIS', currentSiswa.NIS);
    } catch (e) { }
  }, 30000);
}

// ===================== ANTI CHEAT =====================
function enableAntiCheat() {
  // Blur/focus
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  // Copy paste
  document.addEventListener('copy', onCopy);
  document.addEventListener('paste', onPaste);
  document.addEventListener('cut', onCopy);
  // Right click
  document.addEventListener('contextmenu', e => { if (examActive) e.preventDefault(); });
  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
  // Visibility change
  document.addEventListener('visibilitychange', onVisibility);
}

function onBlur() {
  if (!examActive || examSubmitted) return;
  violations.outOfFocus++;
  saveViolationsLocal();
  catatKecurangan('TAB_SWITCH', 'Berpindah tab/window');
  checkViolationLimit();
}
function onFocus() { }
function onCopy(e) {
  if (!examActive || examSubmitted) return;
  e.preventDefault();
  violations.copyPaste++;
  saveViolationsLocal();
  catatKecurangan('COPY_PASTE', 'Mencoba copy/cut/paste');
  checkViolationLimit();
}
function onPaste(e) {
  if (!examActive || examSubmitted) return;
  e.preventDefault();
  violations.copyPaste++;
  saveViolationsLocal();
  catatKecurangan('COPY_PASTE', 'Mencoba paste');
  checkViolationLimit();
}
function onKeyDown(e) {
  if (!examActive || examSubmitted) return;
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'u')) {
    e.preventDefault();
    violations.devTools++;
    saveViolationsLocal();
    catatKecurangan('DEV_TOOLS', 'Mencoba buka DevTools');
    checkViolationLimit();
  }
  if (e.key === 'Escape' && examActive) {
    e.preventDefault();
    try { document.documentElement.requestFullscreen(); } catch (e) { }
  }
}
function onVisibility() {
  if (!examActive || examSubmitted) return;
  if (document.hidden) {
    violations.outOfFocus++;
    saveViolationsLocal();
    catatKecurangan('TAB_HIDDEN', 'Tab disembunyikan');
    checkViolationLimit();
  }
}

function getTotalViolations() {
  return violations.outOfFocus + violations.copyPaste + violations.devTools + violations.multipleLogin;
}

function checkViolationLimit() {
  const total = getTotalViolations();
  violationThresholds.forEach(th => {
    if (total >= th && !warningShown[th]) {
      warningShown[th] = true;
      if (total >= maxViolations) {
        toast(`Pelanggaran maksimum! Auto-submit!`, 'error');
        doSubmit(true);
      } else {
        toast(`Peringatan! Pelanggaran ke-${total}/${maxViolations}. Ujian akan di-submit otomatis jika mencapai batas.`, 'error');
      }
    }
  });
  updateViolationDisplay();
}

function updateViolationDisplay() {
  const el = document.getElementById('violationCount');
  if (el) {
    const total = getTotalViolations();
    el.textContent = `⚠ ${total}`;
    if (total >= 10) el.style.color = '#e74c3c';
    else if (total >= 5) el.style.color = '#f39c12';
  }
}

async function catatKecurangan(jenis, detail) {
  if (isSubmittingViolation) return;
  isSubmittingViolation = true;
  try {
    // FIX: Gunakan fetch langsung dengan Prefer: return=minimal
    await fetch(SUPABASE_URL + '/rest/v1/KECURANGAN', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        NIS: currentSiswa.NIS,
        Nama: currentSiswa.Nama,
        Mapel: currentMapel,
        Jenis: jenis,
        Detail: detail,
        Waktu: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Gagal catat kecurangan:', e);
  }
  isSubmittingViolation = false;
}

// ===================== SUBMIT =====================
function konfirmasiSubmit() {
  const dijawab = Object.keys(jawaban).length;
  const belum = soalList.length - dijawab;
  document.getElementById('submitInfo').textContent =
    `Dijawab: ${dijawab} | Belum: ${belum} dari ${soalList.length} soal`;
  document.getElementById('submitModal').classList.add('active');
}
function batalSubmit() {
  document.getElementById('submitModal').classList.remove('active');
}

async function doSubmit(auto) {
  if (examSubmitted) return;
  examSubmitted = true;
  examActive = false;
  document.getElementById('submitModal').classList.remove('active');
  clearInterval(timerInterval);
  clearInterval(heartbeatInterval);
  showL();

  try {
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

    // FIX: Gunakan fetch langsung dengan Prefer: return=minimal
    const response = await fetch(SUPABASE_URL + '/rest/v1/HASIL', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(insertData)
    });

    console.log('[SUBMIT] Response status:', response.status);

    if (!response.ok && response.status !== 201) {
      const errText = await response.text();
      console.error('[SUBMIT] Error response:', errText);
      throw new Error('Insert gagal: ' + response.status + ' ' + errText);
    }

    console.log('[SUBMIT] Insert berhasil!');

    // Update status SISWA
    await sb.from('SISWA').update({ Status: 'SELESAI' }).eq('NIS', currentSiswa.NIS);

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

// ===================== LOGOUT =====================
async function logout() {
  try {
    if (currentSiswa) {
      await sb.from('SISWA').update({ Status: 'OFFLINE' }).eq('NIS', currentSiswa.NIS);
    }
  } catch (e) { }
  currentSiswa = null;
  currentMapel = '';
  soalList = [];
  jawaban = {};
  examActive = false;
  examSubmitted = false;
  clearInterval(timerInterval);
  clearInterval(heartbeatInterval);
  localStorage.removeItem('cbt_siswa');
  showPage('loginPage');
}

function kembaliKeMapel() {
  showMapelSelection();
}

// ===================== INIT =====================
window.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('cbt_siswa');
  if (saved) {
    try {
      currentSiswa = JSON.parse(saved);
      const { data } = await sb.from('SISWA').select('*').eq('NIS', currentSiswa.NIS).maybeSingle();
      if (data && data.Status !== 'SELESAI') {
        currentSiswa = data;
        showMapelSelection();
        return;
      } else if (data && data.Status === 'SELESAI') {
        localStorage.removeItem('cbt_siswa');
        currentSiswa = null;
      }
    } catch (e) {
      localStorage.removeItem('cbt_siswa');
      currentSiswa = null;
    }
  }
  showPage('loginPage');
});

// ============================================================
// CBT SMASSIC 2026 - ADMIN DASHBOARD (FULL UPGRADE)
// Timer, Soal Multi-tipe, Peringatan, Export, LaTeX
// ============================================================

const SUPABASE_URL = 'https://wwchdqtqakpbjswkavnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rwPcbkV7Y6Fi1AKCET40Yg_ae7HGaZr';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE ============
let siswaData = [];
let kecuranganData = [];
let hasilData = [];
let soalData = [];
let pengaturanData = [];
let peringatanData = [];
let realtimeChannel = null;
let confirmModal = null;
let soalModal = null;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
  soalModal = new bootstrap.Modal(document.getElementById('soalModal'));
  startClock();
  
  // Live preview for soal text
  const soalText = document.getElementById('soalText');
  if (soalText) {
    soalText.addEventListener('input', () => {
      const preview = document.getElementById('soalPreview');
      preview.innerHTML = soalText.value || 'Preview muncul di sini...';
      renderMathIn(preview);
    });
  }
  
  await checkSession();
});

function renderMathIn(el) {
  if (window.renderMathInElement) {
    renderMathInElement(el, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  }
}

// ============ CLOCK ============
function startClock() {
  const update = () => {
    document.getElementById('liveClock').textContent = new Date().toLocaleTimeString('id-ID');
  };
  update(); setInterval(update, 1000);
}

// ============ AUTH ============
async function checkSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) showDashboard(session.user);
    else showLogin();
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('loginPage').classList.remove('d-none');
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('dashboardPage').classList.add('d-none');
}

function showDashboard(user) {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('loginPage').classList.add('d-none');
  document.getElementById('dashboardPage').classList.remove('d-none');
  document.getElementById('adminEmail').textContent = user.email || 'Admin';
  loadAllData();
  subscribeRealtime();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('inEmail').value.trim();
  const password = document.getElementById('inPassword').value.trim();
  const alertEl = document.getElementById('loginAlert');
  const spinner = document.getElementById('loginSpinner');
  const btn = document.getElementById('btnLogin');
  alertEl.classList.add('d-none');
  spinner.classList.remove('d-none');
  btn.disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    spinner.classList.add('d-none'); btn.disabled = false;
    if (error) { alertEl.textContent = error.message; alertEl.classList.remove('d-none'); return; }
    if (data.user) { showToast('Login berhasil!', 'success'); showDashboard(data.user); }
  } catch (err) {
    spinner.classList.add('d-none'); btn.disabled = false;
    alertEl.textContent = err.message; alertEl.classList.remove('d-none');
  }
  return false;
}

async function handleLogout() {
  await sb.auth.signOut();
  unsubscribeRealtime();
  siswaData = []; kecuranganData = []; hasilData = []; soalData = [];
  showLogin(); showToast('Berhasil logout', 'info');
}

function togglePassword() {
  const inp = document.getElementById('inPassword');
  const icon = document.getElementById('eyeIcon');
  if (inp.type === 'password') { inp.type = 'text'; icon.className = 'bi bi-eye-slash'; }
  else { inp.type = 'password'; icon.className = 'bi bi-eye'; }
}

// ============ SIDEBAR & NAVIGATION ============
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('show');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = () => { sidebar.classList.remove('show'); overlay.classList.remove('show'); };
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('show');
}

function switchSection(name) {
  document.querySelectorAll('.section-panel').forEach(s => s.classList.add('d-none'));
  const target = document.getElementById('sec-' + name);
  if (target) target.classList.remove('d-none');
  document.querySelectorAll('#sidebar .nav-link').forEach(n => {
    n.classList.toggle('active', n.getAttribute('data-section') === name);
  });
  const titles = {
    overview: '📊 Overview', pengaturan: '⚙️ Pengaturan Ujian', siswa: '👥 Monitor Siswa',
    kecurangan: '⚠️ Live Kecurangan', peringatan: '🔔 Peringatan', hasil: '📋 Rekap Nilai', soal: '📝 Bank Soal'
  };
  document.getElementById('sectionTitle').textContent = titles[name] || name;
  document.getElementById('sidebar').classList.remove('show');
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.remove('show');

  // Lazy load
  if (name === 'pengaturan') loadPengaturan();
  if (name === 'peringatan') loadPeringatan();
}

// ============ LOAD ALL DATA ============
async function loadAllData() {
  await Promise.all([loadSiswa(), loadKecurangan(), loadHasil(), loadSoal(), loadPengaturan(), loadPeringatan()]);
  updateOverviewStats();
}

// ============ PENGATURAN (TIMER) ============
async function loadPengaturan() {
  try {
    const { data, error } = await sb.from('PENGATURAN').select('*').order('Mapel');
    if (error) throw error;
    pengaturanData = data || [];
    renderPengaturan();
  } catch (e) { showToast('Gagal memuat pengaturan: ' + e.message, 'error'); }
}

function renderPengaturan() {
  const body = document.getElementById('pengaturanBody');
  if (!pengaturanData.length) {
    body.innerHTML = '<p class="text-muted">Belum ada pengaturan mapel.</p>';
    return;
  }
  body.innerHTML = pengaturanData.map(p => {
    const statusBadge = p.Status_ujian === 'AKTIF' 
      ? '<span class="badge bg-success">🟢 AKTIF</span>' 
      : p.Status_ujian === 'SELESAI' 
        ? '<span class="badge bg-secondary">⏹ SELESAI</span>'
        : '<span class="badge bg-warning text-dark">⏸ BELUM</span>';
    return `
    <div class="card border mb-3">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h6 class="fw-bold mb-0"><i class="bi bi-book"></i> ${esc(p.Mapel)}</h6>
          ${statusBadge}
        </div>
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Durasi (menit)</label>
            <input type="number" class="form-control form-control-sm" value="${p.Durasi_menit || 90}" id="dur-${p.id}" min="1" max="300">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-semibold">Acak Soal</label>
            <select class="form-select form-select-sm" id="acak-${p.id}">
              <option value="true" ${p.Acak_soal ? 'selected' : ''}>Ya</option>
              <option value="false" ${!p.Acak_soal ? 'selected' : ''}>Tidak</option>
            </select>
          </div>
          <div class="col-md-6">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" onclick="savePengaturan(${p.id})"><i class="bi bi-save"></i> Simpan</button>
              <button class="btn btn-success" onclick="startExamMapel('${esc(p.Mapel)}',${p.id})"><i class="bi bi-play-fill"></i> Mulai</button>
              <button class="btn btn-danger" onclick="stopExamMapel('${esc(p.Mapel)}',${p.id})"><i class="bi bi-stop-fill"></i> Stop</button>
              <button class="btn btn-outline-danger" onclick="deletePengaturan(${p.id},'${esc(p.Mapel)}')"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function savePengaturan(id) {
  const dur = parseInt(document.getElementById('dur-' + id).value) || 90;
  const acak = document.getElementById('acak-' + id).value === 'true';
  try {
    const { error } = await sb.from('PENGATURAN').update({ Durasi_menit: dur, Acak_soal: acak, Updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    showToast('Pengaturan disimpan!', 'success');
    loadPengaturan();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

async function startExamMapel(mapel, id) {
  try {
    const now = new Date();
    const p = pengaturanData.find(x => x.id === id);
    const dur = parseInt(document.getElementById('dur-' + id)?.value) || p?.Durasi_menit || 90;
    const end = new Date(now.getTime() + dur * 60000);
    const { error } = await sb.from('PENGATURAN').update({
      Status_ujian: 'AKTIF', Waktu_mulai: now.toISOString(), Waktu_selesai: end.toISOString(),
      Durasi_menit: dur, Updated_at: now.toISOString()
    }).eq('id', id);
    if (error) throw error;
    showToast(`Ujian ${mapel} dimulai! (${dur} menit)`, 'success');
    loadPengaturan();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

async function stopExamMapel(mapel, id) {
  try {
    const { error } = await sb.from('PENGATURAN').update({
      Status_ujian: 'SELESAI', Updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    showToast(`Ujian ${mapel} dihentikan`, 'warning');
    loadPengaturan();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

async function startAllExams() {
  showConfirm('▶️', 'Mulai Semua Ujian', 'Mulai semua ujian sekarang?', 'btn-success', async () => {
    for (const p of pengaturanData) {
      await startExamMapel(p.Mapel, p.id);
    }
  });
}

async function stopAllExams() {
  showConfirm('⏹', 'Hentikan Semua', 'Hentikan semua ujian?', 'btn-danger', async () => {
    for (const p of pengaturanData) {
      await stopExamMapel(p.Mapel, p.id);
    }
  });
}

async function addMapelPengaturan() {
  const mapel = prompt('Nama mapel baru:');
  if (!mapel) return;
  try {
    const { error } = await sb.from('PENGATURAN').insert({ Mapel: mapel.trim(), Durasi_menit: 90 });
    if (error) throw error;
    showToast('Mapel ditambahkan', 'success');
    loadPengaturan();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

async function deletePengaturan(id, mapel) {
  showConfirm('🗑️', 'Hapus Mapel', `Hapus pengaturan "${mapel}"?`, 'btn-danger', async () => {
    await sb.from('PENGATURAN').delete().eq('id', id);
    showToast('Dihapus', 'success');
    loadPengaturan();
  });
}

// ============ PERINGATAN (WARNING SYSTEM) ============
async function loadPeringatan() {
  try {
    const { data, error } = await sb.from('PERINGATAN').select('*').order('Timestamp', { ascending: false }).limit(200);
    if (error) throw error;
    peringatanData = data || [];
    renderPeringatan();
    populateWarnSiswa();
    updateNavBadges();
  } catch (e) { showToast('Gagal memuat peringatan: ' + e.message, 'error'); }
}

function renderPeringatan() {
  const tbody = document.getElementById('warnBody');
  if (!peringatanData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Belum ada peringatan</td></tr>';
    return;
  }
  tbody.innerHTML = peringatanData.map((w, i) => {
    const levelBadge = w.Level === 'RED' ? '<span class="badge bg-danger">🔴 RED</span>'
      : w.Level === 'ORANGE' ? '<span class="badge bg-warning text-dark">🟠 ORANGE</span>'
      : '<span class="badge bg-warning text-dark">🟡 YELLOW</span>';
    const statusBadge = w.Dibaca ? '<span class="badge bg-success">Dibaca</span>' : '<span class="badge bg-secondary">Belum</span>';
    return `<tr>
      <td>${i+1}</td>
      <td class="small text-nowrap">${formatTimestamp(w.Timestamp)}</td>
      <td><code>${esc(w.NIS)}</code></td>
      <td>${esc(w.Nama)}</td>
      <td>${levelBadge}</td>
      <td class="small">${esc(w.Pesan)}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

function populateWarnSiswa() {
  const sel = document.getElementById('warnSiswa');
  sel.innerHTML = '<option value="">-- Pilih Siswa --</option>';
  const onlineSiswa = siswaData.filter(s => ['ONLINE'].includes((s.Status||'').toUpperCase()));
  const allSiswa = onlineSiswa.length > 0 ? onlineSiswa : siswaData;
  allSiswa.forEach(s => {
    sel.innerHTML += `<option value="${esc(s.NIS)}" data-nama="${esc(s.Nama)}">${esc(s.NIS)} - ${esc(s.Nama)}</option>`;
  });
}

function applyPresetMsg() {
  const preset = document.getElementById('warnPreset').value;
  if (preset) document.getElementById('warnMsg').value = preset;
}

async function sendWarning() {
  const sel = document.getElementById('warnSiswa');
  const nis = sel.value;
  const nama = sel.selectedOptions[0]?.dataset?.nama || '';
  const level = document.getElementById('warnLevel').value;
  const msg = document.getElementById('warnMsg').value.trim();
  if (!nis) { showToast('Pilih siswa!', 'error'); return; }
  if (!msg) { showToast('Tulis pesan!', 'error'); return; }
  try {
    const { error } = await sb.from('PERINGATAN').insert({
      NIS: nis, Nama: nama, Level: level, Pesan: msg, Dibaca: false, Timestamp: new Date().toISOString()
    });
    if (error) throw error;
    showToast(`Peringatan ${level} terkirim ke ${nama}`, 'success');
    document.getElementById('warnMsg').value = '';
    loadPeringatan();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function confirmResetPeringatan() {
  showConfirm('⚠️', 'Reset Peringatan', 'Hapus semua peringatan?', 'btn-danger', async () => {
    await sb.from('PERINGATAN').delete().neq('NIS', '__never__');
    peringatanData = []; renderPeringatan(); updateNavBadges();
    showToast('Semua peringatan dihapus', 'success');
  });
}

// ============ LOAD SISWA ============
async function loadSiswa() {
  try {
    const { data, error } = await sb.from('SISWA').select('NIS, Nama, Sekolah, Status, Last_Heartbeat').order('NIS', { ascending: true });
    if (error) throw error;
    siswaData = data || [];
    renderSiswa(siswaData);
    updateOverviewStats();
    populateWarnSiswa();
  } catch (e) { showToast('Gagal memuat siswa: ' + e.message, 'error'); }
}

function renderSiswa(list) {
  const tbody = document.getElementById('siswaBody');
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="bi bi-people"></i>Tidak ada data siswa</td></tr>';
    document.getElementById('siswaFooter').textContent = 'Total: 0 siswa';
    return;
  }
  tbody.innerHTML = list.map((s, i) => {
    const statusClass = getStatusClass(s.Status);
    const hb = formatHeartbeat(s.Last_Heartbeat);
    return `<tr id="siswa-row-${s.NIS}">
      <td>${i+1}</td>
      <td><code class="fw-bold">${esc(s.NIS)}</code></td>
      <td>${esc(s.Nama)}</td>
      <td>${esc(s.Sekolah||'-')}</td>
      <td><span class="status-badge ${statusClass}"><span class="dot"></span> ${esc(s.Status||'OFFLINE')}</span></td>
      <td><span class="hb-text ${hb.cls}">${hb.text}</span></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-warning btn-sm" onclick="sendQuickWarn('${esc(s.NIS)}','${esc(s.Nama)}')" title="Kirim Peringatan"><i class="bi bi-bell"></i></button>
          <button class="btn btn-outline-secondary btn-sm" onclick="resetSiswaLogin('${esc(s.NIS)}')" title="Reset"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-outline-danger btn-sm" onclick="blockSiswa('${esc(s.NIS)}','${esc(s.Nama)}')" title="Block"><i class="bi bi-slash-circle"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('siswaFooter').textContent = `Total: ${list.length} siswa`;
}

function sendQuickWarn(nis, nama) {
  document.getElementById('warnSiswa').value = nis;
  document.getElementById('warnMsg').value = '';
  switchSection('peringatan');
}

function filterSiswa() {
  const q = (document.getElementById('searchSiswa').value || '').toLowerCase();
  const st = document.getElementById('filterStatus').value;
  const filtered = siswaData.filter(s => {
    const matchSearch = !q || (s.NIS||'').toLowerCase().includes(q) || (s.Nama||'').toLowerCase().includes(q);
    const matchStatus = !st || (s.Status||'OFFLINE').toUpperCase() === st;
    return matchSearch && matchStatus;
  });
  renderSiswa(filtered);
}

function updateSiswaRow(nis, newData) {
  const idx = siswaData.findIndex(s => s.NIS === nis);
  if (idx >= 0) Object.assign(siswaData[idx], newData);
  const row = document.getElementById('siswa-row-' + nis);
  if (!row) { loadSiswa(); return; }
  const s = idx >= 0 ? siswaData[idx] : newData;
  const statusClass = getStatusClass(s.Status);
  const hb = formatHeartbeat(s.Last_Heartbeat);
  const cells = row.querySelectorAll('td');
  if (cells.length >= 6) {
    cells[4].innerHTML = `<span class="status-badge ${statusClass}"><span class="dot"></span> ${esc(s.Status||'OFFLINE')}</span>`;
    cells[5].innerHTML = `<span class="hb-text ${hb.cls}">${hb.text}</span>`;
  }
  row.classList.add('table-row-highlight');
  setTimeout(() => row.classList.remove('table-row-highlight'), 1500);
  updateOverviewStats();
}

// ============ LOAD KECURANGAN ============
async function loadKecurangan() {
  try {
    const { data, error } = await sb.from('KECURANGAN').select('id, NIS, Nama, Jenis, Timestamp').order('Timestamp', { ascending: false }).limit(500);
    if (error) throw error;
    kecuranganData = data || [];
    renderKecurangan(kecuranganData);
    renderRecentCheats(kecuranganData.slice(0, 5));
    updateOverviewStats();
  } catch (e) { showToast('Gagal memuat kecurangan: ' + e.message, 'error'); }
}

function renderKecurangan(list) {
  const tbody = document.getElementById('cheatBody');
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="bi bi-shield-check"></i>Tidak ada kecurangan</td></tr>';
    document.getElementById('cheatFooter').textContent = 'Total: 0 record';
    return;
  }
  tbody.innerHTML = list.map((c, i) => {
    const badgeClass = getCheatBadgeClass(c.Jenis);
    return `<tr><td>${i+1}</td><td class="text-nowrap">${formatTimestamp(c.Timestamp)}</td><td><code>${esc(c.NIS)}</code></td><td>${esc(c.Nama)}</td><td><span class="cheat-badge ${badgeClass}">${esc(c.Jenis)}</span></td></tr>`;
  }).join('');
  document.getElementById('cheatFooter').textContent = `Total: ${list.length} record`;
}

function renderRecentCheats(list) {
  const tbody = document.getElementById('recentCheatBody');
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="bi bi-shield-check fs-3 d-block mb-2"></i>Belum ada kecurangan</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => {
    const bc = getCheatBadgeClass(c.Jenis);
    return `<tr><td class="text-nowrap small">${formatTimestamp(c.Timestamp)}</td><td><code class="small">${esc(c.NIS)}</code></td><td class="small">${esc(c.Nama)}</td><td><span class="cheat-badge ${bc}">${esc(c.Jenis)}</span></td></tr>`;
  }).join('');
}

function filterKecurangan() {
  const q = (document.getElementById('searchCheat').value || '').toLowerCase();
  const j = document.getElementById('filterJenis').value;
  const filtered = kecuranganData.filter(c => {
    const ms = !q || (c.NIS||'').toLowerCase().includes(q) || (c.Nama||'').toLowerCase().includes(q);
    const mj = !j || c.Jenis === j;
    return ms && mj;
  });
  renderKecurangan(filtered);
}

function prependCheatRow(record) {
  kecuranganData.unshift(record);
  renderKecurangan(kecuranganData);
  renderRecentCheats(kecuranganData.slice(0, 5));
  updateNavBadges();
}

// ============ LOAD HASIL ============
async function loadHasil() {
  try {
    const { data, error } = await sb.from('HASIL').select('id, NIS, Nama, Sekolah, Mapel, Skor, Jawaban_benar, Jawaban_salah, Kosong, Waktu_selesai').order('Waktu_selesai', { ascending: false });
    if (error) throw error;
    hasilData = data || [];
    renderHasil(hasilData);
    updateHasilMapelFilter();
    updateOverviewStats();
  } catch (e) { showToast('Gagal memuat hasil: ' + e.message, 'error'); }
}

function renderHasil(list) {
  const tbody = document.getElementById('hasilBody');
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state"><i class="bi bi-clipboard-x"></i>Belum ada hasil</td></tr>';
    document.getElementById('hasilFooter').textContent = 'Total: 0 hasil';
    return;
  }
  tbody.innerHTML = list.map((h, i) => `<tr>
    <td>${i+1}</td><td><code>${esc(h.NIS)}</code></td><td>${esc(h.Nama)}</td><td>${esc(h.Sekolah||'-')}</td>
    <td>${esc(h.Mapel||'-')}</td><td><span class="badge ${getSkorBadge(h.Skor)} fs-6">${h.Skor||0}</span></td>
    <td class="text-success fw-semibold">${h.Jawaban_benar||0}</td><td class="text-danger fw-semibold">${h.Jawaban_salah||0}</td>
    <td>${h.Kosong||0}</td><td class="small">${formatTimestamp(h.Waktu_selesai)}</td>
    <td><button class="btn btn-outline-danger btn-sm" onclick="deleteHasil('${h.id}','${esc(h.NIS)}','${esc(h.Nama)}')"><i class="bi bi-trash3"></i></button></td>
  </tr>`).join('');
  document.getElementById('hasilFooter').textContent = `Total: ${list.length} hasil`;
}

function updateHasilMapelFilter() {
  const sel = document.getElementById('filterMapelHasil');
  const mapels = [...new Set(hasilData.map(h => h.Mapel).filter(Boolean))];
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua Mapel</option>';
  mapels.forEach(m => { sel.innerHTML += `<option value="${esc(m)}">${esc(m)}</option>`; });
  sel.value = cur;
}

function filterHasil() {
  const q = (document.getElementById('searchHasil').value || '').toLowerCase();
  const m = document.getElementById('filterMapelHasil').value;
  const filtered = hasilData.filter(h => {
    const ms = !q || (h.NIS||'').toLowerCase().includes(q) || (h.Nama||'').toLowerCase().includes(q);
    const mm = !m || h.Mapel === m;
    return ms && mm;
  });
  renderHasil(filtered);
}

// ============ LOAD SOAL (Multi-type + Math) ============
async function loadSoal() {
  try {
    const { data, error } = await sb.from('SOAL').select('No, Mapel, Tipe, Soal, Opsi_A, Opsi_B, Opsi_C, Opsi_D, Opsi_E, Kunci, Bobot, Gambar').order('No', { ascending: true });
    if (error) throw error;
    soalData = data || [];
    renderSoal(soalData);
    updateMapelFilter();
    updateOverviewStats();
  } catch (e) { showToast('Gagal memuat soal: ' + e.message, 'error'); }
}

function getTipeLabel(tipe) {
  return { PG: 'Pilihan Ganda', BS: 'Benar/Salah', IS: 'Isian Singkat' }[tipe] || tipe || 'PG';
}

function getTipeBadgeClass(tipe) {
  return { PG: 'bg-primary', BS: 'bg-info', IS: 'bg-success' }[tipe] || 'bg-secondary';
}

function renderSoal(list) {
  const tbody = document.getElementById('soalBody');
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="bi bi-journal-x"></i>Belum ada soal</td></tr>';
    document.getElementById('soalFooter').textContent = 'Total: 0 soal';
    return;
  }
  tbody.innerHTML = list.map(s => {
    const hasImg = s.Gambar ? `<a href="${esc(s.Gambar)}" target="_blank" class="btn btn-sm btn-outline-info"><i class="bi bi-image"></i></a>` : '-';
    const tipe = s.Tipe || 'PG';
    return `<tr>
      <td><strong>${s.No}</strong></td>
      <td><span class="badge bg-primary-subtle text-primary">${esc(s.Mapel)}</span></td>
      <td><span class="badge ${getTipeBadgeClass(tipe)}">${getTipeLabel(tipe)}</span></td>
      <td><span class="text-truncate-2 soal-cell">${esc(s.Soal)}</span></td>
      <td><span class="badge bg-success">${esc(s.Kunci)}</span></td>
      <td>${s.Bobot||1}</td>
      <td>${hasImg}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary btn-sm" onclick="editSoal(${s.No})" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteSoal(${s.No})" title="Hapus"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('soalFooter').textContent = `Total: ${list.length} soal`;

  // Render math in soal cells
  setTimeout(() => {
    document.querySelectorAll('.soal-cell').forEach(el => renderMathIn(el));
  }, 100);
}

function updateMapelFilter() {
  const sel = document.getElementById('filterMapelSoal');
  const mapels = [...new Set(soalData.map(s => s.Mapel).filter(Boolean))];
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua Mapel</option>';
  mapels.forEach(m => { sel.innerHTML += `<option value="${esc(m)}">${esc(m)}</option>`; });
  sel.value = cur;
}

function filterSoal() {
  const m = document.getElementById('filterMapelSoal').value;
  const t = document.getElementById('filterTipeSoal').value;
  const filtered = soalData.filter(s => {
    return (!m || s.Mapel === m) && (!t || (s.Tipe||'PG') === t);
  });
  renderSoal(filtered);
}

// ============ SOAL MODAL (Add/Edit) ============
function toggleSoalFields() {
  const tipe = document.getElementById('soalTipe').value;
  const pgFields = document.getElementById('pgFields');
  const kunciInput = document.getElementById('soalKunci');
  if (tipe === 'PG') {
    pgFields.style.display = '';
    kunciInput.placeholder = 'A / B / C / D / E';
  } else if (tipe === 'BS') {
    pgFields.style.display = 'none';
    kunciInput.placeholder = 'Benar / Salah';
  } else if (tipe === 'IS') {
    pgFields.style.display = 'none';
    kunciInput.placeholder = 'Jawaban singkat (teks)';
  }
}

function openSoalModal(editNo) {
  const isEdit = !!editNo;
  document.getElementById('soalModalTitle').innerHTML = isEdit 
    ? '<i class="bi bi-pencil"></i> Edit Soal' 
    : '<i class="bi bi-journal-plus"></i> Tambah Soal';
  document.getElementById('soalEditNo').value = isEdit ? editNo : '';
  
  if (isEdit) {
    const s = soalData.find(x => x.No === editNo);
    if (!s) return;
    document.getElementById('soalNo').value = s.No;
    document.getElementById('soalNo').disabled = true;
    document.getElementById('soalMapel').value = s.Mapel || 'Matematika';
    document.getElementById('soalTipe').value = s.Tipe || 'PG';
    document.getElementById('soalText').value = s.Soal || '';
    document.getElementById('soalA').value = s.Opsi_A || '';
    document.getElementById('soalB').value = s.Opsi_B || '';
    document.getElementById('soalC').value = s.Opsi_C || '';
    document.getElementById('soalD').value = s.Opsi_D || '';
    document.getElementById('soalE').value = s.Opsi_E || '';
    document.getElementById('soalKunci').value = s.Kunci || '';
    document.getElementById('soalBobot').value = s.Bobot || 1;
    document.getElementById('soalGambar').value = s.Gambar || '';
  } else {
    document.getElementById('soalNo').value = soalData.length ? Math.max(...soalData.map(x=>x.No)) + 1 : 1;
    document.getElementById('soalNo').disabled = false;
    document.getElementById('soalTipe').value = 'PG';
    document.getElementById('soalText').value = '';
    document.getElementById('soalA').value = '';
    document.getElementById('soalB').value = '';
    document.getElementById('soalC').value = '';
    document.getElementById('soalD').value = '';
    document.getElementById('soalE').value = '';
    document.getElementById('soalKunci').value = '';
    document.getElementById('soalBobot').value = 1;
    document.getElementById('soalGambar').value = '';
  }
  
  toggleSoalFields();
  // Preview
  const preview = document.getElementById('soalPreview');
  preview.innerHTML = document.getElementById('soalText').value || 'Preview...';
  renderMathIn(preview);
  
  soalModal.show();
}

function editSoal(no) { openSoalModal(no); }

async function saveSoal() {
  const editNo = document.getElementById('soalEditNo').value;
  const isEdit = !!editNo;
  const no = parseInt(document.getElementById('soalNo').value);
  const tipe = document.getElementById('soalTipe').value;

  if (!no) { showToast('No soal wajib diisi', 'error'); return; }

  const payload = {
    No: no,
    Mapel: document.getElementById('soalMapel').value,
    Tipe: tipe,
    Soal: document.getElementById('soalText').value,
    Opsi_A: tipe === 'PG' ? document.getElementById('soalA').value : null,
    Opsi_B: tipe === 'PG' ? document.getElementById('soalB').value : null,
    Opsi_C: tipe === 'PG' ? document.getElementById('soalC').value : null,
    Opsi_D: tipe === 'PG' ? document.getElementById('soalD').value : null,
    Opsi_E: tipe === 'PG' ? document.getElementById('soalE').value : null,
    Kunci: document.getElementById('soalKunci').value,
    Bobot: parseInt(document.getElementById('soalBobot').value) || 1,
    Gambar: document.getElementById('soalGambar').value || null
  };

  try {
    if (isEdit) {
      const { error } = await sb.from('SOAL').update(payload).eq('No', parseInt(editNo));
      if (error) throw error;
      showToast('Soal diupdate!', 'success');
    } else {
      const { error } = await sb.from('SOAL').insert(payload);
      if (error) throw error;
      showToast('Soal ditambahkan!', 'success');
    }
    soalModal.hide();
    loadSoal();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function deleteSoal(no) {
  showConfirm('🗑️', 'Hapus Soal', `Hapus soal No. ${no}?`, 'btn-danger', async () => {
    await sb.from('SOAL').delete().eq('No', no);
    showToast('Soal dihapus', 'success');
    loadSoal();
  });
}

// ============ OVERVIEW STATS ============
function updateOverviewStats() {
  const total = siswaData.length;
  const online = siswaData.filter(s => (s.Status||'').toUpperCase() === 'ONLINE').length;
  const selesai = siswaData.filter(s => (s.Status||'').toUpperCase() === 'SELESAI').length;
  const blocked = siswaData.filter(s => ['BLOCKED','KICKED'].includes((s.Status||'').toUpperCase())).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statSelesai').textContent = selesai;
  document.getElementById('statBlocked').textContent = blocked;
  document.getElementById('statKecurangan').textContent = kecuranganData.length;
  document.getElementById('statSoal').textContent = soalData.length;
  document.getElementById('statHasil').textContent = hasilData.length;
  if (hasilData.length > 0) {
    const avg = hasilData.reduce((sum, h) => sum + (h.Skor||0), 0) / hasilData.length;
    document.getElementById('statRata').textContent = Math.round(avg);
  } else { document.getElementById('statRata').textContent = '0'; }
  updateNavBadges();
}

function updateNavBadges() {
  const online = siswaData.filter(s => (s.Status||'').toUpperCase() === 'ONLINE').length;
  document.getElementById('navOnlineCount').textContent = online;
  document.getElementById('navCheatCount').textContent = kecuranganData.length;
  const unread = peringatanData.filter(w => !w.Dibaca).length;
  document.getElementById('navWarnCount').textContent = unread;
}

// ============ ACTIONS ============
async function resetSiswaLogin(nis) {
  try {
    const { error } = await sb.from('SISWA').update({ Status: 'OFFLINE', Last_Heartbeat: null }).eq('NIS', nis);
    if (error) throw error;
    showToast(`Status ${nis} direset`, 'success');
    updateSiswaRow(nis, { Status: 'OFFLINE', Last_Heartbeat: null });
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function blockSiswa(nis, nama) {
  showConfirm('🚫', 'Block Siswa', `Block "${nama}" (${nis})?`, 'btn-danger', async () => {
    try {
      await sb.from('SISWA').update({ Status: 'BLOCKED' }).eq('NIS', nis);
      showToast(`${nama} diblokir`, 'warning');
      updateSiswaRow(nis, { Status: 'BLOCKED' });
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
  });
}

async function resetAllStatus() {
  showConfirm('🔄', 'Reset Semua Status', 'Reset SEMUA siswa ke OFFLINE?', 'btn-warning', async () => {
    try {
      await sb.from('SISWA').update({ Status: 'OFFLINE', Last_Heartbeat: null }).neq('Status', '__never__');
      showToast('Semua status direset', 'success');
      await loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
  });
}

function deleteHasil(id, nis, nama) {
  showConfirm('🗑️', 'Reset Ujian', `Hapus hasil "${nama}"?`, 'btn-danger', async () => {
    await sb.from('HASIL').delete().eq('id', id);
    await sb.from('SISWA').update({ Status: 'OFFLINE' }).eq('NIS', nis);
    showToast(`Hasil ${nama} dihapus`, 'success');
    await loadHasil(); await loadSiswa();
  });
}

function confirmResetKecurangan() {
  showConfirm('⚠️', 'Reset Kecurangan', 'Hapus semua log?', 'btn-danger', async () => {
    await sb.from('KECURANGAN').delete().neq('NIS', '__never__');
    kecuranganData = []; renderKecurangan([]); renderRecentCheats([]);
    updateOverviewStats(); showToast('Semua kecurangan dihapus', 'success');
  });
}

function confirmResetHasil() {
  showConfirm('⚠️', 'Reset Semua Hasil', 'Hapus semua hasil?', 'btn-danger', async () => {
    await sb.from('HASIL').delete().neq('NIS', '__never__');
    hasilData = []; renderHasil([]); updateOverviewStats();
    showToast('Semua hasil dihapus', 'success');
  });
}

// ============ EXPORT EXCEL ============
function exportToExcel(data, filename, sheetName) {
  if (!data || !data.length) { showToast('Tidak ada data untuk diexport', 'error'); return; }
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, filename);
  showToast(`File ${filename} berhasil didownload`, 'success');
}

function exportSiswaExcel() {
  const data = siswaData.map(s => ({
    NIS: s.NIS, Nama: s.Nama, Sekolah: s.Sekolah, Status: s.Status,
    Last_Heartbeat: s.Last_Heartbeat ? new Date(s.Last_Heartbeat).toLocaleString('id-ID') : '-'
  }));
  exportToExcel(data, 'siswa_cbt.xlsx', 'Siswa');
}

function exportKecuranganExcel() {
  const data = kecuranganData.map(c => ({
    Waktu: c.Timestamp ? new Date(c.Timestamp).toLocaleString('id-ID') : '-',
    NIS: c.NIS, Nama: c.Nama, Jenis: c.Jenis
  }));
  exportToExcel(data, 'kecurangan_cbt.xlsx', 'Kecurangan');
}

function exportHasilExcel() {
  const data = hasilData.map(h => ({
    NIS: h.NIS, Nama: h.Nama, Sekolah: h.Sekolah, Mapel: h.Mapel,
    Skor: h.Skor, Benar: h.Jawaban_benar, Salah: h.Jawaban_salah, Kosong: h.Kosong || 0,
    Waktu_Selesai: h.Waktu_selesai ? new Date(h.Waktu_selesai).toLocaleString('id-ID') : '-'
  }));
  exportToExcel(data, 'hasil_ujian_cbt.xlsx', 'Hasil');
}

function exportSoalExcel() {
  const data = soalData.map(s => ({
    No: s.No, Mapel: s.Mapel, Tipe: s.Tipe || 'PG', Soal: s.Soal,
    Opsi_A: s.Opsi_A, Opsi_B: s.Opsi_B, Opsi_C: s.Opsi_C, Opsi_D: s.Opsi_D, Opsi_E: s.Opsi_E,
    Kunci: s.Kunci, Bobot: s.Bobot, Gambar: s.Gambar
  }));
  exportToExcel(data, 'bank_soal_cbt.xlsx', 'Soal');
}

function exportPeringatanExcel() {
  const data = peringatanData.map(w => ({
    Waktu: w.Timestamp ? new Date(w.Timestamp).toLocaleString('id-ID') : '-',
    NIS: w.NIS, Nama: w.Nama, Level: w.Level, Pesan: w.Pesan, Dibaca: w.Dibaca ? 'Ya' : 'Belum'
  }));
  exportToExcel(data, 'peringatan_cbt.xlsx', 'Peringatan');
}

// ============ SUPABASE REALTIME ============
function subscribeRealtime() {
  unsubscribeRealtime();
  realtimeChannel = sb.channel('admin-dashboard-v2');

  realtimeChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'SISWA' }, (payload) => {
    const nd = payload.new;
    const idx = siswaData.findIndex(s => s.NIS === nd.NIS);
    if (idx >= 0) { siswaData[idx] = { ...siswaData[idx], ...nd }; updateSiswaRow(nd.NIS, nd); }
    else loadSiswa();
  });

  realtimeChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'KECURANGAN' }, (payload) => {
    prependCheatRow(payload.new);
    updateOverviewStats();
    playAlertSound();
    showToast(`⚠️ ${payload.new.Nama}: ${payload.new.Jenis}`, 'warning');
    if (Notification.permission === 'granted') {
      new Notification('Kecurangan!', { body: `${payload.new.Nama} — ${payload.new.Jenis}` });
    }
  });

  realtimeChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'HASIL' }, (payload) => {
    hasilData.unshift(payload.new);
    renderHasil(hasilData);
    updateOverviewStats();
    showToast(`✅ ${payload.new.Nama} telah submit`, 'info');
  });

  realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'PERINGATAN' }, () => {
    loadPeringatan();
  });

  realtimeChannel.subscribe((status) => {
    const dot = document.getElementById('realtimeDot');
    if (status === 'SUBSCRIBED') { dot.classList.add('connected'); dot.title = 'Connected'; }
    else { dot.classList.remove('connected'); dot.title = 'Disconnected'; }
  });

  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function unsubscribeRealtime() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  const dot = document.getElementById('realtimeDot');
  if (dot) dot.classList.remove('connected');
}

// ============ HELPERS ============
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function trunc(s, n) { if (!s) return ''; return s.length > n ? s.substring(0, n) + '...' : s; }

function getStatusClass(status) {
  switch ((status||'').toUpperCase()) {
    case 'ONLINE': return 'online'; case 'SELESAI': return 'selesai';
    case 'BLOCKED': return 'blocked'; case 'KICKED': return 'kicked';
    default: return 'offline';
  }
}

function getCheatBadgeClass(jenis) {
  if (!jenis) return 'default';
  const j = jenis.toLowerCase();
  if (j.includes('tab')||j.includes('ganti')) return 'tab';
  if (j.includes('focus')) return 'focus';
  if (j.includes('fullscreen')||j.includes('keluar')) return 'fullscreen';
  if (j.includes('keyboard')||j.includes('shortcut')) return 'keyboard';
  if (j.includes('devtools')||j.includes('dev')) return 'devtools';
  if (j.includes('mouse')) return 'mouse';
  if (j.includes('klik')||j.includes('click')) return 'click';
  if (j.includes('screenshot')) return 'screenshot';
  return 'default';
}

function getSkorBadge(skor) {
  if (!skor && skor !== 0) return 'bg-secondary';
  if (skor >= 80) return 'bg-success'; if (skor >= 60) return 'bg-primary';
  if (skor >= 40) return 'bg-warning text-dark'; return 'bg-danger';
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString('id-ID', { day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' });
  } catch (e) { return ts; }
}

function formatHeartbeat(ts) {
  if (!ts) return { text: 'Belum pernah', cls: '' };
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return { text: '-', cls: '' };
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return { text: `${diff}s lalu`, cls: 'recent' };
    if (diff < 3600) return { text: `${Math.floor(diff/60)}m lalu`, cls: diff < 120 ? 'recent' : '' };
    return { text: d.toLocaleTimeString('id-ID'), cls: 'stale' };
  } catch (e) { return { text: '-', cls: '' }; }
}

// ============ CONFIRMATION MODAL ============
function showConfirm(icon, title, msg, btnClass, onConfirm) {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmBtn');
  btn.className = `btn btn-sm px-4 ${btnClass || 'btn-danger'}`;
  btn.textContent = 'Ya, Lanjutkan';
  btn.onclick = () => { confirmModal.hide(); if (onConfirm) onConfirm(); };
  confirmModal.show();
}

// ============ TOAST ============
function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  const id = 'toast-' + Date.now();
  const bgClass = { success:'bg-success', error:'bg-danger', warning:'bg-warning text-dark', info:'bg-primary' }[type] || 'bg-primary';
  const iconMap = { success:'bi-check-circle-fill', error:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-white ${bgClass} border-0" role="alert" data-bs-autohide="true" data-bs-delay="4000">
      <div class="d-flex"><div class="toast-body"><i class="bi ${iconMap[type]||'bi-info-circle-fill'} me-1"></i>${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>
    </div>`);
  const el = document.getElementById(id);
  const bsToast = new bootstrap.Toast(el);
  bsToast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function playAlertSound() {
  try { const a = document.getElementById('alertSound'); if (a) { a.currentTime = 0; a.play().catch(()=>{}); } } catch(e) {}
}

// Periodic heartbeat refresh
setInterval(() => {
  if (siswaData.length > 0) {
    siswaData.forEach(s => {
      const row = document.getElementById('siswa-row-' + s.NIS);
      if (row) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          const hb = formatHeartbeat(s.Last_Heartbeat);
          cells[5].innerHTML = `<span class="hb-text ${hb.cls}">${hb.text}</span>`;
        }
      }
    });
  }
}, 30000

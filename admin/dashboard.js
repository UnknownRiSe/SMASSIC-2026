// ============================================================
// CBT SMASSIC 2026 - ADMIN DASHBOARD
// Supabase Realtime + Bootstrap 5
// ============================================================

// ⚠️ GANTI DENGAN KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = 'https://wwchdqtqakpbjswkavnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rwPcbkV7Y6Fi1AKCET40Yg_ae7HGaZr';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ STATE ============
let siswaData = [];
let kecuranganData = [];
let hasilData = [];
let soalData = [];
let realtimeChannel = null;
let confirmModal = null;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
  startClock();
  await checkSession();
});

// ============ CLOCK ============
function startClock() {
  const update = () => {
    document.getElementById('liveClock').textContent =
      new Date().toLocaleTimeString('id-ID');
  };
  update();
  setInterval(update, 1000);
}

// ============ AUTH ============
async function checkSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      showDashboard(session.user);
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
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

  // Load all data
  loadAllData();
  // Subscribe realtime
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

    spinner.classList.add('d-none');
    btn.disabled = false;

    if (error) {
      alertEl.textContent = error.message || 'Login gagal!';
      alertEl.classList.remove('d-none');
      return;
    }

    if (data.user) {
      showToast('Login berhasil!', 'success');
      showDashboard(data.user);
    }
  } catch (err) {
    spinner.classList.add('d-none');
    btn.disabled = false;
    alertEl.textContent = 'Terjadi kesalahan: ' + err.message;
    alertEl.classList.remove('d-none');
  }

  return false;
}

async function handleLogout() {
  await sb.auth.signOut();
  unsubscribeRealtime();
  siswaData = [];
  kecuranganData = [];
  hasilData = [];
  soalData = [];
  showLogin();
  showToast('Berhasil logout', 'info');
}

function togglePassword() {
  const inp = document.getElementById('inPassword');
  const icon = document.getElementById('eyeIcon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'bi bi-eye';
  }
}

// ============ SIDEBAR & NAVIGATION ============
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('show');

  // Manage overlay
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    };
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('show');
}

function switchSection(name) {
  // Hide all sections
  document.querySelectorAll('.section-panel').forEach(s => s.classList.add('d-none'));
  // Show target
  const target = document.getElementById('sec-' + name);
  if (target) {
    target.classList.remove('d-none');
  }

  // Update nav active
  document.querySelectorAll('#sidebar .nav-link').forEach(n => {
    n.classList.toggle('active', n.getAttribute('data-section') === name);
  });

  // Update title
  const titles = {
    overview: '📊 Overview',
    siswa: '👥 Monitor Siswa',
    kecurangan: '⚠️ Live Kecurangan',
    hasil: '📋 Rekap Nilai',
    soal: '📖 Bank Soal'
  };
  document.getElementById('sectionTitle').textContent = titles[name] || name;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('show');
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.remove('show');

  // Lazy load data
  if (name === 'siswa' && siswaData.length === 0) loadSiswa();
  if (name === 'kecurangan' && kecuranganData.length === 0) loadKecurangan();
  if (name === 'hasil' && hasilData.length === 0) loadHasil();
  if (name === 'soal' && soalData.length === 0) loadSoal();
}

// ============ LOAD ALL DATA ============
async function loadAllData() {
  await Promise.all([
    loadSiswa(),
    loadKecurangan(),
    loadHasil(),
    loadSoal()
  ]);
  updateOverviewStats();
}

// ============ LOAD SISWA ============
async function loadSiswa() {
  try {
    const { data, error } = await sb
      .from('SISWA')
      .select('NIS, Nama, Sekolah, Status, Last_Heartbeat')
      .order('NIS', { ascending: true });

    if (error) throw error;
    siswaData = data || [];
    renderSiswa(siswaData);
    updateOverviewStats();
  } catch (e) {
    showToast('Gagal memuat siswa: ' + e.message, 'error');
  }
}

function renderSiswa(list) {
  const tbody = document.getElementById('siswaBody');

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
      <i class="bi bi-people"></i>Tidak ada data siswa
    </td></tr>`;
    document.getElementById('siswaFooter').textContent = 'Total: 0 siswa';
    return;
  }

  tbody.innerHTML = list.map((s, i) => {
    const statusClass = getStatusClass(s.Status);
    const hb = formatHeartbeat(s.Last_Heartbeat);
    return `<tr id="siswa-row-${s.NIS}">
      <td>${i + 1}</td>
      <td><code class="fw-bold">${esc(s.NIS)}</code></td>
      <td>${esc(s.Nama)}</td>
      <td>${esc(s.Sekolah || '-')}</td>
      <td><span class="status-badge ${statusClass}"><span class="dot"></span> ${esc(s.Status || 'OFFLINE')}</span></td>
      <td><span class="hb-text ${hb.cls}">${hb.text}</span></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-warning btn-sm" onclick="resetSiswaLogin('${esc(s.NIS)}')" title="Reset ke OFFLINE">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="blockSiswa('${esc(s.NIS)}','${esc(s.Nama)}')" title="Block Siswa">
            <i class="bi bi-slash-circle"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('siswaFooter').textContent = `Total: ${list.length} siswa`;
}

function filterSiswa() {
  const q = (document.getElementById('searchSiswa').value || '').toLowerCase();
  const st = document.getElementById('filterStatus').value;

  const filtered = siswaData.filter(s => {
    const matchSearch = !q ||
      (s.NIS || '').toLowerCase().includes(q) ||
      (s.Nama || '').toLowerCase().includes(q);
    const matchStatus = !st || (s.Status || 'OFFLINE').toUpperCase() === st;
    return matchSearch && matchStatus;
  });

  renderSiswa(filtered);
}

// Update a single row in siswa table (efficient DOM update)
function updateSiswaRow(nis, newData) {
  const row = document.getElementById('siswa-row-' + nis);
  if (!row) {
    // Row doesn't exist, full re-render
    loadSiswa();
    return;
  }

  // Update local data
  const idx = siswaData.findIndex(s => s.NIS === nis);
  if (idx >= 0) {
    Object.assign(siswaData[idx], newData);
  }

  const s = idx >= 0 ? siswaData[idx] : newData;
  const statusClass = getStatusClass(s.Status);
  const hb = formatHeartbeat(s.Last_Heartbeat);

  // Update specific cells
  const cells = row.querySelectorAll('td');
  if (cells.length >= 6) {
    cells[4].innerHTML = `<span class="status-badge ${statusClass}"><span class="dot"></span> ${esc(s.Status || 'OFFLINE')}</span>`;
    cells[5].innerHTML = `<span class="hb-text ${hb.cls}">${hb.text}</span>`;
  }

  // Flash animation
  row.classList.add('table-row-highlight');
  setTimeout(() => row.classList.remove('table-row-highlight'), 1500);

  updateOverviewStats();
}

// ============ LOAD KECURANGAN ============
async function loadKecurangan() {
  try {
    const { data, error } = await sb
      .from('KECURANGAN')
      .select('id, NIS, Nama, Jenis, Timestamp')
      .order('Timestamp', { ascending: false })
      .limit(500);

    if (error) throw error;
    kecuranganData = data || [];
    renderKecurangan(kecuranganData);
    renderRecentCheats(kecuranganData.slice(0, 5));
    updateOverviewStats();
  } catch (e) {
    showToast('Gagal memuat kecurangan: ' + e.message, 'error');
  }
}

function renderKecurangan(list) {
  const tbody = document.getElementById('cheatBody');

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">
      <i class="bi bi-shield-check"></i>Tidak ada kecurangan tercatat
    </td></tr>`;
    document.getElementById('cheatFooter').textContent = 'Total: 0 record';
    return;
  }

  tbody.innerHTML = list.map((c, i) => {
    const badgeClass = getCheatBadgeClass(c.Jenis);
    return `<tr id="cheat-row-${c.id || i}">
      <td>${i + 1}</td>
      <td class="text-nowrap">${formatTimestamp(c.Timestamp)}</td>
      <td><code>${esc(c.NIS)}</code></td>
      <td>${esc(c.Nama)}</td>
      <td><span class="cheat-badge ${badgeClass}">${esc(c.Jenis)}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('cheatFooter').textContent = `Total: ${list.length} record`;
}

function renderRecentCheats(list) {
  const tbody = document.getElementById('recentCheatBody');
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">
      <i class="bi bi-shield-check fs-3 d-block mb-2"></i>Belum ada kecurangan
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const badgeClass = getCheatBadgeClass(c.Jenis);
    return `<tr>
      <td class="text-nowrap small">${formatTimestamp(c.Timestamp)}</td>
      <td><code class="small">${esc(c.NIS)}</code></td>
      <td class="small">${esc(c.Nama)}</td>
      <td><span class="cheat-badge ${badgeClass}">${esc(c.Jenis)}</span></td>
    </tr>`;
  }).join('');
}

function filterKecurangan() {
  const q = (document.getElementById('searchCheat').value || '').toLowerCase();
  const j = document.getElementById('filterJenis').value;

  const filtered = kecuranganData.filter(c => {
    const matchSearch = !q ||
      (c.NIS || '').toLowerCase().includes(q) ||
      (c.Nama || '').toLowerCase().includes(q);
    const matchJenis = !j || c.Jenis === j;
    return matchSearch && matchJenis;
  });

  renderKecurangan(filtered);
}

// Prepend new cheat row efficiently
function prependCheatRow(record) {
  // Add to local data
  kecuranganData.unshift(record);

  const tbody = document.getElementById('cheatBody');

  // Clear empty state if it exists
  const emptyCheck = tbody.querySelector('.empty-state');
  if (emptyCheck) {
    emptyCheck.closest('tr').remove();
  }

  const badgeClass = getCheatBadgeClass(record.Jenis);
  const tr = document.createElement('tr');
  tr.id = 'cheat-row-' + (record.id || Date.now());
  tr.className = 'cheat-row-new';
  tr.innerHTML = `
    <td>!</td>
    <td class="text-nowrap">${formatTimestamp(record.Timestamp)}</td>
    <td><code>${esc(record.NIS)}</code></td>
    <td>${esc(record.Nama)}</td>
    <td><span class="cheat-badge ${badgeClass}">${esc(record.Jenis)}</span></td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  // Update footer count
  document.getElementById('cheatFooter').textContent =
    `Total: ${kecuranganData.length} record`;

  // Update recent cheats on overview
  renderRecentCheats(kecuranganData.slice(0, 5));
  updateNavBadges();

  // Re-number rows
  const rows = tbody.querySelectorAll('tr');
  rows.forEach((r, i) => {
    const firstTd = r.querySelector('td');
    if (firstTd && !r.querySelector('.empty-state')) {
      firstTd.textContent = i + 1;
    }
  });
}

// ============ LOAD HASIL ============
async function loadHasil() {
  try {
    const { data, error } = await sb
      .from('HASIL')
      .select('id, NIS, Nama, Sekolah, Mapel, Skor, Jawaban_benar, Jawaban_salah, Waktu_selesai')
      .order('Waktu_selesai', { ascending: false });

    if (error) throw error;
    hasilData = data || [];
    renderHasil(hasilData);
    updateOverviewStats();
  } catch (e) {
    showToast('Gagal memuat hasil: ' + e.message, 'error');
  }
}

function renderHasil(list) {
  const tbody = document.getElementById('hasilBody');

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">
      <i class="bi bi-clipboard-x"></i>Belum ada hasil ujian
    </td></tr>`;
    document.getElementById('hasilFooter').textContent = 'Total: 0 hasil';
    return;
  }

  tbody.innerHTML = list.map((h, i) => {
    return `<tr>
      <td>${i + 1}</td>
      <td><code>${esc(h.NIS)}</code></td>
      <td>${esc(h.Nama)}</td>
      <td>${esc(h.Sekolah || '-')}</td>
      <td>${esc(h.Mapel || '-')}</td>
      <td><span class="badge ${getSkorBadge(h.Skor)} fs-6">${h.Skor || 0}</span></td>
      <td class="text-success fw-semibold">${h.Jawaban_benar || 0}</td>
      <td class="text-danger fw-semibold">${h.Jawaban_salah || 0}</td>
      <td class="small">${formatTimestamp(h.Waktu_selesai)}</td>
      <td>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteHasil('${h.id}','${esc(h.NIS)}','${esc(h.Nama)}')" title="Reset ujian siswa ini">
          <i class="bi bi-trash3"></i> Reset
        </button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('hasilFooter').textContent = `Total: ${list.length} hasil`;
}

function filterHasil() {
  const q = (document.getElementById('searchHasil').value || '').toLowerCase();
  const filtered = hasilData.filter(h => {
    return !q ||
      (h.NIS || '').toLowerCase().includes(q) ||
      (h.Nama || '').toLowerCase().includes(q) ||
      (h.Mapel || '').toLowerCase().includes(q);
  });
  renderHasil(filtered);
}

// ============ LOAD SOAL ============
async function loadSoal() {
  try {
    const { data, error } = await sb
      .from('SOAL')
      .select('No, Mapel, Soal, Opsi_A, Opsi_B, Opsi_C, Opsi_D, Opsi_E, Kunci, Gambar')
      .order('No', { ascending: true });

    if (error) throw error;
    soalData = data || [];
    renderSoal(soalData);
    updateMapelFilter();
    updateOverviewStats();
  } catch (e) {
    showToast('Gagal memuat soal: ' + e.message, 'error');
  }
}

function renderSoal(list) {
  const tbody = document.getElementById('soalBody');

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">
      <i class="bi bi-journal-x"></i>Belum ada soal
    </td></tr>`;
    document.getElementById('soalFooter').textContent = 'Total: 0 soal';
    return;
  }

  tbody.innerHTML = list.map(s => {
    const hasImg = s.Gambar ? `<a href="${esc(s.Gambar)}" target="_blank" class="btn btn-sm btn-outline-info"><i class="bi bi-image"></i></a>` : '<span class="text-muted">-</span>';
    return `<tr>
      <td><strong>${s.No}</strong></td>
      <td><span class="badge bg-primary-subtle text-primary">${esc(s.Mapel)}</span></td>
      <td><span class="text-truncate-2">${esc(s.Soal)}</span></td>
      <td class="small">${esc(trunc(s.Opsi_A, 20))}</td>
      <td class="small">${esc(trunc(s.Opsi_B, 20))}</td>
      <td class="small">${esc(trunc(s.Opsi_C, 20))}</td>
      <td class="small">${esc(trunc(s.Opsi_D, 20))}</td>
      <td class="small">${esc(trunc(s.Opsi_E, 20))}</td>
      <td><span class="badge bg-success">${esc(s.Kunci)}</span></td>
      <td>${hasImg}</td>
    </tr>`;
  }).join('');

  document.getElementById('soalFooter').textContent = `Total: ${list.length} soal`;
}

function updateMapelFilter() {
  const sel = document.getElementById('filterMapelSoal');
  const mapelSet = new Set(soalData.map(s => s.Mapel).filter(Boolean));
  const current = sel.value;
  sel.innerHTML = '<option value="">Semua Mapel</option>';
  mapelSet.forEach(m => {
    sel.innerHTML += `<option value="${esc(m)}">${esc(m)}</option>`;
  });
  sel.value = current;
}

function filterSoal() {
  const m = document.getElementById('filterMapelSoal').value;
  const filtered = m ? soalData.filter(s => s.Mapel === m) : soalData;
  renderSoal(filtered);
}

// ============ OVERVIEW STATS ============
function updateOverviewStats() {
  const total = siswaData.length;
  const online = siswaData.filter(s => (s.Status || '').toUpperCase() === 'ONLINE').length;
  const selesai = siswaData.filter(s => (s.Status || '').toUpperCase() === 'SELESAI').length;
  const blocked = siswaData.filter(s => ['BLOCKED', 'KICKED'].includes((s.Status || '').toUpperCase())).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statSelesai').textContent = selesai;
  document.getElementById('statBlocked').textContent = blocked;
  document.getElementById('statKecurangan').textContent = kecuranganData.length;
  document.getElementById('statSoal').textContent = soalData.length;
  document.getElementById('statHasil').textContent = hasilData.length;

  // Average score
  if (hasilData.length > 0) {
    const totalSkor = hasilData.reduce((sum, h) => sum + (h.Skor || 0), 0);
    document.getElementById('statRata').textContent = Math.round(totalSkor / hasilData.length);
  } else {
    document.getElementById('statRata').textContent = '0';
  }

  updateNavBadges();
}

function updateNavBadges() {
  const online = siswaData.filter(s => (s.Status || '').toUpperCase() === 'ONLINE').length;
  document.getElementById('navOnlineCount').textContent = online;
  document.getElementById('navCheatCount').textContent = kecuranganData.length;
}

// ============ ACTIONS ============
async function resetSiswaLogin(nis) {
  try {
    const { error } = await sb
      .from('SISWA')
      .update({ Status: 'OFFLINE', Last_Heartbeat: null })
      .eq('NIS', nis);

    if (error) throw error;
    showToast(`Status ${nis} direset ke OFFLINE`, 'success');

    // Optimistic update
    updateSiswaRow(nis, { Status: 'OFFLINE', Last_Heartbeat: null });
  } catch (e) {
    showToast('Gagal reset: ' + e.message, 'error');
  }
}

function blockSiswa(nis, nama) {
  showConfirm(
    '🚫',
    'Block Siswa',
    `Block "${nama}" (${nis})? Siswa tidak bisa melanjutkan ujian.`,
    'btn-danger',
    async () => {
      try {
        const { error } = await sb
          .from('SISWA')
          .update({ Status: 'BLOCKED' })
          .eq('NIS', nis);

        if (error) throw error;
        showToast(`${nama} telah diblokir`, 'warning');
        updateSiswaRow(nis, { Status: 'BLOCKED' });
      } catch (e) {
        showToast('Gagal block: ' + e.message, 'error');
      }
    }
  );
}

async function resetAllStatus() {
  showConfirm(
    '🔄',
    'Reset Semua Status',
    'Reset SEMUA siswa ke OFFLINE? Siswa yang sedang ujian akan ter-disconnect.',
    'btn-warning',
    async () => {
      try {
        const { error } = await sb
          .from('SISWA')
          .update({ Status: 'OFFLINE', Last_Heartbeat: null })
          .neq('Status', 'placeholder_never_match');
        // neq trick to update all rows

        if (error) throw error;
        showToast('Semua status direset', 'success');
        await loadSiswa();
      } catch (e) {
        showToast('Gagal reset: ' + e.message, 'error');
      }
    }
  );
}

function deleteHasil(id, nis, nama) {
  showConfirm(
    '🗑️',
    'Reset Ujian',
    `Hapus hasil ujian "${nama}" (${nis})? Siswa bisa mengulang ujian.`,
    'btn-danger',
    async () => {
      try {
        const { error } = await sb
          .from('HASIL')
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Also reset status to OFFLINE so student can re-login
        await sb
          .from('SISWA')
          .update({ Status: 'OFFLINE' })
          .eq('NIS', nis);

        showToast(`Hasil ${nama} dihapus`, 'success');
        await loadHasil();
        await loadSiswa();
      } catch (e) {
        showToast('Gagal hapus: ' + e.message, 'error');
      }
    }
  );
}

function confirmResetKecurangan() {
  showConfirm(
    '⚠️',
    'Reset Semua Kecurangan',
    'Hapus SEMUA log kecurangan? Tindakan ini tidak bisa dibatalkan.',
    'btn-danger',
    async () => {
      try {
        // Delete all rows
        const { error } = await sb
          .from('KECURANGAN')
          .delete()
          .neq('NIS', 'placeholder_never_match');

        if (error) throw error;

        kecuranganData = [];
        renderKecurangan([]);
        renderRecentCheats([]);
        updateOverviewStats();
        showToast('Semua kecurangan dihapus', 'success');
      } catch (e) {
        showToast('Gagal reset: ' + e.message, 'error');
      }
    }
  );
}

function confirmResetHasil() {
  showConfirm(
    '⚠️',
    'Reset Semua Hasil',
    'Hapus SEMUA hasil ujian? Tindakan ini tidak bisa dibatalkan.',
    'btn-danger',
    async () => {
      try {
        const { error } = await sb
          .from('HASIL')
          .delete()
          .neq('NIS', 'placeholder_never_match');

        if (error) throw error;

        hasilData = [];
        renderHasil([]);
        updateOverviewStats();
        showToast('Semua hasil dihapus', 'success');
      } catch (e) {
        showToast('Gagal reset: ' + e.message, 'error');
      }
    }
  );
}

// ============ SUPABASE REALTIME ============
function subscribeRealtime() {
  unsubscribeRealtime();

  realtimeChannel = sb.channel('admin-dashboard');

  // Listen to SISWA changes (UPDATE)
  realtimeChannel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'SISWA'
    },
    (payload) => {
      console.log('[RT] SISWA updated:', payload.new.NIS, payload.new.Status);
      const newData = payload.new;

      // Update local data
      const idx = siswaData.findIndex(s => s.NIS === newData.NIS);
      if (idx >= 0) {
        siswaData[idx] = { ...siswaData[idx], ...newData };
        updateSiswaRow(newData.NIS, newData);
      } else {
        // New student appeared
        loadSiswa();
      }
    }
  );

  // Listen to KECURANGAN inserts
  realtimeChannel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'KECURANGAN'
    },
    (payload) => {
      console.log('[RT] KECURANGAN insert:', payload.new);
      const record = payload.new;

      // Prepend to table
      prependCheatRow(record);
      updateOverviewStats();

      // Browser notification
      playAlertSound();
      showToast(
        `⚠️ ${record.Nama} (${record.NIS}): ${record.Jenis}`,
        'warning'
      );

      // Try native notification
      if (Notification.permission === 'granted') {
        new Notification('Kecurangan Terdeteksi!', {
          body: `${record.Nama} — ${record.Jenis}`,
          icon: '🚨'
        });
      }
    }
  );

  // Listen to HASIL inserts
  realtimeChannel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'HASIL'
    },
    (payload) => {
      console.log('[RT] HASIL insert:', payload.new);
      hasilData.unshift(payload.new);
      renderHasil(hasilData);
      updateOverviewStats();
      showToast(`📋 ${payload.new.Nama} telah submit jawaban`, 'info');
    }
  );

  // Subscribe
  realtimeChannel.subscribe((status) => {
    console.log('[RT] Channel status:', status);
    const dot = document.getElementById('realtimeDot');
    if (status === 'SUBSCRIBED') {
      dot.classList.add('connected');
      dot.title = 'Realtime Connected';
    } else {
      dot.classList.remove('connected');
      dot.title = 'Realtime Disconnected';
    }
  });

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function unsubscribeRealtime() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  const dot = document.getElementById('realtimeDot');
  if (dot) dot.classList.remove('connected');
}

// ============ HELPERS ============
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function trunc(s, n) {
  if (!s) return '';
  return s.length > n ? s.substring(0, n) + '...' : s;
}

function getStatusClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'ONLINE': return 'online';
    case 'SELESAI': return 'selesai';
    case 'BLOCKED': return 'blocked';
    case 'KICKED': return 'kicked';
    default: return 'offline';
  }
}

function getCheatBadgeClass(jenis) {
  if (!jenis) return 'default';
  const j = jenis.toLowerCase();
  if (j.includes('tab') || j.includes('ganti')) return 'tab';
  if (j.includes('focus')) return 'focus';
  if (j.includes('fullscreen') || j.includes('keluar')) return 'fullscreen';
  if (j.includes('keyboard') || j.includes('shortcut')) return 'keyboard';
  if (j.includes('devtools') || j.includes('dev')) return 'devtools';
  if (j.includes('mouse')) return 'mouse';
  if (j.includes('klik') || j.includes('click')) return 'click';
  if (j.includes('screenshot') || j.includes('screen')) return 'screenshot';
  return 'default';
}

function getSkorBadge(skor) {
  if (!skor && skor !== 0) return 'bg-secondary';
  if (skor >= 80) return 'bg-success';
  if (skor >= 60) return 'bg-primary';
  if (skor >= 40) return 'bg-warning text-dark';
  return 'bg-danger';
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return ts;
  }
}

function formatHeartbeat(ts) {
  if (!ts) return { text: 'Belum pernah', cls: '' };
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return { text: '-', cls: '' };

    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);

    if (diffSec < 60) {
      return { text: `${diffSec} detik lalu`, cls: 'recent' };
    }
    if (diffSec < 3600) {
      return { text: `${Math.floor(diffSec / 60)} menit lalu`, cls: diffSec < 120 ? 'recent' : '' };
    }
    return {
      text: d.toLocaleTimeString('id-ID'),
      cls: 'stale'
    };
  } catch (e) {
    return { text: '-', cls: '' };
  }
}

// ============ CONFIRMATION MODAL ============
function showConfirm(icon, title, msg, btnClass, onConfirm) {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;

  const btn = document.getElementById('confirmBtn');
  btn.className = `btn btn-sm px-4 ${btnClass || 'btn-danger'}`;
  btn.textContent = 'Ya, Lanjutkan';
  btn.onclick = () => {
    confirmModal.hide();
    if (onConfirm) onConfirm();
  };

  confirmModal.show();
}

// ============ TOAST ============
function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  const id = 'toast-' + Date.now();

  const bgClass = {
    success: 'bg-success',
    error: 'bg-danger',
    warning: 'bg-warning text-dark',
    info: 'bg-primary'
  }[type] || 'bg-primary';

  const iconMap = {
    success: 'bi-check-circle-fill',
    error: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };

  const html = `
    <div id="${id}" class="toast align-items-center text-white ${bgClass} border-0 ${type === 'warning' ? 'toast-cheat' : ''}" role="alert" data-bs-autohide="true" data-bs-delay="4000">
      <div class="d-flex">
        <div class="toast-body">
          <i class="bi ${iconMap[type] || 'bi-info-circle-fill'} me-1"></i>
          ${esc(message)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', html);

  const toastEl = document.getElementById(id);
  const bsToast = new bootstrap.Toast(toastEl);
  bsToast.show();

  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ============ ALERT SOUND ============
function playAlertSound() {
  try {
    const audio = document.getElementById('alertSound');
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => { /* autoplay blocked */ });
    }
  } catch (e) { /* ignore */ }
}

// ============ PERIODIC HEARTBEAT REFRESH ============
// Refresh heartbeat display every 30 seconds
setInterval(() => {
  if (siswaData.length > 0) {
    // Only update heartbeat text, not full re-render
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
}, 30000);

// ============================================================
// CBT SMASSIC 2026 — SISWA CLIENT (FULL UPGRADE)
// Multi-type, LaTeX math, Server timer, Warning system
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
let timerInterval = null;
let heartbeatInterval = null;
let warningChannel = null;
let examActive = false;
let examSubmitted = false;
let waktuMulai = '';
let sisaDetik = 0;
let violations = {};
const MAX_VIOLATIONS = 20;

const MAPEL_LIST = [
  { nama: 'Matematika', icon: '🔢', color: '#3b82f6' },
  { nama: 'IPA', icon: '🔬', color: '#10b981' },
  { nama: 'IPS', icon: '🌍', color: '#f59e0b' }
];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('cbt_siswa');
  if (saved) {
    try {
      currentSiswa = JSON.parse(saved);
      showPage('mapelPage');
      renderMapelButtons();
    } catch (e) { showPage('loginPage'); }
  } else {
    showPage('loginPage');
  }
});

// ============ RENDER MATH ============
function renderMath(el) {
  if (!el) return;
  // Wait for KaTeX to load
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
    } else {
      setTimeout(tryRender, 200);
    }
  };
  tryRender();
}

// ============ PAGE MANAGEMENT ============
function showPage(id) {
  ['loginPage', 'mapelPage', 'examPage', 'resultPage'].forEach(p => {
    const el = document.getElementById(p);
    if (!el) return;
    if (p === id) { el.classList.add('active'); el.style.display = ''; }
    else { el.classList.remove('active'); el.style.display = 'none'; }
  });
}

function showL() { document.getElementById('loader').classList.add('active'); }
function hideL() { document.getElementById('loader').classList.remove('active'); }

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i> ${msg}`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(40px)'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ============ LOGIN ============
async function doLogin(e) {
  e.preventDefault();
  const nis = document.getElementById('inputNIS').value.trim();
  const nama = document.getElementById('inputNama').value.trim();
  const alertEl = document.getElementById('loginAlert');
  alertEl.classList.add('d-none');

  if (!nis || !nama) { alertEl.textContent = 'NIS dan Nama wajib diisi'; alertEl.classList.remove('d-none'); return false; }

  showL();
  try {
    const { data, error } = await sb.from('SISWA').select('NIS, Nama, Sekolah, Status').eq('NIS', nis).maybeSingle();
    if (error) throw error;
    if (!data) { hideL(); alertEl.textContent = 'NIS tidak terdaftar'; alertEl.classList.remove('d-none'); return false; }
    if (data.Nama.trim().toLowerCase() !== nama.trim().toLowerCase()) {
      hideL(); alertEl.textContent = 'Nama tidak cocok'; alertEl.classList.remove('d-none'); return false;
    }
    const st = (data.Status || '').toUpperCase();
    if (st === 'BLOCKED' || st === 'KICKED') {
      hideL(); alertEl.textContent = 'Akun Anda diblokir. Hubungi pengawas.'; alertEl.classList.remove('d-none'); return false;
    }
    if (st === 'SELESAI') {
      hideL(); alertEl.textContent = 'Anda sudah menyelesaikan ujian.'; alertEl.classList.remove('d-none'); return false;
    }

    // Update status
    await sb.from('SISWA').update({ Status: 'ONLINE', Last_Heartbeat: new Date().toISOString() }).eq('NIS', nis);

    currentSiswa = { NIS: data.NIS, Nama: data.Nama, Sekolah: data.Sekolah || '' };
    localStorage.setItem('cbt_siswa', JSON.stringify(currentSiswa));
    hideL();
    toast(`Selamat datang, ${data.Nama}!`, 'success');
    showPage('mapelPage');
    renderMapelButtons();
  } catch (err) {
    hideL(); alertEl.textContent = 'Gagal login: ' + err.message; alertEl.classList.remove('d-none');
  }
  return false;
}

function doLogout() {
  if (examActive) { toast('Selesaikan ujian terlebih dahulu', 'warning'); return; }
  if (currentSiswa) {
    sb.from('SISWA').update({ Status: 'OFFLINE' }).eq('NIS', currentSiswa.NIS).then(() => {});
  }
  unsubscribeWarning();
  localStorage.removeItem('cbt_siswa');
  currentSiswa = null;
  showPage('loginPage');
}

function backToLogin() {
  localStorage.removeItem('cbt_siswa');
  currentSiswa = null;
  showPage('loginPage');
}

// ============ MAPEL SELECT ============
function renderMapelButtons() {
  if (!currentSiswa) return;
  document.getElementById('mapelWelcome').textContent = `Selamat datang, ${currentSiswa.Nama}`;
  const container = document.getElementById('mapelButtons');
  container.innerHTML = MAPEL_LIST.map(m => `
    <button class="mapel-btn" onclick="startExam('${m.nama}')">
      <div class="mapel-icon" style="background:${m.color}20;color:${m.color}">${m.icon}</div>
      <div style="text-align:left">
        <div style="font-size:15px">${m.nama}</div>
        <div style="font-size:11px;color:var(--gray);font-weight:400">Mulai ujian ${m.nama}</div>
      </div>
      <i class="bi bi-chevron-right ms-auto" style="color:var(--gray)"></i>
    </button>
  `).join('');
}

// ============ START EXAM ============
async function startExam(mapel) {
  currentMapel = mapel;
  showL();
  try {
    // 1. Check pengaturan ujian (timer dari server)
    const { data: pengaturan, error: pengErr } = await sb.from('PENGATURAN')
      .select('Durasi_menit, Status_ujian, Waktu_mulai, Waktu_selesai, Acak_soal')
      .eq('Mapel', mapel).maybeSingle();

    if (pengErr) console.warn('Pengaturan not found, using defaults');

    // Check if exam is active
    if (pengaturan && pengaturan.Status_ujian === 'SELESAI') {
      hideL(); toast('Ujian ' + mapel + ' sudah berakhir.', 'error'); return;
    }
    if (pengaturan && pengaturan.Status_ujian === 'BELUM') {
      hideL(); toast('Ujian ' + mapel + ' belum dimulai. Tunggu instruksi pengawas.', 'warning'); return;
    }

    // 2. Check if already submitted
    const { data: existingResult } = await sb.from('HASIL')
      .select('id').eq('NIS', currentSiswa.NIS).eq('Mapel', mapel).maybeSingle();
    if (existingResult) {
      hideL(); toast('Anda sudah mengerjakan ujian ' + mapel, 'warning'); return;
    }

    // 3. Load soal with Kunci, Bobot, Tipe
    const { data: soalRaw, error: soalErr } = await sb.from('SOAL')
      .select('No, Soal, Opsi_A, Opsi_B, Opsi_C, Opsi_D, Opsi_E, Kunci, Bobot, Tipe, Gambar, Mapel')
      .eq('Mapel', mapel).order('No', { ascending: true });

    if (soalErr || !soalRaw || !soalRaw.length) {
      hideL(); toast('Soal tidak ditemukan untuk ' + mapel, 'error'); return;
    }

    // 4. Shuffle if enabled
    let finalSoal = [...soalRaw];
    const shouldShuffle = pengaturan ? pengaturan.Acak_soal : true;
    if (shouldShuffle) {
      for (let j = finalSoal.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [finalSoal[j], finalSoal[k]] = [finalSoal[k], finalSoal[j]];
      }
    }

    // 5. Calculate timer from server pengaturan
    let durasi = 90; // default 90 minutes
    if (pengaturan) {
      if (pengaturan.Waktu_selesai) {
        // Calculate remaining time from server end time
        const endTime = new Date(pengaturan.Waktu_selesai).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
        if (remaining <= 0) {
          hideL(); toast('Waktu ujian ' + mapel + ' sudah habis.', 'error'); return;
        }
        durasi = remaining; // in seconds
      } else {
        durasi = (pengaturan.Durasi_menit || 90) * 60;
      }
    } else {
      durasi = 90 * 60;
    }

    hideL();
    initExam(mapel, finalSoal, durasi);
  } catch (e) {
    hideL(); toast('Gagal: ' + e.message, 'error');
  }
}

// ============ INIT EXAM ============
function initExam(mapel, soal, durasiDetik) {
  soalList = soal;
  jawaban = {};
  flagged = {};
  currentIndex = 0;
  examActive = true;
  examSubmitted = false;
  waktuMulai = new Date().toISOString();
  sisaDetik = durasiDetik;
  violations = {};

  // Restore saved answers
  const savedAns = loadJawabanLocal();
  if (savedAns && savedAns.mapel === mapel) {
    jawaban = savedAns.jawaban || {};
  }

  // UI
  document.getElementById('examMapelBadge').textContent = mapel;
  document.getElementById('examStudentName').textContent = currentSiswa.Nama;
  showPage('examPage');

  renderNavNumbers();
  renderSoal(0);
  startTimer();
  startHeartbeat();
  setupAntiCheat();
  subscribeWarning();

  // Request fullscreen
  try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
}

// ============ RENDER NAV NUMBERS ============
function renderNavNumbers() {
  const list = document.getElementById('soalNavList');
  list.innerHTML = soalList.map((s, i) => {
    const no = i + 1;
    const cls = [];
    if (i === currentIndex) cls.push('active');
    if (jawaban[s.No] || jawaban[String(s.No)]) cls.push('answered');
    if (flagged[s.No]) cls.push('flagged');
    return `<div class="nav-num ${cls.join(' ')}" onclick="goToSoal(${i})" title="Soal ${no}">${no}</div>`;
  }).join('');
  document.getElementById('examProgress').textContent = `${currentIndex + 1}/${soalList.length}`;
}

function updateNavHighlight() {
  const nums = document.querySelectorAll('.nav-num');
  nums.forEach((el, i) => {
    const s = soalList[i];
    el.className = 'nav-num';
    if (i === currentIndex) el.classList.add('active');
    if (jawaban[s.No] || jawaban[String(s.No)]) el.classList.add('answered');
    if (flagged[s.No]) el.classList.add('flagged');
  });
  document.getElementById('examProgress').textContent = `${currentIndex + 1}/${soalList.length}`;
}

// ============ RENDER SOAL (Multi-type) ============
function renderSoal(index) {
  if (index < 0 || index >= soalList.length) return;
  currentIndex = index;
  const s = soalList[index];
  const tipe = (s.Tipe || 'PG').toUpperCase();
  const currentAnswer = jawaban[s.No] || jawaban[String(s.No)] || '';
  const card = document.getElementById('questionCard');

  // Tipe badge
  const tipeBadges = { PG: ['Pilihan Ganda', 'tipe-pg'], BS: ['Benar / Salah', 'tipe-bs'], IS: ['Isian Singkat', 'tipe-is'] };
  const [tipeLabel, tipeClass] = tipeBadges[tipe] || tipeBadges.PG;

  // Gambar
  const imgHtml = s.Gambar ? `<img src="${esc(s.Gambar)}" class="question-img" alt="Gambar soal" onerror="this.style.display='none'">` : '';

  let optionsHtml = '';

  if (tipe === 'PG') {
    // Pilihan Ganda
    const options = [];
    if (s.Opsi_A) options.push({ key: 'A', text: s.Opsi_A });
    if (s.Opsi_B) options.push({ key: 'B', text: s.Opsi_B });
    if (s.Opsi_C) options.push({ key: 'C', text: s.Opsi_C });
    if (s.Opsi_D) options.push({ key: 'D', text: s.Opsi_D });
    if (s.Opsi_E) options.push({ key: 'E', text: s.Opsi_E });

    optionsHtml = `<div class="options-list">${options.map(o => `
      <div class="option-item ${currentAnswer.toUpperCase() === o.key ? 'selected' : ''}" onclick="selectAnswer('${s.No}','${o.key}')">
        <div class="option-letter">${o.key}</div>
        <div class="option-text">${esc(o.text)}</div>
      </div>
    `).join('')}</div>`;

  } else if (tipe === 'BS') {
    // Benar / Salah
    optionsHtml = `<div class="bs-options">
      <div class="bs-option benar ${currentAnswer.toUpperCase() === 'BENAR' ? 'selected' : ''}" onclick="selectAnswer('${s.No}','Benar')">
        <div style="font-size:28px;margin-bottom:4px">✅</div> Benar
      </div>
      <div class="bs-option salah ${currentAnswer.toUpperCase() === 'SALAH' ? 'selected' : ''}" onclick="selectAnswer('${s.No}','Salah')">
        <div style="font-size:28px;margin-bottom:4px">❌</div> Salah
      </div>
    </div>`;

  } else if (tipe === 'IS') {
    // Isian Singkat
    optionsHtml = `
      <div style="margin-top:8px">
        <label style="font-size:13px;font-weight:600;color:var(--gray);margin-bottom:8px;display:block">Ketik jawaban Anda:</label>
        <input type="text" class="isian-input" id="isianInput" value="${esc(currentAnswer)}" 
          placeholder="Ketik jawaban di sini..." 
          oninput="selectAnswer('${s.No}', this.value)" 
          autocomplete="off" spellcheck="false">
      </div>`;
  }

  card.innerHTML = `
    <div class="question-number">
      <div class="num">${index + 1}</div>
      <span class="tipe-badge ${tipeClass}">${tipeLabel}</span>
      ${s.Bobot && s.Bobot > 1 ? `<span class="tipe-badge" style="background:#fef3c7;color:#92400e">Bobot: ${s.Bobot}</span>` : ''}
    </div>
    <div class="question-text" id="questionText">${esc(s.Soal)}</div>
    ${imgHtml}
    ${optionsHtml}
  `;

  // Render math in question text and options
  setTimeout(() => {
    renderMath(document.getElementById('questionText'));
    document.querySelectorAll('.option-text').forEach(el => renderMath(el));
  }, 50);

  updateNavHighlight();
  updateFlagButton();

  // Focus isian input
  if (tipe === 'IS') {
    setTimeout(() => {
      const inp = document.getElementById('isianInput');
      if (inp) inp.focus();
    }, 100);
  }
}

// ============ ANSWER HANDLING ============
function selectAnswer(no, value) {
  jawaban[no] = value;
  saveJawabanLocal();
  // Re-render if PG or BS to show selection
  const tipe = (soalList[currentIndex]?.Tipe || 'PG').toUpperCase();
  if (tipe !== 'IS') {
    renderSoal(currentIndex);
  } else {
    updateNavHighlight();
  }
}

// ============ NAVIGATION ============
function goToSoal(i) { renderSoal(i); }
function prevSoal() { if (currentIndex > 0) renderSoal(currentIndex - 1); }
function nextSoal() { if (currentIndex < soalList.length - 1) renderSoal(currentIndex + 1); }

function toggleFlag() {
  const s = soalList[currentIndex];
  if (!s) return;
  flagged[s.No] = !flagged[s.No];
  updateNavHighlight();
  updateFlagButton();
}

function updateFlagButton() {
  const s = soalList[currentIndex];
  const btn = document.getElementById('btnFlag');
  if (s && flagged[s.No]) { btn.classList.add('active'); btn.innerHTML = '<i class="bi bi-flag-fill"></i> Ditandai'; }
  else { btn.classList.remove('active'); btn.innerHTML = '<i class="bi bi-flag"></i> Ragu'; }
}

// ============ TIMER ============
function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    sisaDetik--;
    updateTimerDisplay();
    if (sisaDetik <= 0) {
      clearInterval(timerInterval);
      toast('⏰ Waktu habis! Jawaban dikumpulkan otomatis.', 'warning');
      doSubmit(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const box = document.getElementById('timerBox');
  const h = Math.floor(sisaDetik / 3600);
  const m = Math.floor((sisaDetik % 3600) / 60);
  const s = sisaDetik % 60;
  box.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  box.classList.remove('warning', 'critical');
  if (sisaDetik <= 60) box.classList.add('critical');
  else if (sisaDetik <= 300) box.classList.add('warning');
}

// ============ HEARTBEAT ============
function startHeartbeat() {
  clearInterval(heartbeatInterval);
  const beat = () => {
    if (!currentSiswa || !examActive) return;
    sb.from('SISWA').update({ Status: 'ONLINE', Last_Heartbeat: new Date().toISOString() })
      .eq('NIS', currentSiswa.NIS).then(() => {});
  };
  beat();
  heartbeatInterval = setInterval(beat, 30000); // 30s for scalability
}

// ============ WARNING SYSTEM (Realtime) ============
function subscribeWarning() {
  unsubscribeWarning();
  if (!currentSiswa) return;

  warningChannel = sb.channel('warnings-' + currentSiswa.NIS);
  warningChannel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'PERINGATAN',
    filter: `NIS=eq.${currentSiswa.NIS}`
  }, (payload) => {
    const w = payload.new;
    if (w && !w.Dibaca) showWarningPopup(w);
  });
  warningChannel.subscribe();

  // Also check for unread warnings on load
  checkUnreadWarnings();
}

function unsubscribeWarning() {
  if (warningChannel) { sb.removeChannel(warningChannel); warningChannel = null; }
}

async function checkUnreadWarnings() {
  if (!currentSiswa) return;
  try {
    const { data } = await sb.from('PERINGATAN')
      .select('*').eq('NIS', currentSiswa.NIS).eq('Dibaca', false)
      .order('Timestamp', { ascending: false }).limit(1);
    if (data && data.length > 0) showWarningPopup(data[0]);
  } catch (e) { console.warn('Warning check failed:', e); }
}

function showWarningPopup(warning) {
  const overlay = document.getElementById('warningOverlay');
  const level = (warning.Level || 'YELLOW').toUpperCase();
  
  overlay.className = 'warning-overlay active ' + level.toLowerCase();

  const icons = { YELLOW: '🟡', ORANGE: '🟠', RED: '🔴' };
  const titles = { YELLOW: 'Peringatan Kuning', ORANGE: 'Peringatan Oranye', RED: 'PERINGATAN MERAH' };

  document.getElementById('warnIcon').textContent = icons[level] || '⚠️';
  document.getElementById('warnTitle').textContent = titles[level] || 'PERINGATAN';
  document.getElementById('warnMsg').textContent = warning.Pesan || 'Anda mendapat peringatan dari pengawas.';

  // Store warning id for marking as read
  overlay.dataset.warningId = warning.id;

  // Play alert
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LkZqTi4F5dXmBipOcnZeQiIB9foOLk5qcmJGJgH17gImSnJyYkImAe3uBipOcnZiRiYCAf4OLk5qcmA==');
    audio.play().catch(() => {});
  } catch (e) {}
}

async function dismissWarning() {
  const overlay = document.getElementById('warningOverlay');
  const id = overlay.dataset.warningId;
  overlay.classList.remove('active');

  if (id) {
    try {
      await sb.from('PERINGATAN').update({ Dibaca: true }).eq('id', parseInt(id));
    } catch (e) { console.warn('Failed to mark warning as read:', e); }
  }
}

// ============ ANTI-CHEAT ============
function setupAntiCheat() {
  violations = loadViolationsLocal() || {};

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && examActive && !examSubmitted) reportCheat('Ganti Tab');
  });

  window.addEventListener('blur', () => {
    if (examActive && !examSubmitted) reportCheat('Focus Lost');
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && examActive && !examSubmitted) {
      reportCheat('Keluar Fullscreen');
      try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
    }
  });

  document.addEventListener('contextmenu', (e) => {
    if (examActive) { e.preventDefault(); reportCheat('Klik Kanan'); }
  });

  document.addEventListener('keydown', (e) => {
    if (!examActive) return;
    const blocked = [
      e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()),
      e.ctrlKey && ['U', 'S', 'P', 'C', 'A'].includes(e.key.toUpperCase()),
      e.key === 'F12',
      e.key === 'PrintScreen',
      e.altKey && e.key === 'Tab',
      e.metaKey
    ];
    if (blocked.some(Boolean)) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'PrintScreen') reportCheat('Screenshot');
      else if (e.key === 'F12' || (e.ctrlKey && e.shiftKey)) reportCheat('DevTools');
      else reportCheat('Shortcut Keyboard');
    }
  });

  document.addEventListener('mouseleave', () => {
    if (examActive && !examSubmitted) reportCheat('Mouse Leave');
  });
}

async function reportCheat(jenis) {
  if (!currentSiswa || examSubmitted) return;

  // Rate limit: max 1 report per type per 5 seconds
  const key = jenis;
  const now = Date.now();
  if (violations[key] && (now - violations[key]) < 5000) return;
  violations[key] = now;
  saveViolationsLocal();

  // Count total violations
  const totalViolations = Object.keys(violations).reduce((sum, k) => {
    // Count each type as one violation for threshold
    return sum + 1;
  }, 0);

  console.log(`[CHEAT] ${jenis} (total types: ${totalViolations})`);

  try {
    await sb.from('KECURANGAN').insert({
      NIS: currentSiswa.NIS,
      Nama: currentSiswa.Nama,
      Jenis: jenis,
      Timestamp: new Date().toISOString()
    });
  } catch (e) { console.warn('Failed to report cheat:', e); }

  // Auto-submit after too many violations
  if (totalViolations >= MAX_VIOLATIONS && !examSubmitted) {
    toast('⛔ Terlalu banyak pelanggaran. Ujian otomatis dikumpulkan.', 'error');
    doSubmit(true);
  }
}

// ============ SUBMIT ============
function openSubmitModal() {
  const total = soalList.length;
  let answered = 0;
  let unanswered = 0;
  let flagCount = 0;

  soalList.forEach(s => {
    const ans = jawaban[s.No] || jawaban[String(s.No)] || '';
    if (ans.trim()) answered++;
    else unanswered++;
    if (flagged[s.No]) flagCount++;
  });

  document.getElementById('submitSummary').innerHTML = `
    <div class="d-flex justify-content-center gap-4 mb-2">
      <div><strong class="text-success">${answered}</strong><br><small>Dijawab</small></div>
      <div><strong class="text-danger">${unanswered}</strong><br><small>Kosong</small></div>
      <div><strong class="text-warning">${flagCount}</strong><br><small>Ditandai</small></div>
      <div><strong>${total}</strong><br><small>Total</small></div>
    </div>
    ${unanswered > 0 ? '<div class="text-danger small mt-2"><i class="bi bi-exclamation-circle"></i> Masih ada soal yang belum dijawab!</div>' : ''}
  `;
  document.getElementById('submitModal').classList.add('active');
}

function closeSubmitModal() { document.getElementById('submitModal').classList.remove('active'); }

async function doSubmit(auto) {
  if (examSubmitted) return;
  examSubmitted = true;
  examActive = false;

  document.getElementById('submitModal').classList.remove('active');
  clearInterval(timerInterval);
  clearInterval(heartbeatInterval);
  showL();

  // ========== HITUNG BENAR, SALAH, KOSONG, SKOR ==========
  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let totalSkor = 0;
  const jawabanRinci = {};

  soalList.forEach(soal => {
    const noSoal = String(soal.No);
    const jawabanSiswa = (jawaban[soal.No] || jawaban[noSoal] || '').trim();
    const kunci = (soal.Kunci || '').trim();
    const bobot = soal.Bobot || 1;
    const tipe = (soal.Tipe || 'PG').toUpperCase();

    jawabanRinci[noSoal] = jawabanSiswa;

    if (!jawabanSiswa) {
      kosong++;
    } else {
      // Compare based on type
      let isCorrect = false;
      if (tipe === 'PG') {
        isCorrect = jawabanSiswa.toUpperCase() === kunci.toUpperCase();
      } else if (tipe === 'BS') {
        isCorrect = jawabanSiswa.toUpperCase() === kunci.toUpperCase();
      } else if (tipe === 'IS') {
        // Case-insensitive, trim
        isCorrect = jawabanSiswa.toLowerCase() === kunci.toLowerCase();
      }

      if (isCorrect) {
        benar++;
        totalSkor += bobot;
      } else {
        salah++;
      }
    }
  });

  console.log('[SUBMIT] Benar:', benar, 'Salah:', salah, 'Kosong:', kosong, 'Skor:', totalSkor);

  const payload = {
    NIS: currentSiswa.NIS,
    Nama: currentSiswa.Nama,
    Sekolah: currentSiswa.Sekolah || '',
    Mapel: currentMapel,
    Jawaban_rinci: jawabanRinci,
    Waktu_mulai: waktuMulai,
    Waktu_selesai: new Date().toISOString(),
    Skor: totalSkor,
    Jawaban_benar: benar,
    Jawaban_salah: salah,
    Kosong: kosong
  };

  let success = false;

  // Method 1: Direct fetch
  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/HASIL', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (response.ok || response.status === 201) {
      success = true;
    } else {
      throw new Error('HTTP ' + response.status);
    }
  } catch (fetchErr) {
    console.warn('[SUBMIT] fetch failed, trying supabase-js:', fetchErr);
    // Method 2: Supabase JS
    try {
      const { error } = await sb.from('HASIL').insert([payload]);
      if (!error) success = true;
      else {
        // Verify
        const { data: check } = await sb.from('HASIL').select('id')
          .eq('NIS', currentSiswa.NIS).eq('Mapel', currentMapel)
          .order('id', { ascending: false }).limit(1).maybeSingle();
        if (check) success = true;
        else throw error;
      }
    } catch (sbErr) { console.error('[SUBMIT] All methods failed:', sbErr); }
  }

  if (success) {
    // Update status SELESAI
    try {
      await sb.from('SISWA').update({ Status: 'SELESAI' }).eq('NIS', currentSiswa.NIS);
    } catch (e) { console.warn('Status update failed:', e); }

    hideL();
    clearJawabanLocal();
    clearViolationsLocal();
    unsubscribeWarning();
    localStorage.removeItem('cbt_siswa');
    showPage('resultPage');
    try { document.exitFullscreen(); } catch (e) {}
    toast('✅ Jawaban berhasil dikumpulkan!', 'success');
  } else {
    hideL();
    toast('❌ Gagal submit. Coba lagi.', 'error');
    examSubmitted = false;
    examActive = true;
  }
}

// ============ LOCAL STORAGE ============
function saveJawabanLocal() {
  try {
    localStorage.setItem('cbt_jawaban', JSON.stringify({ mapel: currentMapel, jawaban }));
  } catch (e) {}
}

function loadJawabanLocal() {
  try {
    const d = localStorage.getItem('cbt_jawaban');
    return d ? JSON.parse(d) : null;
  } catch (e) { return null; }
}

function clearJawabanLocal() {
  try { localStorage.removeItem('cbt_jawaban'); } catch (e) {}
}

function saveViolationsLocal() {
  try { localStorage.setItem('cbt_violations', JSON.stringify(violations)); } catch (e) {}
}

function loadViolationsLocal() {
  try {
    const d = localStorage.getItem('cbt_violations');
    return d ? JSON.parse(d) : null;
  } catch (e) { return null; }
}

function clearViolationsLocal() {
  try { localStorage.removeItem('cbt_violations'); } catch (e) {}
}

// ============ HELPERS ============
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

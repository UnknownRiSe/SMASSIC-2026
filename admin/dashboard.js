// ============================================================
// CBT SMASSIC 2026 — PANEL PENGAWAS (FULL)
// Upload gambar via ImgBB (free, unlimited)
// ============================================================

const SUPABASE_URL = 'https://wwchdqtqakpbjswkavnm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2hkcXRxYWtwYmpzd2thdm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0OTk4NzcsImV4cCI6MjA2ODA3NTg3N30.a0gSp7WxIVDIBPVIvjYXVIHR4UBhM5VhEAi4V5YFpGQ';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ IMGBB CONFIG ============
// Dapatkan API key gratis di: https://api.imgbb.com/
const IMGBB_API_KEY = 'GANTI_DENGAN_API_KEY_ANDA';

// ============ CREDENTIALS ============
const VALID_USERS = [
    { username: 'admin', password: 'admin123', nama: 'Administrator' },
    { username: 'pengawas', password: 'pengawas123', nama: 'Pengawas Ujian' }
];

// ============ STATE ============
let currentUser = null;
let siswaList = [];
let soalList = [];
let hasilList = [];
let cheatList = [];
let siswaModal, soalModal, detailHasilModal;
let toastEl;
let refreshInterval = null;

// ============ MAPEL CONFIG ============
const MAPEL_LIST = [
    { nama: 'Matematika', icon: '📐', color: '#3b82f6' },
    { nama: 'IPA', icon: '🔬', color: '#10b981' },
    { nama: 'IPS', icon: '🌍', color: '#f59e0b' }
];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    siswaModal = new bootstrap.Modal(document.getElementById('modalSiswa'));
    soalModal = new bootstrap.Modal(document.getElementById('modalSoal'));
    detailHasilModal = new bootstrap.Modal(document.getElementById('modalDetailHasil'));
    toastEl = new bootstrap.Toast(document.getElementById('liveToast'), { delay: 3500 });

    // Check saved session
    const saved = localStorage.getItem('cbt_pengawas');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            showDashboard();
        } catch (e) {
            localStorage.removeItem('cbt_pengawas');
        }
    }

    // Enter key login
    document.getElementById('loginUser').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('loginPass').focus();
    });
    document.getElementById('loginPass').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    // Load theme
    const theme = localStorage.getItem('cbt_theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);

    // Tab change listeners
    document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(btn => {
        btn.addEventListener('shown.bs.tab', e => {
            const target = e.target.getAttribute('data-bs-target');
            if (target === '#paneSiswa') loadSiswa();
            if (target === '#paneSoal') loadSoal();
            if (target === '#panePengaturan') loadPengaturan();
            if (target === '#paneHasil') loadHasil();
            if (target === '#paneCheat') loadCheat();
        });
    });
});

// ============ THEME ============
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('cbt_theme', next);
}

function toggleLoginPw() {
    const inp = document.getElementById('loginPass');
    const icon = document.getElementById('loginPwIcon');
    if (inp.type === 'password') {
        inp.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        inp.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

// ============ TOAST ============
function showToast(msg, type = 'info') {
    const toast = document.getElementById('liveToast');
    toast.className = 'toast align-items-center border-0 text-white bg-' + type;
    document.getElementById('toastBody').textContent = msg;
    toastEl.show();
}

// ============ ESCAPE HTML ============
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============ LOGIN/LOGOUT ============
function doLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const alertEl = document.getElementById('loginAlert');
    alertEl.classList.add('d-none');

    if (!username || !password) {
        alertEl.textContent = 'Username dan password wajib diisi!';
        alertEl.classList.remove('d-none');
        return;
    }

    const user = VALID_USERS.find(u => u.username === username && u.password === password);
    if (!user) {
        alertEl.textContent = 'Username atau password salah!';
        alertEl.classList.remove('d-none');
        return;
    }

    currentUser = user;
    localStorage.setItem('cbt_pengawas', JSON.stringify(user));
    showDashboard();
}

function doLogout() {
    if (!confirm('Yakin keluar?')) return;
    currentUser = null;
    localStorage.removeItem('cbt_pengawas');
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    document.getElementById('dashboardSection').classList.add('d-none');
    document.getElementById('loginSection').style.display = '';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
}

function showDashboard() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboardSection').classList.remove('d-none');
    document.getElementById('navUser').textContent = currentUser.nama;
    loadSiswa();
    loadSoal();
    loadPengaturan();
    loadCheat();
    loadHasil();

    // Auto-refresh every 15s
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        loadSiswa();
        loadCheat();
    }, 15000);
}

// ============ FORMAT HELPERS ============
function formatTime(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return '-'; }
}

function formatDateTime(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
               d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '-'; }
}

function timeAgo(iso) {
    if (!iso) return '-';
    try {
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 0) return 'baru saja';
        if (diff < 30) return 'baru saja';
        if (diff < 60) return diff + ' dtk lalu';
        if (diff < 3600) return Math.floor(diff/60) + ' mnt lalu';
        return Math.floor(diff/3600) + ' jam lalu';
    } catch (e) { return '-'; }
}

function heartbeatStatus(iso) {
    if (!iso) return { cls: 'dead', text: 'Tidak ada' };
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return { cls: 'alive', text: timeAgo(iso) };
    if (diff < 300) return { cls: 'stale', text: timeAgo(iso) };
    return { cls: 'dead', text: timeAgo(iso) };
}

function statusBadge(status) {
    const s = (status || 'OFFLINE').toUpperCase();
    const map = {
        ONLINE: { cls: 'online', icon: '🟢', label: 'Online' },
        OFFLINE: { cls: 'offline', icon: '⚪', label: 'Offline' },
        SELESAI: { cls: 'selesai', icon: '🔵', label: 'Selesai' },
        BLOCKED: { cls: 'blocked', icon: '🔴', label: 'Blocked' },
        KICKED: { cls: 'kicked', icon: '🟠', label: 'Kicked' }
    };
    const m = map[s] || map.OFFLINE;
    return `<span class="status-badge ${m.cls}">${m.icon} ${m.label}</span>`;
}

// ================================================================
//                         TAB SISWA
// ================================================================
async function loadSiswa() {
    try {
        const { data, error } = await sb.from('SISWA')
            .select('*').order('Nama', { ascending: true });
        if (error) throw error;
        siswaList = data || [];
        renderSiswa();
        updateWarnTargets();
    } catch (e) {
        showToast('Gagal memuat siswa: ' + e.message, 'danger');
    }
}

function renderSiswa() {
    const tbody = document.getElementById('tbodySiswa');
    const search = (document.getElementById('searchSiswa').value || '').toLowerCase();

    let filtered = siswaList;
    if (search) {
        filtered = siswaList.filter(s =>
            (s.Nama || '').toLowerCase().includes(search) ||
            (s.NIS || '').toLowerCase().includes(search) ||
            (s.Sekolah || '').toLowerCase().includes(search)
        );
    }

    // Stats
    const online = siswaList.filter(s => (s.Status || '').toUpperCase() === 'ONLINE').length;
    const selesai = siswaList.filter(s => (s.Status || '').toUpperCase() === 'SELESAI').length;
    const blocked = siswaList.filter(s => ['BLOCKED','KICKED'].includes((s.Status || '').toUpperCase())).length;
    document.getElementById('statOnline').textContent = online;
    document.getElementById('statTotal').textContent = siswaList.length;
    document.getElementById('statSelesai').textContent = selesai;
    document.getElementById('statBlocked').textContent = blocked;
    document.getElementById('badgeSiswa').textContent = siswaList.length;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6">
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <div class="empty-text">Belum ada siswa</div>
                <div class="empty-sub">Klik "Tambah Siswa" untuk menambahkan</div>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const hb = heartbeatStatus(s.Last_Heartbeat);
        const st = (s.Status || 'OFFLINE').toUpperCase();
        return `<tr>
            <td><code>${esc(s.NIS)}</code></td>
            <td class="fw-semibold">${esc(s.Nama)}</td>
            <td class="text-muted">${esc(s.Sekolah || '-')}</td>
            <td>${statusBadge(s.Status)}</td>
            <td><span class="hb-dot ${hb.cls}"></span>${hb.text}</td>
            <td class="text-center text-nowrap">
                <button class="btn-action" onclick="openSiswaModal('${esc(s.NIS)}')" title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                ${st === 'BLOCKED' || st === 'KICKED' ?
                    `<button class="btn-action success" onclick="activateSiswa('${esc(s.NIS)}')" title="Aktifkan">
                        <i class="bi bi-unlock"></i>
                    </button>` : ''}
                ${st === 'ONLINE' ?
                    `<button class="btn-action warning" onclick="kickSiswa('${esc(s.NIS)}')" title="Kick">
                        <i class="bi bi-box-arrow-right"></i>
                    </button>
                    <button class="btn-action danger" onclick="blockSiswa('${esc(s.NIS)}')" title="Block">
                        <i class="bi bi-slash-circle"></i>
                    </button>` : ''}
                <button class="btn-action danger" onclick="deleteSiswa('${esc(s.NIS)}')" title="Hapus">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function filterSiswa() { renderSiswa(); }

// CRUD Siswa
function openSiswaModal(nis) {
    const isEdit = !!nis;
    document.getElementById('modalSiswaTitle').textContent = isEdit ? 'Edit Siswa' : 'Tambah Siswa';
    document.getElementById('siswaEditNIS').value = '';
    document.getElementById('siswaNIS').value = '';
    document.getElementById('siswaNIS').disabled = false;
    document.getElementById('siswaNama').value = '';
    document.getElementById('siswaSekolah').value = '';
    document.getElementById('siswaPassword').value = '';

    if (isEdit) {
        const s = siswaList.find(x => x.NIS === nis);
        if (s) {
            document.getElementById('siswaEditNIS').value = s.NIS;
            document.getElementById('siswaNIS').value = s.NIS;
            document.getElementById('siswaNIS').disabled = true;
            document.getElementById('siswaNama').value = s.Nama || '';
            document.getElementById('siswaSekolah').value = s.Sekolah || '';
            document.getElementById('siswaPassword').value = s.Password || '';
        }
    }
    siswaModal.show();
}

async function saveSiswa() {
    const editNIS = document.getElementById('siswaEditNIS').value;
    const isEdit = !!editNIS;
    const nis = document.getElementById('siswaNIS').value.trim();
    const nama = document.getElementById('siswaNama').value.trim();
    const sekolah = document.getElementById('siswaSekolah').value.trim();
    const password = document.getElementById('siswaPassword').value.trim();

    if (!nis || !nama || !password) {
        showToast('NIS, Nama, dan Password wajib diisi!', 'warning');
        return;
    }

    const payload = { Nama: nama, Sekolah: sekolah, Password: password };

    try {
        if (isEdit) {
            const { error } = await sb.from('SISWA').update(payload).eq('NIS', editNIS);
            if (error) throw error;
            showToast('Siswa diupdate!', 'success');
        } else {
            payload.NIS = nis;
            payload.Status = 'OFFLINE';
            const { error } = await sb.from('SISWA').insert(payload);
            if (error) throw error;
            showToast('Siswa ditambahkan!', 'success');
        }
        siswaModal.hide();
        loadSiswa();
    } catch (e) {
        showToast('Gagal: ' + e.message, 'danger');
    }
}

async function deleteSiswa(nis) {
    if (!confirm('Hapus siswa ' + nis + '?')) return;
    try {
        const { error } = await sb.from('SISWA').delete().eq('NIS', nis);
        if (error) throw error;
        showToast('Siswa dihapus.', 'success');
        loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function kickSiswa(nis) {
    if (!confirm('Kick siswa ' + nis + '?')) return;
    try {
        const { error } = await sb.from('SISWA').update({ Status: 'KICKED' }).eq('NIS', nis);
        if (error) throw error;
        showToast('Siswa di-kick.', 'warning');
        loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function blockSiswa(nis) {
    if (!confirm('Block siswa ' + nis + '?')) return;
    try {
        const { error } = await sb.from('SISWA').update({ Status: 'BLOCKED' }).eq('NIS', nis);
        if (error) throw error;
        showToast('Siswa diblokir.', 'danger');
        loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function activateSiswa(nis) {
    try {
        const { error } = await sb.from('SISWA').update({ Status: 'OFFLINE' }).eq('NIS', nis);
        if (error) throw error;
        showToast('Siswa diaktifkan kembali.', 'success');
        loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function resetAllSiswa() {
    if (!confirm('Reset semua status siswa ke OFFLINE?\nSiswa yang sedang ujian akan terdampak!')) return;
    try {
        const { error } = await sb.from('SISWA').update({ Status: 'OFFLINE', Last_Heartbeat: null }).neq('NIS', '');
        if (error) throw error;
        showToast('Semua status direset.', 'success');
        loadSiswa();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

// ================================================================
//                          TAB SOAL
// ================================================================
async function loadSoal() {
    try {
        let query = sb.from('SOAL').select('*').order('Mapel').order('No', { ascending: true });
        const filterMapel = document.getElementById('filterMapelSoal').value;
        const filterTipe = document.getElementById('filterTipeSoal').value;
        if (filterMapel) query = query.eq('Mapel', filterMapel);
        if (filterTipe) query = query.eq('Tipe', filterTipe);

        const { data, error } = await query;
        if (error) throw error;
        soalList = data || [];
        renderSoal();
    } catch (e) {
        showToast('Gagal memuat soal: ' + e.message, 'danger');
    }
}

function renderSoal() {
    const tbody = document.getElementById('tbodySoal');
    document.getElementById('badgeSoal').textContent = soalList.length;

    if (!soalList.length) {
        tbody.innerHTML = `<tr><td colspan="8">
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-text">Belum ada soal</div>
                <div class="empty-sub">Klik "Tambah Soal" untuk menambahkan</div>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = soalList.map(s => {
        const tipeMap = { PG: '🔘 PG', BS: '✅ B/S', IS: '✏️ Isian' };
        const soalPreview = (s.Soal || '').substring(0, 60) + ((s.Soal || '').length > 60 ? '...' : '');
        const imgHtml = s.Gambar ?
            `<img src="${esc(s.Gambar)}" class="soal-img-thumb" alt="img" onerror="this.style.display='none'" title="Klik untuk memperbesar" onclick="window.open('${esc(s.Gambar)}','_blank')">` :
            '<span class="text-muted small">-</span>';
        return `<tr>
            <td><strong>${s.No}</strong></td>
            <td>${esc(s.Mapel)}</td>
            <td>${tipeMap[s.Tipe] || s.Tipe}</td>
            <td><span class="soal-text-preview">${esc(soalPreview)}</span></td>
            <td>${imgHtml}</td>
            <td><code>${esc(s.Kunci || '-')}</code></td>
            <td>${s.Bobot || 1}</td>
            <td class="text-center text-nowrap">
                <button class="btn-action" onclick="openSoalModal(${s.No})" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn-action danger" onclick="deleteSoal(${s.No})" title="Hapus"><i class="bi bi-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ============ SOAL MODAL ============
function toggleSoalFields() {
    const tipe = document.getElementById('soalTipe').value;
    document.getElementById('pgFields').style.display = tipe === 'PG' ? '' : 'none';
    const kunci = document.getElementById('soalKunci');
    if (tipe === 'BS') {
        kunci.placeholder = 'Benar / Salah';
    } else if (tipe === 'IS') {
        kunci.placeholder = 'Jawaban teks';
    } else {
        kunci.placeholder = 'A / B / C / D / E';
    }
}

function openSoalModal(no) {
    const isEdit = !!no;
    document.getElementById('modalSoalTitle').textContent = isEdit ? 'Edit Soal' : 'Tambah Soal';
    document.getElementById('soalEditNo').value = '';
    document.getElementById('soalNo').value = '';
    document.getElementById('soalMapel').value = 'Matematika';
    document.getElementById('soalTipe').value = 'PG';
    document.getElementById('soalText').value = '';
    document.getElementById('soalA').value = '';
    document.getElementById('soalB').value = '';
    document.getElementById('soalC').value = '';
    document.getElementById('soalD').value = '';
    document.getElementById('soalE').value = '';
    document.getElementById('soalKunci').value = '';
    document.getElementById('soalBobot').value = '1';
    document.getElementById('soalGambar').value = '';
    document.getElementById('soalGambarFile').value = '';
    document.getElementById('soalGambarPreview').innerHTML = '';
    document.getElementById('soalGambarUploadStatus').innerHTML = '';
    document.getElementById('btnRemoveImg').classList.add('d-none');

    if (isEdit) {
        const s = soalList.find(x => x.No === no);
        if (s) {
            document.getElementById('soalEditNo').value = s.No;
            document.getElementById('soalNo').value = s.No;
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

            // Show existing image
            if (s.Gambar && s.Gambar.trim()) {
                document.getElementById('soalGambarPreview').innerHTML = `
                    <img src="${esc(s.Gambar)}" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid var(--border)">
                    <div class="small text-muted mt-1">Gambar saat ini — pilih file baru untuk mengganti</div>`;
                document.getElementById('btnRemoveImg').classList.remove('d-none');
            }
        }
    } else {
        // Auto-fill next number
        const maxNo = soalList.reduce((max, s) => Math.max(max, s.No || 0), 0);
        document.getElementById('soalNo').value = maxNo + 1;
    }

    toggleSoalFields();
    soalModal.show();
}

// ============ IMAGE UPLOAD (ImgBB) ============
function previewSoalImage(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('soalGambarPreview');
    const removeBtn = document.getElementById('btnRemoveImg');

    if (!file) {
        preview.innerHTML = '';
        removeBtn.classList.add('d-none');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('File harus berupa gambar!', 'warning');
        event.target.value = '';
        return;
    }

    if (file.size > 32 * 1024 * 1024) {
        showToast('Ukuran file maksimal 32MB!', 'warning');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}">`;
        removeBtn.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
}

function removeSoalImage() {
    document.getElementById('soalGambarFile').value = '';
    document.getElementById('soalGambar').value = '';
    document.getElementById('soalGambarPreview').innerHTML = '';
    document.getElementById('soalGambarUploadStatus').innerHTML = '';
    document.getElementById('btnRemoveImg').classList.add('d-none');
}

async function uploadToImgBB(file) {
    const statusEl = document.getElementById('soalGambarUploadStatus');
    statusEl.innerHTML = '<span class="text-primary"><i class="bi bi-cloud-upload me-1"></i>Mengupload gambar...</span>';

    const formData = new FormData();
    formData.append('image', file);
    formData.append('key', IMGBB_API_KEY);

    try {
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // Use original quality URL (not thumbnail)
            const imageUrl = result.data.image.url;
            document.getElementById('soalGambar').value = imageUrl;
            statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Upload berhasil!</span>';
            return imageUrl;
        } else {
            throw new Error(result.error?.message || 'Upload gagal');
        }
    } catch (e) {
        statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Gagal: ${e.message}</span>`;
        throw e;
    }
}

// ============ SAVE SOAL ============
async function saveSoal() {
    const editNo = document.getElementById('soalEditNo').value;
    const isEdit = !!editNo;
    const no = parseInt(document.getElementById('soalNo').value);
    const tipe = document.getElementById('soalTipe').value;

    if (!no) { showToast('No soal wajib diisi!', 'warning'); return; }
    if (!document.getElementById('soalText').value.trim()) { showToast('Soal wajib diisi!', 'warning'); return; }
    if (!document.getElementById('soalKunci').value.trim()) { showToast('Kunci jawaban wajib diisi!', 'warning'); return; }

    // Disable button during save
    const btnSave = document.getElementById('btnSaveSoal');
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="spinner-grow spinner-grow-sm me-1"></span> Menyimpan...';

    // Handle image upload
    let gambarUrl = document.getElementById('soalGambar').value || null;
    const fileInput = document.getElementById('soalGambarFile');

    if (fileInput.files && fileInput.files[0]) {
        try {
            gambarUrl = await uploadToImgBB(fileInput.files[0]);
        } catch (e) {
            showToast('Upload gambar gagal: ' + e.message, 'danger');
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-check-lg me-1"></i> Simpan';
            return;
        }
    }

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
        Gambar: gambarUrl
    };

    try {
        if (isEdit) {
            const { error } = await sb.from('SOAL').update(payload).eq('No', parseInt(editNo));
            if (error) throw error;
            showToast('Soal berhasil diupdate!', 'success');
        } else {
            const { error } = await sb.from('SOAL').insert(payload);
            if (error) throw error;
            showToast('Soal berhasil ditambahkan!', 'success');
        }
        soalModal.hide();
        loadSoal();
    } catch (e) {
        showToast('Gagal: ' + e.message, 'danger');
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = '<i class="bi bi-check-lg me-1"></i> Simpan';
    }
}

async function deleteSoal(no) {
    if (!confirm('Hapus soal No.' + no + '?')) return;
    try {
        const { error } = await sb.from('SOAL').delete().eq('No', no);
        if (error) throw error;
        showToast('Soal dihapus.', 'success');
        loadSoal();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function deleteAllSoal() {
    const mapel = document.getElementById('filterMapelSoal').value;
    const label = mapel || 'SEMUA MAPEL';
    if (!confirm('Hapus semua soal ' + label + '?\nAksi ini tidak dapat dibatalkan!')) return;
    if (!confirm('YAKIN? Semua soal ' + label + ' akan dihapus permanen!')) return;

    try {
        let query = sb.from('SOAL').delete();
        if (mapel) query = query.eq('Mapel', mapel);
        else query = query.neq('No', 0); // delete all
        const { error } = await query;
        if (error) throw error;
        showToast('Semua soal ' + label + ' dihapus.', 'success');
        loadSoal();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

// ================================================================
//                       TAB PENGATURAN
// ================================================================
async function loadPengaturan() {
    const container = document.getElementById('pengaturanCards');
    let html = '';

    for (const m of MAPEL_LIST) {
        try {
            const { data } = await sb.from('PENGATURAN')
                .select('*').eq('Mapel', m.nama).maybeSingle();

            const p = data || { Mapel: m.nama, Status_ujian: 'BELUM', Durasi_menit: 90, Acak_soal: true };
            const statusClass = p.Status_ujian === 'AKTIF' ? 'aktif' :
                                p.Status_ujian === 'SELESAI' ? 'selesai-uj' : 'belum';
            const statusLabel = p.Status_ujian === 'AKTIF' ? '🟢 AKTIF' :
                                p.Status_ujian === 'SELESAI' ? '🔵 SELESAI' : '⚪ BELUM';

            html += `
            <div class="pengaturan-card">
                <div class="mapel-title">
                    <span style="font-size:20px">${m.icon}</span> ${m.nama}
                    <span class="status-ujian ${statusClass} ms-auto">${statusLabel}</span>
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-semibold mb-1">Durasi (menit)</label>
                    <input type="number" class="form-control form-control-sm" value="${p.Durasi_menit || 90}"
                        id="durasi_${m.nama}" min="1" max="600">
                </div>
                <div class="mb-2 form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="acak_${m.nama}" ${p.Acak_soal !== false ? 'checked' : ''}>
                    <label class="form-check-label small" for="acak_${m.nama}">Acak Soal</label>
                </div>
                <div class="d-flex flex-wrap gap-1">
                    <button class="btn btn-sm btn-outline-primary" onclick="savePengaturan('${m.nama}')">
                        <i class="bi bi-save me-1"></i>Simpan
                    </button>
                    ${p.Status_ujian !== 'AKTIF' ?
                        `<button class="btn btn-sm btn-success" onclick="setUjianStatus('${m.nama}','AKTIF')">
                            <i class="bi bi-play me-1"></i>Mulai
                        </button>` :
                        `<button class="btn btn-sm btn-danger" onclick="setUjianStatus('${m.nama}','SELESAI')">
                            <i class="bi bi-stop me-1"></i>Akhiri
                        </button>`
                    }
                    ${p.Status_ujian === 'SELESAI' ?
                        `<button class="btn btn-sm btn-outline-secondary" onclick="setUjianStatus('${m.nama}','BELUM')">
                            <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
                        </button>` : ''
                    }
                </div>
            </div>`;
        } catch (e) {
            html += `<div class="pengaturan-card"><p class="text-danger">Error: ${e.message}</p></div>`;
        }
    }

    container.innerHTML = html;
}

async function savePengaturan(mapel) {
    const durasi = parseInt(document.getElementById('durasi_' + mapel).value) || 90;
    const acak = document.getElementById('acak_' + mapel).checked;

    try {
        // Upsert
        const { data: existing } = await sb.from('PENGATURAN').select('id').eq('Mapel', mapel).maybeSingle();
        if (existing) {
            const { error } = await sb.from('PENGATURAN').update({
                Durasi_menit: durasi, Acak_soal: acak
            }).eq('Mapel', mapel);
            if (error) throw error;
        } else {
            const { error } = await sb.from('PENGATURAN').insert({
                Mapel: mapel, Durasi_menit: durasi, Acak_soal: acak, Status_ujian: 'BELUM'
            });
            if (error) throw error;
        }
        showToast('Pengaturan ' + mapel + ' disimpan!', 'success');
        loadPengaturan();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function setUjianStatus(mapel, status) {
    const action = status === 'AKTIF' ? 'memulai' : status === 'SELESAI' ? 'mengakhiri' : 'mereset';
    if (!confirm('Yakin ' + action + ' ujian ' + mapel + '?')) return;

    try {
        const payload = { Status_ujian: status };
        if (status === 'AKTIF') {
            const durasi = parseInt(document.getElementById('durasi_' + mapel).value) || 90;
            const now = new Date();
            const end = new Date(now.getTime() + durasi * 60000);
            payload.Waktu_mulai = now.toISOString();
            payload.Waktu_selesai = end.toISOString();
            payload.Durasi_menit = durasi;
            payload.Acak_soal = document.getElementById('acak_' + mapel).checked;
        }
        if (status === 'BELUM') {
            payload.Waktu_mulai = null;
            payload.Waktu_selesai = null;
        }

        const { data: existing } = await sb.from('PENGATURAN').select('id').eq('Mapel', mapel).maybeSingle();
        if (existing) {
            const { error } = await sb.from('PENGATURAN').update(payload).eq('Mapel', mapel);
            if (error) throw error;
        } else {
            payload.Mapel = mapel;
            payload.Durasi_menit = payload.Durasi_menit || 90;
            payload.Acak_soal = payload.Acak_soal !== undefined ? payload.Acak_soal : true;
            const { error } = await sb.from('PENGATURAN').insert(payload);
            if (error) throw error;
        }

        showToast('Ujian ' + mapel + ' → ' + status, 'success');
        loadPengaturan();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

// ============ WARNING SYSTEM ============
function updateWarnTargets() {
    const sel = document.getElementById('warnTarget');
    const onlineSiswa = siswaList.filter(s => (s.Status || '').toUpperCase() === 'ONLINE');
    sel.innerHTML = `<option value="">— Semua Siswa Online (${onlineSiswa.length}) —</option>` +
        onlineSiswa.map(s => `<option value="${esc(s.NIS)}">${esc(s.NIS)} — ${esc(s.Nama)}</option>`).join('');
}

async function sendWarning() {
    const target = document.getElementById('warnTarget').value;
    const level = document.getElementById('warnLevel').value;
    const pesan = document.getElementById('warnMsg').value.trim();

    if (!pesan) { showToast('Tulis pesan peringatan!', 'warning'); return; }

    try {
        if (target) {
            // Send to one siswa
            const { error } = await sb.from('PERINGATAN').insert({
                NIS: target, Level: level, Pesan: pesan,
                Dibaca: false, Timestamp: new Date().toISOString()
            });
            if (error) throw error;
            showToast('Peringatan dikirim ke ' + target, 'success');
        } else {
            // Send to all online
            const onlineSiswa = siswaList.filter(s => (s.Status || '').toUpperCase() === 'ONLINE');
            if (!onlineSiswa.length) { showToast('Tidak ada siswa online!', 'warning'); return; }

            const rows = onlineSiswa.map(s => ({
                NIS: s.NIS, Level: level, Pesan: pesan,
                Dibaca: false, Timestamp: new Date().toISOString()
            }));
            const { error } = await sb.from('PERINGATAN').insert(rows);
            if (error) throw error;
            showToast('Peringatan dikirim ke ' + onlineSiswa.length + ' siswa!', 'success');
        }
        document.getElementById('warnMsg').value = '';
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

// ================================================================
//                         TAB HASIL
// ================================================================
async function loadHasil() {
    try {
        let query = sb.from('HASIL').select('*').order('Waktu_selesai', { ascending: false });
        const filterMapel = document.getElementById('filterMapelHasil').value;
        if (filterMapel) query = query.eq('Mapel', filterMapel);

        const { data, error } = await query;
        if (error) throw error;
        hasilList = data || [];
        renderHasil();
    } catch (e) { showToast('Gagal memuat hasil: ' + e.message, 'danger'); }
}

function renderHasil() {
    const tbody = document.getElementById('tbodyHasil');
    document.getElementById('badgeHasil').textContent = hasilList.length;

    if (!hasilList.length) {
        tbody.innerHTML = `<tr><td colspan="11">
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-text">Belum ada hasil ujian</div>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = hasilList.map(h => {
        return `<tr>
            <td><code>${esc(h.NIS)}</code></td>
            <td class="fw-semibold">${esc(h.Nama)}</td>
            <td class="text-muted">${esc(h.Sekolah || '-')}</td>
            <td>${esc(h.Mapel)}</td>
            <td><strong class="text-primary">${h.Skor || 0}</strong></td>
            <td class="text-success">${h.Jawaban_benar || 0}</td>
            <td class="text-danger">${h.Jawaban_salah || 0}</td>
            <td class="text-muted">${h.Kosong || 0}</td>
            <td class="small">${formatDateTime(h.Waktu_mulai)}</td>
            <td class="small">${formatDateTime(h.Waktu_selesai)}</td>
            <td class="text-center text-nowrap">
                <button class="btn-action" onclick="showDetailHasil(${h.id})" title="Detail">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn-action danger" onclick="deleteHasil(${h.id})" title="Hapus">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function showDetailHasil(id) {
    const h = hasilList.find(x => x.id === id);
    if (!h) return;
    const body = document.getElementById('detailHasilBody');
    const rinci = h.Jawaban_rinci || {};

    let html = `
        <div class="mb-3">
            <strong>${esc(h.Nama)}</strong> (${esc(h.NIS)}) — ${esc(h.Mapel)}<br>
            <span class="text-muted small">Skor: <strong>${h.Skor}</strong> | Benar: ${h.Jawaban_benar} | Salah: ${h.Jawaban_salah} | Kosong: ${h.Kosong}</span>
        </div>
        <table class="table table-sm table-bordered">
            <thead><tr><th>No</th><th>Jawaban Siswa</th></tr></thead>
            <tbody>`;

    const keys = Object.keys(rinci).sort((a,b) => parseInt(a) - parseInt(b));
    keys.forEach(no => {
        const ans = rinci[no] || '-';
        html += `<tr><td>${no}</td><td><code>${esc(ans)}</code></td></tr>`;
    });

    html += '</tbody></table>';
    body.innerHTML = html;
    detailHasilModal.show();
}

async function deleteHasil(id) {
    if (!confirm('Hapus hasil ini?')) return;
    try {
        const { error } = await sb.from('HASIL').delete().eq('id', id);
        if (error) throw error;
        showToast('Hasil dihapus.', 'success');
        loadHasil();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

async function deleteAllHasil() {
    const mapel = document.getElementById('filterMapelHasil').value;
    const label = mapel || 'SEMUA';
    if (!confirm('Hapus semua hasil ' + label + '?\nAksi ini TIDAK DAPAT dibatalkan!')) return;
    if (!confirm('KONFIRMASI TERAKHIR: Hapus permanen?')) return;
    try {
        let query = sb.from('HASIL').delete();
        if (mapel) query = query.eq('Mapel', mapel);
        else query = query.neq('id', 0);
        const { error } = await query;
        if (error) throw error;
        showToast('Semua hasil ' + label + ' dihapus.', 'success');
        loadHasil();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

function exportHasil() {
    if (!hasilList.length) { showToast('Tidak ada data untuk diexport.', 'warning'); return; }

    const headers = ['NIS','Nama','Sekolah','Mapel','Skor','Benar','Salah','Kosong','Waktu_Mulai','Waktu_Selesai'];
    const rows = hasilList.map(h => [
        h.NIS, h.Nama, h.Sekolah || '', h.Mapel,
        h.Skor || 0, h.Jawaban_benar || 0, h.Jawaban_salah || 0, h.Kosong || 0,
        h.Waktu_mulai || '', h.Waktu_selesai || ''
    ]);

    let csv = '\uFEFF'; // BOM for Excel
    csv += headers.join(',') + '\n';
    rows.forEach(r => {
        csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Hasil_CBT_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV berhasil didownload!', 'success');
}

// ================================================================
//                       TAB KECURANGAN
// ================================================================
async function loadCheat() {
    try {
        const { data, error } = await sb.from('KECURANGAN')
            .select('*').order('Timestamp', { ascending: false }).limit(200);
        if (error) throw error;
        cheatList = data || [];
        renderCheat();
    } catch (e) { showToast('Gagal memuat log: ' + e.message, 'danger'); }
}

function renderCheat() {
    const tbody = document.getElementById('tbodyCheat');
    document.getElementById('badgeCheat').textContent = cheatList.length;

    if (!cheatList.length) {
        tbody.innerHTML = `<tr><td colspan="5">
            <div class="empty-state">
                <div class="empty-icon">🛡️</div>
                <div class="empty-text">Belum ada pelanggaran</div>
                <div class="empty-sub">Semua siswa berperilaku baik 👍</div>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = cheatList.map(c => {
        const jenis = (c.Jenis || '').toLowerCase();
        const rowClass = jenis.includes('devtools') || jenis.includes('screenshot') || jenis.includes('split') ?
            'cheat-row-high' :
            jenis.includes('ganti tab') || jenis.includes('focus') ? 'cheat-row-mid' : '';
        return `<tr class="${rowClass}">
            <td class="small text-nowrap">${formatDateTime(c.Timestamp)}</td>
            <td><code>${esc(c.NIS)}</code></td>
            <td class="fw-semibold">${esc(c.Nama)}</td>
            <td><span class="badge bg-danger bg-opacity-10 text-danger">${esc(c.Jenis)}</span></td>
            <td class="small">${esc(c.Detail || '-')}</td>
        </tr>`;
    }).join('');
}

async function clearAllCheat() {
    if (!confirm('Hapus semua log kecurangan?\nAksi ini tidak dapat dibatalkan!')) return;
    try {
        const { error } = await sb.from('KECURANGAN').delete().neq('id', 0);
        if (error) throw error;
        showToast('Semua log dihapus.', 'success');
        loadCheat();
    } catch (e) { showToast('Gagal: ' + e.message, 'danger'); }
}

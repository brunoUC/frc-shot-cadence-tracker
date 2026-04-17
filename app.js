// ── Firebase SDK (CDN modules) ──────────────────────────────────
import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc,
         deleteDoc, doc, onSnapshot,
         serverTimestamp }         from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref as storageRef,
         uploadBytesResumable,
         getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig }          from './firebase-config.js';

// ── Init ────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const stor = getStorage(app);

// ── DOM refs ────────────────────────────────────────────────────
const uploadArea    = document.getElementById('upload-area');
const videoInput    = document.getElementById('video-input');
const videoPreview  = document.getElementById('video-preview');
const uploadPH      = document.getElementById('upload-placeholder');
const removeBtn     = document.getElementById('remove-video');
const progressWrap  = document.getElementById('progress-wrap');
const progressBar   = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');

const shootTime   = document.getElementById('shoot-time');
const ballCount   = document.getElementById('ball-count');
const bpsLive     = document.getElementById('bps-live');
const reduction   = document.getElementById('reduction');
const motor       = document.getElementById('motor');
const mechNotes   = document.getElementById('mech-notes');

const sampleForm  = document.getElementById('sample-form');
const submitBtn   = document.getElementById('submit-btn');
const btnText     = document.getElementById('btn-text');
const btnSpinner  = document.getElementById('btn-spinner');
const formError   = document.getElementById('form-error');

const filterMotor     = document.getElementById('filter-motor');
const filterReduction = document.getElementById('filter-reduction');
const groupsContainer = document.getElementById('groups-container');
const groupsCount     = document.getElementById('groups-count');

const videoModal   = document.getElementById('video-modal');
const modalVideo   = document.getElementById('modal-video');
const modalClose   = document.getElementById('modal-close');
const modalBackdrop = document.getElementById('modal-backdrop');

const deleteModal   = document.getElementById('delete-modal');
const deleteBackdrop = document.getElementById('delete-backdrop');
const deleteCancel  = document.getElementById('delete-cancel');
const deleteConfirm = document.getElementById('delete-confirm');

// ── Toast ───────────────────────────────────────────────────────
const toastEl = Object.assign(document.createElement('div'), { id: 'toast' });
document.body.appendChild(toastEl);

function toast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className   = `show ${type}`;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.className = ''; }, 3200);
}

// ── State ───────────────────────────────────────────────────────
let selectedFile   = null;
let allSamples     = [];
let pendingDeleteId = null;
let pendingDeleteStoragePath = null;

// ── BPS live calc ───────────────────────────────────────────────
function calcBPS() {
  const t = parseFloat(shootTime.value);
  const b = parseInt(ballCount.value);
  if (t > 0 && b > 0) {
    const bps = (b / t).toFixed(2);
    bpsLive.textContent = bps;
    return parseFloat(bps);
  }
  bpsLive.textContent = '—';
  return null;
}

shootTime.addEventListener('input', calcBPS);
ballCount.addEventListener('input', calcBPS);

// ── Upload area ─────────────────────────────────────────────────
uploadArea.addEventListener('click', () => videoInput.click());

uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) setVideoFile(f);
});

videoInput.addEventListener('change', () => {
  if (videoInput.files[0]) setVideoFile(videoInput.files[0]);
});

function setVideoFile(file) {
  if (file.size > 200 * 1024 * 1024) {
    toast('Vídeo muito grande (máx. 200 MB)', 'error');
    return;
  }
  selectedFile         = file;
  uploadPH.style.display    = 'none';
  videoPreview.style.display = 'block';
  removeBtn.style.display    = 'block';
  videoPreview.src = URL.createObjectURL(file);
}

removeBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearVideoSelection();
});

function clearVideoSelection() {
  selectedFile              = null;
  videoInput.value          = '';
  videoPreview.src          = '';
  videoPreview.style.display     = 'none';
  uploadPH.style.display    = 'flex';
  removeBtn.style.display   = 'none';
}

// ── Form Submit ─────────────────────────────────────────────────
sampleForm.addEventListener('submit', async e => {
  e.preventDefault();
  formError.textContent = '';

  const t    = parseFloat(shootTime.value);
  const b    = parseInt(ballCount.value);
  const red  = reduction.value;
  const mot  = motor.value;

  if (!t || t <= 0) return (formError.textContent = 'Informe o tempo de tiro.');
  if (!b || b <= 0) return (formError.textContent = 'Informe a quantidade de bolas.');
  if (!red)         return (formError.textContent = 'Selecione a redução.');
  if (!mot)         return (formError.textContent = 'Selecione o motor.');

  const bps  = parseFloat((b / t).toFixed(4));
  const notes = mechNotes.value.trim();

  setLoading(true);

  try {
    let videoURL      = null;
    let storagePath   = null;

    if (selectedFile) {
      const path   = `videos/${Date.now()}_${selectedFile.name}`;
      storagePath  = path;
      videoURL     = await uploadVideo(selectedFile, path);
    }

    await addDoc(collection(db, 'samples'), {
      shootTime:   t,
      ballCount:   b,
      bps,
      reduction:   red,
      motor:       mot,
      notes,
      videoURL,
      storagePath,
      createdAt:   serverTimestamp()
    });

    toast('Amostra adicionada!');
    sampleForm.reset();
    clearVideoSelection();
    bpsLive.textContent = '—';
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    setLoading(false);
    progressWrap.classList.remove('active');
    progressBar.style.setProperty('--pct', '0%');
    progressLabel.textContent = '0%';
  }
});

function setLoading(on) {
  submitBtn.disabled  = on;
  btnText.hidden      = on;
  btnSpinner.hidden   = !on;
}

function uploadVideo(file, path) {
  return new Promise((resolve, reject) => {
    const ref    = storageRef(stor, path);
    const task   = uploadBytesResumable(ref, file);
    progressWrap.classList.add('active');

    task.on('state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        progressBar.style.setProperty('--pct', pct + '%');
        progressLabel.textContent = pct + '%';
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

// ── Realtime listener ───────────────────────────────────────────
onSnapshot(collection(db, 'samples'), snap => {
  allSamples = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGroups();
});

filterMotor.addEventListener('change', renderGroups);
filterReduction.addEventListener('change', renderGroups);

function renderGroups() {
  const fm = filterMotor.value;
  const fr = filterReduction.value;

  let samples = allSamples.filter(s =>
    (!fm || s.motor === fm) &&
    (!fr || s.reduction === fr)
  );

  // sort by creation date newest first
  samples.sort((a, b) => {
    const ta = a.createdAt?.seconds ?? 0;
    const tb = b.createdAt?.seconds ?? 0;
    return tb - ta;
  });

  if (samples.length === 0) {
    groupsCount.textContent = '0';
    groupsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>Nenhuma amostra encontrada. Adicione a primeira acima!</p>
      </div>`;
    return;
  }

  // Group by motor + reduction
  const groups = {};
  for (const s of samples) {
    const key = `${s.motor}__${s.reduction}`;
    if (!groups[key]) groups[key] = { motor: s.motor, reduction: s.reduction, items: [] };
    groups[key].items.push(s);
  }

  // Sort groups by average BPS descending
  const sortedGroups = Object.values(groups).sort((a, b) => avgBPS(b) - avgBPS(a));

  groupsCount.textContent = sortedGroups.length;
  groupsContainer.innerHTML = '';

  sortedGroups.forEach((g, idx) => {
    groupsContainer.appendChild(buildGroupCard(g, idx + 1));
  });
}

function avgBPS(group) {
  const sum = group.items.reduce((acc, s) => acc + (s.bps ?? 0), 0);
  return sum / group.items.length;
}

function buildGroupCard(group, rank) {
  const avg   = avgBPS(group).toFixed(2);
  const count = group.items.length;

  const card = document.createElement('div');
  card.className = `group-card rank-${rank}`;

  const rankDisplay = rank === 1 ? '🏆' : `#${rank}`;

  card.innerHTML = `
    <div class="group-header">
      <div class="group-rank">${rankDisplay}</div>
      <div class="group-tags">
        <span class="tag tag-motor">⚡ ${group.motor}</span>
        <span class="tag tag-reduction">⚙ ${group.reduction}</span>
      </div>
      <span class="group-count">${count} amostra${count !== 1 ? 's' : ''}</span>
      <div class="group-avg">
        <span class="group-avg-label">Média BPS</span>
        <span class="group-avg-value">${avg}</span>
        <span class="group-avg-unit">bolas/s</span>
      </div>
    </div>
    <ul class="sample-list"></ul>
  `;

  const ul = card.querySelector('.sample-list');
  for (const sample of group.items) {
    ul.appendChild(buildSampleItem(sample));
  }

  return card;
}

function buildSampleItem(s) {
  const li = document.createElement('li');
  li.className = 'sample-item';

  const date = s.createdAt?.seconds
    ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  const thumbHTML = s.videoURL
    ? `<div class="sample-thumb" data-url="${s.videoURL}" title="Assistir vídeo">
         <video src="${s.videoURL}#t=0.1" preload="metadata" muted playsinline></video>
         <span class="play-icon">▶</span>
       </div>`
    : `<div class="sample-thumb" style="cursor:default"><span class="sample-no-video">🎥</span></div>`;

  li.innerHTML = `
    ${thumbHTML}
    <div class="sample-info">
      <div class="sample-stats">
        <span class="stat-chip bps"><strong>${s.bps?.toFixed(2)}</strong> bps</span>
        <span class="stat-chip"><strong>${s.ballCount}</strong> bolas</span>
        <span class="stat-chip"><strong>${s.shootTime}s</strong></span>
      </div>
      ${s.notes ? `<p class="sample-notes" title="${s.notes}">📝 ${s.notes}</p>` : ''}
      <span class="sample-date">${date}</span>
    </div>
    <div class="sample-actions">
      ${s.videoURL ? `<button class="btn-icon" data-play="${s.videoURL}" title="Assistir">▶</button>` : ''}
      <button class="btn-icon danger" data-delete="${s.id}" data-path="${s.storagePath ?? ''}" title="Excluir">🗑</button>
    </div>
  `;

  // thumb click
  const thumb = li.querySelector('.sample-thumb[data-url]');
  if (thumb) thumb.addEventListener('click', () => openVideoModal(s.videoURL));

  // play button
  const playBtn = li.querySelector('[data-play]');
  if (playBtn) playBtn.addEventListener('click', () => openVideoModal(s.videoURL));

  // delete button
  const delBtn = li.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      pendingDeleteId          = s.id;
      pendingDeleteStoragePath = s.storagePath ?? null;
      deleteModal.hidden       = false;
    });
  }

  return li;
}

// ── Video modal ──────────────────────────────────────────────────
function openVideoModal(url) {
  modalVideo.src    = url;
  videoModal.hidden = false;
  modalVideo.play().catch(() => {});
}

function closeVideoModal() {
  videoModal.hidden = true;
  modalVideo.pause();
  modalVideo.src = '';
}

modalClose.addEventListener('click', closeVideoModal);
modalBackdrop.addEventListener('click', closeVideoModal);

// ── Delete modal ────────────────────────────────────────────────
deleteCancel.addEventListener('click', () => {
  deleteModal.hidden = true;
  pendingDeleteId = null;
  pendingDeleteStoragePath = null;
});

deleteBackdrop.addEventListener('click', () => {
  deleteModal.hidden = true;
  pendingDeleteId = null;
  pendingDeleteStoragePath = null;
});

deleteConfirm.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  deleteModal.hidden = true;

  try {
    await deleteDoc(doc(db, 'samples', pendingDeleteId));
    if (pendingDeleteStoragePath) {
      try { await deleteObject(storageRef(stor, pendingDeleteStoragePath)); } catch {}
    }
    toast('Amostra excluída.');
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  } finally {
    pendingDeleteId = null;
    pendingDeleteStoragePath = null;
  }
});

// ── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeVideoModal();
    deleteModal.hidden = true;
  }
});

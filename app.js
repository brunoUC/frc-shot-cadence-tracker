// ── Firebase SDK (CDN modules) ──────────────────────────────────
import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc, updateDoc,
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
const reduction    = document.getElementById('reduction');
const motor        = document.getElementById('motor');
const currentLimit = document.getElementById('current-limit');
const mechNotes    = document.getElementById('mech-notes');

const sampleForm  = document.getElementById('sample-form');
const submitBtn   = document.getElementById('submit-btn');
const btnText     = document.getElementById('btn-text');
const btnSpinner  = document.getElementById('btn-spinner');
const formError   = document.getElementById('form-error');

const filterMotor     = document.getElementById('filter-motor');
const filterReduction = document.getElementById('filter-reduction');
const filterCurrent   = document.getElementById('filter-current');
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
let pendingDeleteCollection = 'samples';  // 'samples' or 'autos'
let editingId = null;              // when set, submit does update instead of add
let editingStoragePath = null;     // existing video path of the sample being edited
let editingVideoURL = null;        // existing video url of the sample being edited
let replaceVideo = false;          // true if user picked a new video during edit

// Refs for edit UI (dynamically added below)
const cardHeader   = document.querySelector('#add-section .card-header');
const addSection   = document.getElementById('add-section');

// Title + icon inside card header so we can swap "Nova Amostra" ↔ "Editando Amostra"
const cardHeaderTitle = cardHeader.querySelector('h2');
const cardHeaderIcon  = cardHeader.querySelector('.card-header-icon');

// Build a cancel-edit button, injected into the card header, shown only while editing
const cancelEditBtn = document.createElement('button');
cancelEditBtn.type = 'button';
cancelEditBtn.className = 'btn-secondary';
cancelEditBtn.id = 'cancel-edit-btn';
cancelEditBtn.textContent = '✕ Cancelar edição';
cancelEditBtn.style.marginLeft = 'auto';
cancelEditBtn.hidden = true;
cardHeader.appendChild(cancelEditBtn);
cancelEditBtn.addEventListener('click', cancelEdit);

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
  if (editingId) replaceVideo = true;   // user chose a new video during edit
  uploadPH.style.display    = 'none';
  videoPreview.style.display = 'block';
  removeBtn.style.display    = 'block';
  removeBtn.textContent     = editingId ? '↺ Reverter vídeo' : '✕ Remover vídeo';
  videoPreview.src = URL.createObjectURL(file);
}

removeBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (editingId && replaceVideo) {
    // revert to original video (don't replace)
    replaceVideo = false;
    selectedFile = null;
    videoInput.value = '';
    if (editingVideoURL) {
      videoPreview.src = editingVideoURL;
      removeBtn.textContent = '🔄 Substituir vídeo';
    } else {
      clearVideoSelection();
    }
    return;
  }
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
  const curLim = currentLimit.value !== '' ? parseFloat(currentLimit.value) : null;

  setLoading(true);

  try {
    if (editingId) {
      // ── UPDATE existing sample ───────────────────────────────
      let videoURL    = editingVideoURL;
      let storagePath = editingStoragePath;

      if (replaceVideo && selectedFile) {
        // upload new video, delete old one afterwards
        const path  = `videos/${Date.now()}_${selectedFile.name}`;
        const newURL = await uploadVideo(selectedFile, path);
        // best-effort delete of old file
        if (editingStoragePath) {
          try { await deleteObject(storageRef(stor, editingStoragePath)); } catch {}
        }
        storagePath = path;
        videoURL    = newURL;
      }

      await updateDoc(doc(db, 'samples', editingId), {
        shootTime: t,
        ballCount: b,
        bps,
        reduction: red,
        motor:     mot,
        currentLimit: curLim,
        notes,
        videoURL,
        storagePath,
        updatedAt: serverTimestamp()
      });

      toast('Amostra atualizada!');
      exitEditMode();
      sampleForm.reset();
      clearVideoSelection();
      bpsLive.textContent = '—';
    } else {
      // ── CREATE new sample ────────────────────────────────────
      let videoURL    = null;
      let storagePath = null;

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
        currentLimit: curLim,
        notes,
        videoURL,
        storagePath,
        createdAt:   serverTimestamp()
      });

      toast('Amostra adicionada!');
      sampleForm.reset();
      clearVideoSelection();
      bpsLive.textContent = '—';
    }
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

// ── Edit mode helpers ──────────────────────────────────────────
function startEdit(sample) {
  editingId          = sample.id;
  editingStoragePath = sample.storagePath ?? null;
  editingVideoURL    = sample.videoURL ?? null;
  replaceVideo       = false;

  shootTime.value    = sample.shootTime ?? '';
  ballCount.value    = sample.ballCount ?? '';
  reduction.value    = sample.reduction ?? '';
  motor.value        = sample.motor ?? '';
  currentLimit.value = sample.currentLimit ?? '';
  mechNotes.value    = sample.notes ?? '';
  calcBPS();

  // show existing video in preview area (not selected for re-upload unless user picks a new one)
  selectedFile = null;
  videoInput.value = '';
  if (sample.videoURL) {
    uploadPH.style.display      = 'none';
    videoPreview.style.display  = 'block';
    videoPreview.src            = sample.videoURL;
    removeBtn.style.display     = 'block';
    removeBtn.textContent       = '🔄 Substituir vídeo';
  } else {
    clearVideoSelection();
  }

  cardHeaderTitle.textContent = 'Editando Amostra';
  cardHeaderIcon.textContent  = '✏️';
  btnText.textContent         = 'Salvar alterações';
  cancelEditBtn.hidden        = false;
  addSection.classList.add('editing');

  // scroll to form
  addSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitEditMode() {
  editingId          = null;
  editingStoragePath = null;
  editingVideoURL    = null;
  replaceVideo       = false;

  cardHeaderTitle.textContent = 'Nova Amostra';
  cardHeaderIcon.textContent  = '＋';
  btnText.textContent         = 'Adicionar Amostra';
  removeBtn.textContent       = '✕ Remover vídeo';
  cancelEditBtn.hidden        = true;
  addSection.classList.remove('editing');
}

function cancelEdit() {
  exitEditMode();
  sampleForm.reset();
  clearVideoSelection();
  bpsLive.textContent = '—';
  formError.textContent = '';
}

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
filterCurrent.addEventListener('change', renderGroups);

function rebuildCurrentFilter() {
  const unique = [...new Set(
    allSamples
      .map(s => s.currentLimit)
      .filter(v => v != null)
  )].sort((a, b) => a - b);

  const prev = filterCurrent.value;
  filterCurrent.innerHTML =
    '<option value="">Todas as correntes</option>' +
    unique.map(v => `<option value="${v}">${v} A</option>`).join('') +
    '<option value="none">Sem limite</option>';
  if ([...filterCurrent.options].some(o => o.value === prev)) filterCurrent.value = prev;
}

function renderGroups() {
  rebuildCurrentFilter();

  const fm = filterMotor.value;
  const fr = filterReduction.value;
  const fc = filterCurrent.value;

  let samples = allSamples.filter(s => {
    if (fm && s.motor !== fm) return false;
    if (fr && s.reduction !== fr) return false;
    if (fc === 'none') return s.currentLimit == null;
    if (fc) return String(s.currentLimit) === fc;
    return true;
  });

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

  // Group by motor + reduction + currentLimit
  const groups = {};
  for (const s of samples) {
    const curKey = s.currentLimit != null ? s.currentLimit : 'none';
    const key = `${s.motor}__${s.reduction}__${curKey}`;
    if (!groups[key]) groups[key] = {
      motor: s.motor,
      reduction: s.reduction,
      currentLimit: s.currentLimit ?? null,
      items: []
    };
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

  const currentTag = group.currentLimit != null
    ? `<span class="tag tag-current">🔌 ${group.currentLimit}A</span>`
    : `<span class="tag tag-current tag-muted">🔌 sem limite</span>`;

  card.innerHTML = `
    <div class="group-header">
      <div class="group-rank">${rankDisplay}</div>
      <div class="group-tags">
        <span class="tag tag-motor">⚡ ${group.motor}</span>
        <span class="tag tag-reduction">⚙ ${group.reduction}</span>
        ${currentTag}
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
      <button class="btn-icon" data-edit="${s.id}" title="Editar">✏️</button>
      <button class="btn-icon danger" data-delete="${s.id}" data-path="${s.storagePath ?? ''}" title="Excluir">🗑</button>
    </div>
  `;

  // thumb click
  const thumb = li.querySelector('.sample-thumb[data-url]');
  if (thumb) thumb.addEventListener('click', () => openVideoModal(s.videoURL));

  // play button
  const playBtn = li.querySelector('[data-play]');
  if (playBtn) playBtn.addEventListener('click', () => openVideoModal(s.videoURL));

  // edit button
  const editBtn = li.querySelector('[data-edit]');
  if (editBtn) editBtn.addEventListener('click', () => startEdit(s));

  // delete button
  const delBtn = li.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      pendingDeleteId          = s.id;
      pendingDeleteStoragePath = s.storagePath ?? null;
      deleteModal.hidden       = false;
    });
  }

  // highlight if this sample is currently being edited
  if (editingId === s.id) li.classList.add('editing-sample');

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
  pendingDeleteCollection = 'samples';
});

deleteBackdrop.addEventListener('click', () => {
  deleteModal.hidden = true;
  pendingDeleteId = null;
  pendingDeleteStoragePath = null;
  pendingDeleteCollection = 'samples';
});

deleteConfirm.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  deleteModal.hidden = true;

  try {
    await deleteDoc(doc(db, pendingDeleteCollection, pendingDeleteId));
    if (pendingDeleteStoragePath) {
      try { await deleteObject(storageRef(stor, pendingDeleteStoragePath)); } catch {}
    }
    toast('Amostra excluída.');
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  } finally {
    pendingDeleteId = null;
    pendingDeleteStoragePath = null;
    pendingDeleteCollection = 'samples';
  }
});

// ── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeVideoModal();
    deleteModal.hidden = true;
  }
});

// ════════════════════════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════════════════════════
const tabButtons = document.querySelectorAll('.tab');
const tabPanels  = document.querySelectorAll('.tab-panel');
const heroTitle  = document.getElementById('hero-title');
const heroDesc   = document.getElementById('hero-desc');

const heroContent = {
  cadence: {
    title: 'Meça e otimize a cadência do seu robô',
    desc:  'Faça upload de vídeos curtos, registre tempos e quantidades, e descubra automaticamente qual configuração entrega o melhor BPS.'
  },
  auto: {
    title: 'Acompanhe a performance do seu autônomo',
    desc:  'Registre cada execução do autônomo e veja a média de bolas acertadas por tipo e lado.'
  }
};

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabButtons.forEach(b => b.classList.toggle('active', b === btn));
    tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
    heroTitle.textContent = heroContent[tab].title;
    heroDesc.textContent  = heroContent[tab].desc;
  });
});

// ════════════════════════════════════════════════════════════════
//  AUTO TAB
// ════════════════════════════════════════════════════════════════

// ── DOM refs ────────────────────────────────────────────────────
const autoUploadArea    = document.getElementById('auto-upload-area');
const autoVideoInput    = document.getElementById('auto-video-input');
const autoVideoPreview  = document.getElementById('auto-video-preview');
const autoUploadPH      = document.getElementById('auto-upload-placeholder');
const autoRemoveBtn     = document.getElementById('auto-remove-video');
const autoProgressWrap  = document.getElementById('auto-progress-wrap');
const autoProgressBar   = document.getElementById('auto-progress-bar');
const autoProgressLabel = document.getElementById('auto-progress-label');

const autoType       = document.getElementById('auto-type');
const autoTypeCustom = document.getElementById('auto-type-custom');
const autoCustomWrap = document.getElementById('auto-custom-wrap');
const autoSide       = document.getElementById('auto-side');
const autoBalls      = document.getElementById('auto-balls');
const autoNotes      = document.getElementById('auto-notes');

const autoForm      = document.getElementById('auto-form');
const autoSubmitBtn = document.getElementById('auto-submit-btn');
const autoBtnText   = document.getElementById('auto-btn-text');
const autoBtnSpin   = document.getElementById('auto-btn-spinner');
const autoFormError = document.getElementById('auto-form-error');

const autoFilterType = document.getElementById('auto-filter-type');
const autoFilterSide = document.getElementById('auto-filter-side');
const autoGroupsContainer = document.getElementById('auto-groups-container');
const autoGroupsCount     = document.getElementById('auto-groups-count');

const autoCardTitle = document.getElementById('auto-card-title');
const autoCardIcon  = document.getElementById('auto-card-icon');
const autoAddSection = document.getElementById('auto-add-section');

// cancel-edit btn for auto
const autoCancelEditBtn = document.createElement('button');
autoCancelEditBtn.type = 'button';
autoCancelEditBtn.className = 'btn-secondary';
autoCancelEditBtn.textContent = '✕ Cancelar edição';
autoCancelEditBtn.style.marginLeft = 'auto';
autoCancelEditBtn.hidden = true;
autoAddSection.querySelector('.card-header').appendChild(autoCancelEditBtn);
autoCancelEditBtn.addEventListener('click', cancelAutoEdit);

// ── State ───────────────────────────────────────────────────────
let autoSelectedFile   = null;
let allAutos           = [];
let autoEditingId      = null;
let autoEditingStoragePath = null;
let autoEditingVideoURL = null;
let autoReplaceVideo   = false;

// ── "Outro" toggle ──────────────────────────────────────────────
autoType.addEventListener('change', () => {
  const isCustom = autoType.value === '__custom__';
  autoCustomWrap.hidden = !isCustom;
  if (!isCustom) autoTypeCustom.value = '';
});

// ── Upload area ─────────────────────────────────────────────────
autoUploadArea.addEventListener('click', () => autoVideoInput.click());

autoUploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  autoUploadArea.classList.add('drag-over');
});
autoUploadArea.addEventListener('dragleave', () => autoUploadArea.classList.remove('drag-over'));
autoUploadArea.addEventListener('drop', e => {
  e.preventDefault();
  autoUploadArea.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) setAutoVideoFile(f);
});

autoVideoInput.addEventListener('change', () => {
  if (autoVideoInput.files[0]) setAutoVideoFile(autoVideoInput.files[0]);
});

function setAutoVideoFile(file) {
  if (file.size > 200 * 1024 * 1024) {
    toast('Vídeo muito grande (máx. 200 MB)', 'error');
    return;
  }
  autoSelectedFile = file;
  if (autoEditingId) autoReplaceVideo = true;
  autoUploadPH.style.display     = 'none';
  autoVideoPreview.style.display = 'block';
  autoRemoveBtn.style.display    = 'block';
  autoRemoveBtn.textContent      = autoEditingId ? '↺ Reverter vídeo' : '✕ Remover vídeo';
  autoVideoPreview.src = URL.createObjectURL(file);
}

autoRemoveBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (autoEditingId && autoReplaceVideo) {
    autoReplaceVideo = false;
    autoSelectedFile = null;
    autoVideoInput.value = '';
    if (autoEditingVideoURL) {
      autoVideoPreview.src = autoEditingVideoURL;
      autoRemoveBtn.textContent = '🔄 Substituir vídeo';
    } else {
      clearAutoVideoSelection();
    }
    return;
  }
  clearAutoVideoSelection();
});

function clearAutoVideoSelection() {
  autoSelectedFile             = null;
  autoVideoInput.value         = '';
  autoVideoPreview.src         = '';
  autoVideoPreview.style.display = 'none';
  autoUploadPH.style.display   = 'flex';
  autoRemoveBtn.style.display  = 'none';
}

// ── Submit ──────────────────────────────────────────────────────
autoForm.addEventListener('submit', async e => {
  e.preventDefault();
  autoFormError.textContent = '';

  let type = autoType.value;
  if (!type) return (autoFormError.textContent = 'Selecione o tipo de autônomo.');
  if (type === '__custom__') {
    const custom = autoTypeCustom.value.trim();
    if (!custom) return (autoFormError.textContent = 'Digite o nome do autônomo.');
    type = custom;
  }

  const side  = autoSide.value;
  const balls = parseInt(autoBalls.value);
  const notes = autoNotes.value.trim();

  if (!side)                      return (autoFormError.textContent = 'Selecione o lado.');
  if (isNaN(balls) || balls < 0)  return (autoFormError.textContent = 'Informe a quantidade de bolas acertadas.');

  setAutoLoading(true);

  try {
    if (autoEditingId) {
      let videoURL    = autoEditingVideoURL;
      let storagePath = autoEditingStoragePath;

      if (autoReplaceVideo && autoSelectedFile) {
        const path   = `autos/${Date.now()}_${autoSelectedFile.name}`;
        const newURL = await uploadAutoVideo(autoSelectedFile, path);
        if (autoEditingStoragePath) {
          try { await deleteObject(storageRef(stor, autoEditingStoragePath)); } catch {}
        }
        storagePath = path;
        videoURL    = newURL;
      }

      await updateDoc(doc(db, 'autos', autoEditingId), {
        type, side, balls, notes,
        videoURL, storagePath,
        updatedAt: serverTimestamp()
      });

      toast('Autônomo atualizado!');
      exitAutoEditMode();
      autoForm.reset();
      clearAutoVideoSelection();
      autoCustomWrap.hidden = true;
    } else {
      let videoURL    = null;
      let storagePath = null;

      if (autoSelectedFile) {
        const path  = `autos/${Date.now()}_${autoSelectedFile.name}`;
        storagePath = path;
        videoURL    = await uploadAutoVideo(autoSelectedFile, path);
      }

      await addDoc(collection(db, 'autos'), {
        type, side, balls, notes,
        videoURL, storagePath,
        createdAt: serverTimestamp()
      });

      toast('Autônomo adicionado!');
      autoForm.reset();
      clearAutoVideoSelection();
      autoCustomWrap.hidden = true;
    }
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    setAutoLoading(false);
    autoProgressWrap.classList.remove('active');
    autoProgressBar.style.setProperty('--pct', '0%');
    autoProgressLabel.textContent = '0%';
  }
});

function setAutoLoading(on) {
  autoSubmitBtn.disabled = on;
  autoBtnText.hidden     = on;
  autoBtnSpin.hidden     = !on;
}

function uploadAutoVideo(file, path) {
  return new Promise((resolve, reject) => {
    const ref  = storageRef(stor, path);
    const task = uploadBytesResumable(ref, file);
    autoProgressWrap.classList.add('active');

    task.on('state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        autoProgressBar.style.setProperty('--pct', pct + '%');
        autoProgressLabel.textContent = pct + '%';
      },
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

// ── Edit mode ───────────────────────────────────────────────────
function startAutoEdit(a) {
  autoEditingId          = a.id;
  autoEditingStoragePath = a.storagePath ?? null;
  autoEditingVideoURL    = a.videoURL ?? null;
  autoReplaceVideo       = false;

  // Populate type: if it's one of the preset options use it, else use "Outro"
  const presets = ['Double sweep', 'Double sweep climb', 'Depot', 'Center'];
  if (presets.includes(a.type)) {
    autoType.value = a.type;
    autoCustomWrap.hidden = true;
    autoTypeCustom.value = '';
  } else {
    autoType.value = '__custom__';
    autoCustomWrap.hidden = false;
    autoTypeCustom.value = a.type ?? '';
  }

  autoSide.value  = a.side ?? '';
  autoBalls.value = a.balls ?? '';
  autoNotes.value = a.notes ?? '';

  autoSelectedFile = null;
  autoVideoInput.value = '';
  if (a.videoURL) {
    autoUploadPH.style.display      = 'none';
    autoVideoPreview.style.display  = 'block';
    autoVideoPreview.src            = a.videoURL;
    autoRemoveBtn.style.display     = 'block';
    autoRemoveBtn.textContent       = '🔄 Substituir vídeo';
  } else {
    clearAutoVideoSelection();
  }

  autoCardTitle.textContent = 'Editando Autônomo';
  autoCardIcon.textContent  = '✏️';
  autoBtnText.textContent   = 'Salvar alterações';
  autoCancelEditBtn.hidden  = false;
  autoAddSection.classList.add('editing');

  autoAddSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitAutoEditMode() {
  autoEditingId          = null;
  autoEditingStoragePath = null;
  autoEditingVideoURL    = null;
  autoReplaceVideo       = false;

  autoCardTitle.textContent = 'Novo Autônomo';
  autoCardIcon.textContent  = '＋';
  autoBtnText.textContent   = 'Adicionar Autônomo';
  autoRemoveBtn.textContent = '✕ Remover vídeo';
  autoCancelEditBtn.hidden  = true;
  autoAddSection.classList.remove('editing');
}

function cancelAutoEdit() {
  exitAutoEditMode();
  autoForm.reset();
  clearAutoVideoSelection();
  autoCustomWrap.hidden = true;
  autoFormError.textContent = '';
}

// ── Realtime listener ───────────────────────────────────────────
onSnapshot(collection(db, 'autos'), snap => {
  allAutos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAutoGroups();
});

autoFilterType.addEventListener('change', renderAutoGroups);
autoFilterSide.addEventListener('change', renderAutoGroups);

function renderAutoGroups() {
  const ft = autoFilterType.value;
  const fs = autoFilterSide.value;

  let list = allAutos.filter(a =>
    (!ft || a.type === ft) &&
    (!fs || a.side === fs)
  );

  list.sort((a, b) => {
    const ta = a.createdAt?.seconds ?? 0;
    const tb = b.createdAt?.seconds ?? 0;
    return tb - ta;
  });

  if (list.length === 0) {
    autoGroupsCount.textContent = '0';
    autoGroupsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🤖</div>
        <p>Nenhum autônomo registrado. Adicione o primeiro acima!</p>
      </div>`;
    return;
  }

  // Group by type + side
  const groups = {};
  for (const a of list) {
    const key = `${a.type}__${a.side}`;
    if (!groups[key]) groups[key] = { type: a.type, side: a.side, items: [] };
    groups[key].items.push(a);
  }

  const sorted = Object.values(groups).sort((a, b) => avgBalls(b) - avgBalls(a));

  autoGroupsCount.textContent = sorted.length;
  autoGroupsContainer.innerHTML = '';
  sorted.forEach((g, idx) => autoGroupsContainer.appendChild(buildAutoGroupCard(g, idx + 1)));
}

function avgBalls(group) {
  const sum = group.items.reduce((acc, a) => acc + (a.balls ?? 0), 0);
  return sum / group.items.length;
}

function buildAutoGroupCard(group, rank) {
  const avg   = avgBalls(group).toFixed(2);
  const count = group.items.length;
  const rankDisplay = rank === 1 ? '🏆' : `#${rank}`;

  const card = document.createElement('div');
  card.className = `group-card rank-${rank}`;

  card.innerHTML = `
    <div class="group-header">
      <div class="group-rank">${rankDisplay}</div>
      <div class="group-tags">
        <span class="tag tag-type">🤖 ${escapeHTML(group.type)}</span>
        <span class="tag tag-side">${group.side === 'Direita' ? '➡' : '⬅'} ${group.side}</span>
      </div>
      <span class="group-count">${count} execuç${count !== 1 ? 'ões' : 'ão'}</span>
      <div class="group-avg">
        <span class="group-avg-label">Média bolas</span>
        <span class="group-avg-value">${avg}</span>
        <span class="group-avg-unit">acertos</span>
      </div>
    </div>
    <ul class="sample-list"></ul>
  `;

  const ul = card.querySelector('.sample-list');
  for (const item of group.items) ul.appendChild(buildAutoItem(item));

  return card;
}

function buildAutoItem(a) {
  const li = document.createElement('li');
  li.className = 'sample-item';

  const date = a.createdAt?.seconds
    ? new Date(a.createdAt.seconds * 1000).toLocaleDateString('pt-BR',
        { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  const thumbHTML = a.videoURL
    ? `<div class="sample-thumb" data-url="${a.videoURL}" title="Assistir vídeo">
         <video src="${a.videoURL}#t=0.1" preload="metadata" muted playsinline></video>
         <span class="play-icon">▶</span>
       </div>`
    : `<div class="sample-thumb" style="cursor:default"><span class="sample-no-video">🎥</span></div>`;

  li.innerHTML = `
    ${thumbHTML}
    <div class="sample-info">
      <div class="sample-stats">
        <span class="stat-chip bps"><strong>${a.balls ?? 0}</strong> bolas</span>
      </div>
      ${a.notes ? `<p class="sample-notes" title="${escapeHTML(a.notes)}">📝 ${escapeHTML(a.notes)}</p>` : ''}
      <span class="sample-date">${date}</span>
    </div>
    <div class="sample-actions">
      ${a.videoURL ? `<button class="btn-icon" data-play="${a.videoURL}" title="Assistir">▶</button>` : ''}
      <button class="btn-icon" data-edit title="Editar">✏️</button>
      <button class="btn-icon danger" data-delete title="Excluir">🗑</button>
    </div>
  `;

  const thumb = li.querySelector('.sample-thumb[data-url]');
  if (thumb) thumb.addEventListener('click', () => openVideoModal(a.videoURL));

  const playBtn = li.querySelector('[data-play]');
  if (playBtn) playBtn.addEventListener('click', () => openVideoModal(a.videoURL));

  const editBtn = li.querySelector('[data-edit]');
  if (editBtn) editBtn.addEventListener('click', () => startAutoEdit(a));

  const delBtn = li.querySelector('[data-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      pendingDeleteId          = a.id;
      pendingDeleteStoragePath = a.storagePath ?? null;
      pendingDeleteCollection  = 'autos';
      deleteModal.hidden       = false;
    });
  }

  if (autoEditingId === a.id) li.classList.add('editing-sample');

  return li;
}

// ── Helpers ─────────────────────────────────────────────────────
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

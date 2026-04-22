'use strict';

// ── Supabase ──────────────────────────────────────────────────
const SUPABASE_URL      = '***REMOVED_URL***';
const SUPABASE_ANON_KEY = '***REMOVED***';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── DB 변환 헬퍼 ──────────────────────────────────────────────
function rowToItem(row) {
  return {
    id            : row.id,
    name          : row.name,
    qty           : row.qty,
    total         : row.total,
    vendor        : row.vendor,
    url           : row.url           || '',
    orderUrl      : row.order_url     || '',
    options       : row.options       || '',
    note          : row.note          || '',
    image         : row.image         || '',
    deliveryType  : row.delivery_type || 'own',
    mainCategory  : Array.isArray(row.main_category) ? row.main_category : [],
    subCategory   : Array.isArray(row.sub_category)  ? row.sub_category  : [],
    createdAt     : row.created_at,
  };
}

function itemToRow(item) {
  return {
    id            : item.id,
    name          : item.name,
    qty           : item.qty,
    total         : item.total,
    vendor        : item.vendor,
    url           : item.url          || '',
    order_url     : item.orderUrl     || '',
    options       : item.options      || '',
    note          : item.note         || '',
    image         : item.image        || '',
    delivery_type : item.deliveryType || 'own',
    main_category : item.mainCategory || [],
    sub_category  : item.subCategory  || [],
    created_at    : item.createdAt,
  };
}

// ── 상태 ──────────────────────────────────────────────────────
let items        = [];
let editingId    = null;
let deletingId   = null;
let selectedIds  = new Set();
let filterMain   = '';
let filterSub    = '';

// ── DOM refs ──────────────────────────────────────────────────
const itemsGrid    = document.getElementById('itemsGrid');
const emptyState   = document.getElementById('emptyState');
const modalOverlay = document.getElementById('modalOverlay');
const deleteOverlay = document.getElementById('deleteOverlay');
const toast        = document.getElementById('toast');

const form          = document.getElementById('itemForm');
const itemName      = document.getElementById('itemName');
const itemQty       = document.getElementById('itemQty');
const itemUnitPrice = document.getElementById('itemUnitPrice');
const itemTotal     = document.getElementById('itemTotal');
const itemVendor    = document.getElementById('itemVendor');
const itemUrl       = document.getElementById('itemUrl');
const itemOrderUrl  = document.getElementById('itemOrderUrl');
const itemOptions   = document.getElementById('itemOptions');
const itemNote      = document.getElementById('itemNote');
const imageInput    = document.getElementById('imageInput');
const imagePreview  = document.getElementById('imagePreview');
const imagePlaceholder = document.getElementById('imagePlaceholder');
const imageRemove   = document.getElementById('imageRemove');
const imageUploadArea = document.getElementById('imageUploadArea');

const itemDeliveryType  = document.getElementById('itemDeliveryType');
const deliveryOwnBtn    = document.getElementById('deliveryOwnBtn');
const deliveryDirectBtn = document.getElementById('deliveryDirectBtn');
const deliveryFields    = document.getElementById('deliveryFields');

const selectBar      = document.getElementById('selectBar');
const selectCount    = document.getElementById('selectCount');
const selectClearBtn = document.getElementById('selectClearBtn');
const selectCopyBtn  = document.getElementById('selectCopyBtn');

const itemMainCatGroup = document.getElementById('itemMainCategory');
const itemSubCatGroup  = document.getElementById('itemSubCategory');

// ── Utils ─────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatNumber(n) {
  if (!n && n !== 0) return '-';
  return Number(n).toLocaleString('ko-KR');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ── 카테고리 pill 헬퍼 ────────────────────────────────────────
function getCatValues(group) {
  return [...group.querySelectorAll('.cat-pill.selected')].map(p => p.dataset.value);
}

function setCatValues(group, values) {
  group.querySelectorAll('.cat-pill').forEach(p => {
    p.classList.toggle('selected', values.includes(p.dataset.value));
  });
}

function clearCatGroup(group) {
  group.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('selected'));
}

function setLoading(on) {
  document.getElementById('addItemBtn').disabled = on;
}

// ── DB 작업 ───────────────────────────────────────────────────
async function fetchItems() {
  const { data, error } = await db
    .from('items')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []).map(rowToItem);
}

async function upsertItem(item) {
  const { error } = await db.from('items').upsert(itemToRow(item));
  if (error) throw error;
}

async function removeItem(id) {
  const { error } = await db.from('items').delete().eq('id', id);
  if (error) throw error;
}

// ── Render ────────────────────────────────────────────────────
function render() {
  itemsGrid.innerHTML = '';

  const filtered = items.filter(item => {
    if (filterMain && !(item.mainCategory || []).includes(filterMain)) return false;
    if (filterSub  && !(item.subCategory  || []).includes(filterSub))  return false;
    return true;
  });

  if (filtered.length === 0) {
    emptyState.classList.add('visible');
    return;
  }
  emptyState.classList.remove('visible');

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.id = item.id;

    const unitPrice = item.qty && item.total
      ? Math.round(item.total / item.qty)
      : null;

    const imageHtml = item.image
      ? `<img class="card-image" src="${item.image}" alt="${item.name}">`
      : `<div class="card-image-placeholder">🖼<span>이미지 없음</span></div>`;

    const vendorHtml = item.vendor
      ? `<div class="card-vendor">📦 ${escapeHtml(item.vendor)}</div>`
      : '';

    const urlHtml = item.url
      ? `<div class="card-vendor">🔗 <a href="${item.url}" target="_blank" rel="noopener">${item.url}</a></div>`
      : '';

    const orderUrlHtml = item.orderUrl
      ? `<div class="card-vendor card-order-url">📌 <a href="${item.orderUrl}" target="_blank" rel="noopener">${item.orderUrl}</a><span class="url-badge">주문URL</span></div>`
      : '';

    const optionsHtml = item.options
      ? `<div class="card-options">${escapeHtml(item.options)}</div>`
      : '';

    const noteHtml = item.note
      ? `<div class="card-vendor" style="margin-top:8px">📝 ${escapeHtml(item.note)}</div>`
      : '';

    const mainBadges = (item.mainCategory || []).map(c => `<span class="cat-badge main">${c}</span>`).join('');
    const subBadges  = (item.subCategory  || []).map(c => `<span class="cat-badge sub">${c}</span>`).join('');
    const categoryHtml = (mainBadges || subBadges)
      ? `<div class="card-category">${mainBadges}${subBadges}</div>`
      : '';

    const isDirect = item.deliveryType === 'direct';
    const deliveryBadge = isDirect
      ? `<span class="delivery-badge direct">🚚 직배송</span>`
      : `<span class="delivery-badge own">🏢 자사 배송</span>`;

    const deliveryInfoHtml = isDirect
      ? `<div class="card-delivery-info">📍 배송지 주소 :<br>👤 담당자명 :&nbsp;&nbsp;📞 연락처 :</div>`
      : '';

    const isSelected = selectedIds.has(item.id);
    if (isSelected) card.classList.add('selected');

    card.innerHTML = `
      <label class="card-checkbox-wrap" data-action="select" data-id="${item.id}">
        <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
      </label>
      ${imageHtml}
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.name)}</div>
        <div class="card-meta">
          <div class="meta-item">
            <div class="meta-label">수량</div>
            <div class="meta-value">${formatNumber(item.qty)} 개</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">단가</div>
            <div class="meta-value">${unitPrice !== null ? formatNumber(unitPrice) + ' 원' : '-'}</div>
          </div>
          <div class="meta-item total" style="grid-column: 1 / -1;">
            <div class="meta-label">총 금액</div>
            <div class="meta-value">${item.total ? formatNumber(item.total) + ' 원' : '-'}</div>
          </div>
        </div>
        ${categoryHtml}
        ${deliveryBadge}
        ${vendorHtml}
        ${urlHtml}
        ${orderUrlHtml}
        ${optionsHtml}
        ${deliveryInfoHtml}
        ${noteHtml}
      </div>
      <div class="card-actions">
        <button class="btn btn-copy" data-action="copy" data-id="${item.id}">📋 복사</button>
        <button class="btn btn-edit" data-action="edit" data-id="${item.id}">✏️ 수정</button>
        <button class="btn btn-delete" data-action="delete" data-id="${item.id}">🗑</button>
      </div>
    `;

    itemsGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ── 다중 선택 ─────────────────────────────────────────────────
function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectBar();
  render();
}

function clearSelection() {
  selectedIds.clear();
  updateSelectBar();
  render();
}

function updateSelectBar() {
  const count = selectedIds.size;
  selectBar.classList.toggle('visible', count > 0);
  selectCount.textContent = `${count}개 선택됨`;
}

async function copySelected() {
  if (selectedIds.size === 0) return;

  const selectedItems = items.filter(i => selectedIds.has(i.id));
  const blocks = selectedItems.map((item, idx) => {
    const lines = [`${idx + 1}. 【 ${item.name} 】`, ''];
    if (item.vendor) lines.push(`발주처 : ${item.vendor}`);
    if (item.url)    lines.push(`URL : ${item.url}`);
    lines.push('');
    if (item.options) {
      lines.push('<옵션>');
      lines.push(item.options);
      lines.push('');
    }
    const isDirect = item.deliveryType === 'direct';
    lines.push(`배송 방식 : ${isDirect ? '직배송' : '자사 배송'}`);
    if (isDirect) {
      lines.push('배송지 주소 :');
      lines.push('담당자명 :');
      lines.push('연락처 :');
    }
    if (item.note) {
      lines.push('');
      lines.push(`비고 : ${item.note}`);
    }
    return lines.join('\n');
  });

  const text = blocks.join('\n\n' + '─'.repeat(30) + '\n\n');

  try {
    await navigator.clipboard.writeText(text);
    showToast(`✅ ${selectedIds.size}개 항목 복사 완료!`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`✅ ${selectedIds.size}개 항목 복사 완료!`);
  }
}

// ── Copy formatting ───────────────────────────────────────────
function buildCopyText(item) {
  const lines = [];
  lines.push(`【 ${item.name} 】`);
  lines.push('');

  if (item.vendor) lines.push(`발주처 : ${item.vendor}`);
  if (item.url)    lines.push(`URL : ${item.url}`);
  lines.push('');

  if (item.options) {
    lines.push('<옵션>');
    lines.push(item.options);
    lines.push('');
  }

  const isDirect = item.deliveryType === 'direct';
  lines.push(`배송 방식 : ${isDirect ? '직배송' : '자사 배송'}`);
  if (isDirect) {
    lines.push('배송지 주소 :');
    lines.push('담당자명 :');
    lines.push('연락처 :');
  }

  if (item.note) {
    lines.push('');
    lines.push(`비고 : ${item.note}`);
  }

  return lines.join('\n');
}

async function copyItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const text = buildCopyText(item);
  try {
    await navigator.clipboard.writeText(text);
    showToast('✅ 복사 완료! 지출결의서에 붙여넣기 하세요.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ 복사 완료! 지출결의서에 붙여넣기 하세요.');
  }
}

// ── Delivery toggle ───────────────────────────────────────────
function setDeliveryType(type) {
  itemDeliveryType.value = type;
  deliveryOwnBtn.classList.toggle('active', type === 'own');
  deliveryDirectBtn.classList.toggle('active', type === 'direct');
  deliveryFields.classList.toggle('open', type === 'direct');
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id = null) {
  editingId = id;
  form.reset();
  imagePreview.hidden = true;
  imagePreview.src = '';
  imagePlaceholder.style.display = '';
  imageRemove.hidden = true;
  itemUnitPrice.value = '';
  clearCatGroup(itemMainCatGroup);
  clearCatGroup(itemSubCatGroup);
  setDeliveryType('own');
  document.getElementById('modalTitle').textContent = id ? '항목 수정' : '항목 추가';

  if (id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    itemName.value         = item.name         || '';
    itemQty.value          = item.qty          || '';
    itemTotal.value        = item.total        || '';
    itemVendor.value       = item.vendor       || '';
    itemUrl.value          = item.url          || '';
    itemOrderUrl.value     = item.orderUrl     || '';
    itemOptions.value      = item.options      || '';
    itemNote.value         = item.note         || '';
    setCatValues(itemMainCatGroup, item.mainCategory || []);
    setCatValues(itemSubCatGroup,  item.subCategory  || []);
    setDeliveryType(item.deliveryType || 'own');
    updateUnitPrice();

    if (item.image) {
      imagePreview.src = item.image;
      imagePreview.hidden = false;
      imagePlaceholder.style.display = 'none';
      imageRemove.hidden = false;
    }
  }

  modalOverlay.classList.add('open');
  setTimeout(() => itemName.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  editingId = null;
}

// ── Delete modal ──────────────────────────────────────────────
function openDeleteModal(id) {
  deletingId = id;
  const item = items.find(i => i.id === id);
  document.getElementById('deleteItemName').textContent = item ? item.name : '';
  deleteOverlay.classList.add('open');
}

function closeDeleteModal() {
  deleteOverlay.classList.remove('open');
  deletingId = null;
}

async function confirmDelete() {
  if (!deletingId) return;
  try {
    await removeItem(deletingId);
    items = items.filter(i => i.id !== deletingId);
    render();
    closeDeleteModal();
    showToast('삭제되었습니다.');
  } catch (e) {
    showToast('❌ 삭제 중 오류가 발생했습니다.');
    console.error(e);
  }
}

// ── Auto-calculate unit price ─────────────────────────────────
function updateUnitPrice() {
  const qty   = parseFloat(itemQty.value)   || 0;
  const total = parseFloat(itemTotal.value) || 0;
  if (qty > 0 && total > 0) {
    itemUnitPrice.value = formatNumber(Math.round(total / qty)) + ' 원';
  } else {
    itemUnitPrice.value = '';
  }
}

// ── Image handling ────────────────────────────────────────────
function handleImageFile(file) {
  if (!file) return;

  // 2MB 초과 시 경고
  if (file.size > 2 * 1024 * 1024) {
    showToast('⚠️ 이미지가 너무 큽니다. 2MB 이하로 올려주세요.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreview.hidden = false;
    imagePlaceholder.style.display = 'none';
    imageRemove.hidden = false;
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  imagePreview.hidden = true;
  imagePreview.src = '';
  imagePlaceholder.style.display = '';
  imageRemove.hidden = true;
  imageInput.value = '';
}

// ── Save ──────────────────────────────────────────────────────
async function saveItem() {
  const name   = itemName.value.trim();
  const qty    = parseFloat(itemQty.value);
  const total  = parseFloat(itemTotal.value);
  const vendor = itemVendor.value.trim();

  if (!name)        { itemName.focus();   showToast('⚠️ 품목명을 입력하세요.');  return; }
  if (!qty || qty < 1) { itemQty.focus(); showToast('⚠️ 수량을 입력하세요.');   return; }
  if (!vendor)      { itemVendor.focus(); showToast('⚠️ 발주처를 입력하세요.'); return; }

  const data = {
    id           : editingId || uid(),
    name,
    qty,
    total        : isNaN(total) ? null : total,
    vendor,
    url          : itemUrl.value.trim()      || '',
    orderUrl     : itemOrderUrl.value.trim() || '',
    options      : itemOptions.value.trim()  || '',
    note         : itemNote.value.trim()     || '',
    image        : imagePreview.hidden ? '' : imagePreview.src,
    deliveryType  : itemDeliveryType.value,
    mainCategory  : getCatValues(itemMainCatGroup),
    subCategory   : getCatValues(itemSubCatGroup),
    createdAt     : editingId
      ? (items.find(i => i.id === editingId)?.createdAt || new Date().toISOString())
      : new Date().toISOString(),
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    await upsertItem(data);

    if (editingId) {
      const idx = items.findIndex(i => i.id === editingId);
      if (idx !== -1) items[idx] = data;
    } else {
      items.push(data);
    }

    render();
    closeModal();
    showToast(editingId ? '✅ 수정되었습니다.' : '✅ 항목이 추가되었습니다.');
  } catch (e) {
    showToast('❌ 저장 중 오류가 발생했습니다.');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

// ── 실시간 동기화 ─────────────────────────────────────────────
function subscribeRealtime() {
  db.channel('items-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, async () => {
      items = await fetchItems();
      render();
    })
    .subscribe();
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('addItemBtn').addEventListener('click', () => openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveItem);

document.getElementById('deleteClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);

// 모달 외부 클릭으로 닫히지 않도록 의도적으로 막음
deleteOverlay.addEventListener('click', (e) => { if (e.target === deleteOverlay) closeDeleteModal(); });

itemsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'copy')   copyItem(id);
  if (action === 'edit')   openModal(id);
  if (action === 'delete') openDeleteModal(id);
  if (action === 'select') toggleSelect(id);
});

selectClearBtn.addEventListener('click', clearSelection);
selectCopyBtn.addEventListener('click', copySelected);

// 필터 클릭
document.getElementById('mainFilter').addEventListener('click', (e) => {
  const pill = e.target.closest('.filter-pill');
  if (!pill) return;
  filterMain = pill.dataset.main;
  filterSub  = '';
  document.querySelectorAll('#mainFilter .filter-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#subFilter .filter-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  document.querySelector('#subFilter .filter-pill[data-sub=""]').classList.add('active');
  render();
});

document.getElementById('subFilter').addEventListener('click', (e) => {
  const pill = e.target.closest('.filter-pill');
  if (!pill) return;
  filterSub = pill.dataset.sub;
  document.querySelectorAll('#subFilter .filter-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  render();
});

deliveryOwnBtn.addEventListener('click', () => setDeliveryType('own'));
deliveryDirectBtn.addEventListener('click', () => setDeliveryType('direct'));

// 카테고리 pill 토글
[itemMainCatGroup, itemSubCatGroup].forEach(group => {
  group.addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    pill.classList.toggle('selected');
  });
});

itemQty.addEventListener('input', updateUnitPrice);
itemTotal.addEventListener('input', updateUnitPrice);

imageUploadArea.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
imageRemove.addEventListener('click', (e) => { e.stopPropagation(); removeImage(); });

imageUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageUploadArea.style.borderColor = 'var(--primary)';
  imageUploadArea.style.background  = 'var(--primary-light)';
});
imageUploadArea.addEventListener('dragleave', () => {
  imageUploadArea.style.borderColor = '';
  imageUploadArea.style.background  = '';
});
imageUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  imageUploadArea.style.borderColor = '';
  imageUploadArea.style.background  = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageFile(file);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (deleteOverlay.classList.contains('open')) closeDeleteModal();
    else if (modalOverlay.classList.contains('open')) closeModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (modalOverlay.classList.contains('open')) saveItem();
  }
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  setLoading(true);
  items = await fetchItems();
  render();
  setLoading(false);
  subscribeRealtime();
})();

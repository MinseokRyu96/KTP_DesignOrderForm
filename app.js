'use strict';

// ── Supabase ──────────────────────────────────────────────────
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

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
    notionUrl     : row.notion_url    || '',
    options       : row.options       || '',
    note          : row.note          || '',
    image         : row.image         || '',
    deliveryType  : row.delivery_type || 'own',
    mainCategory  : Array.isArray(row.main_category) ? row.main_category : [],
    subCategory   : Array.isArray(row.sub_category)  ? row.sub_category  : [],
    createdAt     : row.created_at,
    initialQty    : row.initial_qty ?? null,
    manageStock   : row.manage_stock ?? false,
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
    notion_url    : item.notionUrl    || '',
    options       : item.options      || '',
    note          : item.note         || '',
    image         : item.image        || '',
    delivery_type : item.deliveryType || 'own',
    main_category : item.mainCategory || [],
    sub_category  : item.subCategory  || [],
    created_at    : item.createdAt,
    initial_qty   : item.initialQty ?? null,
    manage_stock  : item.manageStock ?? false,
  };
}

const HOTEL_DESIGN_KEYS = [
  { key: 'banner', label: 'X배너' },
  { key: 'tableTent', label: '테이블텐트', hasCount: true },
  { key: 'taxNotice', label: '택스리펀 안내문', hasCount: true },
  { key: 'holder', label: '거치함' },
  { key: 'signage', label: '안내판' },
];

function rowToHotel(row) {
  return {
    id           : row.id,
    nameKo       : row.name_ko       || '',
    nameEn       : row.name_en       || '',
    url          : row.url           || '',
    qrImage      : row.qr_image      || '',
    roomCount    : row.room_count ?? null,
    refundMethod : row.refund_method || 'kiosk',
    kioskSize    : row.kiosk_size    || row.checklist?.kioskSize || 'large',
    checklist    : row.checklist     || {},
    address      : row.address       || '',
    createdAt    : row.created_at    || new Date().toISOString(),
    updatedAt    : row.updated_at    || new Date().toISOString(),
  };
}

function hotelToRow(hotel) {
  return {
    id            : hotel.id,
    name_ko       : hotel.nameKo       || '',
    name_en       : hotel.nameEn       || '',
    url           : hotel.url          || '',
    qr_image      : hotel.qrImage      || '',
    room_count    : hotel.roomCount ?? null,
    refund_method : hotel.refundMethod || 'kiosk',
    checklist     : { ...(hotel.checklist || {}), kioskSize: hotel.kioskSize || 'large' },
    address       : hotel.address      || '',
    created_at    : hotel.createdAt,
    updated_at    : hotel.updatedAt,
  };
}

// ── 상태 ──────────────────────────────────────────────────────
let items          = [];
let editingId      = null;
let deletingId     = null;
let hotelRecords   = [];
let hotelStorageMode = 'supabase';
let hotelsLoaded   = false;
let hotelRowEdit   = null; // 인라인 편집/신규 행 상태: { mode: 'new'|'edit', id, nameKo, nameEn, url, urlTouched, qrImage, roomCount, refundMethod, kioskSize, checklist, address }
let selectedIds    = new Set();
let filterMain     = '';
let filterSub      = '';
let searchQuery    = '';
let latestOrderMap = {};
let viewMode       = localStorage.getItem('designViewMode') || 'card';
let pendingImageFile = null; // Storage 업로드 대기 중인 파일

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
const itemNotionUrl = document.getElementById('itemNotionUrl');
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

const hotelQrBody      = document.getElementById('hotelQrBody');
const hotelEmptyState  = document.getElementById('hotelEmptyState');

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

async function fetchLatestOrders() {
  const { data, error } = await db
    .from('order_history')
    .select('item_id, order_date')
    .order('order_date', { ascending: false });
  if (error) return;
  latestOrderMap = {};
  (data || []).forEach(row => {
    if (!latestOrderMap[row.item_id]) {
      latestOrderMap[row.item_id] = row.order_date;
    }
  });
}

async function upsertItem(item) {
  const { error } = await db.from('items').upsert(itemToRow(item));
  if (error) throw error;
}

async function removeItem(id) {
  const item = items.find(i => i.id === id);
  if (item?.image) {
    const match = item.image.match(/\/item-images\/(.+)$/);
    if (match) await db.storage.from('item-images').remove([decodeURIComponent(match[1])]);
  }
  const { error } = await db.from('items').delete().eq('id', id);
  if (error) throw error;
}

function loadHotelLocal() {
  try {
    return JSON.parse(localStorage.getItem('hotelQrRecords') || '[]');
  } catch {
    return [];
  }
}

function saveHotelLocal() {
  localStorage.setItem('hotelQrRecords', JSON.stringify(hotelRecords));
}

async function fetchHotels() {
  if (hotelStorageMode === 'local') return loadHotelLocal();

  const { data, error } = await db
    .from('hotel_qr_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('hotel_qr_records 테이블을 사용할 수 없어 로컬 저장 모드로 전환합니다.', error);
    hotelStorageMode = 'local';
    return loadHotelLocal();
  }

  return (data || []).map(rowToHotel);
}

async function upsertHotel(hotel) {
  if (hotelStorageMode === 'local') {
    const idx = hotelRecords.findIndex(h => h.id === hotel.id);
    if (idx === -1) hotelRecords.unshift(hotel);
    else hotelRecords[idx] = hotel;
    saveHotelLocal();
    return;
  }

  const { error } = await db.from('hotel_qr_records').upsert(hotelToRow(hotel));
  if (error) {
    console.warn('호텔 QR Supabase 저장 실패, 로컬 저장으로 전환합니다.', error);
    hotelStorageMode = 'local';
    const idx = hotelRecords.findIndex(h => h.id === hotel.id);
    if (idx === -1) hotelRecords.unshift(hotel);
    else hotelRecords[idx] = hotel;
    saveHotelLocal();
  }
}

async function removeHotel(id) {
  if (hotelStorageMode === 'local') {
    hotelRecords = hotelRecords.filter(h => h.id !== id);
    saveHotelLocal();
    return;
  }

  const { error } = await db.from('hotel_qr_records').delete().eq('id', id);
  if (error) throw error;
}

// ── Render ────────────────────────────────────────────────────
function getFilteredItems() {
  const q = searchQuery.trim().toLowerCase();
  return items.filter(item => {
    if (filterMain && !(item.mainCategory || []).includes(filterMain)) return false;
    if (filterSub  && !(item.subCategory  || []).includes(filterSub))  return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const filtered = getFilteredItems();
  const isEmpty  = filtered.length === 0;

  itemsGrid.style.display          = (!isEmpty && viewMode === 'card') ? '' : 'none';
  document.getElementById('itemsListWrap').style.display = (!isEmpty && viewMode === 'list') ? '' : 'none';
  emptyState.classList.toggle('visible', isEmpty);
  if (isEmpty) return;

  if (viewMode === 'card') renderCards(filtered);
  else                     renderList(filtered);
}

function renderCards(filtered) {
  itemsGrid.innerHTML = '';
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.id = item.id;

    const unitPrice = item.qty && item.total ? Math.round(item.total / item.qty) : null;

    const imageHtml = item.image
      ? `<img class="card-image" src="${item.image}" alt="${item.name}">`
      : `<div class="card-image-placeholder">🖼<span>이미지 없음</span></div>`;

    const mainBadges = (item.mainCategory || []).map(c => `<span class="cat-badge main">${c}</span>`).join('');
    const subBadges  = (item.subCategory  || []).map(c => `<span class="cat-badge sub">${c}</span>`).join('');
    const categoryHtml = (mainBadges || subBadges) ? `<div class="card-category">${mainBadges}${subBadges}</div>` : '';

    const latestOrder = latestOrderMap[item.id];
    const latestOrderHtml = latestOrder ? `<div class="card-latest-order">🕒 최근 발주일 <strong>${latestOrder}</strong></div>` : '';

    const stockToggleHtml = `
      <div class="stock-toggle-row">
        <button class="btn-stock-toggle${item.manageStock ? ' active' : ''}" data-action="toggle-stock" data-id="${item.id}">
          📦 재고관리 ${item.manageStock ? 'ON' : 'OFF'}
        </button>
      </div>`;

    const isDirect = item.deliveryType === 'direct';
    const deliveryBadge    = isDirect ? `<span class="delivery-badge direct">🚚 직배송</span>` : `<span class="delivery-badge own">🏢 자사 배송</span>`;
    const deliveryInfoHtml = isDirect ? `<div class="card-delivery-info">📍 배송지 주소 :<br>👤 담당자명 :&nbsp;&nbsp;📞 연락처 :</div>` : '';

    const isSelected = selectedIds.has(item.id);
    if (isSelected) card.classList.add('selected');

    card.innerHTML = `
      <label class="card-checkbox-wrap" data-action="select" data-id="${item.id}">
        <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
      </label>
      ${imageHtml}
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title">${escapeHtml(item.name)}</div>
          <button class="btn-history-inline" data-action="history" data-id="${item.id}">📦 발주내역</button>
        </div>
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
        ${item.vendor ? `<div class="card-vendor">📦 ${escapeHtml(item.vendor)}</div>` : ''}
        ${item.url ? `<div class="card-vendor">🔗 <a href="${item.url}" target="_blank" rel="noopener">${item.url}</a></div>` : ''}
        ${item.orderUrl   ? `<div class="card-vendor card-order-url">📌 <a href="${item.orderUrl}" target="_blank" rel="noopener">${item.orderUrl}</a><span class="url-badge">주문URL</span></div>` : ''}
        ${item.notionUrl  ? `<div class="card-vendor card-order-url">📓 <a href="${item.notionUrl}" target="_blank" rel="noopener">${item.notionUrl}</a><span class="url-badge notion-badge">노션</span></div>` : ''}
        ${item.options ? `<div class="card-options">${escapeHtml(item.options)}</div>` : ''}
        ${deliveryInfoHtml}
        ${item.note ? `<div class="card-vendor" style="margin-top:8px">📝 ${escapeHtml(item.note)}</div>` : ''}
        ${latestOrderHtml}
        ${stockToggleHtml}
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

function renderList(filtered) {
  const tbody = document.getElementById('itemsListBody');
  tbody.innerHTML = '';
  filtered.forEach(item => {
    const unitPrice  = item.qty && item.total ? Math.round(item.total / item.qty) : null;
    const isDirect   = item.deliveryType === 'direct';
    const latestOrder = latestOrderMap[item.id];
    const isSelected  = selectedIds.has(item.id);

    const mainBadges = (item.mainCategory || []).map(c => `<span class="cat-badge main">${c}</span>`).join('');
    const subBadges  = (item.subCategory  || []).map(c => `<span class="cat-badge sub">${c}</span>`).join('');

    const thumbHtml = item.image
      ? `<img class="inv-thumb" src="${item.image}" alt="" data-action="zoom" data-src="${item.image}">`
      : `<div class="inv-thumb-placeholder">🖼</div>`;

    const tr = document.createElement('tr');
    tr.dataset.id = item.id;
    if (isSelected) tr.classList.add('selected');

    tr.innerHTML = `
      <td><input type="checkbox" class="list-checkbox" data-action="select" data-id="${item.id}" ${isSelected ? 'checked' : ''}></td>
      <td>
        <div class="list-name-wrap">
          ${thumbHtml}
          <div>
            <div class="list-name">${escapeHtml(item.name)}</div>
            ${item.vendor ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px">${escapeHtml(item.vendor)}</div>` : ''}
          </div>
        </div>
      </td>
      <td><div class="list-cat">${mainBadges}${subBadges}</div></td>
      <td class="col-num">${item.qty ? formatNumber(item.qty) : '-'}</td>
      <td class="col-num">${unitPrice !== null ? formatNumber(unitPrice) + ' 원' : '-'}</td>
      <td class="col-num">${item.total ? formatNumber(item.total) + ' 원' : '-'}</td>
      <td style="white-space:nowrap">${isDirect ? '<span class="delivery-badge direct" style="font-size:11px">🚚 직배송</span>' : '<span class="delivery-badge own" style="font-size:11px">🏢 자사</span>'}</td>
      <td style="white-space:nowrap;color:var(--gray-400);font-size:13px">${latestOrder || '-'}</td>
      <td>
        <button class="btn-stock-toggle${item.manageStock ? ' active' : ''}" style="font-size:10px;padding:3px 8px" data-action="toggle-stock" data-id="${item.id}">
          ${item.manageStock ? 'ON' : 'OFF'}
        </button>
      </td>
      <td>
        <div class="list-actions">
          <button class="btn btn-copy" style="font-size:11px;padding:5px 8px" data-action="copy" data-id="${item.id}">📋</button>
          <button class="btn-history-inline" style="font-size:11px;padding:4px 8px" data-action="history" data-id="${item.id}">발주내역</button>
          <button class="btn btn-edit" style="font-size:11px;padding:5px 8px" data-action="edit" data-id="${item.id}">✏️</button>
          <button class="btn btn-delete" style="font-size:11px;padding:5px 8px" data-action="delete" data-id="${item.id}">🗑</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getHotelDoneCount(hotel) {
  const checklist = hotel.checklist || {};
  return HOTEL_DESIGN_KEYS.filter(item => checklist[item.key]).length;
}

function renderHotels() {
  const total = hotelRecords.length;
  const ready = hotelRecords.filter(hotel => getHotelDoneCount(hotel) === HOTEL_DESIGN_KEYS.length).length;

  document.getElementById('hotelTotalCount').textContent = total;
  document.getElementById('hotelReadyCount').textContent = ready;
  document.getElementById('hotelProgressCount').textContent = total - ready;

  hotelQrBody.innerHTML = '';
  const showTable = total > 0 || !!hotelRowEdit;
  hotelEmptyState.classList.toggle('visible', !showTable);
  document.querySelector('.hotel-table-wrap').style.display = showTable ? '' : 'none';

  hotelRecords.forEach(hotel => {
    if (hotelRowEdit && hotelRowEdit.mode === 'edit' && hotelRowEdit.id === hotel.id) {
      hotelQrBody.appendChild(buildHotelEditRow(hotelRowEdit));
    } else {
      hotelQrBody.appendChild(buildHotelDisplayRow(hotel));
    }
  });

  if (hotelRowEdit && hotelRowEdit.mode === 'new') {
    hotelQrBody.appendChild(buildHotelEditRow(hotelRowEdit));
  }
}

function buildHotelDisplayRow(hotel) {
  const doneCount = getHotelDoneCount(hotel);
  const percent = Math.round((doneCount / HOTEL_DESIGN_KEYS.length) * 100);
  const refundLabel = hotel.refundMethod === 'airport' ? '공항' : '키오스크';
  const kioskSizeLabel = hotel.kioskSize === 'small' ? '소형' : '대형';
  const qrHtml = hotel.qrImage
    ? `<img class="hotel-qr-thumb" src="${hotel.qrImage}" alt="${escapeHtml(hotel.nameKo)} QR">`
    : '<div class="hotel-qr-empty">QR</div>';
  const tagsHtml = HOTEL_DESIGN_KEYS.map(item => (
    `<span class="hotel-design-tag${hotel.checklist?.[item.key] ? ' done' : ''}">${hotel.checklist?.[item.key] ? '✓ ' : ''}${item.label}</span>`
  )).join('');
  const tableTentCount = hotel.checklist?.tableTentCount;
  const taxNoticeCount = hotel.checklist?.taxNoticeCount;

  const tr = document.createElement('tr');
  tr.dataset.id = hotel.id;
  tr.innerHTML = `
    <td class="hotel-name">
      <strong>${escapeHtml(hotel.nameKo) || '-'}</strong>
      ${hotel.nameEn ? `<span>${escapeHtml(hotel.nameEn)}</span>` : ''}
    </td>
    <td>
      <div class="hotel-url-wrap">
        ${qrHtml}
        <div class="hotel-url">${hotel.url ? `<a href="${escapeAttr(hotel.url)}" target="_blank" rel="noopener">${escapeHtml(hotel.url)}</a>` : '-'}</div>
      </div>
    </td>
    <td style="white-space:nowrap">${hotel.roomCount ? formatNumber(hotel.roomCount) + '실' : '-'}</td>
    <td style="white-space:nowrap">${tableTentCount ? formatNumber(tableTentCount) + '개' : '-'}</td>
    <td style="white-space:nowrap">${taxNoticeCount ? formatNumber(taxNoticeCount) + '개' : '-'}</td>
    <td><span class="refund-badge ${hotel.refundMethod === 'airport' ? 'airport' : 'kiosk'}">${refundLabel}${hotel.refundMethod === 'kiosk' ? ` · ${kioskSizeLabel}` : ''}</span></td>
    <td>
      <div class="hotel-progress">
        <div class="hotel-progress-head"><span>${doneCount}/${HOTEL_DESIGN_KEYS.length}</span><span>${percent}%</span></div>
        <div class="hotel-progress-bar"><div class="hotel-progress-fill" style="width:${percent}%"></div></div>
        <div class="hotel-design-tags">${tagsHtml}</div>
      </div>
    </td>
    <td class="hotel-address">${escapeHtml(hotel.address) || '-'}</td>
    <td>
      <div class="hotel-actions">
        <button class="btn btn-copy btn-sm" data-haction="copy-url" data-id="${hotel.id}">URL 복사</button>
        <button class="btn btn-edit btn-sm" data-haction="edit" data-id="${hotel.id}">수정</button>
        <button class="btn btn-delete btn-sm" data-haction="delete" data-id="${hotel.id}">삭제</button>
      </div>
    </td>
  `;
  return tr;
}

function buildHotelEditRow(state) {
  const qrInner = state.qrImage
    ? `<img src="${state.qrImage}" alt="QR 미리보기"><button type="button" class="hotel-qr-box-remove" data-haction="remove-qr">×</button>`
    : `<span>QR 추가</span>`;

  const checksHtml = HOTEL_DESIGN_KEYS.map(item => `
    <label class="hotel-check-sm">
      <input type="checkbox" data-check="${item.key}" ${state.checklist?.[item.key] ? 'checked' : ''}>
      <span>${item.label}</span>
    </label>
  `).join('');

  const tr = document.createElement('tr');
  tr.className = 'hotel-row-edit';
  if (state.id) tr.dataset.id = state.id;
  tr.innerHTML = `
    <td class="hotel-name">
      <input type="text" class="hotel-edit-input" data-field="nameKo" placeholder="호텔명 (한글) *" value="${escapeAttr(state.nameKo || '')}">
      <input type="text" class="hotel-edit-input hotel-edit-sub" data-field="nameEn" placeholder="영문명" value="${escapeAttr(state.nameEn || '')}">
    </td>
    <td>
      <div class="hotel-url-wrap">
        <div class="hotel-qr-box" data-haction="qr-box">${qrInner}</div>
        <input type="file" class="hotel-qr-box-input" accept="image/*" hidden>
        <input type="url" class="hotel-edit-input" data-field="url" placeholder="URL (자동 생성)" value="${escapeAttr(state.url || '')}">
      </div>
    </td>
    <td>
      <input type="number" class="hotel-edit-input" data-field="roomCount" placeholder="0" min="0" value="${state.roomCount ?? ''}">
    </td>
    <td>
      <input type="number" class="hotel-edit-input" data-check-count="tableTent" placeholder="0" min="0" value="${state.checklist?.tableTentCount ?? ''}">
    </td>
    <td>
      <input type="number" class="hotel-edit-input" data-check-count="taxNotice" placeholder="0" min="0" value="${state.checklist?.taxNoticeCount ?? ''}">
    </td>
    <td>
      <div class="hotel-inline-toggle" data-toggle="refund">
        <button type="button" class="${state.refundMethod === 'kiosk' ? 'active' : ''}" data-refund="kiosk">키오스크</button>
        <button type="button" class="${state.refundMethod === 'airport' ? 'active' : ''}" data-refund="airport">공항</button>
      </div>
      <div class="hotel-inline-toggle hotel-inline-size" data-toggle="size" style="display:${state.refundMethod === 'kiosk' ? 'flex' : 'none'}">
        <button type="button" class="${state.kioskSize === 'large' ? 'active' : ''}" data-size="large">대형</button>
        <button type="button" class="${state.kioskSize === 'small' ? 'active' : ''}" data-size="small">소형</button>
      </div>
    </td>
    <td>
      <div class="hotel-check-grid-sm">${checksHtml}</div>
    </td>
    <td>
      <input type="text" class="hotel-edit-input" data-field="address" placeholder="주소">
    </td>
    <td>
      <div class="hotel-actions">
        <button type="button" class="btn btn-primary btn-sm" data-haction="save-row">저장</button>
        <button type="button" class="btn btn-ghost btn-sm" data-haction="cancel-row">취소</button>
      </div>
    </td>
  `;
  tr.querySelector('[data-field="address"]').value = state.address || '';
  return tr;
}

function defaultHotelRowState() {
  return {
    mode         : 'new',
    id           : null,
    nameKo       : '',
    nameEn       : '',
    url          : '',
    urlTouched   : false,
    qrImage      : '',
    roomCount    : null,
    refundMethod : 'kiosk',
    kioskSize    : 'large',
    checklist    : {},
    address      : '',
  };
}

function focusHotelEditRow() {
  setTimeout(() => {
    hotelQrBody.querySelector('.hotel-row-edit [data-field="nameKo"]')?.focus();
  }, 30);
}

function startAddHotelRow() {
  if (hotelRowEdit) {
    showToast('⚠️ 먼저 작성 중인 행을 저장하거나 취소하세요.');
    focusHotelEditRow();
    return;
  }
  hotelRowEdit = defaultHotelRowState();
  renderHotels();
  focusHotelEditRow();
}

function startEditHotelRow(id) {
  if (hotelRowEdit) {
    showToast('⚠️ 먼저 작성 중인 행을 저장하거나 취소하세요.');
    focusHotelEditRow();
    return;
  }
  const hotel = hotelRecords.find(h => h.id === id);
  if (!hotel) return;
  hotelRowEdit = {
    mode         : 'edit',
    id,
    nameKo       : hotel.nameKo || '',
    nameEn       : hotel.nameEn || '',
    url          : hotel.url || '',
    urlTouched   : true,
    qrImage      : hotel.qrImage || '',
    roomCount    : hotel.roomCount ?? null,
    refundMethod : hotel.refundMethod || 'kiosk',
    kioskSize    : hotel.kioskSize || 'large',
    checklist    : { ...(hotel.checklist || {}) },
    address      : hotel.address || '',
  };
  renderHotels();
  focusHotelEditRow();
}

function cancelHotelRowEdit() {
  hotelRowEdit = null;
  renderHotels();
}

function handleHotelRowQrFile(file, tr) {
  if (!file || !hotelRowEdit) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('⚠️ QR 이미지는 2MB 이하로 올려주세요.');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    hotelRowEdit.qrImage = e.target.result;
    const box = tr.querySelector('.hotel-qr-box');
    if (box) {
      box.innerHTML = `<img src="${hotelRowEdit.qrImage}" alt="QR 미리보기"><button type="button" class="hotel-qr-box-remove" data-haction="remove-qr">×</button>`;
    }
  };
  reader.readAsDataURL(file);
}

async function saveHotelRowEdit() {
  if (!hotelRowEdit) return;
  const state = hotelRowEdit;
  const tr = hotelQrBody.querySelector('.hotel-row-edit');
  const nameKo = (state.nameKo || '').trim();
  const autoUrl = buildHotelUrlFromEnglishName(state.nameEn || '');
  const url = (state.url || '').trim() || autoUrl;

  if (!nameKo) {
    showToast('⚠️ 호텔명을 입력하세요.');
    tr?.querySelector('[data-field="nameKo"]')?.focus();
    return;
  }
  if (!url) {
    showToast('⚠️ 호텔 영문명을 입력하거나 URL을 입력하세요.');
    tr?.querySelector('[data-field="nameEn"]')?.focus();
    return;
  }

  const checklist = { ...(state.checklist || {}) };
  HOTEL_DESIGN_KEYS.forEach(item => {
    if (!item.hasCount) return;
    const countKey = `${item.key}Count`;
    const raw = checklist[countKey];
    checklist[countKey] = raw !== undefined && raw !== null && raw !== '' ? parseFloat(raw) : null;
  });

  const now = new Date().toISOString();
  const existing = state.mode === 'edit' ? hotelRecords.find(h => h.id === state.id) : null;
  const hotel = {
    id           : state.id || uid(),
    nameKo,
    nameEn       : (state.nameEn || '').trim(),
    url,
    qrImage      : state.qrImage || '',
    roomCount    : state.roomCount !== null && state.roomCount !== '' ? parseFloat(state.roomCount) : null,
    refundMethod : state.refundMethod,
    kioskSize    : state.refundMethod === 'kiosk' ? state.kioskSize : '',
    checklist,
    address      : (state.address || '').trim(),
    createdAt    : existing?.createdAt || now,
    updatedAt    : now,
  };

  const saveBtn = tr?.querySelector('[data-haction="save-row"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  try {
    await upsertHotel(hotel);
    if (hotelStorageMode === 'supabase') {
      if (state.mode === 'edit') {
        const idx = hotelRecords.findIndex(h => h.id === state.id);
        if (idx !== -1) hotelRecords[idx] = hotel;
      } else {
        hotelRecords.unshift(hotel);
      }
    }
    const wasNew = state.mode === 'new';
    hotelRowEdit = wasNew ? defaultHotelRowState() : null;
    renderHotels();
    showToast(hotelStorageMode === 'local' ? '✅ 로컬에 저장됐습니다.' : '✅ 호텔 정보가 저장됐습니다.');
    if (wasNew) focusHotelEditRow();
  } catch (e) {
    showToast('❌ 저장 중 오류가 발생했습니다.');
    console.error(e);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  }
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

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(successMessage);
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
  pendingImageFile = null;
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
    itemNotionUrl.value    = item.notionUrl    || '';
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

// ── Hotel QR ──────────────────────────────────────────────────
function buildHotelUrlFromEnglishName(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `https://hotel.refundit.kr/${slug}` : '';
}

async function deleteHotel(id) {
  const hotel = hotelRecords.find(h => h.id === id);
  if (!hotel) return;
  if (!confirm(`${hotel.nameKo} 항목을 삭제하시겠습니까?`)) return;

  try {
    await removeHotel(id);
    hotelRecords = hotelRecords.filter(h => h.id !== id);
    saveHotelLocal();
    if (hotelRowEdit && hotelRowEdit.id === id) hotelRowEdit = null;
    renderHotels();
    showToast('삭제됐습니다.');
  } catch (e) {
    showToast('❌ 삭제 중 오류가 발생했습니다.');
    console.error(e);
  }
}

async function copyHotelUrl(id) {
  const hotel = hotelRecords.find(h => h.id === id);
  if (!hotel?.url) return;
  await copyText(hotel.url, '✅ URL을 복사했습니다.');
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

// ── 재고관리 토글 ──────────────────────────────────────────────
async function toggleManageStock(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.manageStock = !item.manageStock;
  const { error } = await db.from('items').update({ manage_stock: item.manageStock }).eq('id', id);
  if (error) { item.manageStock = !item.manageStock; showToast('❌ ' + error.message); return; }
  render();
  showToast(item.manageStock ? '✅ 재고관리 항목에 추가됐습니다.' : '재고관리에서 제외됐습니다.');
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
  if (file.size > 10 * 1024 * 1024) {
    showToast('⚠️ 이미지가 너무 큽니다. 10MB 이하로 올려주세요.');
    return;
  }
  pendingImageFile = file;
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
  pendingImageFile = null;
}

// ── Save ──────────────────────────────────────────────────────
async function saveItem() {
  const name   = itemName.value.trim();
  const qty    = parseFloat(itemQty.value);
  const total  = parseFloat(itemTotal.value);
  const vendor = itemVendor.value.trim();

  if (!name)           { itemName.focus();   showToast('⚠️ 품목명을 입력하세요.');  return; }
  if (!qty || qty < 1) { itemQty.focus();    showToast('⚠️ 수량을 입력하세요.');   return; }
  if (!vendor)         { itemVendor.focus(); showToast('⚠️ 발주처를 입력하세요.'); return; }

  const itemId = editingId || uid();
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    // 이미지: Storage 업로드
    let imageUrl = '';
    if (pendingImageFile) {
      const ext  = pendingImageFile.name.split('.').pop().toLowerCase();
      const path = `${itemId}.${ext}`;
      const { error: uploadError } = await db.storage
        .from('item-images')
        .upload(path, pendingImageFile, { upsert: true, contentType: pendingImageFile.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = db.storage.from('item-images').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    } else if (!imagePreview.hidden) {
      // 기존 URL 유지 (수정 시 이미지 그대로 두는 경우)
      imageUrl = imagePreview.src;
    } else if (editingId) {
      // 이미지 제거됨 — Storage에서도 삭제
      const oldItem = items.find(i => i.id === editingId);
      if (oldItem?.image) {
        const match = oldItem.image.match(/\/item-images\/(.+)$/);
        if (match) await db.storage.from('item-images').remove([decodeURIComponent(match[1])]);
      }
    }

    const data = {
      id           : itemId,
      name,
      qty,
      total        : isNaN(total) ? null : total,
      vendor,
      url          : itemUrl.value.trim()         || '',
      orderUrl     : itemOrderUrl.value.trim()    || '',
      notionUrl    : itemNotionUrl.value.trim()   || '',
      options      : itemOptions.value.trim()  || '',
      note         : itemNote.value.trim()     || '',
      image        : imageUrl,
      deliveryType : itemDeliveryType.value,
      mainCategory : getCatValues(itemMainCatGroup),
      subCategory  : getCatValues(itemSubCatGroup),
      createdAt    : editingId
        ? (items.find(i => i.id === editingId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      manageStock  : editingId
        ? (items.find(i => i.id === editingId)?.manageStock ?? false)
        : false,
    };

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
    pendingImageFile = null;
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

  db.channel('hotel-qr-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_qr_records' }, async () => {
      if (hotelStorageMode !== 'supabase') return;
      hotelRecords = await fetchHotels();
      hotelsLoaded = true;
      renderHotels();
    })
    .subscribe();
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('addItemBtn').addEventListener('click', () => openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveItem);

document.getElementById('addHotelBtn').addEventListener('click', () => startAddHotelRow());

document.getElementById('deleteClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);

// 모달 외부 클릭으로 닫히지 않도록 의도적으로 막음
deleteOverlay.addEventListener('click', (e) => { if (e.target === deleteOverlay) closeDeleteModal(); });

itemsGrid.addEventListener('click', (e) => {
  const img = e.target.closest('.card-image');
  if (img) { openLightbox(img.src); return; }

  const btn = e.target.closest('[data-action]');
  if (btn) {
    const { action, id } = btn.dataset;
    if (action === 'copy')         copyItem(id);
    if (action === 'history')      openHistoryModal(id);
    if (action === 'edit')         openModal(id);
    if (action === 'delete')       openDeleteModal(id);
    if (action === 'select')       toggleSelect(id);
    if (action === 'toggle-stock') toggleManageStock(id);
    return;
  }

  // 링크 클릭은 그냥 통과
  if (e.target.closest('a')) return;

  // 카드 어디든 클릭하면 선택 토글
  const card = e.target.closest('.item-card');
  if (card) toggleSelect(card.dataset.id);
});

// ── 리스트 뷰 클릭 핸들러 ────────────────────────────────────
document.getElementById('itemsListWrap').addEventListener('click', (e) => {
  const zoomImg = e.target.closest('[data-action="zoom"]');
  if (zoomImg) { openLightbox(zoomImg.dataset.src); return; }

  const btn = e.target.closest('[data-action]');
  if (btn) {
    const { action, id } = btn.dataset;
    if (action === 'copy')         copyItem(id);
    if (action === 'history')      openHistoryModal(id);
    if (action === 'edit')         openModal(id);
    if (action === 'delete')       openDeleteModal(id);
    if (action === 'select')       toggleSelect(id);
    if (action === 'toggle-stock') toggleManageStock(id);
    return;
  }

  if (e.target.closest('a')) return;

  const tr = e.target.closest('tr[data-id]');
  if (tr) toggleSelect(tr.dataset.id);
});

hotelQrBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-haction]');
  if (btn) {
    const { haction, id } = btn.dataset;
    if (haction === 'copy-url')   copyHotelUrl(id);
    if (haction === 'edit')       startEditHotelRow(id);
    if (haction === 'delete')     deleteHotel(id);
    if (haction === 'save-row')   saveHotelRowEdit();
    if (haction === 'cancel-row') cancelHotelRowEdit();
    if (haction === 'remove-qr') {
      if (hotelRowEdit) hotelRowEdit.qrImage = '';
      const box = btn.closest('.hotel-qr-box');
      if (box) box.innerHTML = '<span>QR 추가</span>';
    }
    return;
  }

  const qrBox = e.target.closest('.hotel-qr-box');
  if (qrBox) {
    qrBox.closest('tr')?.querySelector('.hotel-qr-box-input')?.click();
    return;
  }

  const refundBtn = e.target.closest('[data-refund]');
  if (refundBtn && hotelRowEdit) {
    const method = refundBtn.dataset.refund;
    hotelRowEdit.refundMethod = method;
    refundBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === refundBtn));
    const sizeGroup = refundBtn.closest('tr').querySelector('[data-toggle="size"]');
    if (sizeGroup) sizeGroup.style.display = method === 'kiosk' ? 'flex' : 'none';
    return;
  }

  const sizeBtn = e.target.closest('[data-size]');
  if (sizeBtn && hotelRowEdit) {
    hotelRowEdit.kioskSize = sizeBtn.dataset.size;
    sizeBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === sizeBtn));
  }
});

hotelQrBody.addEventListener('input', (e) => {
  if (!hotelRowEdit) return;

  const countKey = e.target.dataset.checkCount;
  if (countKey) {
    hotelRowEdit.checklist[`${countKey}Count`] = e.target.value;
    return;
  }

  const field = e.target.dataset.field;
  if (!field) return;
  hotelRowEdit[field] = e.target.value;
  if (field === 'nameEn' && !hotelRowEdit.urlTouched) {
    const autoUrl = buildHotelUrlFromEnglishName(e.target.value);
    hotelRowEdit.url = autoUrl;
    const urlInput = e.target.closest('tr').querySelector('[data-field="url"]');
    if (urlInput) urlInput.value = autoUrl;
  }
  if (field === 'url') {
    hotelRowEdit.urlTouched = e.target.value.trim() !== '';
  }
});

hotelQrBody.addEventListener('change', (e) => {
  if (!hotelRowEdit) return;
  if (e.target.matches('[data-check]')) {
    hotelRowEdit.checklist[e.target.dataset.check] = e.target.checked;
  }
  if (e.target.matches('.hotel-qr-box-input')) {
    handleHotelRowQrFile(e.target.files[0], e.target.closest('tr'));
  }
});

hotelQrBody.addEventListener('keydown', (e) => {
  if (!e.target.matches('.hotel-edit-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveHotelRowEdit(); }
  if (e.key === 'Escape') { e.preventDefault(); cancelHotelRowEdit(); }
});

// ── 뷰 토글 ──────────────────────────────────────────────────
function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem('designViewMode', mode);
  document.getElementById('viewCardBtn').classList.toggle('active', mode === 'card');
  document.getElementById('viewListBtn').classList.toggle('active', mode === 'list');
  render();
}

document.getElementById('viewCardBtn').addEventListener('click', () => setViewMode('card'));
document.getElementById('viewListBtn').addEventListener('click', () => setViewMode('list'));

// ── 라이트박스 ────────────────────────────────────────────────
const lightbox    = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.add('open');
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightboxImg.src = '';
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
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

// 검색
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  searchClear.hidden = !searchQuery;
  render();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClear.hidden = true;
  searchInput.focus();
  render();
});

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

// ── 발주내역 ──────────────────────────────────────────────────
const historyOverlay  = document.getElementById('historyOverlay');
const historyTitle    = document.getElementById('historyTitle');
const historySubtitle = document.getElementById('historySubtitle');
const historyList     = document.getElementById('historyList');
const historyEmpty    = document.getElementById('historyEmpty');
const historyFormFields = document.getElementById('historyFormFields');
const historyFormTitle  = document.getElementById('historyFormTitle');
const historyEditId   = document.getElementById('historyEditId');
const hOrderDate      = document.getElementById('hOrderDate');
const hQty            = document.getElementById('hQty');
const hTotal          = document.getElementById('hTotal');
const hUnitPrice      = document.getElementById('hUnitPrice');
const hPurpose        = document.getElementById('hPurpose');

let currentHistoryItemId = null;
let historyRecords = [];

function hUpdateUnitPrice() {
  const qty   = parseFloat(hQty.value)   || 0;
  const total = parseFloat(hTotal.value) || 0;
  hUnitPrice.value = (qty > 0 && total > 0)
    ? formatNumber(Math.round(total / qty)) + ' 원'
    : '';
}

function openHistoryForm(record = null) {
  historyEditId.value = record ? record.id : '';
  hOrderDate.value    = record ? record.order_date   : new Date().toISOString().slice(0, 10);
  hQty.value          = record ? record.quantity      : '';
  hTotal.value        = record ? record.total_amount  : '';
  hPurpose.value      = record ? record.purpose       : '';
  hUpdateUnitPrice();
  historyFormTitle.textContent = record ? '✏️ 발주 수정' : '+ 새 발주 추가';
  historyFormFields.classList.add('open');
  hOrderDate.focus();
}

function closeHistoryForm() {
  historyFormFields.classList.remove('open');
  historyFormTitle.textContent = '+ 새 발주 추가';
  historyEditId.value = '';
  hOrderDate.value = '';
  hQty.value = '';
  hTotal.value = '';
  hUnitPrice.value = '';
  hPurpose.value = '';
}

function renderHistoryList() {
  historyList.innerHTML = '';

  if (historyRecords.length === 0) {
    historyList.appendChild(historyEmpty);
    historyEmpty.style.display = '';
    return;
  }

  historyEmpty.style.display = 'none';
  const sorted = [...historyRecords].sort((a, b) => b.order_date.localeCompare(a.order_date));

  sorted.forEach(rec => {
    const unitPrice = rec.quantity && rec.total_amount
      ? Math.round(rec.total_amount / rec.quantity)
      : null;

    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div>
        <div class="hrow-label">발주일</div>
        <div class="hrow-value">${rec.order_date}</div>
      </div>
      <div>
        <div class="hrow-label">개수</div>
        <div class="hrow-value">${formatNumber(rec.quantity)}</div>
      </div>
      <div>
        <div class="hrow-label">단가</div>
        <div class="hrow-value">${unitPrice !== null ? formatNumber(unitPrice) + ' 원' : '-'}</div>
      </div>
      <div>
        <div class="hrow-label">총금액</div>
        <div class="hrow-value accent">${rec.total_amount ? formatNumber(rec.total_amount) + ' 원' : '-'}</div>
      </div>
      <div style="overflow:hidden;">
        <div class="hrow-label">발주 목적</div>
        <div class="hrow-purpose">${escapeHtml(rec.purpose) || '-'}</div>
      </div>
      <div class="hrow-actions">
        <button class="btn-hrow" data-haction="edit" data-hid="${rec.id}">수정</button>
        <button class="btn-hrow danger" data-haction="delete" data-hid="${rec.id}">삭제</button>
      </div>
    `;
    historyList.appendChild(row);
  });
}

async function openHistoryModal(itemId) {
  currentHistoryItemId = itemId;
  const item = items.find(i => i.id === itemId);
  historyTitle.textContent    = '발주내역';
  historySubtitle.textContent = item ? item.name : '';
  closeHistoryForm();
  historyOverlay.classList.add('open');

  const { data, error } = await db
    .from('order_history')
    .select('*')
    .eq('item_id', itemId)
    .order('order_date', { ascending: false });

  historyRecords = error ? [] : (data || []);
  renderHistoryList();
}

function closeHistoryModal() {
  historyOverlay.classList.remove('open');
  currentHistoryItemId = null;
  historyRecords = [];
}

async function saveHistoryRecord() {
  const date    = hOrderDate.value;
  const qty     = parseFloat(hQty.value);
  const total   = parseFloat(hTotal.value);
  const purpose = hPurpose.value.trim();

  if (!date)       { hOrderDate.focus(); showToast('⚠️ 발주일을 입력하세요.'); return; }
  if (!qty || qty < 1) { hQty.focus(); showToast('⚠️ 개수를 입력하세요.'); return; }

  const unitPrice = qty && total ? Math.round(total / qty) : null;
  const editId    = historyEditId.value;

  const record = {
    id           : editId || uid(),
    item_id      : currentHistoryItemId,
    order_date   : date,
    quantity     : qty,
    total_amount : isNaN(total) ? null : total,
    unit_price   : unitPrice,
    purpose,
  };

  const btn = document.getElementById('hSaveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const { error } = await db.from('order_history').upsert(record);
    if (error) throw error;

    if (editId) {
      const idx = historyRecords.findIndex(r => r.id === editId);
      if (idx !== -1) historyRecords[idx] = record;
    } else {
      historyRecords.unshift(record);
      // 재고관리 항목이면 처음 개수에 발주 수량 자동 합산
      const item = items.find(i => i.id === currentHistoryItemId);
      if (item?.manageStock) {
        const newInitialQty = (item.initialQty || 0) + qty;
        const { error: qtyError } = await db.from('items').update({ initial_qty: newInitialQty }).eq('id', item.id);
        if (!qtyError) item.initialQty = newInitialQty;
      }
    }
    // 최근 발주일 갱신
    await fetchLatestOrders();
    render();
    renderInventory();
    renderHistoryList();
    closeHistoryForm();
    showToast('✅ 저장됐습니다.');
  } catch (e) {
    showToast('❌ 저장 중 오류가 발생했습니다.');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

async function deleteHistoryRecord(id) {
  const deletedRecord = historyRecords.find(r => r.id === id);
  const { error } = await db.from('order_history').delete().eq('id', id);
  if (error) { showToast('❌ 삭제 중 오류가 발생했습니다.'); return; }
  historyRecords = historyRecords.filter(r => r.id !== id);

  // 재고관리 항목이면 처음 개수에서 삭제된 발주 수량 차감
  if (deletedRecord) {
    const item = items.find(i => i.id === currentHistoryItemId);
    if (item?.manageStock && deletedRecord.quantity) {
      const newInitialQty = (item.initialQty || 0) - deletedRecord.quantity;
      const { error: qtyError } = await db.from('items').update({ initial_qty: newInitialQty }).eq('id', item.id);
      if (!qtyError) item.initialQty = newInitialQty;
    }
  }
  await fetchLatestOrders();
  render();
  renderInventory();
  renderHistoryList();
  showToast('삭제됐습니다.');
}

// 발주내역 이벤트
document.getElementById('historyClose').addEventListener('click', closeHistoryModal);
document.getElementById('historyDoneBtn').addEventListener('click', closeHistoryModal);
document.getElementById('historyAddBtn').addEventListener('click', () => openHistoryForm());
document.getElementById('historyFormTitle').addEventListener('click', () => {
  if (historyFormFields.classList.contains('open')) closeHistoryForm();
  else openHistoryForm();
});
document.getElementById('hSaveBtn').addEventListener('click', saveHistoryRecord);
document.getElementById('hCancelBtn').addEventListener('click', closeHistoryForm);

historyOverlay.addEventListener('click', (e) => {
  if (e.target === historyOverlay) closeHistoryModal();
});

hQty.addEventListener('input', hUpdateUnitPrice);
hTotal.addEventListener('input', hUpdateUnitPrice);

historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-haction]');
  if (!btn) return;
  const { haction, hid } = btn.dataset;
  if (haction === 'edit') {
    const rec = historyRecords.find(r => r.id === hid);
    if (rec) openHistoryForm(rec);
  }
  if (haction === 'delete') deleteHistoryRecord(hid);
});

// ── 재고현황 ──────────────────────────────────────────────────
let distRecordsMap    = {}; // item_id -> array of records (date desc)
let latestDistMap     = {}; // item_id -> latest record
let currentDistItemId = null;
let distRecords       = [];

async function fetchInventory() {
  const { data, error } = await db
    .from('inventory')
    .select('*')
    .order('distribution_date', { ascending: false });
  if (error) return;
  distRecordsMap = {};
  latestDistMap  = {};
  (data || []).forEach(row => {
    if (!distRecordsMap[row.item_id]) distRecordsMap[row.item_id] = [];
    distRecordsMap[row.item_id].push(row);
    if (!latestDistMap[row.item_id]) latestDistMap[row.item_id] = row;
  });
}

function calcRemaining(itemId) {
  const item = items.find(i => i.id === itemId);
  if (item?.initialQty == null) return '-';
  const totalDist = (distRecordsMap[itemId] || [])
    .reduce((sum, r) => sum + (Number(r.distribution_qty) || 0), 0);
  return item.initialQty - totalDist;
}

function renderInventory() {
  const tbody = document.getElementById('inventoryBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const stockItems = items.filter(item => item.manageStock);

  if (stockItems.length === 0) {
    const colCount = document.querySelectorAll('#inventoryBody').length || 8;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400)">
      [디자인물] 탭에서 <strong>📦 재고관리 ON</strong> 버튼을 눌러 항목을 추가하세요.
    </td></tr>`;
    return;
  }

  const sorted = stockItems.sort((a, b) => {
    const aMax = (distRecordsMap[a.id] || []).reduce((m, r) => r.updated_at > m ? r.updated_at : m, '');
    const bMax = (distRecordsMap[b.id] || []).reduce((m, r) => r.updated_at > m ? r.updated_at : m, '');
    if (!aMax && !bMax) return 0;
    if (!aMax) return 1;
    if (!bMax) return -1;
    return bMax.localeCompare(aMax);
  });

  sorted.forEach(item => {
    const latest  = latestDistMap[item.id];
    const remaining = calcRemaining(item.id);
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;
    const thumbHtml = item.image
      ? `<img class="inv-thumb" src="${item.image}" alt="">`
      : `<div class="inv-thumb-placeholder">🖼</div>`;
    tr.innerHTML = `
      <td class="inv-name"><div class="inv-name-wrap">${thumbHtml}<span>${escapeHtml(item.name)}</span></div></td>
      <td class="inv-readonly">
        ${latestOrderMap[item.id] || '-'}
        <button class="btn-inv-history" data-id="${item.id}">내역</button>
      </td>
      <td class="inv-init-qty inv-num" data-value="${item.initialQty ?? ''}">${item.initialQty ?? '<span class="inv-placeholder">클릭하여 입력</span>'}</td>
      <td class="inv-readonly">${escapeHtml(latest?.distribution_location || '-')}</td>
      <td class="inv-readonly">${escapeHtml(latest?.assignee || '-')}</td>
      <td class="inv-readonly">${latest?.distribution_date || '-'}</td>
      <td class="inv-readonly inv-num">${latest?.distribution_qty ?? '-'}</td>
      <td class="inv-readonly inv-num${remaining !== '-' && remaining < 0 ? ' inv-negative' : ''}">${remaining}</td>
      <td><button class="btn-dist-history" data-id="${item.id}">📋 히스토리</button></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('inventoryBody').addEventListener('click', (e) => {
  const thumb = e.target.closest('.inv-thumb');
  if (thumb) { openLightbox(thumb.src); return; }

  const initCell = e.target.closest('.inv-init-qty');
  if (initCell && !initCell.querySelector('input')) {
    const itemId = initCell.closest('tr').dataset.itemId;
    const currentValue = initCell.dataset.value || '';
    const input = document.createElement('input');
    input.type = 'number'; input.value = currentValue; input.min = '0';
    input.className = 'inv-input';
    initCell.innerHTML = '';
    initCell.appendChild(input);
    input.focus(); input.select();

    let saved = false;
    async function saveInitQty() {
      if (saved) return; saved = true;
      const newValue = input.value !== '' ? parseFloat(input.value) : null;
      const { error } = await db.from('items').update({ initial_qty: newValue }).eq('id', itemId);
      if (error) { console.error('initial_qty 저장 오류:', error); showToast('❌ ' + error.message); renderInventory(); return; }
      const item = items.find(i => i.id === itemId);
      if (item) item.initialQty = newValue;
      renderInventory();
    }
    input.addEventListener('blur', saveInitQty);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { saved = true; renderInventory(); }
    });
    return;
  }

  const histBtn = e.target.closest('.btn-inv-history');
  if (histBtn) { openHistoryModal(histBtn.dataset.id); return; }

  const btn = e.target.closest('.btn-dist-history');
  if (!btn) return;
  openDistModal(btn.dataset.id);
});

// ── 배부 히스토리 모달 ─────────────────────────────────────────
const distOverlay    = document.getElementById('distOverlay');
const distSubtitle   = document.getElementById('distSubtitle');
const distList       = document.getElementById('distList');
const distEmpty      = document.getElementById('distEmpty');
const distFormFields = document.getElementById('distFormFields');
const distFormTitle  = document.getElementById('distFormTitle');
const distEditId     = document.getElementById('distEditId');
const dDate          = document.getElementById('dDate');
const dLocation      = document.getElementById('dLocation');
const dAssignee      = document.getElementById('dAssignee');
const dQty           = document.getElementById('dQty');

function openDistForm(record = null) {
  distEditId.value = record ? record.id : '';
  dDate.value      = record ? (record.distribution_date || '') : new Date().toISOString().slice(0, 10);
  dLocation.value  = record ? (record.distribution_location || '') : '';
  dAssignee.value  = record ? (record.assignee || '') : '';
  dQty.value       = record ? (record.distribution_qty ?? '') : '';
  distFormTitle.textContent = record ? '✏️ 배부 수정' : '+ 새 배부 추가';
  distFormFields.classList.add('open');
  dDate.focus();
}

function closeDistForm() {
  distFormFields.classList.remove('open');
  distFormTitle.textContent = '+ 새 배부 추가';
  distEditId.value = '';
  dDate.value = ''; dLocation.value = ''; dAssignee.value = ''; dQty.value = '';
}

function renderDistList() {
  distList.innerHTML = '';
  if (distRecords.length === 0) {
    distList.appendChild(distEmpty);
    distEmpty.style.display = '';
    return;
  }
  distEmpty.style.display = 'none';
  const sorted = [...distRecords].sort((a, b) =>
    (b.distribution_date || '').localeCompare(a.distribution_date || ''));
  sorted.forEach(rec => {
    const row = document.createElement('div');
    row.className = 'dist-row';
    row.innerHTML = `
      <div>
        <div class="hrow-label">배부일자</div>
        <div class="hrow-value">${rec.distribution_date || '-'}</div>
      </div>
      <div>
        <div class="hrow-label">배부장소</div>
        <div class="hrow-value">${escapeHtml(rec.distribution_location || '-')}</div>
      </div>
      <div>
        <div class="hrow-label">담당자</div>
        <div class="hrow-value">${escapeHtml(rec.assignee || '-')}</div>
      </div>
      <div>
        <div class="hrow-label">배부개수</div>
        <div class="hrow-value">${rec.distribution_qty ?? '-'}</div>
      </div>
      <div class="hrow-actions">
        <button class="btn-hrow" data-daction="edit" data-did="${rec.id}">수정</button>
        <button class="btn-hrow danger" data-daction="delete" data-did="${rec.id}">삭제</button>
      </div>
    `;
    distList.appendChild(row);
  });
}

async function openDistModal(itemId) {
  currentDistItemId = itemId;
  const item = items.find(i => i.id === itemId);
  distSubtitle.textContent = item ? item.name : '';
  closeDistForm();
  distOverlay.classList.add('open');

  const { data, error } = await db
    .from('inventory')
    .select('*')
    .eq('item_id', itemId)
    .order('distribution_date', { ascending: false });
  distRecords = error ? [] : (data || []);
  renderDistList();
}

function closeDistModal() {
  distOverlay.classList.remove('open');
  currentDistItemId = null;
  distRecords = [];
}

async function saveDistRecord() {
  const date = dDate.value;
  if (!date) { dDate.focus(); showToast('⚠️ 배부일자를 입력하세요.'); return; }

  const editId = distEditId.value;
  const record = {
    id                    : editId || uid(),
    item_id               : currentDistItemId,
    distribution_date     : date,
    distribution_location : dLocation.value.trim() || null,
    assignee              : dAssignee.value.trim() || null,
    distribution_qty      : dQty.value !== '' ? parseFloat(dQty.value) : null,
    updated_at            : new Date().toISOString(),
  };

  const btn = document.getElementById('dSaveBtn');
  btn.disabled = true; btn.textContent = '저장 중...';

  try {
    const { error } = await db.from('inventory').upsert(record);
    if (error) throw error;
    if (editId) {
      const idx = distRecords.findIndex(r => r.id === editId);
      if (idx !== -1) distRecords[idx] = record;
    } else {
      distRecords.unshift(record);
    }
    await fetchInventory();
    renderInventory();
    renderDistList();
    closeDistForm();
    showToast('✅ 저장됐습니다.');
  } catch (e) {
    showToast('❌ 저장 중 오류가 발생했습니다.');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
}

async function deleteDistRecord(id) {
  const { error } = await db.from('inventory').delete().eq('id', id);
  if (error) { showToast('❌ 삭제 중 오류가 발생했습니다.'); return; }
  distRecords = distRecords.filter(r => r.id !== id);
  await fetchInventory();
  renderInventory();
  renderDistList();
  showToast('삭제됐습니다.');
}

document.getElementById('distClose').addEventListener('click', closeDistModal);
document.getElementById('distDoneBtn').addEventListener('click', closeDistModal);
document.getElementById('distAddBtn').addEventListener('click', () => openDistForm());
document.getElementById('distFormTitle').addEventListener('click', () => {
  if (distFormFields.classList.contains('open')) closeDistForm();
  else openDistForm();
});
document.getElementById('dSaveBtn').addEventListener('click', saveDistRecord);
document.getElementById('dCancelBtn').addEventListener('click', closeDistForm);

distOverlay.addEventListener('click', (e) => { if (e.target === distOverlay) closeDistModal(); });

distList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-daction]');
  if (!btn) return;
  const { daction, did } = btn.dataset;
  if (daction === 'edit') {
    const rec = distRecords.find(r => r.id === did);
    if (rec) openDistForm(rec);
  }
  if (daction === 'delete') deleteDistRecord(did);
});

// ── 탭 전환 ───────────────────────────────────────────────────
document.querySelector('.tab-bar').addEventListener('click', async (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;
  const tabPaneMap = {
    design   : 'tabDesign',
    inventory: 'tabInventory',
    hotelQr  : 'tabHotelQr',
  };

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  btn.classList.add('active');
  document.getElementById(tabPaneMap[tab]).classList.add('active');
  document.getElementById('addItemBtn').style.display = tab === 'design' ? '' : 'none';

  if (tab === 'inventory') {
    await fetchInventory();
    renderInventory();
  }

  if (tab === 'hotelQr') {
    if (!hotelsLoaded) {
      hotelRecords = await fetchHotels();
      hotelsLoaded = true;
    }
    renderHotels();
  }
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  // 뷰 토글 초기 상태
  document.getElementById('viewCardBtn').classList.toggle('active', viewMode === 'card');
  document.getElementById('viewListBtn').classList.toggle('active', viewMode === 'list');

  setLoading(true);
  [items] = await Promise.all([fetchItems(), fetchLatestOrders()]);
  render();
  setLoading(false);
  subscribeRealtime();
})();

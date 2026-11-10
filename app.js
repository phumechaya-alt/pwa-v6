/* ==========================================================================
   КОШЕЛЕК PWA v5 — ОСНОВНАЯ ЛОГИКА (3 ВКЛАДКИ: РАСХОДЫ / ДОХОДЫ / АНАЛИТИКА)
   ========================================================================== */

const STORAGE_KEY = 'koshelek_data';
const THEME_KEY = 'koshelek_theme';
const AI_KEY = 'koshelek_ai_key';
const AI_PROVIDER_KEY = 'koshelek_ai_provider';
const AI_URL_KEY = 'koshelek_ai_url';
const AI_MODEL_KEY = 'koshelek_ai_model';
const ACCOUNTS_KEY = 'koshelek_accounts';
const PROMO_KEY = 'koshelek_promo_visible';

const DEFAULT_CATEGORIES = {
  expense: [
    { id: 'e_prod', name: '🛒 Продукты', color: '#F6A65A', iconType: 'cart' },
    { id: 'e_net', name: '📶 Интернет', color: '#5BA8F0', iconType: 'wifi' },
    { id: 'e_taxi', name: '🚕 Такси', color: '#F2C94C', iconType: 'taxi' },
    { id: 'e1', name: '🍔 Еда', color: '#F48278', iconType: 'food' },
    { id: 'e2', name: '🚌 Транспорт', color: '#4FD1C5', iconType: 'taxi' },
    { id: 'e3', name: '🏠 Жильё', color: '#B794F4', iconType: 'home' },
    { id: 'e4', name: '💊 Здоровье', color: '#FF8FA3', iconType: 'health' },
    { id: 'e5', name: '🎮 Развлечения', color: '#8B8CF5', iconType: 'fun' },
    { id: 'e6', name: '👗 Одежда', color: '#E879C6', iconType: 'clothes' },
    { id: 'e7', name: '📦 Прочее', color: '#94A3B8', iconType: 'misc' }
  ],
  income: [
    { id: 'i1', name: '💼 Зарплата', color: '#67C992', iconType: 'salary' },
    { id: 'i2', name: '💻 Фриланс', color: '#4FD1C5', iconType: 'freelance' },
    { id: 'i3', name: '🎁 Подарок', color: '#F6A65A', iconType: 'gift' },
    { id: 'i4', name: '📈 Инвестиции', color: '#818CF8', iconType: 'invest' },
    { id: 'i5', name: '💵 Прочее', color: '#94A3B8', iconType: 'income' }
  ]
};

const DEFAULT_ACCOUNTS = [
  { id: 'default', name: 'По умолчанию', initialBalance: 0 }
];

const nowInit = new Date();

let state = {
  transactions: [],
  categories: { expense: [], income: [] },
  accounts: [...DEFAULT_ACCOUNTS],
  activeNav: 'expense',       // v5: 'expense' | 'income' | 'analytics'
  activeTab: 'expense',       // Тип операций на главном экране: 'expense' | 'income'
  catDialogTab: 'expense',    // Для диалога категорий: 'expense' | 'income'
  analyticsType: 'expense',   // Для вкладки Аналитика: 'expense' | 'income'
  txModalMode: 'expense',     // Для диалога Новая транзакция: 'expense' | 'income' | 'transfer'
  txPaid: true,               // Статус «Оплачено» в диалоге транзакции
  txGroupingMode: 'day',      // 'day' (по референсу) или 'year_month' (по календарю)
  selectedYear: nowInit.getFullYear(),
  selectedMonth: nowInit.getMonth(),
  periodScope: 'month',       // 'month' | 'all'
  editingId: null,
  filtersOpen: false,
  dashFiltersOpen: false,
  viewMode: 'list',
  collapsedYears: new Set(),
  collapsedMonths: new Set(),
  collapsedYearsDetail: new Set(),
  aiChatHistory: [],
  filters: { search: '', category: 'all', sort: 'date_desc', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' },
  dashFilters: { search: '', category: 'all', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' },
  user: null,
  syncQueue: [],
  _isSyncing: false,
  promoVisible: true
};

/* ===== ДАННЫЕ ИЗ РЕФЕРЕНСА (-1 182,00 ₽: Продукты 525, Интернет 450, Такси 207) ===== */
function buildRefDataTxs() {
  const y = state.selectedYear;
  const m = String(state.selectedMonth + 1).padStart(2, '0');
  return [
    {
      id: 'ref-tx-1',
      type: 'expense',
      amount: 525,
      categoryId: 'e_prod',
      date: `${y}-${m}-04`,
      comment: '',
      accountId: 'default',
      paid: true,
      recurrence: 'none'
    },
    {
      id: 'ref-tx-2',
      type: 'expense',
      amount: 207,
      categoryId: 'e_taxi',
      date: `${y}-${m}-04`,
      comment: 'Вике',
      accountId: 'default',
      paid: true,
      recurrence: 'none'
    },
    {
      id: 'ref-tx-3',
      type: 'expense',
      amount: 450,
      categoryId: 'e_net',
      date: `${y}-${m}-01`,
      comment: '',
      accountId: 'default',
      paid: false,
      recurrence: 'none'
    }
  ];
}

function loadRefData() {
  ensureRefCategories();
  state.transactions = buildRefDataTxs();
  state.balanceAdjustment = 0;
  saveData();
  render();
  const d = document.getElementById('settingsDialog');
  if (d && d.open) d.close();
  showToast('🌸 Загружены данные из референса (-1 182,00 ₽)');
}

function ensureRefCategories() {
  ['expense', 'income'].forEach(type => {
    DEFAULT_CATEGORIES[type].forEach(defCat => {
      if (!state.categories[type].some(c => c.id === defCat.id)) {
        state.categories[type].unshift({ ...defCat });
      }
    });
  });
}

/* ===== ДЕМО-ДАННЫЕ (РЫБА — 50 ТРАНЗАКЦИЙ) ===== */
function buildDemoDataTxs() {
  const txs = [];
  const now = new Date();

  const subDays = (d, days) => {
    const res = new Date(d);
    res.setDate(res.getDate() - days);
    return res.toISOString().slice(0, 10);
  };

  const cats = {
    expense: { prod: 'e_prod', net: 'e_net', taxi: 'e_taxi', food: 'e1', transport: 'e2', rent: 'e3', health: 'e4', fun: 'e5', clothes: 'e6' },
    income: { salary: 'i1', freelance: 'i2', gift: 'i3', invest: 'i4' }
  };

  for (let i = 0; i < 6; i++) {
    txs.push({
      id: 'demo-sal-' + i,
      type: 'income',
      amount: 65000,
      categoryId: cats.income.salary,
      date: subDays(now, i * 15 + 5),
      comment: 'Основная зарплата',
      accountId: 'default',
      paid: true
    });
  }

  for (let i = 0; i < 3; i++) {
    txs.push({
      id: 'demo-free-' + i,
      type: 'income',
      amount: i === 0 ? 32000 : 25000,
      categoryId: cats.income.freelance,
      date: subDays(now, i * 30 + 12),
      comment: 'Разработка PWA приложения',
      accountId: 'default',
      paid: true
    });
  }

  for (let i = 0; i < 3; i++) {
    txs.push({
      id: 'demo-rent-' + i,
      type: 'expense',
      amount: 38000,
      categoryId: cats.expense.rent,
      date: subDays(now, i * 30 + 26),
      comment: 'Аренда квартиры и коммунальные',
      accountId: 'default',
      paid: true
    });
  }

  const foodComments = ['Супермаркет ВкусВилл', 'Продукты домой', 'Обед в кафе', 'Кофе и десерт', 'Доставка продуктов'];
  const foodAmounts = [525, 2400, 4800, 650, 280, 1800, 3200];
  for (let i = 0; i < 20; i++) {
    txs.push({
      id: 'demo-food-' + i,
      type: 'expense',
      amount: foodAmounts[i % foodAmounts.length],
      categoryId: i % 2 === 0 ? cats.expense.prod : cats.expense.food,
      date: subDays(now, i * 3 + 1),
      comment: foodComments[i % foodComments.length],
      accountId: 'default',
      paid: true
    });
  }

  const transComments = ['Вике', 'Такси по городу', 'Пополнение Тройки', 'Каршеринг'];
  const transAmounts = [207, 650, 1000, 450];
  for (let i = 0; i < 10; i++) {
    txs.push({
      id: 'demo-trans-' + i,
      type: 'expense',
      amount: transAmounts[i % transAmounts.length],
      categoryId: cats.expense.taxi,
      date: subDays(now, i * 7 + 2),
      comment: transComments[i % transComments.length],
      accountId: 'default',
      paid: true
    });
  }

  txs.push({ id: 'demo-net-1', type: 'expense', amount: 450, categoryId: cats.expense.net, date: subDays(now, 3), comment: 'Домашний интернет', accountId: 'default', paid: false });
  txs.push({ id: 'demo-health-1', type: 'expense', amount: 3200, categoryId: cats.expense.health, date: subDays(now, 14), comment: 'Витамины и аптека', accountId: 'default', paid: true });
  txs.push({ id: 'demo-clothes-1', type: 'expense', amount: 8500, categoryId: cats.expense.clothes, date: subDays(now, 8), comment: 'Кроссовки', accountId: 'default', paid: true });
  txs.push({ id: 'demo-invest-1', type: 'income', amount: 4500, categoryId: cats.income.invest, date: subDays(now, 20), comment: 'Дивиденды по акциям', accountId: 'default', paid: true });

  return txs;
}

function loadDemoData() {
  ensureRefCategories();
  state.transactions = buildDemoDataTxs();
  saveData();
  render();
  const d = document.getElementById('settingsDialog');
  if (d && d.open) d.close();
  showToast('🪄 Загружено 50 демо-транзакций!');
}

/* ===== ВЕКТОРНЫЕ ИКОНКИ КАТЕГОРИЙ В ПАСТЕЛЬНЫХ КРУЖКАХ (ПО РЕФЕРЕНСУ) ===== */
function getCategorySvgIcon(catName, iconType) {
  const lower = (catName || '').toLowerCase();
  if (iconType === 'cart' || lower.includes('продукт') || lower.includes('покупк') || lower.includes('маркет')) {
    return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"></circle><circle cx="19" cy="20" r="1.5"></circle><path d="M2 3h3l2.4 11.5a2 2 0 0 0 2 1.5h9.2a2 2 0 0 0 2-1.5L22 7H6"></path></svg>`;
  }
  if (iconType === 'wifi' || lower.includes('интернет') || lower.includes('связь') || lower.includes('wi-fi')) {
    return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`;
  }
  if (iconType === 'taxi' || lower.includes('такси') || lower.includes('транспорт') || lower.includes('траспорт') || lower.includes('авто') || lower.includes('метро')) {
    return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14v-5l-2-6H7L5 12v5z"></path><circle cx="7.5" cy="14.5" r="1.2" fill="#ffffff"></circle><circle cx="16.5" cy="14.5" r="1.2" fill="#ffffff"></circle><path d="M10 6V4h4v2"></path><line x1="6" y1="17" x2="6" y2="19"></line><line x1="18" y1="17" x2="18" y2="19"></line></svg>`;
  }
  if (iconType === 'home' || lower.includes('жиль') || lower.includes('дом') || lower.includes('аренд')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
  }
  if (iconType === 'salary' || lower.includes('зарплат') || lower.includes('доход')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
  }
  const em = extractIcon(catName);
  if (em) {
    return `<span style="font-size:17px; line-height:1;">${em}</span>`;
  }
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"></circle></svg>`;
}

function catEmoji(name) {
  const m = (name || '').match(/^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/u);
  return m ? m[0] : null;
}
const CAT_FALLBACK_COLORS = ['#F6A65A','#5BA8F0','#F2C94C','#F48278','#4FD1C5','#B794F4','#FF8FA3','#8B8CF5','#E879C6','#6FCF97'];
function catColorOf(cat) {
  if (cat && cat.color) return cat.color;
  const s = String((cat && (cat.id || cat.name)) || '');
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_FALLBACK_COLORS[h % CAT_FALLBACK_COLORS.length];
}
function renderCatBadgeHTML(cat, extraClass = '') {
  const color = catColorOf(cat);
  const em = cat ? catEmoji(cat.name) : null;
  const inner = em ? `<span class="cat-emoji">${em}</span>` : getCategorySvgIcon(cat ? cat.name : '', cat ? cat.iconType : '');
  return `<div class="pastel-cat-badge ${extraClass}" style="background:${color}; --cat-color:${color}">${inner}</div>`;
}

function cleanCatTitle(name) {
  const em = catEmoji(name);
  const t = em ? name.slice(em.length) : (name || '');
  return t.trim() || name || 'Без категории';
}

/* ===== БЫСТРЫЕ ШАБЛОНЫ ===== */
function renderTemplates() {
  const container = document.getElementById('quickTemplates');
  if (!container) return;

  if (!state.templates) {
    state.templates = JSON.parse(localStorage.getItem('koshelek_templates')) || [
      { id: 't1', name: '🛒 Продукты', type: 'expense', categoryId: 'e_prod', comment: 'Супермаркет' },
      { id: 't2', name: '🚕 Такси', type: 'expense', categoryId: 'e_taxi', comment: 'Поездка' },
      { id: 't3', name: '💼 Зарплата', type: 'income', categoryId: 'i1', comment: 'Зарплата' }
    ];
  }

  const flowType = state.activeTab === 'income' ? 'income' : 'expense';
  const tplHtml = state.templates.filter(t => (t.type || 'expense') === flowType).map(t => {
    const amt = parseFloat(t.amount) > 0 ? `<b class="tpl-amt">${escapeHtml(fmt(parseFloat(t.amount)).replace(/,00(?=\s)/, ''))}</b>` : '';
    return `<div class="template-chip ${t.type === 'income' ? 'income' : ''}" data-id="${escapeHtml(t.id)}">
      <button class="template-chip-btn" type="button" data-id="${escapeHtml(t.id)}">
        <span>${escapeHtml(t.name)}</span>${amt}
      </button>
      <button class="template-chip-delete" type="button" data-id="${escapeHtml(t.id)}" title="Удалить кнопку">×</button>
    </div>`;
  }).join('');

  // Автоматические «частые» категории, которых нет среди шаблонов
  const usedCats = new Set(state.templates.map(t => t.categoryId));
  const autoCats = getCategoriesByUsage(flowType).filter(c => !usedCats.has(c.id)).slice(0, 4);
  const autoHtml = autoCats.map(c => `<button type="button" class="template-chip auto" data-auto-cat="${escapeHtml(c.id)}">
      <span class="template-chip-btn"><span>${escapeHtml(c.name)}</span></span>
    </button>`).join('');

  container.innerHTML = tplHtml + autoHtml || '<span class="templates-empty">Откройте любую запись и нажмите ⭐ — она станет кнопкой</span>';

  container.querySelectorAll('.template-chip-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', () => applyTemplate(btn.dataset.id));
  });
  container.querySelectorAll('.template-chip-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTemplate(btn.dataset.id);
    });
  });
  container.querySelectorAll('[data-auto-cat]').forEach(btn => {
    btn.addEventListener('click', () => openAddDialog(flowType, btn.dataset.autoCat));
  });
}

function applyTemplate(id) {
  const t = (state.templates || []).find(x => x.id === id);
  if (!t) return;

  const catOk = state.categories[t.type]?.some(c => c.id === t.categoryId);
  const amt = parseFloat(t.amount);
  // Есть сохранённая сумма — записываем в 1 касание (отмена в уведомлении)
  if (catOk && amt > 0) {
    addTxQuick({ type: t.type, amount: amt, categoryId: t.categoryId, comment: t.comment || '' });
    return;
  }

  openAddDialog(t.type);
  const catSel = document.getElementById('txCategory');
  if (catSel && catOk) {
    catSel.value = t.categoryId;
    renderTxQuickCategoryBar();
  }
  const commentEl = document.getElementById('txComment');
  if (commentEl) commentEl.value = t.comment || '';
}

function saveAsTemplate(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;

  const cat = getCat(tx.type, tx.categoryId);
  const icon = extractIcon(cat.name) || (tx.type === 'expense' ? '🛒' : '💼');
  const name = cleanCatTitle(cat.name);

  const customName = prompt('Введите название для быстрого шаблона:', name);
  if (customName === null) return;

  const finalName = customName.trim() || name;
  const displayName = finalName.length > 16 ? finalName.slice(0, 15) + '…' : finalName;

  const newTemplate = {
    id: uid(),
    name: `${icon} ${displayName}`,
    type: tx.type,
    categoryId: tx.categoryId,
    comment: tx.comment || ''
  };
  if (tx.amount > 0 && confirm(`Запомнить сумму ${fmt(tx.amount)}? Тогда кнопка будет добавлять запись в одно касание.`)) {
    newTemplate.amount = tx.amount;
  }

  if (!state.templates) state.templates = [];
  state.templates.push(newTemplate);
  localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));
  renderTemplates();
  syncItem('templates', 'upsert', newTemplate);
  showToast('⭐ Сохранено в быстрые шаблоны!');
}

function deleteTemplate(id) {
  if (!state.templates) return;
  state.templates = state.templates.filter(t => t.id !== id);
  localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));
  renderTemplates();
  syncItem('templates', 'delete', { id });
  showToast('Шаблон удален');
}

/* ===== ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ SUPABASE ===== */
let supabaseClient = null;

async function initSupabase() {
  const url = localStorage.getItem('supabase_url') || '';
  const key = localStorage.getItem('supabase_key') || '';

  if (url && key && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        state.user = session.user;
        await onUserLoggedIn();
      } else {
        state.user = null;
        updateCloudUI();
      }
    } catch (e) {
      console.error('Supabase initialization failed', e);
      supabaseClient = null;
      state.user = null;
      updateCloudUI();
    }
  } else {
    supabaseClient = null;
    state.user = null;
    updateCloudUI();
  }
}

async function onUserLoggedIn() {
  if (!supabaseClient || !state.user) return;
  try {
    showToast('☁️ Подключение успешно. Синхронизируем...');
    const [
      { data: cloudTxs, error: txErr },
      { data: cloudCats, error: catErr },
      { data: cloudProfile, error: profErr },
      { data: cloudTemplates, error: tempErr },
      { data: cloudAiSessions, error: aiErr }
    ] = await Promise.all([
      supabaseClient.from('transactions').select('*').eq('user_id', state.user.id),
      supabaseClient.from('categories').select('*').eq('user_id', state.user.id),
      supabaseClient.from('profiles').select('*').eq('id', state.user.id).maybeSingle(),
      supabaseClient.from('templates').select('*').eq('user_id', state.user.id),
      supabaseClient.from('ai_sessions').select('*').eq('user_id', state.user.id)
    ]);

    if (txErr) throw txErr;
    if (catErr) throw catErr;
    if (profErr) throw profErr;
    if (tempErr) throw tempErr;
    if (aiErr) throw aiErr;

    const localTxs = [...state.transactions];
    const localCats = {
      expense: [...state.categories.expense],
      income: [...state.categories.income]
    };
    const localTemplates = state.templates ? [...state.templates] : [];
    const localAiSessions = state.aiSessions ? [...state.aiSessions] : [];
    const syncPromises = [];

    const mergedCats = { expense: [], income: [] };
    const cloudCatIds = new Set((cloudCats || []).filter(c => c && c.id).map(c => c.id));
    (cloudCats || []).forEach(c => {
      if (c && c.type && mergedCats[c.type]) {
        mergedCats[c.type].push({ id: c.id, name: c.name, color: c.color });
      }
    });

    ['expense', 'income'].forEach(type => {
      localCats[type].forEach(lc => {
        if (!lc) return;
        const isDefault = DEFAULT_CATEGORIES[type].some(dc => dc.id === lc.id);
        if (!cloudCatIds.has(lc.id)) {
          mergedCats[type].push(lc);
          if (!isDefault) {
            syncPromises.push(syncItem('categories', 'upsert', { id: lc.id, type, name: lc.name, color: lc.color }));
          }
        }
      });
    });
    state.categories = mergedCats;

    const mergedTxs = [];
    const cloudTxIds = new Set((cloudTxs || []).filter(t => t && t.id).map(t => t.id));
    (cloudTxs || []).forEach(t => {
      if (t) {
        mergedTxs.push({
          id: t.id,
          type: t.type,
          amount: parseFloat(t.amount) || 0,
          categoryId: t.category_id,
          date: t.date,
          comment: t.comment || '',
          accountId: 'default',
          paid: true
        });
      }
    });
    localTxs.forEach(lt => {
      if (lt && !cloudTxIds.has(lt.id)) {
        mergedTxs.push(lt);
        syncPromises.push(syncItem('transactions', 'upsert', lt));
      }
    });
    state.transactions = mergedTxs;

    if (cloudProfile) {
      state.balanceAdjustment = parseFloat(cloudProfile.balance_adjustment) || 0;
    } else {
      const localAdj = state.balanceAdjustment || 0;
      syncPromises.push(syncItem('profiles', 'upsert', { balanceAdjustment: localAdj }));
    }

    const mergedTemplates = [];
    const cloudTempIds = new Set((cloudTemplates || []).filter(t => t && t.id).map(t => t.id));
    (cloudTemplates || []).forEach(t => {
      if (t) {
        mergedTemplates.push({
          id: t.id,
          name: t.name,
          type: t.type,
          categoryId: t.category_id,
          comment: t.comment || ''
        });
      }
    });
    localTemplates.forEach(lt => {
      if (lt && !cloudTempIds.has(lt.id)) {
        mergedTemplates.push(lt);
        syncPromises.push(syncItem('templates', 'upsert', lt));
      }
    });
    state.templates = mergedTemplates;
    localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));

    const mergedAiSessions = [];
    const cloudAiIds = new Set((cloudAiSessions || []).filter(a => a && a.id).map(a => a.id));
    (cloudAiSessions || []).forEach(a => {
      if (a) {
        mergedAiSessions.push({ id: a.id, date: a.date, title: a.title, history: a.history || [] });
      }
    });
    localAiSessions.forEach(la => {
      if (la && !cloudAiIds.has(la.id)) {
        mergedAiSessions.push(la);
        syncPromises.push(syncItem('ai_sessions', 'upsert', la));
      }
    });
    state.aiSessions = mergedAiSessions;
    localStorage.setItem('koshelek_ai_sessions', JSON.stringify(state.aiSessions));

    saveData();
    render();
    renderTemplates();
    await Promise.all(syncPromises);
    await drainSyncQueue();
    updateCloudUI();
    showToast('✨ Синхронизация с облаком успешна!');
  } catch (err) {
    console.error('Error during cloud merger:', err);
    showToast(`Ошибка синхронизации: ${err.message || err}`);
  }
}

function onUserLoggedOut() {
  loadData();
  render();
  renderTemplates();
}

function updateCloudUI() {
  const badge = document.getElementById('cloudStatusBadge');
  const userStatus = document.getElementById('cloudUserStatus');
  const dbAuthFormBlock = document.getElementById('dbAuthFormBlock');
  const dbLoggedInBlock = document.getElementById('dbLoggedInBlock');
  const userEmailDisplay = document.getElementById('supabaseUserEmailDisplay');
  const summaryEl = document.getElementById('dbSettingsSummary');
  const detailsEl = summaryEl ? summaryEl.closest('details') : null;

  const url = localStorage.getItem('supabase_url') || '';
  const key = localStorage.getItem('supabase_key') || '';
  const urlInput = document.getElementById('supabaseUrlInput');
  const keyInput = document.getElementById('supabaseKeyInput');
  if (urlInput && !urlInput.value) urlInput.value = url;
  if (keyInput && !keyInput.value) keyInput.value = key;

  if (state.user) {
    if (badge) {
      badge.className = 'status-badge cloud';
      badge.title = `Облако Supabase подключено (${state.user.email}).`;
    }
    if (userStatus) {
      userStatus.innerHTML = `<span>Режим: <strong style="color: var(--mint);">Облако подключено</strong></span>`;
    }
    if (dbAuthFormBlock) dbAuthFormBlock.style.display = 'none';
    if (dbLoggedInBlock) dbLoggedInBlock.style.display = 'flex';
    if (userEmailDisplay) userEmailDisplay.textContent = state.user.email || 'Supabase User';
    const localWarningCard = document.getElementById('localWarningCard');
    if (localWarningCard) localWarningCard.remove();
  } else {
    if (badge) {
      badge.className = 'status-badge local';
      badge.title = 'Локальный режим. Нажмите, чтобы подключить облако.';
    }
    if (userStatus) {
      userStatus.innerHTML = `<span>Режим: <strong>Локальный кошелёк (Offline)</strong></span>`;
    }
    if (dbAuthFormBlock) dbAuthFormBlock.style.display = 'flex';
    if (dbLoggedInBlock) dbLoggedInBlock.style.display = 'none';
    if (detailsEl) detailsEl.open = !(url && key);
    renderLocalWarningCard();
  }
}

function renderLocalWarningCard() {
  const existing = document.getElementById('localWarningCard');
  if (existing) existing.remove();
  if (state.user) return;
  // v5: напоминание об облаке убрано из списка — статус облака виден в настройках
  return;
  const list = document.getElementById('transactionList');
  if (!list) return;

  const card = document.createElement('div');
  card.id = 'localWarningCard';
  card.className = 'local-warning-card';
  card.innerHTML = `
    <div class="local-warning-title">☁️ Ваши данные хранятся локально</div>
    <div class="local-warning-text">
      Подключите бесплатное облако Supabase в настройках, чтобы синхронизировать записи между устройствами.
    </div>
    <button type="button" id="localWarningAuthBtn" class="pill-outline-btn sm">Настроить облако</button>
  `;
  list.appendChild(card);

  const warnAuthBtn = document.getElementById('localWarningAuthBtn');
  if (warnAuthBtn) {
    warnAuthBtn.addEventListener('click', () => {
      openSettingsDialog();
    });
  }
}

async function handleAuthAction(actionType) {
  const email = document.getElementById('supabaseEmailInput').value.trim();
  const password = document.getElementById('supabasePasswordInput').value.trim();
  let url = document.getElementById('supabaseUrlInput').value.trim() || localStorage.getItem('supabase_url') || '';
  let key = document.getElementById('supabaseKeyInput').value.trim() || localStorage.getItem('supabase_key') || '';

  if (!url || !key) {
    showToast('Укажите URL и Key базы данных Supabase');
    const details = document.getElementById('dbSettingsSummary')?.closest('details');
    if (details) details.open = true;
    return;
  }
  if (!email || !password) {
    showToast('Введите Email и Пароль');
    return;
  }

  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_key', key);
  try {
    supabaseClient = window.supabase.createClient(url, key);
  } catch {
    showToast('Ошибка инициализации Supabase. Проверьте URL и Key.');
    return;
  }

  const loginBtn = document.getElementById('supabaseLoginBtn');
  const regBtn = document.getElementById('supabaseRegisterBtn');
  if (loginBtn) loginBtn.disabled = true;
  if (regBtn) regBtn.disabled = true;

  try {
    if (actionType === 'login') {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.user = data.user;
      await onUserLoggedIn();
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && data.session) {
        state.user = data.user;
        await onUserLoggedIn();
      } else {
        showToast('✉️ Подтвердите регистрацию по ссылке на почте!');
      }
    }
    document.getElementById('supabaseEmailInput').value = '';
    document.getElementById('supabasePasswordInput').value = '';
  } catch (err) {
    showToast(`Ошибка: ${err.message || err}`);
  } finally {
    if (loginBtn) loginBtn.disabled = false;
    if (regBtn) regBtn.disabled = false;
  }
}

async function handleSupabaseLogout() {
  if (!confirm('Выйти из облачного аккаунта?')) return;
  if (supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch {}
  }
  state.user = null;
  onUserLoggedOut();
  updateCloudUI();
  showToast('Вы вышли из облачного аккаунта');
}

async function handleFullDisconnect() {
  if (!confirm('Полностью отключить облачную синхронизацию и удалить параметры БД?')) return;
  if (supabaseClient && state.user) {
    try { await supabaseClient.auth.signOut(); } catch {}
  }
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabaseClient = null;
  state.user = null;
  onUserLoggedOut();
  updateCloudUI();
  const urlEl = document.getElementById('supabaseUrlInput');
  if (urlEl) urlEl.value = '';
  const keyEl = document.getElementById('supabaseKeyInput');
  if (keyEl) keyEl.value = '';
  showToast('Облачные параметры сброшены');
}

async function syncItem(table, action, data) {
  if (!supabaseClient || !state.user) return;
  try {
    if (table === 'profiles' && action === 'upsert') {
      const { error } = await supabaseClient.from('profiles').upsert({
        id: state.user.id,
        balance_adjustment: data.balanceAdjustment,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
    } else if (table === 'categories') {
      if (action === 'upsert') {
        const { error } = await supabaseClient.from('categories').upsert({
          id: data.id, user_id: state.user.id, name: data.name, color: data.color, type: data.type
        });
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabaseClient.from('categories').delete().eq('id', data.id).eq('user_id', state.user.id);
        if (error) throw error;
      }
    } else if (table === 'transactions') {
      if (action === 'upsert') {
        const { error } = await supabaseClient.from('transactions').upsert({
          id: data.id, user_id: state.user.id, type: data.type, amount: data.amount,
          category_id: data.categoryId, date: data.date, comment: data.comment || ''
        });
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabaseClient.from('transactions').delete().eq('id', data.id).eq('user_id', state.user.id);
        if (error) throw error;
      }
    } else if (table === 'templates') {
      if (action === 'upsert') {
        const { error } = await supabaseClient.from('templates').upsert({
          id: data.id, user_id: state.user.id, name: data.name, type: data.type,
          category_id: data.categoryId, comment: data.comment || ''
        });
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabaseClient.from('templates').delete().eq('id', data.id).eq('user_id', state.user.id);
        if (error) throw error;
      }
    } else if (table === 'ai_sessions') {
      if (action === 'upsert') {
        const { error } = await supabaseClient.from('ai_sessions').upsert({
          id: data.id, user_id: state.user.id, title: data.title, history: data.history, date: data.date
        });
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabaseClient.from('ai_sessions').delete().eq('id', data.id).eq('user_id', state.user.id);
        if (error) throw error;
      }
    }
  } catch (err) {
    queueSync(table, action, data);
  }
}

function queueSync(table, action, data) {
  if (!state.syncQueue) state.syncQueue = [];
  const id = data.id || state.user?.id;
  state.syncQueue = state.syncQueue.filter(q => !(q.table === table && (q.data.id === id || q.data.balanceAdjustment !== undefined)));
  state.syncQueue.push({ table, action, data, timestamp: Date.now() });
  localStorage.setItem('koshelek_sync_queue', JSON.stringify(state.syncQueue));
}

async function drainSyncQueue() {
  if (!supabaseClient || !state.user || !navigator.onLine || state._isSyncing) return;
  const queue = JSON.parse(localStorage.getItem('koshelek_sync_queue')) || [];
  if (!queue.length) return;

  state._isSyncing = true;
  state.syncQueue = [];
  localStorage.setItem('koshelek_sync_queue', JSON.stringify([]));
  try {
    for (const item of queue) {
      await syncItem(item.table, item.action, item.data);
    }
    showToast('🔄 Облачная синхронизация завершена!');
  } finally {
    state._isSyncing = false;
  }
}

window.addEventListener('online', async () => {
  showToast('🔌 Соединение восстановлено. Синхронизирую...');
  await drainSyncQueue();
});

/* ===== ХРАНЕНИЕ ДАННЫХ (PERSISTENCE) ===== */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.transactions = (saved.transactions || []).map(tx => ({
        ...tx,
        accountId: tx.accountId || 'default',
        paid: tx.paid !== undefined ? tx.paid : true,
        recurrence: tx.recurrence || 'none'
      }));
      state.categories = {
        expense: saved.categories?.expense?.length ? saved.categories.expense : [...DEFAULT_CATEGORIES.expense],
        income: saved.categories?.income?.length ? saved.categories.income : [...DEFAULT_CATEGORIES.income]
      };
      // Исправляем старую опечатку «Траспорт» -> «Транспорт» и добавляем референс-категории
      state.categories.expense.forEach(c => {
        if (c.name && c.name.includes('Траспорт')) {
          c.name = c.name.replace('Траспорт', 'Транспорт');
        }
      });
      ensureRefCategories();
      state.balanceAdjustment = saved.balanceAdjustment || 0;
    } else {
      state.categories = {
        expense: [...DEFAULT_CATEGORIES.expense],
        income: [...DEFAULT_CATEGORIES.income]
      };
      state.balanceAdjustment = 0;
      // По умолчанию загружаем транзакции из референса (-1 182,00 ₽)
      state.transactions = buildRefDataTxs();
      saveData();
    }

    const savedAccounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
    state.accounts = (savedAccounts && savedAccounts.length) ? savedAccounts : [...DEFAULT_ACCOUNTS];

    const savedObj = raw ? JSON.parse(raw) : {};
    if (!localStorage.getItem(AI_KEY) && savedObj.aiApiKey) {
      localStorage.setItem(AI_KEY, savedObj.aiApiKey);
    }
    state.aiProvider = localStorage.getItem(AI_PROVIDER_KEY) || savedObj.aiProvider || 'google';
    state.aiApiUrl = localStorage.getItem(AI_URL_KEY) || savedObj.aiApiUrl || '';
    state.aiModel = localStorage.getItem(AI_MODEL_KEY) || savedObj.aiModel || 'gemini-2.5-flash';

    // Синхронизируем поля настроек ИИ в DOM сразу при загрузке
    const providerEl = document.getElementById('aiProvider');
    if (providerEl) providerEl.value = state.aiProvider;
    const urlEl = document.getElementById('aiApiUrl');
    if (urlEl) urlEl.value = state.aiApiUrl;
    const modelEl = document.getElementById('aiModel');
    if (modelEl) modelEl.value = state.aiModel;
    const keyEl = document.getElementById('aiApiKey');
    if (keyEl) keyEl.value = localStorage.getItem(AI_KEY) || '';
    updateAiSettingsStatusUI();

    state.aiSessions = JSON.parse(localStorage.getItem('koshelek_ai_sessions')) || [];
    state.currentAiSessionId = null;
    state.syncQueue = JSON.parse(localStorage.getItem('koshelek_sync_queue')) || [];
  } catch {
    state.categories = { expense: [...DEFAULT_CATEGORIES.expense], income: [...DEFAULT_CATEGORIES.income] };
    state.accounts = [...DEFAULT_ACCOUNTS];
    state.balanceAdjustment = 0;
    state.transactions = buildRefDataTxs();
  }
}

const OLD_DEFAULT_COLORS = { e_prod:'#F5BD7A', e_net:'#F48278', e_taxi:'#F5BD7A', e2:'#F5BD7A', e4:'#F687B3', e5:'#76A9FA', e6:'#F472B6', i3:'#F5BD7A' };
function migrateCatColors() {
  let changed = false;
  ['expense', 'income'].forEach(type => {
    (state.categories[type] || []).forEach(c => {
      const def = DEFAULT_CATEGORIES[type].find(d => d.id === c.id);
      if (def && OLD_DEFAULT_COLORS[c.id] && c.color === OLD_DEFAULT_COLORS[c.id] && def.color !== c.color) {
        c.color = def.color; changed = true;
      }
    });
  });
  if (changed) saveData();
}

function saveDataInternal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    transactions: state.transactions,
    categories: state.categories,
    balanceAdjustment: state.balanceAdjustment || 0,
    aiProvider: state.aiProvider || localStorage.getItem(AI_PROVIDER_KEY) || 'google',
    aiModel: state.aiModel || localStorage.getItem(AI_MODEL_KEY) || 'gemini-2.5-flash',
    aiApiUrl: state.aiApiUrl || localStorage.getItem(AI_URL_KEY) || '',
    aiApiKey: localStorage.getItem(AI_KEY) || ''
  }));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state.accounts));
}

function saveData() {
  saveDataInternal();
  scheduleServerSync();
}

/* ===== СЕРВЕРНАЯ АВТОРИЗАЦИЯ И ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (traty.danywalery.cfd) ===== */
const AUTH_TOKEN_KEY = 'traty_auth_token';
const AUTH_USER_KEY = 'traty_user';

let currentAuthMode = 'login'; // 'login' | 'register'
let currentAuthEmail = '';
let syncDebounceTimer = null;

function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

function setAuthToken(token) {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch {}
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setStoredUser(user) {
  try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); } catch {}
}

function clearAuth() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {}
}

function showAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');

  // Reset to Step 1
  const stepEmail = document.getElementById('authStepEmailForm');
  const stepPassword = document.getElementById('authStepPasswordForm');
  const emailErr = document.getElementById('authEmailError');
  const passErr = document.getElementById('authPasswordError');
  if (stepEmail) stepEmail.style.display = 'block';
  if (stepPassword) stepPassword.style.display = 'none';
  if (emailErr) { emailErr.style.display = 'none'; emailErr.textContent = ''; }
  if (passErr) { passErr.style.display = 'none'; passErr.textContent = ''; }

  const emailInput = document.getElementById('authEmailInput');
  if (emailInput) {
    if (!emailInput.value) {
      const stored = getStoredUser();
      if (stored?.email) emailInput.value = stored.email;
    }
    setTimeout(() => emailInput.focus(), 150);
  }

  // Load server visitor / user stats
  fetch('/api/stats')
    .then(r => r.json())
    .then(d => {
      const textEl = document.getElementById('authServerStatsText');
      if (textEl && d.totalUsers !== undefined) {
        textEl.textContent = `🔒 Сервер traty.danywalery.cfd · Пользователей: ${d.totalUsers}`;
      }
    })
    .catch(() => {});
}

function hideAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.classList.add('hidden');
}

function updateProfileUI() {
  const user = getStoredUser();
  const emailEl = document.getElementById('profileUserEmail');
  const avatarEl = document.getElementById('profileAvatarLetter');
  const totalUsersEl = document.getElementById('profileTotalUsersCount');

  if (user && user.email) {
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl) avatarEl.textContent = (user.email[0] || 'U').toUpperCase();
  } else {
    if (emailEl) emailEl.textContent = 'Не авторизован';
    if (avatarEl) avatarEl.textContent = '?';
  }

  fetch('/api/stats')
    .then(r => r.json())
    .then(d => {
      if (totalUsersEl && d.totalUsers !== undefined) {
        totalUsersEl.textContent = d.totalUsers;
      }
    })
    .catch(() => {});
}

function getAppSyncPayload() {
  return {
    transactions: state.transactions || [],
    categories: state.categories || { expense: [], income: [] },
    accounts: state.accounts || [],
    balanceAdjustment: state.balanceAdjustment || 0,
    templates: state.templates || JSON.parse(localStorage.getItem('koshelek_templates') || '[]'),
    aiSessions: state.aiSessions || JSON.parse(localStorage.getItem('koshelek_ai_sessions') || '[]'),
    aiSettings: {
      provider: state.aiProvider || 'google',
      model: state.aiModel || 'gemini-2.5-flash',
      apiUrl: state.aiApiUrl || '',
      apiKey: localStorage.getItem(AI_KEY) || ''
    },
    version: 1,
    clientUpdatedAt: new Date().toISOString()
  };
}

function applyAppSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  let changed = false;
  if (Array.isArray(payload.transactions)) {
    state.transactions = payload.transactions;
    changed = true;
  }
  if (payload.categories && Array.isArray(payload.categories.expense) && Array.isArray(payload.categories.income)) {
    state.categories = payload.categories;
    changed = true;
  }
  if (Array.isArray(payload.accounts) && payload.accounts.length) {
    state.accounts = payload.accounts;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state.accounts));
    changed = true;
  }
  if (typeof payload.balanceAdjustment === 'number') {
    state.balanceAdjustment = payload.balanceAdjustment;
    changed = true;
  }
  if (Array.isArray(payload.templates)) {
    state.templates = payload.templates;
    localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));
    if (typeof renderTemplates === 'function') renderTemplates();
  }
  if (Array.isArray(payload.aiSessions)) {
    state.aiSessions = payload.aiSessions;
    localStorage.setItem('koshelek_ai_sessions', JSON.stringify(state.aiSessions));
  }
  if (payload.aiSettings && typeof payload.aiSettings === 'object') {
    if (payload.aiSettings.apiKey !== undefined) {
      localStorage.setItem(AI_KEY, payload.aiSettings.apiKey);
      const kEl = document.getElementById('aiApiKey');
      if (kEl) kEl.value = payload.aiSettings.apiKey;
    }
    if (payload.aiSettings.provider) {
      state.aiProvider = payload.aiSettings.provider;
      localStorage.setItem(AI_PROVIDER_KEY, state.aiProvider);
      const pEl = document.getElementById('aiProvider');
      if (pEl) pEl.value = state.aiProvider;
    }
    if (payload.aiSettings.model) {
      state.aiModel = payload.aiSettings.model;
      localStorage.setItem(AI_MODEL_KEY, state.aiModel);
      const mEl = document.getElementById('aiModel');
      if (mEl) mEl.value = state.aiModel;
    }
    if (payload.aiSettings.apiUrl !== undefined) {
      state.aiApiUrl = payload.aiSettings.apiUrl;
      localStorage.setItem(AI_URL_KEY, state.aiApiUrl);
      const uEl = document.getElementById('aiApiUrl');
      if (uEl) uEl.value = state.aiApiUrl;
    }
    if (typeof updateAiSettingsStatusUI === 'function') updateAiSettingsStatusUI();
  }
  if (changed) {
    saveDataInternal();
    if (typeof render === 'function') render();
  }
  return true;
}

async function fetchServerData() {
  const token = getAuthToken();
  if (!token) return;
  const statusEl = document.getElementById('profileServerStatus');
  if (statusEl) statusEl.textContent = '🔄 traty.danywalery.cfd (Синхронизация...)';

  try {
    const res = await fetch('/api/data', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
      clearAuth();
      showAuthOverlay();
      return;
    }
    if (!res.ok) throw new Error('Ошибка HTTP ' + res.status);
    const result = await res.json();
    const serverPayload = result.data;

    const hasServerData = serverPayload &&
      ((Array.isArray(serverPayload.transactions) && serverPayload.transactions.length > 0) ||
       (serverPayload.categories && serverPayload.categories.expense?.length > 0));

    if (hasServerData) {
      applyAppSyncPayload(serverPayload);
      if (statusEl) {
        const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        statusEl.textContent = `🟢 traty.danywalery.cfd (${time})`;
      }
    } else {
      if (state.transactions && state.transactions.length > 0) {
        await syncDataToServer(false);
      } else if (statusEl) {
        statusEl.textContent = '🟢 traty.danywalery.cfd (Синхронизировано)';
      }
    }
  } catch (err) {
    console.warn('Server fetch error:', err);
    if (statusEl) statusEl.textContent = '🟠 Офлайн (сохранено на телефоне)';
  }
}

async function syncDataToServer(isManual = false) {
  const token = getAuthToken();
  if (!token) return;
  const statusEl = document.getElementById('profileServerStatus');
  if (statusEl) statusEl.textContent = '🔄 traty.danywalery.cfd (Сохранение...)';

  try {
    const payload = getAppSyncPayload();
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ data: payload })
    });

    if (res.status === 401) {
      clearAuth();
      showAuthOverlay();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || ('HTTP ' + res.status));
    }

    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (statusEl) statusEl.textContent = `🟢 traty.danywalery.cfd (${time})`;
    if (isManual) showToast('✅ Данные успешно сохранены на сервере');
  } catch (err) {
    console.warn('Sync to server failed:', err);
    if (statusEl) statusEl.textContent = '🟠 Офлайн (сохранено на телефоне)';
    if (isManual) showToast('⚠️ Нет связи с сервером. Сохранено локально.');
  }
}

function scheduleServerSync() {
  if (!getAuthToken()) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDataToServer(false);
  }, 1200);
}

async function handleEmailCheckSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('authEmailInput');
  const errEl = document.getElementById('authEmailError');
  const btn = document.getElementById('authEmailNextBtn');
  const email = (input?.value || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    if (errEl) {
      errEl.textContent = 'Пожалуйста, введите корректный адрес почты';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Проверяем...</span>';
  }

  try {
    const res = await fetch('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка проверки почты');

    currentAuthEmail = email;
    const displayEmail = document.getElementById('authDisplayEmail');
    if (displayEmail) displayEmail.textContent = email;

    const noticeTitle = document.getElementById('authNoticeTitle');
    const noticeDesc = document.getElementById('authNoticeDesc');
    const submitText = document.getElementById('authSubmitBtnText');
    const passInput = document.getElementById('authPasswordInput');
    const passErr = document.getElementById('authPasswordError');

    if (passErr) { passErr.style.display = 'none'; passErr.textContent = ''; }
    if (passInput) passInput.value = '';

    if (data.exists) {
      currentAuthMode = 'login';
      if (noticeTitle) noticeTitle.textContent = 'С возвращением!';
      if (noticeDesc) noticeDesc.textContent = 'Введите пароль от вашего аккаунта:';
      if (submitText) submitText.textContent = 'Войти в кошелёк';
    } else {
      currentAuthMode = 'register';
      if (noticeTitle) noticeTitle.textContent = 'Создание аккаунта';
      if (noticeDesc) noticeDesc.textContent = 'Аккаунт не найден. Придумайте пароль (от 6 символов) для регистрации:';
      if (submitText) submitText.textContent = 'Создать аккаунт и войти';
    }

    const stepEmail = document.getElementById('authStepEmailForm');
    const stepPass = document.getElementById('authStepPasswordForm');
    if (stepEmail) stepEmail.style.display = 'none';
    if (stepPass) stepPass.style.display = 'block';

    setTimeout(() => { if (passInput) passInput.focus(); }, 100);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Ошибка соединения с сервером';
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Продолжить</span><span class="auth-arrow">→</span>';
    }
  }
}

async function handlePasswordSubmit(e) {
  e.preventDefault();
  const passInput = document.getElementById('authPasswordInput');
  const errEl = document.getElementById('authPasswordError');
  const btn = document.getElementById('authPasswordSubmitBtn');
  const submitText = document.getElementById('authSubmitBtnText');
  const password = passInput?.value || '';

  if (!password || password.length < 6) {
    if (errEl) {
      errEl.textContent = 'Пароль должен быть не менее 6 символов';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;
  const originalText = submitText ? submitText.textContent : 'Войти';
  if (submitText) submitText.textContent = currentAuthMode === 'login' ? 'Вход...' : 'Регистрация...';

  try {
    const endpoint = currentAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentAuthEmail, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }

    setAuthToken(data.token);
    setStoredUser(data.user);
    hideAuthOverlay();
    updateProfileUI();

    if (currentAuthMode === 'register') {
      showToast('🎉 Добро пожаловать! Аккаунт успешно создан.');
      await syncDataToServer(false);
    } else {
      showToast(`👋 С возвращением, ${data.user.email}!`);
      await fetchServerData();
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Ошибка авторизации';
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
    if (submitText) submitText.textContent = originalText;
  }
}

function handleProfileLogout() {
  if (!confirm('Вы действительно хотите выйти из аккаунта на этом устройстве?\n\nЛокальные данные останутся сохранены.')) {
    return;
  }
  clearAuth();
  document.getElementById('settingsDialog')?.close();
  showAuthOverlay();
  updateProfileUI();
  showToast('Вы вышли из профиля');
}

function initAuth() {
  const emailForm = document.getElementById('authStepEmailForm');
  if (emailForm) emailForm.addEventListener('submit', handleEmailCheckSubmit);

  const passForm = document.getElementById('authStepPasswordForm');
  if (passForm) passForm.addEventListener('submit', handlePasswordSubmit);

  const changeEmailBtn = document.getElementById('authChangeEmailBtn');
  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', () => {
      const stepEmail = document.getElementById('authStepEmailForm');
      const stepPass = document.getElementById('authStepPasswordForm');
      if (stepPass) stepPass.style.display = 'none';
      if (stepEmail) stepEmail.style.display = 'block';
      const emailInput = document.getElementById('authEmailInput');
      if (emailInput) setTimeout(() => emailInput.focus(), 50);
    });
  }

  const togglePassBtn = document.getElementById('authTogglePasswordBtn');
  if (togglePassBtn) {
    togglePassBtn.addEventListener('click', () => {
      const passInput = document.getElementById('authPasswordInput');
      if (!passInput) return;
      if (passInput.type === 'password') {
        passInput.type = 'text';
        togglePassBtn.textContent = '🔒';
      } else {
        passInput.type = 'password';
        togglePassBtn.textContent = '👁';
      }
    });
  }

  safeBind('forceSyncServerBtn', 'click', () => syncDataToServer(true));
  safeBind('logoutProfileBtn', 'click', handleProfileLogout);

  const token = getAuthToken();
  if (token) {
    hideAuthOverlay();
    updateProfileUI();

    // Verify token with backend
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401) {
          clearAuth();
          showAuthOverlay();
        } else if (res.ok) {
          res.json().then(d => {
            if (d.user) setStoredUser(d.user);
            updateProfileUI();
            fetchServerData();
          });
        }
      })
      .catch(() => {
        console.log('App started offline, running with local data.');
        const statusEl = document.getElementById('profileServerStatus');
        if (statusEl) statusEl.textContent = '🟠 Офлайн (локальный режим)';
      });
  } else {
    showAuthOverlay();
  }
}

/* ===== УТИЛИТЫ И БЕЗОПАСНЫЙ КАЛЬКУЛЯТОР ===== */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthName(m) {
  return new Date(2000, m, 1).toLocaleDateString('ru-RU', { month: 'long' });
}

function getCat(type, id) {
  const bucket = state.categories[type] || [...state.categories.expense, ...state.categories.income];
  return bucket.find(c => c.id === id)
    || [...state.categories.expense, ...state.categories.income].find(c => c.id === id)
    || { id, name: id || 'Категория', color: '#F5BD7A' };
}

function getAccountName(accId) {
  const acc = (state.accounts || []).find(a => a.id === accId);
  return acc ? acc.name : 'По умолчанию';
}

function extractIcon(name) {
  if (!name) return null;
  const match = name.match(/^\p{Emoji}/u);
  return match ? match[0] : null;
}

function showToast(msg, undoCallback) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    if (typeof t.showPopover === 'function') {
      t.setAttribute('popover', 'manual');
    }
  }

  const activeDialogs = document.querySelectorAll('dialog[open]');
  const topDialog = activeDialogs.length > 0 ? activeDialogs[activeDialogs.length - 1] : null;
  if (topDialog && t.parentNode !== topDialog) {
    topDialog.appendChild(t);
  } else if (!topDialog && t.parentNode !== document.body) {
    document.body.appendChild(t);
  }

  clearTimeout(t._timer);
  const safeMsg = escapeHtml(msg);

  if (undoCallback) {
    t.innerHTML = `<span class="toast-msg">${safeMsg}</span><button type="button" class="toast-undo">Отменить</button>`;
    const undoBtn = t.querySelector('.toast-undo');
    undoBtn.addEventListener('click', () => {
      undoCallback();
      hideToast(t);
    });
  } else {
    t.innerHTML = `<span class="toast-msg">${safeMsg}</span>`;
  }

  if (typeof t.showPopover === 'function') {
    try {
      if (t.matches(':popover-open')) t.hidePopover();
      t.showPopover();
    } catch {}
  }

  t.classList.add('show');
  t._timer = setTimeout(() => hideToast(t), 3500);
}

function hideToast(t) {
  if (!t) return;
  t.classList.remove('show');
  setTimeout(() => {
    if (typeof t.hidePopover === 'function' && t.matches(':popover-open')) {
      try { t.hidePopover(); } catch {}
    }
  }, 300);
}

/* Безопасный рекурсивный парсер математических выражений (без eval / new Function) */
function safeEval(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return NaN;
  const rawStr = String(str).trim();
  if (!rawStr || /[^0-9+\-*/().,\s]/.test(rawStr)) return NaN;
  const clean = rawStr.replace(/,/g, '.').replace(/\s+/g, '');
  if (!clean) return NaN;

  let pos = 0;

  function parseExpression() {
    let val = parseTerm();
    while (pos < clean.length && (clean[pos] === '+' || clean[pos] === '-')) {
      const op = clean[pos++];
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm() {
    let val = parseFactor();
    while (pos < clean.length && (clean[pos] === '*' || clean[pos] === '/')) {
      const op = clean[pos++];
      const right = parseFactor();
      if (op === '/' && right === 0) return NaN;
      val = op === '*' ? val * right : val / right;
    }
    return val;
  }

  function parseFactor() {
    if (clean[pos] === '+') { pos++; return parseFactor(); }
    if (clean[pos] === '-') { pos++; return -parseFactor(); }
    if (clean[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (clean[pos] === ')') pos++;
      return val;
    }
    const start = pos;
    while (pos < clean.length && ((clean[pos] >= '0' && clean[pos] <= '9') || clean[pos] === '.')) {
      pos++;
    }
    if (start === pos) return NaN;
    return parseFloat(clean.slice(start, pos));
  }

  try {
    const result = parseExpression();
    if (pos < clean.length) return NaN;
    return typeof result === 'number' && isFinite(result) ? Math.round(result * 100) / 100 : NaN;
  } catch {
    return NaN;
  }
}

/* ===== ПЕРИОД И ФИЛЬТРАЦИЯ ПО МЕСЯЦУ ===== */
function getPeriodRange() {
  if (state.periodScope === 'all') {
    return { from: '0000-01-01', to: '9999-12-31' };
  }
  const y = state.selectedYear;
  const m = state.selectedMonth;
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getPeriodTransactions() {
  const { from, to } = getPeriodRange();
  return state.transactions.filter(tx => tx.date >= from && tx.date <= to);
}

function updateMonthHeaderUI() {
  const labelEl = document.getElementById('activeMonthLabel');
  const titleBtn = document.getElementById('monthTitleBtn');
  if (!labelEl) return;

  if (state.periodScope === 'all') {
    labelEl.textContent = 'ВСЕ ПЕРИОДЫ';
    if (titleBtn) titleBtn.classList.add('all-time');
  } else {
    const d = new Date(state.selectedYear, state.selectedMonth, 1);
    const mName = d.toLocaleDateString('ru-RU', { month: 'long' }).toUpperCase();
    labelEl.textContent = `${mName} ${state.selectedYear} Г.`;
    if (titleBtn) titleBtn.classList.remove('all-time');
  }
}

function shiftMonth(delta) {
  state.periodScope = 'month';
  let m = state.selectedMonth + delta;
  let y = state.selectedYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  state.selectedMonth = m;
  state.selectedYear = y;
  render();
}

function getFiltered() {
  const { activeTab, filters } = state;
  let list = [...state.transactions];

  if (activeTab === 'expense' || activeTab === 'income') {
    list = list.filter(tx => tx.type === activeTab);
  }

  // Если не заданы кастомные даты в фильтре — используем выбранный месяц в шапке
  if (!filters.dateFrom && !filters.dateTo && state.periodScope === 'month') {
    const { from, to } = getPeriodRange();
    list = list.filter(tx => tx.date >= from && tx.date <= to);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(tx => {
      const cat = getCat(tx.type, tx.categoryId);
      return cat.name.toLowerCase().includes(q) || (tx.comment || '').toLowerCase().includes(q);
    });
  }
  if (filters.category && filters.category !== 'all') {
    list = list.filter(tx => tx.categoryId === filters.category);
  }
  if (filters.dateFrom) list = list.filter(tx => tx.date >= filters.dateFrom);
  if (filters.dateTo) list = list.filter(tx => tx.date <= filters.dateTo);
  if (filters.amountMin !== '') list = list.filter(tx => tx.amount >= parseFloat(filters.amountMin));
  if (filters.amountMax !== '') list = list.filter(tx => tx.amount <= parseFloat(filters.amountMax));

  const s = filters.sort;
  list.sort((a, b) => {
    if (s === 'date_desc') return b.date.localeCompare(a.date);
    if (s === 'date_asc') return a.date.localeCompare(b.date);
    if (s === 'amount_desc') return b.amount - a.amount;
    if (s === 'amount_asc') return a.amount - b.amount;
    if (s === 'category_asc') return getCat(a.type, a.categoryId).name.localeCompare(getCat(b.type, b.categoryId).name, 'ru');
    return 0;
  });
  return list;
}

/* ===== v5: БАЛАНС, ИТОГ ПЕРИОДА И ГЛАВНЫЙ ЭКРАН (РАСХОДЫ / ДОХОДЫ) ===== */
function getInitialAccSum() {
  return (state.accounts || []).reduce((s, a) => s + (parseFloat(a.initialBalance) || 0), 0);
}

// Стартовый баланс = корректировка (синхронизируется с облаком) + начальные балансы счетов
function getStartBalance() {
  return (state.balanceAdjustment || 0) + getInitialAccSum();
}

function getFlowTotals() {
  const income = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense };
}

function getTotalBalance() {
  const { income, expense } = getFlowTotals();
  return getStartBalance() + income - expense;
}

function setStartBalance(value) {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  state.balanceAdjustment = Math.round((v - getInitialAccSum()) * 100) / 100;
  saveData();
  render();
  syncItem('profiles', 'upsert', { balanceAdjustment: state.balanceAdjustment });
}

function fmtShort(amount) {
  return fmt(amount).replace(/,00(?=\s)/, '');
}

function getFlowType() {
  return state.activeTab === 'income' ? 'income' : 'expense';
}

function getQuickPlaceholder() {
  return getFlowType() === 'income' ? 'зарплата 65000, кэшбэк 300…' : 'такси 300, кофе 180…';
}

function renderBalance() {
  const { income, expense } = getFlowTotals();
  const start = getStartBalance();
  const totalNet = start + income - expense;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('netBalanceDetail', fmt(totalNet));
  set('totalIncome', fmt(income));
  set('totalExpense', fmt(expense));
  set('balanceAdjustmentVal', fmt(start));
  set('heroBalanceVal', fmtShort(totalNet));
  set('settingsCurrentBalance', fmt(totalNet));
  const heroBal = document.getElementById('heroBalanceBtn');
  if (heroBal) heroBal.dataset.sign = totalNet >= 0 ? 'pos' : 'neg';
}

function renderMainTab() {
  const type = getFlowType();
  const isIncome = type === 'income';
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set('quickZoneTitle', isIncome ? 'Что получили?' : 'Что потратили?');
  const qzInput = document.getElementById('quickZoneInput');
  const micBtn = document.getElementById('quickZoneMicBtn');
  if (qzInput && !(micBtn && micBtn.classList.contains('recording'))) qzInput.placeholder = getQuickPlaceholder();
  set('opsTitle', isIncome ? 'Доходы' : 'Расходы');

  const periodTxs = getPeriodTransactions().filter(t => t.type === type);
  const sum = periodTxs.reduce((s, t) => s + t.amount, 0);
  const periodName = state.periodScope === 'all' ? 'за всё время' : `за ${monthName(state.selectedMonth)}`;
  const labelEl = document.getElementById('heroLabelText');
  if (labelEl) {
    labelEl.textContent = `${isIncome ? 'Получено' : 'Потрачено'} ${periodName}`;
    labelEl.className = isIncome ? 'hl-green' : 'hl-peach';
  }
  set('heroValue', fmtShort(sum));
  const heroVal = document.getElementById('heroValue');
  if (heroVal) heroVal.classList.toggle('income', isIncome);
  const fab = document.getElementById('fabPlusBtn');
  if (fab) {
    fab.title = isIncome ? 'Новый доход' : 'Новый расход';
    fab.setAttribute('aria-label', fab.title);
  }
}

function openCategoryInFlow(type, catId) {
  state.filters.category = catId || 'all';
  switchNavTab(type === 'income' ? 'income' : 'expense');
  const sel = document.getElementById('categoryFilter');
  if (sel) sel.value = state.filters.category;
}

function buildCategorySummaryRowsHTML(txs, type, showQuickAdd = false) {
  const totals = {};
  txs.forEach(tx => {
    totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const grandTotal = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  return sorted.map(([catId, sum]) => {
    const cat = getCat(type, catId);
    const title = escapeHtml(cleanCatTitle(cat.name));
    const color = escapeHtml(catColorOf(cat));
    const pctExact = (sum / grandTotal) * 100;
    const pctLabel = pctExact > 0 && pctExact < 1 ? '<1' : String(Math.round(pctExact));
    const quickBtnHtml = showQuickAdd
      ? `<button type="button" class="cat-row-quick-add" data-quick-cat="${escapeHtml(catId)}" data-quick-type="${type}" title="Быстро добавить в «${title}»" aria-label="Добавить в ${title}">+</button>`
      : '';
    return `<li class="ref-cat-row v6-row" data-cat-id="${escapeHtml(catId)}" data-type="${type}" style="--cat-color:${color}">
      <div class="ref-cat-left">
        ${renderCatBadgeHTML(cat)}
        <div class="ref-cat-text">
          <span class="ref-cat-name">${title}</span>
          <span class="ref-cat-bar" aria-hidden="true"><i style="width:${Math.max(2, pctExact).toFixed(1)}%"></i></span>
        </div>
      </div>
      <div class="ref-cat-right">
        <span class="ref-cat-pct">${pctLabel}%</span>
        <span class="ref-cat-amount">${fmt(sum)}</span>
        ${quickBtnHtml}
      </div>
    </li>`;
  }).join('');
}

function bindCategoryRowClicks(container, type) {
  container.querySelectorAll('.cat-row-quick-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAddDialog(btn.dataset.quickType, btn.dataset.quickCat);
    });
  });

  container.querySelectorAll('.ref-cat-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.cat-row-quick-add')) return;
      openCategoryInFlow(type, row.dataset.catId);
    });
  });
}

/* ===== РЕНДЕР ВКЛАДКИ СЧЕТА (РЕФЕРЕНС 6) ===== */
function renderAccounts() {
  const container = document.getElementById('accountsListContainer');
  const netWorthEl = document.getElementById('accountsNetWorthVal');
  if (!container) return;

  if (!state.accounts || !state.accounts.length) {
    state.accounts = [...DEFAULT_ACCOUNTS];
  }

  let totalNetWorth = state.balanceAdjustment || 0;

  const cardsHtml = state.accounts.map(acc => {
    const accTxs = state.transactions.filter(t => (t.accountId || 'default') === acc.id);
    const inc = accTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = accTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const adjPart = acc.id === 'default' ? (state.balanceAdjustment || 0) : 0;
    const bal = (parseFloat(acc.initialBalance) || 0) + inc - exp + adjPart;
    if (acc.id !== 'default') {
      totalNetWorth += (parseFloat(acc.initialBalance) || 0) + inc - exp;
    } else {
      totalNetWorth += (parseFloat(acc.initialBalance) || 0) + inc - exp;
    }

    return `<div class="account-dashed-card" data-acc-id="${escapeHtml(acc.id)}">
      <span class="account-card-name">${escapeHtml(acc.name)}</span>
      <div class="account-card-right">
        <span class="account-card-bal">${fmt(bal)}</span>
        ${acc.id !== 'default' ? `<button type="button" class="account-del-btn" data-del-acc="${escapeHtml(acc.id)}" title="Удалить счет">×</button>` : ''}
      </div>
    </div>`;
  }).join('');

  if (netWorthEl) netWorthEl.textContent = fmt(totalNetWorth);
  container.innerHTML = cardsHtml;

  container.querySelectorAll('.account-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.delAcc;
      if (!confirm('Удалить этот счет? Транзакции по нему перейдут на счет «По умолчанию».')) return;
      state.transactions.forEach(tx => {
        if (tx.accountId === id) tx.accountId = 'default';
      });
      state.accounts = state.accounts.filter(a => a.id !== id);
      saveData();
      render();
      showToast('Счет удален');
    });
  });
}

/* ===== ЧИПЫ КАТЕГОРИЙ И СПИСОК ТРАНЗАКЦИЙ (РЕФЕРЕНС 5) ===== */
function renderCategoryTotals() {
  const section = document.getElementById('categoryTotals');
  if (!section) return;
  const catId = state.filters.category;
  if (!catId || catId === 'all') {
    section.replaceChildren();
    return;
  }
  const cat = getCat(getFlowType(), catId);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'cat-chip active';
  chip.title = 'Сбросить фильтр по категории';
  chip.innerHTML = `<span class="cat-chip-dot" style="background:${escapeHtml(cat.color || '#F5BD7A')}"></span>${escapeHtml(cleanCatTitle(cat.name))}<span class="cat-chip-x" aria-hidden="true">×</span>`;
  chip.addEventListener('click', () => {
    state.filters.category = 'all';
    const sel = document.getElementById('categoryFilter');
    if (sel) sel.value = 'all';
    render();
  });
  section.replaceChildren(chip);
}

const BLOB_COLORS = ['blob-pink', 'blob-peach', 'blob-mint', 'blob-lavender'];

function renderList(list) {
  const ul = document.getElementById('transactionList');
  const empty = document.getElementById('emptyState');
  if (!ul || !empty) return;

  if (!list.length) {
    ul.replaceChildren();
    empty.classList.add('visible');
    return;
  }
  empty.classList.remove('visible');

  // Режим 1: Группировка по дням (по умолчанию, точно как на Референсе 5)
  if (state.txGroupingMode === 'day') {
    const dayGroups = {};
    list.forEach(tx => {
      if (!dayGroups[tx.date]) dayGroups[tx.date] = [];
      dayGroups[tx.date].push(tx);
    });

    const dates = Object.keys(dayGroups);
    if (state.filters.sort === 'date_asc') {
      dates.sort((a, b) => a.localeCompare(b));
    } else if (state.filters.sort === 'date_desc') {
      dates.sort((a, b) => b.localeCompare(a));
    }

    const frag = document.createDocumentFragment();
    // v6: день — заметная «шапка» (плитка с числом + день недели + итог), операции — в отдельной карточке
    const todayIso = todayISO();
    const yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
    const yesterdayIso = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, '0')}-${String(yDate.getDate()).padStart(2, '0')}`;
    dates.forEach(isoDate => {
      const d = new Date(isoDate + 'T00:00:00');
      const dayNum = d.getDate();
      const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' }).toLowerCase();
      const monthShort = d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
      const rel = isoDate === todayIso ? 'Сегодня' : isoDate === yesterdayIso ? 'Вчера' : '';
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dayTxs = dayGroups[isoDate];

      const dayLi = document.createElement('li');
      dayLi.className = 'day-group-li' + (rel === 'Сегодня' ? ' is-today' : '') + (isWeekend ? ' is-weekend' : '');
      const daySum = dayTxs.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);
      dayLi.innerHTML = `
        <div class="day-group-header">
          <div class="day-date-tile"><span class="day-num">${dayNum}</span><span class="day-month">${escapeHtml(monthShort)}</span></div>
          <div class="day-titles">
            <span class="day-weekday-script">${escapeHtml(weekday)}</span>
            ${rel ? `<span class="day-rel">${rel}</span>` : ''}
          </div>
          <div class="day-total">
            <span class="day-sum">${daySum < 0 ? '−' : '+'}${fmtShort(Math.abs(daySum))}</span>
            <span class="day-count">${dayTxs.length} ${v6Plural(dayTxs.length, ['операция', 'операции', 'операций'])}</span>
          </div>
        </div>
      `;

      const card = document.createElement('ul');
      card.className = 'day-tx-card';
      dayTxs.forEach(tx => {
        card.appendChild(createTxItemElement(tx));
      });
      dayLi.appendChild(card);

      frag.appendChild(dayLi);
    });

    ul.replaceChildren(frag);
    return;
  }

  // Режим 2: Группировка по годам и месяцам (переключается иконкой календаря)
  const groups = {};
  list.forEach(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    const y = d.getFullYear(), m = d.getMonth();
    if (!groups[y]) groups[y] = {};
    if (!groups[y][m]) groups[y][m] = [];
    groups[y][m].push(tx);
  });

  const frag = document.createDocumentFragment();
  const years = Object.keys(groups).sort((a, b) => b - a);

  years.forEach(y => {
    const yearSum = Object.values(groups[y]).flat().reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);
    const yearCollapsed = state.collapsedYears.has(y);
    const yEl = document.createElement('li');
    yEl.className = 'group-year-li';
    yEl.innerHTML = `<div class="group-year" data-year="${y}">
      <span>${yearCollapsed ? '▸' : '▾'} ${y} год</span>
      <span>${fmt(yearSum)}</span>
    </div>`;
    frag.appendChild(yEl);

    if (yearCollapsed) return;

    const months = Object.keys(groups[y]).sort((a, b) => b - a);
    months.forEach(m => {
      const monthKey = `${y}-${m}`;
      const txs = groups[y][m];
      const sum = txs.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);
      const monthCollapsed = state.collapsedMonths.has(monthKey);
      const mEl = document.createElement('li');
      mEl.className = 'group-month-li';
      mEl.innerHTML = `<div class="group-month" data-month="${monthKey}">
        <span>${monthCollapsed ? '▸' : '▾'} ${monthName(parseInt(m))}</span>
        <span>${fmt(sum)}</span>
      </div>`;
      frag.appendChild(mEl);

      if (monthCollapsed) return;
      txs.forEach(tx => frag.appendChild(createTxItemElement(tx)));
    });
  });

  ul.replaceChildren(frag);

  ul.querySelectorAll('.group-year[data-year]').forEach(el => {
    el.addEventListener('click', () => {
      const y = el.dataset.year;
      if (state.collapsedYears.has(y)) state.collapsedYears.delete(y);
      else state.collapsedYears.add(y);
      renderList(list);
    });
  });
  ul.querySelectorAll('.group-month[data-month]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.month;
      if (state.collapsedMonths.has(key)) state.collapsedMonths.delete(key);
      else state.collapsedMonths.add(key);
      renderList(list);
    });
  });
}

function createTxItemElement(tx) {
  const cat = getCat(tx.type, tx.categoryId);
  const catTitle = cleanCatTitle(cat.name);
  const sign = tx.type === 'expense' ? '−' : '+';

  const meta = [];
  if (tx.accountId && tx.accountId !== 'default') meta.push(`<span class="tx-tag">${escapeHtml(getAccountName(tx.accountId))}</span>`);
  if (tx.recurrence && tx.recurrence !== 'none') meta.push('<span class="tx-tag" title="Повторяется">↻</span>');
  if (tx.paid === false) meta.push('<span class="tx-tag unpaid">не оплачено</span>');
  const commentHtml = tx.comment ? `<span class="tx-comment-text">${escapeHtml(tx.comment)}</span>` : '';
  const subline = (commentHtml || meta.length) ? `<div class="tx-sub">${meta.join('')}${commentHtml}</div>` : '';

  const li = document.createElement('li');
  li.className = `tx-item ${tx.type}`;
  li.dataset.id = tx.id;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${catTitle}, ${sign}${fmt(tx.amount)}${tx.comment ? ', ' + tx.comment : ''}. Открыть и изменить`);
  // v6: без кружков — тонкая цветная метка категории + смайлик прямо в названии
  const catColor = catColorOf(cat);
  const catEm = catEmoji(cat.name);
  li.innerHTML = `
    <span class="tx-cat-mark" style="--cat-color:${escapeHtml(catColor)}" aria-hidden="true"></span>
    <div class="tx-body">
      <div class="tx-cat">${catEm ? `<span class="tx-cat-emoji">${catEm}</span>` : ''}${escapeHtml(catTitle)}</div>
      ${subline}
    </div>
    <div class="tx-amount">${sign}${fmt(tx.amount)}</div>
  `;
  return li;
}

function v6Plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* ===== СЕЛЕКТЫ КАТЕГОРИЙ И СЧЕТОВ ===== */
function renderCategoryFilter() {
  const sel = document.getElementById('categoryFilter');
  if (!sel) return;
  const cats = state.activeTab === 'income'
    ? state.categories.income
    : state.activeTab === 'expense'
      ? state.categories.expense
      : [...state.categories.expense, ...state.categories.income];

  sel.innerHTML = '<option value="all">Все категории</option>' +
    cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  sel.value = state.filters.category || 'all';
}

function renderCategoryList() {
  const ul = document.getElementById('categoryList');
  if (!ul) return;
  const tab = state.catDialogTab || 'expense';
  const cats = state.categories[tab] || [];

  document.querySelectorAll('.cat-type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catTab === tab);
  });

  // v6: счётчики на вкладках, поиск, статистика по каждой категории, сортировка по использованию
  ['expense', 'income'].forEach(t => {
    const el = document.querySelector(`[data-count-for="${t}"]`);
    if (el) el.textContent = (state.categories[t] || []).length;
  });
  const stats = cmCategoryStats(tab);
  const q = (document.getElementById('catSearch')?.value || '').trim().toLowerCase();
  const rows = cats.map((c, i) => ({ c, i, s: stats[c.id] || { count: 0, month: 0 } }))
    .filter(x => !q || (x.c.name || '').toLowerCase().includes(q))
    .sort((a, b) => (b.s.month - a.s.month) || (b.s.count - a.s.count) || (a.i - b.i));
  const usedMonth = cats.filter(c => (stats[c.id]?.month || 0) > 0).length;
  const summary = document.getElementById('cmSummary');
  if (summary) {
    summary.textContent = cats.length
      ? `${cats.length} ${v6Plural(cats.length, ['категория', 'категории', 'категорий'])} · в этом месяце активны ${usedMonth}`
      : '';
  }
  if (!rows.length) {
    ul.innerHTML = `<li class="cm-empty">${q ? 'Ничего не найдено' : 'Категорий пока нет — нажмите «+ Новая»'}</li>`;
    return;
  }
  ul.innerHTML = rows.map(({ c, s }) => {
    const sub = s.count
      ? `${s.count} ${v6Plural(s.count, ['операция', 'операции', 'операций'])}${s.month ? ` · ${fmtShort(s.month)} в этом месяце` : ''}`
      : 'Ещё не использовалась';
    return `<li class="cat-item cm-item${state.cmEditId === c.id ? ' editing' : ''}${s.count ? '' : ' unused'}" data-id="${escapeHtml(c.id)}" tabindex="0" role="button">
      ${renderCatBadgeHTML(c)}
      <div class="cm-item-body"><span class="cat-item-name">${escapeHtml(cleanCatTitle(c.name))}</span><span class="cm-item-sub">${sub}</span></div>
      <span class="cm-item-edit-ico" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
    </li>`;
  }).join('');
  return;

  // --- старая (v5) разметка списка — больше не используется ---
  ul.innerHTML = cats.map(c => {
    return `<li class="cat-item" style="--cat-color:${escapeHtml(c.color)}">
      <span class="cat-item-swatch" style="background:${escapeHtml(c.color)}"></span>
      <span class="cat-item-name">${escapeHtml(c.name)}</span>
      <button type="button" class="cat-item-edit" data-id="${escapeHtml(c.id)}" title="Редактировать"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
      <button type="button" class="cat-item-del" data-id="${escapeHtml(c.id)}" title="Удалить"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
    </li>`;
  }).join('');
}

function renderTxCategorySelect() {
  const sel = document.getElementById('txCategory');
  if (!sel) return;
  const mode = state.txModalMode === 'income' ? 'income' : 'expense';
  const cats = state.categories[mode] || [];
  const prevVal = sel.value;
  sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(cleanCatTitle(c.name))}</option>`).join('');
  if (prevVal && cats.some(c => c.id === prevVal)) {
    sel.value = prevVal;
  }
  renderTxQuickCategoryBar();
}

function renderTxQuickCategoryBar() {
  const bar = document.getElementById('txQuickCategoryBar');
  const sel = document.getElementById('txCategory');
  if (!bar || !sel) return;

  if (state.txModalMode === 'transfer') {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const mode = state.txModalMode === 'income' ? 'income' : 'expense';
  const cats = getCategoriesByUsage(mode);
  const activeId = sel.value || (state.categories[mode] || [])[0]?.id;

  bar.innerHTML = cats.map(c => {
    const isActive = c.id === activeId;
    return `<button type="button" class="tx-quick-cat-pill${isActive ? ' active' : ''}" data-cat-id="${escapeHtml(c.id)}">
      <span class="tx-quick-cat-dot" style="background:${escapeHtml(c.color || '#F5BD7A')}"></span>
      <span>${escapeHtml(c.name)}</span>
    </button>`;
  }).join('') + '<button type="button" class="tx-quick-cat-pill tx-quick-cat-add" id="txQuickCatAddPill" aria-label="Новая категория">+</button>';

  bar.querySelectorAll('.tx-quick-cat-pill[data-cat-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      sel.value = btn.dataset.catId;
      bar.querySelectorAll('.tx-quick-cat-pill').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  const addPill = document.getElementById('txQuickCatAddPill');
  if (addPill) addPill.addEventListener('click', () => openCategoryDialog(mode));

  const act = bar.querySelector('.tx-quick-cat-pill.active');
  if (act) bar.scrollLeft = Math.max(0, act.offsetLeft - 16);
}

function renderAccountSelects() {
  const accSel = document.getElementById('txAccount');
  const targetSel = document.getElementById('txTargetAccount');
  const opts = (state.accounts || DEFAULT_ACCOUNTS)
    .map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`)
    .join('');
  if (accSel) accSel.innerHTML = opts;
  if (targetSel) targetSel.innerHTML = opts;
}

/* ===== ГЛАВНЫЙ РЕНДЕР И ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ===== */
function render() {
  if (!state._colorsMigrated) { state._colorsMigrated = true; migrateCatColors(); }
  updateMonthHeaderUI();
  renderBalance();
  renderMainTab();
  renderAccounts();
  renderCategoryFilter();
  const list = getFiltered();
  renderCategoryTotals(list);
  renderTemplates();
  renderList(list);
  if (state.activeNav === 'analytics') {
    renderDashCategoryFilter();
    renderDashboard();
  }
}

function switchNavTab(navName) {
  if (!['expense', 'income', 'analytics'].includes(navName)) navName = 'expense';
  const prevNav = state.activeNav;
  state.activeNav = navName;
  state.viewMode = navName === 'analytics' ? 'dashboard' : 'list';
  if (navName !== 'analytics') state.activeTab = navName;

  const mainSection = document.getElementById('mainSection');
  const analyticsSection = document.getElementById('analyticsSection');
  if (mainSection) mainSection.hidden = navName === 'analytics';
  if (analyticsSection) analyticsSection.hidden = navName !== 'analytics';
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === navName);
  });
  document.body.dataset.flow = navName;

  const floatingWrap = document.getElementById('floatingActionsWrap');
  if (floatingWrap) floatingWrap.hidden = navName === 'analytics';
  const panel = document.getElementById('balancePanel');
  if (panel) panel.hidden = true;

  // Аналитика открывается на том же типе, с которого пришли
  if (navName === 'analytics' && (prevNav === 'expense' || prevNav === 'income')) {
    state.analyticsType = prevNav;
    document.getElementById('analyticsExpensePill')?.classList.toggle('active-expense', prevNav === 'expense');
    document.getElementById('analyticsIncomePill')?.classList.toggle('active-income', prevNav === 'income');
  }

  const tplRow = document.getElementById('quickTemplates');
  const tplEditBtn = document.getElementById('quickChipsEditBtn');
  if (tplRow && tplRow.classList.contains('editing')) {
    tplRow.classList.remove('editing');
    if (tplEditBtn) tplEditBtn.textContent = 'изменить';
  }

  render();
  window.scrollTo(0, 0);
}

function autosizeTxComment() {
  const el = document.getElementById('txComment');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 132) + 'px';
}

function fillSettingsBalance() {
  const el = document.getElementById('startBalanceInput');
  if (el) el.value = String(Math.round(getStartBalance() * 100) / 100);
  renderBalance();
}

function saveStartBalanceFromInput() {
  const el = document.getElementById('startBalanceInput');
  if (!el) return;
  const raw = String(el.value).replace(',', '.').trim();
  const v = raw === '' ? 0 : parseFloat(raw);
  if (isNaN(v)) {
    showToast('Введите число');
    return;
  }
  setStartBalance(v);
  fillSettingsBalance();
  showToast('✅ Стартовый баланс сохранён');
}

/* ===== МОДАЛЬНОЕ ОКНО ТРАНЗАКЦИИ + ЦИФРОВАЯ КЛАВИАТУРА ===== */
function setTxModalMode(mode) {
  state.txModalMode = mode; // 'expense' | 'income' | 'transfer'
  document.querySelectorAll('.tx-mode-pill').forEach(btn => {
    const m = btn.dataset.txMode;
    btn.classList.remove('active-expense', 'active-income', 'active-transfer');
    if (m === mode) {
      btn.classList.add(mode === 'income' ? 'active-income' : mode === 'transfer' ? 'active-transfer' : 'active-expense');
    }
  });

  const catRow = document.getElementById('txCategoryRow');
  const targetRow = document.getElementById('txTransferTargetRow');
  const accLabel = document.getElementById('txAccountRowLabel');
  const quickBar = document.getElementById('txQuickCategoryBar');

  if (mode === 'transfer') {
    if (catRow) catRow.hidden = true;
    if (quickBar) quickBar.hidden = true;
    if (targetRow) targetRow.hidden = false;
    if (accLabel) accLabel.textContent = 'Со счета';
    if (typeof setTxMoreOpen === 'function') setTxMoreOpen(true);
  } else {
    if (catRow) catRow.hidden = false;
    if (targetRow) targetRow.hidden = true;
    if (accLabel) accLabel.textContent = 'Счет';
    renderTxCategorySelect();
  }
}

function updateTxAmountUI() {
  const input = document.getElementById('txAmount');
  const bigDisplay = document.getElementById('txAmountFormattedDisplay');
  const preview = document.getElementById('txAmountPreview');
  if (!input || !bigDisplay) return;

  const raw = input.value.trim();
  if (!raw) {
    bigDisplay.textContent = '0,00 ₽';
    if (preview) preview.style.display = 'none';
    return;
  }

  const hasOps = /[+\-*/()]/.test(raw);
  const val = safeEval(raw);

  if (hasOps) {
    bigDisplay.textContent = raw.replace(/\*/g, '×').replace(/\//g, '÷') + ' ₽';
    if (preview) {
      if (!isNaN(val) && val > 0) {
        preview.textContent = `= ${fmt(val)}`;
        preview.style.display = 'block';
      } else {
        preview.textContent = 'Введите второе число...';
        preview.style.display = 'block';
      }
    }
  } else {
    const num = parseFloat(raw.replace(',', '.'));
    bigDisplay.textContent = !isNaN(num) ? fmt(num) : '0,00 ₽';
    if (preview) preview.style.display = 'none';
  }
}

function updateTxDateLabel() {
  syncDateChips();
  const dateInput = document.getElementById('txDate');
  const label = document.getElementById('txDateHumanLabel');
  if (!dateInput || !label) return;
  label.textContent = fmtDate(dateInput.value) || 'Сегодня';
}

function updateTxPaidButtonUI() {
  const btn = document.getElementById('txPaidToggleBtn');
  if (!btn) return;
  btn.classList.toggle('checked', state.txPaid);
  btn.setAttribute('aria-checked', state.txPaid ? 'true' : 'false');
}

function handleKeypadPress(key) {
  const input = document.getElementById('txAmount');
  if (!input) return;
  let cur = input.value;

  if (key === 'C') {
    cur = '';
  } else if (key === 'BACKSPACE') {
    cur = cur.slice(0, -1);
  } else if (key === '.') {
    const parts = cur.split(/[+\-*/]/);
    const lastPart = parts[parts.length - 1] || '';
    if (!lastPart.includes('.')) {
      cur = cur ? cur + '.' : '0.';
    }
  } else if (['+', '-', '*', '/'].includes(key)) {
    if (!cur) return;
    if (/[+\-*/]$/.test(cur)) {
      cur = cur.slice(0, -1) + key;
    } else {
      cur += key;
    }
  } else if (key === '00') {
    cur = cur ? cur + '00' : '0';
  } else {
    cur += key;
  }

  input.value = cur;
  updateTxAmountUI();
}

function openAddDialog(forcedMode, preselectedCategoryId) {
  state.editingId = null;
  const mode = (typeof forcedMode === 'string' && ['expense', 'income', 'transfer'].includes(forcedMode))
    ? forcedMode
    : (state.activeTab === 'income' ? 'income' : 'expense');

  document.getElementById('transactionDialogTitle').textContent = 'НОВАЯ ЗАПИСЬ';
  const formEl = document.getElementById('transactionForm');
  if (formEl) formEl.classList.remove('keyboard-open');

  const delBtn = document.getElementById('deleteTxInModalBtn');
  if (delBtn) delBtn.hidden = true;
  const tplBtn = document.getElementById('txSaveTemplateBtn');
  if (tplBtn) tplBtn.hidden = true;
  const saveBtn = document.getElementById('bottomSaveTxBtn');
  if (saveBtn) saveBtn.textContent = '✓ Сохранить запись';

  renderAccountSelects();
  setTxModalMode(mode);

  if (preselectedCategoryId) {
    const catEl = document.getElementById('txCategory');
    if (catEl) {
      catEl.value = preselectedCategoryId;
      renderTxQuickCategoryBar();
    }
  }

  if (!preselectedCategoryId && mode !== 'transfer') {
    const last = getLastCats()[mode === 'income' ? 'income' : 'expense'];
    const catEl2 = document.getElementById('txCategory');
    if (catEl2 && last && (state.categories[mode] || []).some(c => c.id === last)) {
      catEl2.value = last;
      renderTxQuickCategoryBar();
    }
  }

  const amtInput = document.getElementById('txAmount');
  if (amtInput) amtInput.value = '';
  updateTxAmountUI();

  const defaultDate = state.periodScope === 'month'
    ? `${state.selectedYear}-${String(state.selectedMonth + 1).padStart(2, '0')}-${String(Math.min(new Date().getDate(), new Date(state.selectedYear, state.selectedMonth + 1, 0).getDate())).padStart(2, '0')}`
    : new Date().toISOString().slice(0, 10);

  const dateEl = document.getElementById('txDate');
  if (dateEl) dateEl.value = defaultDate;
  updateTxDateLabel();

  state.txPaid = true;
  updateTxPaidButtonUI();

  const recEl = document.getElementById('txRecurrence');
  if (recEl) recEl.value = 'none';

  const commentEl = document.getElementById('txComment');
  if (commentEl) commentEl.value = '';

  setTxMoreOpen(mode === 'transfer');
  document.getElementById('transactionDialog').showModal();
  autosizeTxComment();
}

function openEditDialog(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  state.editingId = id;
  document.getElementById('transactionDialogTitle').textContent = 'РЕДАКТИРОВАТЬ';
  const formEl = document.getElementById('transactionForm');
  if (formEl) formEl.classList.remove('keyboard-open');

  const delBtn = document.getElementById('deleteTxInModalBtn');
  if (delBtn) delBtn.hidden = false;
  const tplBtn = document.getElementById('txSaveTemplateBtn');
  if (tplBtn) tplBtn.hidden = false;
  const saveBtn = document.getElementById('bottomSaveTxBtn');
  if (saveBtn) saveBtn.textContent = '✓ Сохранить изменения';

  renderAccountSelects();
  setTxModalMode(tx.type);

  const amtInput = document.getElementById('txAmount');
  if (amtInput) amtInput.value = String(tx.amount);
  updateTxAmountUI();

  const catEl = document.getElementById('txCategory');
  if (catEl) {
    catEl.value = tx.categoryId;
    renderTxQuickCategoryBar();
  }

  const dateEl = document.getElementById('txDate');
  if (dateEl) dateEl.value = tx.date;
  updateTxDateLabel();

  const accEl = document.getElementById('txAccount');
  if (accEl) accEl.value = tx.accountId || 'default';

  const recEl = document.getElementById('txRecurrence');
  if (recEl) recEl.value = tx.recurrence || 'none';

  state.txPaid = tx.paid !== false;
  updateTxPaidButtonUI();

  const commentEl = document.getElementById('txComment');
  if (commentEl) commentEl.value = tx.comment || '';

  setTxMoreOpen(tx.paid === false || (tx.recurrence && tx.recurrence !== 'none') || (tx.accountId && tx.accountId !== 'default'));
  document.getElementById('transactionDialog').showModal();
  autosizeTxComment();
}

function saveTransaction(e) {
  e.preventDefault();
  const amountVal = document.getElementById('txAmount').value;
  const amount = safeEval(amountVal);
  if (isNaN(amount) || amount <= 0) {
    showToast('Введите сумму больше нуля');
    return;
  }

  const date = document.getElementById('txDate').value || new Date().toISOString().slice(0, 10);
  const accountId = document.getElementById('txAccount')?.value || 'default';
  const recurrence = document.getElementById('txRecurrence')?.value || 'none';
  const comment = document.getElementById('txComment').value.trim();
  const paid = state.txPaid;

  // Обработка перевода между счетами
  if (state.txModalMode === 'transfer') {
    const targetAccId = document.getElementById('txTargetAccount')?.value || 'default';
    if (targetAccId === accountId) {
      showToast('Выберите другой счет получателя для перевода');
      return;
    }
    const outTx = {
      id: uid(),
      type: 'expense',
      amount,
      categoryId: state.categories.expense[0]?.id || 'e7',
      date,
      accountId,
      paid: true,
      comment: comment || `Перевод → ${getAccountName(targetAccId)}`
    };
    const inTx = {
      id: uid(),
      type: 'income',
      amount,
      categoryId: state.categories.income[0]?.id || 'i5',
      date,
      accountId: targetAccId,
      paid: true,
      comment: comment || `Перевод ← ${getAccountName(accountId)}`
    };
    state.transactions.push(outTx, inTx);
    saveData();
    render();
    document.getElementById('transactionDialog').close();
    showToast('⇄ Перевод между счетами выполнен');
    return;
  }

  const txType = state.txModalMode === 'income' ? 'income' : 'expense';
  const categoryId = document.getElementById('txCategory').value || state.categories[txType][0]?.id;
  if (!categoryId) return;

  // Синхронизируем выбранный месяц с датой новой транзакции, чтобы она сразу отобразилась
  const txDateObj = new Date(date + 'T00:00:00');
  if (!isNaN(txDateObj)) {
    state.selectedYear = txDateObj.getFullYear();
    state.selectedMonth = txDateObj.getMonth();
  }

  if (state.editingId) {
    const idx = state.transactions.findIndex(t => t.id === state.editingId);
    if (idx !== -1) {
      const oldTx = { ...state.transactions[idx] };
      state.transactions[idx] = {
        ...state.transactions[idx],
        type: txType,
        amount,
        categoryId,
        date,
        comment,
        accountId,
        paid,
        recurrence
      };
      saveData();
      render();
      syncItem('transactions', 'upsert', state.transactions[idx]);
      showToast('Запись обновлена', () => {
        state.transactions[idx] = oldTx;
        saveData();
        render();
        syncItem('transactions', 'upsert', oldTx);
        showToast('Изменение отменено');
      });
    }
  } else {
    const newTx = { id: uid(), type: txType, amount, categoryId, date, comment, accountId, paid, recurrence };
    rememberLastCat(txType, categoryId);
    state.transactions.push(newTx);
    saveData();
    render();
    syncItem('transactions', 'upsert', newTx);
    showToast(txType === 'expense' ? 'Расход добавлен' : 'Доход добавлен', () => {
      const idx = state.transactions.findIndex(t => t.id === newTx.id);
      if (idx !== -1) {
        state.transactions.splice(idx, 1);
        saveData();
        render();
        syncItem('transactions', 'delete', { id: newTx.id });
        showToast('Добавление отменено');
      }
    });
  }

  document.getElementById('transactionDialog').close();
}

function deleteTransaction(id) {
  const idx = state.transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  const deleted = state.transactions[idx];
  state.transactions.splice(idx, 1);
  saveData();
  render();
  syncItem('transactions', 'delete', { id });
  showToast('Запись удалена', () => {
    state.transactions.push(deleted);
    saveData();
    render();
    syncItem('transactions', 'upsert', deleted);
    showToast('Действие отменено');
  });
}

function toggleTransactionPaid(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  tx.paid = tx.paid === false ? true : false;
  saveData();
  render();
  showToast(tx.paid ? '✓ Отмечено как оплаченное' : '○ Отмечено как неоплаченное');
}

/* ===== ДИАЛОГ КАТЕГОРИЙ ===== */
// ===== v6: менеджер категорий (поиск, статистика, редактор со значками и палитрой) =====
const CM_EMOJIS = {
  expense: ['🛒', '🍔', '☕', '🍕', '🍷', '🚕', '🚗', '⛽', '🚇', '🏠', '💡', '📱', '🌐', '💊', '🩺', '💄', '💅', '👗', '👟', '🎁', '🎮', '🎬', '🎵', '📚', '✈️', '🏖️', '🐶', '👶', '🏋️', '🧾', '🔧', '🧴', '💳', '🎓'],
  income: ['💼', '💰', '💵', '💳', '🏦', '📈', '🎁', '🧾', '🛍️', '🏠', '💻', '🤝', '⭐', '🎓']
};
const CM_COLORS = ['#F5BD7A', '#F6A65A', '#F48278', '#E86A60', '#FF8FA3', '#E879C6', '#B794F4', '#8B8CF5', '#5BA8F0', '#4FD1C5', '#6FCF97', '#A3B18A', '#C9A27E', '#8D99AE'];

function cmCategoryStats(type) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const stats = {};
  (state.transactions || []).forEach(t => {
    if (t.type !== type) return;
    const s = stats[t.categoryId] || (stats[t.categoryId] = { count: 0, month: 0 });
    s.count++;
    if (String(t.date || '').startsWith(ym)) s.month += Number(t.amount) || 0;
  });
  return stats;
}

function cmUsedCount(id) {
  return (state.transactions || []).filter(t => t.categoryId === id).length;
}

function cmRenderPickers() {
  const tab = state.catDialogTab || 'expense';
  const eg = document.getElementById('cmEmojiGrid');
  const cg = document.getElementById('cmColorGrid');
  if (eg) {
    const list = [...CM_EMOJIS[tab]];
    if (state.cmEmoji && !list.includes(state.cmEmoji)) list.unshift(state.cmEmoji);
    eg.innerHTML = `<button type="button" class="cm-emoji cm-emoji-none${!state.cmEmoji ? ' active' : ''}" data-emoji="" title="Без значка">Аа</button>`
      + list.map(e => `<button type="button" class="cm-emoji${state.cmEmoji === e ? ' active' : ''}" data-emoji="${e}">${e}</button>`).join('');
  }
  if (cg) {
    const cur = String(state.cmColor || '').toLowerCase();
    const isCustom = !CM_COLORS.some(c => c.toLowerCase() === cur);
    cg.innerHTML = CM_COLORS.map(c => `<button type="button" class="cm-color${c.toLowerCase() === cur ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')
      + `<label class="cm-color cm-color-custom${isCustom ? ' active' : ''}" title="Свой цвет" style="${isCustom ? `background:${escapeHtml(state.cmColor)}` : ''}"><input type="color" id="categoryColor" value="${escapeHtml(state.cmColor || '#F5BD7A')}"><span>🎨</span></label>`;
  }
}

function cmUpdatePreview() {
  const prev = document.getElementById('cmPreview');
  if (!prev) return;
  const title = (document.getElementById('categoryName')?.value || '').trim();
  const tab = state.catDialogTab || 'expense';
  const cat = state.cmEditId ? (state.categories[tab] || []).find(c => c.id === state.cmEditId) : null;
  const name = (state.cmEmoji ? state.cmEmoji + ' ' : '') + (title || (state.cmEmoji ? '' : 'Категория'));
  prev.innerHTML = renderCatBadgeHTML({ name, color: state.cmColor || '#F5BD7A', iconType: state.cmEmoji ? undefined : cat?.iconType });
}

function cmOpenEditor(id) {
  const tab = state.catDialogTab || 'expense';
  const form = document.getElementById('categoryForm');
  if (!form) return;
  const cats = state.categories[tab] || [];
  const cat = id ? cats.find(c => c.id === id) : null;
  state.cmEditId = cat ? cat.id : null;
  state.cmEmoji = cat ? (catEmoji(cat.name) || '') : '';
  state.cmColor = cat ? catColorOf(cat) : CM_COLORS[cats.length % CM_COLORS.length];
  document.getElementById('categoryName').value = cat ? (catEmoji(cat.name) ? cleanCatTitle(cat.name) : cat.name) : '';
  const titleEl = document.getElementById('cmEditorTitle');
  if (titleEl) titleEl.textContent = cat ? 'Изменить категорию' : (tab === 'income' ? 'Новая категория дохода' : 'Новая категория расхода');
  const submit = document.getElementById('cmSubmit');
  if (submit) submit.textContent = cat ? 'Сохранить' : 'Добавить';
  const del = document.getElementById('cmDelete');
  const hint = document.getElementById('cmDeleteHint');
  const used = cat ? cmUsedCount(cat.id) : 0;
  if (del) { del.hidden = !cat; del.disabled = used > 0; }
  if (hint) {
    hint.hidden = !(cat && used);
    hint.textContent = used ? `Удалить нельзя: в категории ${used} ${v6Plural(used, ['операция', 'операции', 'операций'])}. Можно переименовать или сменить цвет.` : '';
  }
  form.hidden = false;
  document.getElementById('categoryDialog')?.classList.add('cm-editing');
  cmRenderPickers();
  cmUpdatePreview();
  renderCategoryList();
  form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (!cat) setTimeout(() => document.getElementById('categoryName')?.focus(), 60);
}

function cmCloseEditor() {
  const form = document.getElementById('categoryForm');
  if (form) form.hidden = true;
  document.getElementById('categoryDialog')?.classList.remove('cm-editing');
  state.cmEditId = null;
  renderCategoryList();
}

function openCategoryDialog(defaultType) {
  if (typeof defaultType === 'string' && (defaultType === 'expense' || defaultType === 'income')) {
    state.catDialogTab = defaultType;
  } else {
    state.catDialogTab = state.activeTab === 'income' ? 'income' : 'expense';
  }
  const search = document.getElementById('catSearch');
  if (search) search.value = '';
  const form = document.getElementById('categoryForm');
  if (form) form.hidden = true;
  document.getElementById('categoryDialog')?.classList.remove('cm-editing');
  state.cmEditId = null;
  renderCategoryList();
  document.getElementById('categoryDialog').showModal();
}

function addCategory(e) {
  if (e) e.preventDefault();
  const tab = state.catDialogTab || 'expense';
  const nameInput = document.getElementById('categoryName');
  const title = (nameInput?.value || '').trim();
  if (!title) { nameInput?.focus(); showToast('Введите название категории'); return; }
  const fullName = state.cmEmoji ? `${state.cmEmoji} ${title}` : title;
  const color = state.cmColor || '#F5BD7A';
  const cats = state.categories[tab] || (state.categories[tab] = []);
  const norm = s => cleanCatTitle(s).trim().toLowerCase();
  if (cats.some(c => c.id !== state.cmEditId && norm(c.name) === norm(fullName))) {
    showToast('Такая категория уже есть');
    return;
  }
  if (state.cmEditId) {
    const idx = cats.findIndex(c => c.id === state.cmEditId);
    if (idx !== -1) {
      cats[idx] = { ...cats[idx], name: fullName, color };
      syncItem('categories', 'upsert', { ...cats[idx], type: tab });
      showToast('Категория сохранена');
    }
  } else {
    const newCat = { id: uid(), name: fullName, color, type: tab };
    cats.push(newCat);
    syncItem('categories', 'upsert', newCat);
    showToast('Категория добавлена');
  }
  saveData();
  cmCloseEditor();
  renderCategoryFilter();
  renderTxCategorySelect();
  render();
}

function deleteCategory(id) {
  const tab = state.catDialogTab || 'expense';
  const used = state.transactions.some(t => t.categoryId === id);
  if (used) {
    showToast('Нельзя удалить: есть транзакции в этой категории');
    return;
  }
  const cat = (state.categories[tab] || []).find(c => c.id === id);
  if (cat && !confirm(`Удалить категорию «${cleanCatTitle(cat.name)}»?`)) return;
  state.categories[tab] = state.categories[tab].filter(c => c.id !== id);
  saveData();
  cmCloseEditor();
  renderCategoryFilter();
  renderTxCategorySelect();
  render();
  syncItem('categories', 'delete', { id });
  showToast('Категория удалена');
}

function openEditCategoryDialog(id) {
  const tab = state.catDialogTab || 'expense';
  const cat = state.categories[tab].find(c => c.id === id);
  if (!cat) return;
  document.getElementById('editCategoryId').value = id;
  document.getElementById('editCategoryName').value = cat.name;
  document.getElementById('editCategoryColor').value = cat.color;
  document.getElementById('editCategoryDialog').showModal();
}

function saveEditCategory(e) {
  e.preventDefault();
  const tab = state.catDialogTab || 'expense';
  const id = document.getElementById('editCategoryId').value;
  const name = document.getElementById('editCategoryName').value.trim();
  const color = document.getElementById('editCategoryColor').value;
  if (!name) return;
  const idx = state.categories[tab].findIndex(c => c.id === id);
  if (idx !== -1) {
    state.categories[tab][idx] = { ...state.categories[tab][idx], name, color };
    const updatedCat = { ...state.categories[tab][idx], type: tab };
    saveData();
    renderCategoryList();
    renderCategoryFilter();
    renderTxCategorySelect();
    render();
    syncItem('categories', 'upsert', updatedCat);
  }
  document.getElementById('editCategoryDialog').close();
  document.getElementById('categoryDialog').showModal();
  showToast('Категория обновлена');
}

/* ===== ТЕМА (СВЕТЛАЯ БУМАЖНАЯ ПО УМОЛЧАНИЮ / ТЁМНАЯ) ===== */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  updateThemeToggle();
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeToggle();
}

function updateThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
  btn.classList.toggle('on', isDark);
}

/* ===== ЭКСПОРТ И ИМПОРТ (CSV и полный бэкап JSON) ===== */
function csvCell(v) {
  if (v === undefined || v === null) v = '';
  return '"' + String(v).replace(/\r?\n/g, ' ').replace(/"/g, '""') + '"';
}
function downloadBlob(text, mime, filename) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function getTemplatesList() {
  if (state.templates) return state.templates;
  try { return JSON.parse(localStorage.getItem('koshelek_templates')) || []; } catch { return []; }
}

function exportCSV() {
  const allCats = [...state.categories.expense, ...state.categories.income];
  const catName = id => (allCats.find(c => c.id === id) || {}).name || id;
  const accName = id => getAccountName(id);
  const line = arr => arr.map(csvCell).join(',');
  const out = [];
  out.push('# TRANSACTIONS');
  out.push(line(['ID операции','Тип','Сумма','ID категории','Категория','Дата','Комментарий','ID счёта','Счёт','Оплачено','Повтор']));
  state.transactions.forEach(tx => out.push(line([
    tx.id, tx.type === 'income' ? 'Доход' : 'Расход', tx.amount, tx.categoryId, catName(tx.categoryId), tx.date,
    tx.comment || '', tx.accountId || 'default', accName(tx.accountId || 'default'),
    tx.paid === false ? 'Нет' : 'Да', tx.recurrence || 'none'
  ])));
  out.push('');
  out.push('# CATEGORIES');
  out.push(line(['ID категории','Тип категории','Название категории','Цвет','Иконка']));
  [['expense','Расход'],['income','Доход']].forEach(([t, l]) =>
    state.categories[t].forEach(c => out.push(line([c.id, l, c.name, c.color || '', c.iconType || '']))));
  out.push('');
  out.push('# ACCOUNTS');
  out.push(line(['ID счёта','Название счёта','Начальный баланс']));
  (state.accounts || []).forEach(a => out.push(line([a.id, a.name, a.initialBalance || 0])));
  out.push('');
  out.push('# TEMPLATES');
  out.push(line(['ID шаблона','Название','Тип','ID категории','Комментарий','Сумма']));
  getTemplatesList().forEach(t => out.push(line([t.id, t.name, t.type || 'expense', t.categoryId || '', t.comment || '', t.amount || ''])));
  out.push('');
  out.push('# SETTINGS');
  out.push(line(['Параметр','Значение']));
  out.push(line(['balanceAdjustment', state.balanceAdjustment || 0]));
  downloadBlob('\uFEFF' + out.join('\n'), 'text/csv;charset=utf-8;', `koshelek_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast('CSV экспортирован (операции, категории, счета, шаблоны)');
}

function exportBackupJSON() {
  const data = {
    app: 'koshelek',
    format: 2,
    exportedAt: new Date().toISOString(),
    transactions: state.transactions,
    categories: state.categories,
    accounts: state.accounts,
    templates: getTemplatesList(),
    balanceAdjustment: state.balanceAdjustment || 0,
    settings: {
      theme: localStorage.getItem(THEME_KEY) || 'light',
      aiProvider: state.aiProvider || '',
      aiModel: state.aiModel || '',
      aiApiUrl: state.aiApiUrl || ''
    }
  };
  downloadBlob(JSON.stringify(data, null, 2), 'application/json;charset=utf-8;', `koshelek_backup_${new Date().toISOString().slice(0, 10)}.json`);
  showToast('Полный бэкап сохранён (ключ ИИ не включён)');
}

function importBackupJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(String(e.target.result).replace(/^\uFEFF/, ''));
      if (!d || !Array.isArray(d.transactions)) { showToast('Это не бэкап Кошелька'); return; }
      const replaceAll = confirm('Заменить текущие данные данными из бэкапа?\n\nОК — заменить всё\nОтмена — только добавить недостающее');
      const cats = d.categories || { expense: [], income: [] };
      if (replaceAll) {
        state.transactions = d.transactions;
        state.categories = { expense: cats.expense || [], income: cats.income || [] };
        if (Array.isArray(d.accounts) && d.accounts.length) state.accounts = d.accounts;
        state.balanceAdjustment = parseFloat(d.balanceAdjustment) || 0;
        state.templates = Array.isArray(d.templates) ? d.templates : [];
      } else {
        const ids = new Set(state.transactions.map(t => t.id));
        d.transactions.forEach(t => { if (!ids.has(t.id)) state.transactions.push(t); });
        ['expense', 'income'].forEach(type => {
          const have = new Set(state.categories[type].map(c => c.id));
          (cats[type] || []).forEach(c => { if (!have.has(c.id)) state.categories[type].push(c); });
        });
        const accIds = new Set((state.accounts || []).map(a => a.id));
        (d.accounts || []).forEach(a => { if (!accIds.has(a.id)) state.accounts.push(a); });
        const tpl = getTemplatesList(); const tIds = new Set(tpl.map(t => t.id));
        state.templates = [...tpl, ...(d.templates || []).filter(t => !tIds.has(t.id))];
      }
      localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));
      saveData();
      renderTemplates();
      render();
      showToast(`Бэкап загружен: ${d.transactions.length} операций`);
    } catch { showToast('Ошибка чтения бэкапа'); }
  };
  reader.readAsText(file, 'utf-8');
}

const CSV_HEADER_MAP = {
  'id': 'id', 'ID операции': 'id', 'ID': 'id',
  'type': 'type', 'Тип': 'type', 'Тип операции': 'type',
  'amount': 'amount', 'Сумма': 'amount',
  'categoryId': 'categoryId', 'ID категории': 'categoryId',
  'categoryName': 'categoryName', 'Категория': 'categoryName',
  'date': 'date', 'Дата': 'date',
  'comment': 'comment', 'Комментарий': 'comment',
  'ID счёта': 'accountId', 'accountId': 'accountId',
  'Оплачено': 'paid', 'paid': 'paid',
  'Повтор': 'recurrence', 'recurrence': 'recurrence'
};

const CSV_CAT_HEADER_MAP = {
  'cat_id': 'cat_id', 'ID категории': 'cat_id',
  'cat_type': 'cat_type', 'Тип категории': 'cat_type',
  'cat_name': 'cat_name', 'Название категории': 'cat_name',
  'cat_color': 'cat_color', 'Цвет': 'cat_color',
  'cat_icon': 'cat_icon', 'Иконка': 'cat_icon'
};

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target.result.replace(/^\uFEFF/, '');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      let mode = 'tx';
      const newTransactions = [];
      const newCategories = { expense: [], income: [] };
      let txHeaders = null;
      let catHeaders = null;
      let auxHeaders = false;
      const newAccounts = [], newTemplates = [];
      let newAdjustment = null;

      for (const line of lines) {
        if (line.startsWith('# TRANSACTIONS')) { mode = 'tx'; txHeaders = null; continue; }
        if (line.startsWith('# CATEGORIES')) { mode = 'cat'; catHeaders = null; continue; }
        if (line.startsWith('# ACCOUNTS')) { mode = 'acc'; auxHeaders = false; continue; }
        if (line.startsWith('# TEMPLATES')) { mode = 'tpl'; auxHeaders = false; continue; }
        if (line.startsWith('# SETTINGS')) { mode = 'set'; auxHeaders = false; continue; }
        if (line.startsWith('#')) continue;

        const cols = parseCSVLine(line);
        if (mode === 'tx') {
          if (!txHeaders) {
            txHeaders = cols.map(c => CSV_HEADER_MAP[c.trim()] || c.trim());
            continue;
          }
          const row = Object.fromEntries(txHeaders.map((h, i) => [h, cols[i] ?? '']));
          if (row.id && row.type && row.amount && row.date) {
            newTransactions.push({
              id: row.id,
              type: (row.type === 'income' || row.type === 'Доход') ? 'income' : 'expense',
              amount: parseFloat(row.amount),
              categoryId: row.categoryId || 'e_prod',
              date: row.date,
              comment: row.comment || '',
              accountId: row.accountId || 'default',
              paid: !(row.paid === 'Нет' || row.paid === 'false'),
              recurrence: row.recurrence || 'none'
            });
          }
        } else if (mode === 'cat') {
          if (!catHeaders) {
            catHeaders = cols.map(c => CSV_CAT_HEADER_MAP[c.trim()] || c.trim());
            continue;
          }
          const row = Object.fromEntries(catHeaders.map((h, i) => [h, cols[i] ?? '']));
          if (row.cat_id && row.cat_type && row.cat_name) {
            const type = (row.cat_type === 'income' || row.cat_type === 'Доход') ? 'income' : 'expense';
            const nc = { id: row.cat_id, name: row.cat_name, color: row.cat_color || '#F5BD7A' };
            if (row.cat_icon) nc.iconType = row.cat_icon;
            newCategories[type].push(nc);
          }
        } else if (mode === 'acc' || mode === 'tpl' || mode === 'set') {
          if (!auxHeaders) { auxHeaders = true; continue; }
          if (mode === 'acc' && cols[0]) newAccounts.push({ id: cols[0], name: cols[1] || cols[0], initialBalance: parseFloat(cols[2]) || 0 });
          if (mode === 'tpl' && cols[0]) {
            const t = { id: cols[0], name: cols[1] || '', type: cols[2] === 'income' ? 'income' : 'expense', categoryId: cols[3] || '', comment: cols[4] || '' };
            if (parseFloat(cols[5]) > 0) t.amount = parseFloat(cols[5]);
            newTemplates.push(t);
          }
          if (mode === 'set' && cols[0] === 'balanceAdjustment') newAdjustment = parseFloat(cols[1]) || 0;
        }
      }

      if (!newTransactions.length && !newCategories.expense.length && !newCategories.income.length) {
        showToast('Файл не содержит данных');
        return;
      }

      const hadTx = state.transactions.length > 0;
      const existingTxIds = new Set(state.transactions.map(t => t.id));
      let addedTx = 0;
      newTransactions.forEach(tx => {
        if (!existingTxIds.has(tx.id)) { state.transactions.push(tx); addedTx++; }
      });

      ['expense', 'income'].forEach(type => {
        const existingCatIds = new Set(state.categories[type].map(c => c.id));
        newCategories[type].forEach(c => {
          if (!existingCatIds.has(c.id)) state.categories[type].push(c);
        });
      });

      const haveAcc = new Set((state.accounts || []).map(a => a.id));
      newAccounts.forEach(a => { if (!haveAcc.has(a.id)) state.accounts.push(a); });
      const tpl = getTemplatesList(); const haveTpl = new Set(tpl.map(t => t.id));
      state.templates = [...tpl, ...newTemplates.filter(t => !haveTpl.has(t.id))];
      localStorage.setItem('koshelek_templates', JSON.stringify(state.templates));
      if (newAdjustment !== null && !hadTx) state.balanceAdjustment = newAdjustment;
      saveData();
      renderTemplates();
      render();
      showToast(`Импортировано: ${addedTx} записей`);
    } catch {
      showToast('Ошибка чтения CSV-файла');
    }
  };
  reader.readAsText(file, 'utf-8');
}

/* ===== УМНЫЙ ИМПОРТ С ИИ И БЫСТРОЕ ДОБАВЛЕНИЕ ===== */
let _aiImportFile = null;

async function aiImportChunk(rows, chunkIndex, totalChunks) {
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = `You are an expert financial transaction parser.
Parse the following rows from a bank statement CSV/text file and extract transactions as JSON.
Chunk ${chunkIndex} of ${totalChunks}.

For each transaction extract:
- "type": "expense" or "income"
- "amount": positive number
- "categoryName": category with emoji prefix matching: ${state.categories.expense.concat(state.categories.income).map(c => c.name).join(', ')}.
- "date": YYYY-MM-DD (default to ${currentDate} if missing).
- "comment": short description.

Return ONLY a valid JSON array.

Rows:
${rows.join('\n')}`;

  const responseText = await callAI([{ role: 'user', parts: [{ text: prompt }] }]);
  const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [];
}

function splitIntoChunks(text, chunkSize) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize));
  }
  return chunks;
}

async function aiSmartImportFromFile(file) {
  const apiKey = localStorage.getItem(AI_KEY) || '';
  if (!apiKey) {
    showToast('Сначала укажите API Key в Настройках!');
    openSettingsDialog();
    return;
  }

  const submitBtn = document.getElementById('submitAiImportBtn');
  const cancelBtn = document.getElementById('cancelAiImport');
  const dropZone = document.getElementById('aiImportDropZone');
  const progressEl = document.getElementById('aiImportProgress');
  const progressLabel = document.getElementById('aiImportProgressLabel');
  const progressCount = document.getElementById('aiImportProgressCount');
  const progressBar = document.getElementById('aiImportProgressBar');
  const progressSub = document.getElementById('aiImportProgressSub');

  if (submitBtn) submitBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  if (dropZone) dropZone.style.opacity = '0.5';
  if (progressEl) progressEl.style.display = 'block';

  const CHUNK_SIZE = 80;
  let allItems = [];
  let totalImported = 0;

  const updateProgress = (done, total, label, sub) => {
    if (progressLabel) progressLabel.textContent = label;
    if (progressCount) progressCount.textContent = `${done} / ${total}`;
    if (progressBar) progressBar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    if (progressSub) progressSub.textContent = sub || '';
  };

  const ext = file.name.split('.').pop().toLowerCase();

  try {
    let rawText = '';
    if (ext === 'xlsx' || ext === 'xls') {
      if (!window.XLSX) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = evt => {
          try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            let result = '';
            wb.SheetNames.forEach(name => {
              const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
              if (csv.trim()) result += csv + '\n';
            });
            resolve(result);
          } catch { reject(new Error('xlsx_parse_error')); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    } else {
      rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = evt => resolve(evt.target.result.replace(/^\uFEFF/, ''));
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      });
    }

    const chunks = splitIntoChunks(rawText, CHUNK_SIZE);
    const totalChunks = chunks.length;
    if (!totalChunks) {
      showToast('Файл пуст');
      return;
    }

    for (let i = 0; i < totalChunks; i++) {
      updateProgress(i, totalChunks, `✨ Часть ${i + 1} из ${totalChunks}...`, `Найдено: ${allItems.length}`);
      try {
        const items = await aiImportChunk(chunks[i], i + 1, totalChunks);
        allItems = allItems.concat(items);
      } catch (err) {
        console.warn(`Chunk ${i + 1} error:`, err);
      }
    }

    const colors = ['#F5BD7A', '#F48278', '#E46C99', '#67C992', '#B794F4', '#76A9FA'];
    allItems.forEach(item => {
      if (!item.amount || !item.type || !item.categoryName) return;
      const type = item.type === 'income' ? 'income' : 'expense';
      const cleanCatName = item.categoryName.trim();
      let cat = state.categories[type].find(c => {
        const n1 = cleanCatTitle(c.name).toLowerCase();
        const n2 = cleanCatTitle(cleanCatName).toLowerCase();
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
      });
      if (!cat) {
        cat = { id: uid(), name: cleanCatName, color: colors[Math.floor(Math.random() * colors.length)] };
        state.categories[type].push(cat);
      }
      state.transactions.push({
        id: uid(),
        type,
        amount: parseFloat(item.amount),
        categoryId: cat.id,
        date: item.date || new Date().toISOString().slice(0, 10),
        comment: item.comment || '',
        accountId: 'default',
        paid: true
      });
      totalImported++;
    });

    saveData();
    render();
    const d = document.getElementById('aiImportDialog');
    if (d) d.close();
    showToast(`🪄 ИИ добавил ${totalImported} операций!`);
  } catch {
    showToast('Ошибка при импорте файла');
  } finally {
    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = false;
    if (dropZone) dropZone.style.opacity = '1';
    if (progressEl) progressEl.style.display = 'none';
    _aiImportFile = null;
    const fileNameEl = document.getElementById('aiImportFileName');
    if (fileNameEl) fileNameEl.textContent = 'Нажмите или перетащите файл сюда';
  }
}

async function quickAiSmartImport(inputText) {
  const apiKey = localStorage.getItem(AI_KEY) || '';
  if (!apiKey) {
    showToast('Сначала укажите API Key в Настройках!');
    openSettingsDialog();
    return;
  }

  const loader = document.getElementById('quickAiAddLoader');
  const submitBtn = document.getElementById('submitQuickAiAddBtn');
  if (loader) loader.style.display = 'flex';
  if (submitBtn) submitBtn.disabled = true;

  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const prompt = `System Context: Parse raw financial text into JSON array of transactions.
Current Date: ${currentDate}.
Fields per transaction:
- "type": "expense" or "income" (if unclear, use "${getFlowType()}")
- "amount": positive number
- "categoryName": category name matching one of: ${state.categories.expense.concat(state.categories.income).map(c => c.name).join(', ')}
- "date": YYYY-MM-DD (default ${currentDate})
- "comment": short comment
Return ONLY valid JSON array.

Text:
${inputText}`;

  try {
    const responseText = await callAI([{ role: 'user', parts: [{ text: prompt }] }]);
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('NOT_ARRAY');

    let importedCount = 0;
    const addedIds = [];
    const colors = ['#F5BD7A', '#F48278', '#E46C99', '#67C992', '#B794F4'];

    parsed.forEach(item => {
      if (!item.amount || !item.type || !item.categoryName) return;
      const type = item.type === 'income' ? 'income' : 'expense';
      const cleanCatName = item.categoryName.trim();
      let cat = state.categories[type].find(c => {
        const n1 = cleanCatTitle(c.name).toLowerCase();
        const n2 = cleanCatTitle(cleanCatName).toLowerCase();
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
      });
      if (!cat) {
        cat = { id: uid(), name: cleanCatName, color: colors[Math.floor(Math.random() * colors.length)] };
        state.categories[type].push(cat);
        syncItem('categories', 'upsert', { id: cat.id, type, name: cat.name, color: cat.color });
      }
      const txDate = item.date || currentDate;
      const newTx = {
        id: uid(),
        type,
        amount: parseFloat(item.amount),
        categoryId: cat.id,
        date: txDate,
        comment: item.comment || '',
        accountId: 'default',
        paid: true,
        recurrence: 'none'
      };
      state.transactions.push(newTx);
      addedIds.push(newTx.id);
      syncItem('transactions', 'upsert', newTx);
      importedCount++;
    });

    saveData();
    render();
    const d = document.getElementById('quickAiAddDialog');
    if (d) d.close();
    showToast(`🪄 ИИ распознал и добавил ${importedCount} операций!`, addedIds.length ? () => undoQuickTx(addedIds) : undefined);
  } catch {
    showToast('Ошибка ИИ при распознавании текста');
  } finally {
    if (loader) loader.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ===== ДИАЛОГ НАСТРОЕК И СОХРАНЕНИЕ КЛЮЧА ИИ ===== */
function updateAiSettingsStatusUI() {
  const badge = document.getElementById('aiSavedStatusBadge');
  const keyEl = document.getElementById('aiApiKey');
  const modelEl = document.getElementById('aiModel');
  const providerEl = document.getElementById('aiProvider');
  const chipsWrap = document.getElementById('aiModelPresetChips');

  const keyVal = (keyEl ? keyEl.value : localStorage.getItem(AI_KEY) || '').trim();
  const modelVal = (modelEl ? modelEl.value : localStorage.getItem(AI_MODEL_KEY) || state.aiModel || 'gemini-2.5-flash').trim();
  const providerVal = providerEl ? providerEl.value : (localStorage.getItem(AI_PROVIDER_KEY) || state.aiProvider || 'google');

  if (badge) {
    if (keyVal.length > 5) {
      badge.textContent = `✓ Сохранено (${modelVal || 'ИИ'})`;
      badge.classList.add('saved');
    } else {
      badge.textContent = 'Ключ не задан';
      badge.classList.remove('saved');
    }
  }

  if (chipsWrap) {
    chipsWrap.style.display = providerVal === 'google' ? 'flex' : 'none';
    chipsWrap.querySelectorAll('.ai-model-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.model === modelVal);
    });
  }
}

function saveAiSettings(showFeedback = false) {
  const keyEl = document.getElementById('aiApiKey');
  if (keyEl) {
    localStorage.setItem(AI_KEY, keyEl.value.trim());
  }
  const providerEl = document.getElementById('aiProvider');
  if (providerEl && providerEl.value) {
    state.aiProvider = providerEl.value;
    localStorage.setItem(AI_PROVIDER_KEY, state.aiProvider);
  }
  const urlEl = document.getElementById('aiApiUrl');
  if (urlEl) {
    state.aiApiUrl = urlEl.value.trim();
    localStorage.setItem(AI_URL_KEY, state.aiApiUrl);
  }
  const modelEl = document.getElementById('aiModel');
  if (modelEl) {
    const m = modelEl.value.trim() || (state.aiProvider === 'google' ? 'gemini-2.5-flash' : state.aiProvider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat');
    state.aiModel = m;
    localStorage.setItem(AI_MODEL_KEY, state.aiModel);
  }
  saveData();
  updateAiSettingsStatusUI();
  if (showFeedback) {
    const hasKey = (localStorage.getItem(AI_KEY) || '').trim().length > 0;
    showToast(hasKey ? `✅ Ключ и модель (${state.aiModel}) сохранены!` : 'Настройки ИИ обновлены');
  }
}

function openSettingsDialog() {
  updateThemeToggle();
  state.aiProvider = localStorage.getItem(AI_PROVIDER_KEY) || state.aiProvider || 'google';
  state.aiApiUrl = localStorage.getItem(AI_URL_KEY) || state.aiApiUrl || '';
  state.aiModel = localStorage.getItem(AI_MODEL_KEY) || state.aiModel || 'gemini-2.5-flash';

  const providerEl = document.getElementById('aiProvider');
  if (providerEl) providerEl.value = state.aiProvider;
  const urlEl = document.getElementById('aiApiUrl');
  if (urlEl) urlEl.value = state.aiApiUrl;
  const modelEl = document.getElementById('aiModel');
  if (modelEl) modelEl.value = state.aiModel;
  const keyEl = document.getElementById('aiApiKey');
  if (keyEl) keyEl.value = localStorage.getItem(AI_KEY) || '';
  const urlLabel = document.getElementById('aiApiUrlLabel');
  if (urlLabel) urlLabel.style.display = state.aiProvider === 'custom' ? 'flex' : 'none';

  updateAiSettingsStatusUI();

  const supabaseUrlEl = document.getElementById('supabaseUrlInput');
  if (supabaseUrlEl) supabaseUrlEl.value = localStorage.getItem('supabase_url') || '';
  const supabaseKeyEl = document.getElementById('supabaseKeyInput');
  if (supabaseKeyEl) supabaseKeyEl.value = localStorage.getItem('supabase_key') || '';

  fillSettingsBalance();
  renderAccounts();
  document.getElementById('settingsDialog').showModal();
}

function clearAllData() {
  if (!confirm('Удалить все локальные транзакции и категории? Это действие нельзя отменить.')) return;
  state.transactions = [];
  state.categories = {
    expense: [...DEFAULT_CATEGORIES.expense],
    income: [...DEFAULT_CATEGORIES.income]
  };
  state.balanceAdjustment = 0;
  saveData();
  render();
  showToast('Все локальные данные удалены');
}

/* ===== АНАЛИТИКА И ШТРИХОВАННАЯ КОЛЬЦЕВАЯ ДИАГРАММА (РЕФЕРЕНС 4) ===== */
let dashPeriod = 'month';

function getDashRange(period) {
  if (period === 'month' && state.periodScope === 'month') {
    return getPeriodRange();
  }
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === 'all') return { from: '0000-01-01', to: '9999-12-31' };
  if (period === 'year') return { from: `${state.selectedYear}-01-01`, to: `${state.selectedYear}-12-31` };
  if (period === 'quarter') {
    const q = Math.floor(state.selectedMonth / 3);
    const from = new Date(state.selectedYear, q * 3, 1).toISOString().slice(0, 10);
    const to = new Date(state.selectedYear, q * 3 + 3, 0).toISOString().slice(0, 10);
    return { from, to };
  }
  return getPeriodRange();
}

function renderDashCategoryFilter() {
  const sel = document.getElementById('dashCategoryFilter');
  if (!sel) return;
  const cats = [...state.categories.expense, ...state.categories.income];
  sel.innerHTML = '<option value="all">Все категории</option>' +
    cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  sel.value = state.dashFilters.category || 'all';
}

function renderDashboard() {
  let from = '', to = '';
  if (state.dashFilters.dateFrom || state.dashFilters.dateTo) {
    from = state.dashFilters.dateFrom || '0000-01-01';
    to = state.dashFilters.dateTo || '9999-12-31';
  } else {
    const range = getDashRange(dashPeriod);
    from = range.from;
    to = range.to;
  }

  let txs = state.transactions.filter(t => t.date >= from && t.date <= to);

  if (state.dashFilters.search) {
    const q = state.dashFilters.search.toLowerCase();
    txs = txs.filter(tx => {
      const cat = getCat(tx.type, tx.categoryId);
      return cat.name.toLowerCase().includes(q) || (tx.comment || '').toLowerCase().includes(q);
    });
  }
  if (state.dashFilters.category && state.dashFilters.category !== 'all') {
    txs = txs.filter(tx => tx.categoryId === state.dashFilters.category);
  }
  if (state.dashFilters.amountMin !== '') {
    txs = txs.filter(tx => tx.amount >= parseFloat(state.dashFilters.amountMin));
  }
  if (state.dashFilters.amountMax !== '') {
    txs = txs.filter(tx => tx.amount <= parseFloat(state.dashFilters.amountMax));
  }

  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  const summaryEl = document.getElementById('dashSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="dash-cards">
        <div class="dash-card income">
          <div class="dash-card-label">Доходы</div>
          <div class="dash-card-val">${fmt(income)}</div>
        </div>
        <div class="dash-card expense">
          <div class="dash-card-label">Расходы</div>
          <div class="dash-card-val">${fmt(expense)}</div>
        </div>
        <div class="dash-card net ${net >= 0 ? 'pos' : 'neg'}">
          <div class="dash-card-label">Баланс</div>
          <div class="dash-card-val">${fmt(net)}</div>
        </div>
      </div>`;
  }

  renderDashDonutChart(txs);
  renderDashExtremes(txs);
  renderDashBarChart(txs);
  renderDashBreakdown('dashExpenseBreakdown', txs.filter(t => t.type === 'expense'), 'expense', expense);
  renderDashBreakdown('dashIncomeBreakdown', txs.filter(t => t.type === 'income'), 'income', income);
  renderDashYearlyDetail();
  renderDashTop(txs);
}

/* Кольцевая диаграмма со штриховкой + выносные бейджи с процентами (Референс 4) */
function describeDonutSector(cx, cy, rOuter, rInner, startAngleDeg, endAngleDeg) {
  const span = endAngleDeg - startAngleDeg;
  if (span >= 359.9) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `Z`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx - 0.01} ${cy - rInner}`,
      `Z`
    ].join(' ');
  }

  const toRad = deg => ((deg - 90) * Math.PI) / 180;
  const startOuter = { x: cx + rOuter * Math.cos(toRad(startAngleDeg)), y: cy + rOuter * Math.sin(toRad(startAngleDeg)) };
  const endOuter = { x: cx + rOuter * Math.cos(toRad(endAngleDeg)), y: cy + rOuter * Math.sin(toRad(endAngleDeg)) };
  const startInner = { x: cx + rInner * Math.cos(toRad(endAngleDeg)), y: cy + rInner * Math.sin(toRad(endAngleDeg)) };
  const endInner = { x: cx + rInner * Math.cos(toRad(startAngleDeg)), y: cy + rInner * Math.sin(toRad(startAngleDeg)) };
  const largeArc = span > 180 ? 1 : 0;

  return [
    `M ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
    `L ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
    `Z`
  ].join(' ');
}

function renderDashDonutChart(txs) {
  const stage = document.getElementById('dashDonutChart');
  const scriptTitle = document.getElementById('analyticsScriptTitle');
  const catListEl = document.getElementById('analyticsCategoryList');
  if (!stage) return;

  const targetType = state.analyticsType || 'expense';
  if (scriptTitle) scriptTitle.textContent = targetType === 'income' ? 'Доход' : 'Расходы';

  const filteredTxs = txs.filter(t => t.type === targetType);
  const total = filteredTxs.reduce((s, t) => s + t.amount, 0);

  if (!filteredTxs.length || total <= 0) {
    stage.innerHTML = `<div class="empty-state visible">Нет данных о ${targetType === 'income' ? 'доходах' : 'расходах'} за этот период</div>`;
    if (catListEl) catListEl.innerHTML = '';
    return;
  }

  const totals = {};
  filteredTxs.forEach(tx => { totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount; });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  // v6: аккуратный «бублик» со сплошной заливкой, итог в центре, без выносных значков
  const CX = 170, CY = 170;
  const R_OUTER = 160;
  const R_INNER = 112;
  const info = {};
  const paths = [];
  let angle = 0;
  sorted.forEach(([catId, amt]) => {
    const cat = getCat(targetType, catId);
    const color = escapeHtml(catColorOf(cat));
    const pct = amt / total;
    const sweep = pct * 360;
    info[catId] = { title: cleanCatTitle(cat.name), amt, pct, color, emoji: catEmoji(cat.name) };
    // Полный круг (одна категория) рисуем двумя половинками — дуга 360° в SVG не строится
    const parts = sweep >= 359.9 ? [[angle, angle + 180], [angle + 180, angle + 360]] : [[angle, angle + sweep]];
    parts.forEach(([a0, a1]) => {
      paths.push(`<path class="donut-slice-path v6-slice" d="${describeDonutSector(CX, CY, R_OUTER, R_INNER, a0, a1)}" fill="${color}" data-cat="${escapeHtml(catId)}"><title>${escapeHtml(info[catId].title)}: ${fmt(amt)} (${Math.round(pct * 100)}%)</title></path>`);
    });
    angle += sweep;
  });

  stage.classList.add('v6-donut-stage');
  stage.innerHTML = `
    <svg class="v6-donut-svg" viewBox="0 0 340 340" role="img" aria-label="Структура ${targetType === 'income' ? 'доходов' : 'расходов'} по категориям">
      <circle class="v6-donut-track" cx="${CX}" cy="${CY}" r="${(R_OUTER + R_INNER) / 2}" stroke-width="${R_OUTER - R_INNER}" />
      ${paths.join('')}
      <circle class="v6-donut-inner-ring" cx="${CX}" cy="${CY}" r="${R_INNER - 10}" />
    </svg>
    <button type="button" class="v6-donut-center" aria-live="polite"></button>
  `;

  const center = stage.querySelector('.v6-donut-center');
  const opsWord = n => `${n} ${v6Plural(n, ['операция', 'операции', 'операций'])}`;
  let selected = null;
  const paint = () => {
    stage.classList.toggle('has-selection', !!selected);
    stage.querySelectorAll('.v6-slice').forEach(p => p.classList.toggle('is-active', p.dataset.cat === selected));
    if (catListEl) catListEl.querySelectorAll('.ref-cat-row').forEach(r => r.classList.toggle('is-active', r.dataset.catId === selected));
    if (!selected) {
      center.innerHTML = `<span class="dc-label">${targetType === 'income' ? 'Доходы' : 'Расходы'}</span><span class="dc-value">${fmtShort(total)}</span><span class="dc-sub">${opsWord(filteredTxs.length)}</span>`;
      return;
    }
    const i = info[selected];
    const pctLabel = i.pct < 0.01 ? '<1' : Math.round(i.pct * 100);
    center.innerHTML = `<span class="dc-label" style="color:${i.color}">${i.emoji ? i.emoji + ' ' : ''}${escapeHtml(i.title)}</span><span class="dc-value">${fmtShort(i.amt)}</span><span class="dc-sub">${pctLabel}% · открыть ›</span>`;
  };
  stage.querySelectorAll('.v6-slice').forEach(slice => {
    slice.addEventListener('click', e => {
      e.stopPropagation();
      const id = slice.dataset.cat;
      if (selected === id) { openCategoryInFlow(targetType, id); return; }
      selected = id;
      paint();
    });
  });
  center.addEventListener('click', e => {
    e.stopPropagation();
    if (selected) openCategoryInFlow(targetType, selected);
  });
  stage.onclick = () => { if (selected) { selected = null; paint(); } };

  if (catListEl) {
    catListEl.innerHTML = buildCategorySummaryRowsHTML(filteredTxs, targetType);
    bindCategoryRowClicks(catListEl, targetType);
  }
  paint();
  return;

  // --- ниже старая (v5) отрисовка со штриховкой, больше не используется ---
  const patterns = [];
  const badges = [];
  const R_BADGE = 142;
  let currentAngle = 0;

  sorted.forEach(([catId, amt], idx) => {
    const cat = getCat(targetType, catId);
    const color = cat.color || '#F5BD7A';
    const pct = amt / total;
    const sweep = pct * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;
    const midAngle = startAngle + sweep / 2;
    currentAngle = endAngle;

    const patId = `donut-hatch-${idx}`;
    // Чередуем наклон штриховки для выразительности как на референсе 4
    const rot = idx % 2 === 0 ? -25 : -60;
    patterns.push(`
      <pattern id="${patId}" width="5.5" height="5.5" patternTransform="rotate(${rot})" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="5.5" stroke="${escapeHtml(color)}" stroke-width="2.1" />
      </pattern>
    `);

    const dPath = describeDonutSector(CX, CY, R_OUTER, R_INNER, startAngle, endAngle);
    paths.push(`
      <path class="donut-slice-path"
        d="${dPath}"
        fill="url(#${patId})"
        stroke="var(--bg)"
        stroke-width="3.5"
        fill-rule="evenodd"
        data-cat="${escapeHtml(catId)}">
        <title>${escapeHtml(cleanCatTitle(cat.name))}: ${fmt(amt)} (${Math.round(pct * 100)}%)</title>
      </path>
    `);

    // Выносная иконка и процент вокруг диаграммы (только для секторов >= 6%, чтобы не слипались)
    if (pct >= 0.06) {
      const R_BADGE_SAFE = 134;
      const rad = ((midAngle - 90) * Math.PI) / 180;
      const bx = ((CX + R_BADGE_SAFE * Math.cos(rad)) / 340) * 100;
      const by = ((CY + R_BADGE_SAFE * Math.sin(rad)) / 340) * 100;
      const pctRounded = Math.round(pct * 100);

      badges.push(`
        <div class="donut-outer-badge" style="left:${bx.toFixed(1)}%; top:${by.toFixed(1)}%;">
          <div class="donut-outer-icon" style="background:${escapeHtml(color)}">
            ${getCategorySvgIcon(cat.name, cat.iconType)}
          </div>
          <span class="donut-outer-pct">${pctRounded}%</span>
        </div>
      `);
    }
  });

  stage.innerHTML = `
    <svg class="hatched-donut-svg" viewBox="0 0 340 340">
      <defs>${patterns.join('')}</defs>
      ${paths.join('')}
    </svg>
    ${badges.join('')}
  `;

  stage.querySelectorAll('.donut-slice-path').forEach(slice => {
    slice.addEventListener('click', () => {
      openCategoryInFlow(targetType, slice.dataset.cat);
    });
  });

  if (catListEl) {
    catListEl.innerHTML = buildCategorySummaryRowsHTML(filteredTxs, targetType);
    bindCategoryRowClicks(catListEl, targetType);
  }
}

function renderDashExtremes(txs) {
  const el = document.getElementById('dashExtremes');
  if (!el) return;
  const expenses = txs.filter(t => t.type === 'expense');
  if (!expenses.length) { el.innerHTML = ''; return; }

  const maxTx = expenses.reduce((max, tx) => tx.amount > max.amount ? tx : max, expenses[0]);
  const minTx = expenses.reduce((min, tx) => tx.amount < min.amount ? tx : min, expenses[0]);
  const maxCat = getCat('expense', maxTx.categoryId);
  const minCat = getCat('expense', minTx.categoryId);

  el.innerHTML = `
    <div class="dash-section-title">📊 Экстремумы трат за период</div>
    <div class="dash-extremes-grid">
      <div class="extreme-card max">
        <span class="extreme-label">Самая дорогая покупка</span>
        <span class="extreme-amt">${fmt(maxTx.amount)}</span>
        <span class="extreme-cat">${escapeHtml(cleanCatTitle(maxCat.name))}</span>
        <span class="extreme-comment">${escapeHtml(maxTx.comment || 'Без комментария')}</span>
        <span class="extreme-date">${fmtDate(maxTx.date)}</span>
      </div>
      <div class="extreme-card min">
        <span class="extreme-label">Самая дешевая покупка</span>
        <span class="extreme-amt">${fmt(minTx.amount)}</span>
        <span class="extreme-cat">${escapeHtml(cleanCatTitle(minCat.name))}</span>
        <span class="extreme-comment">${escapeHtml(minTx.comment || 'Без комментария')}</span>
        <span class="extreme-date">${fmtDate(minTx.date)}</span>
      </div>
    </div>`;
}

function renderDashBarChart(txs) {
  const el = document.getElementById('dashBarChart');
  if (!el) return;
  const months = {};
  txs.forEach(tx => {
    const key = tx.date.slice(0, 7);
    if (!months[key]) months[key] = { income: 0, expense: 0 };
    months[key][tx.type] += tx.amount;
  });
  const keys = Object.keys(months).sort();
  if (!keys.length) { el.innerHTML = ''; return; }

  const maxVal = Math.max(...keys.map(k => Math.max(months[k].income, months[k].expense)), 1);
  el.innerHTML = `<div class="dash-section-title">По месяцам</div>
    <div class="dash-bars">
      ${keys.map(k => {
        const d = new Date(k + '-01T00:00:00');
        const label = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
        const ih = Math.round((months[k].income / maxVal) * 100);
        const eh = Math.round((months[k].expense / maxVal) * 100);
        return `<div class="dash-bar-group">
          <div class="dash-bar-pair">
            <div class="dash-bar income" style="height:${ih}%" title="Доходы: ${fmt(months[k].income)}"></div>
            <div class="dash-bar expense" style="height:${eh}%" title="Расходы: ${fmt(months[k].expense)}"></div>
          </div>
          <div class="dash-bar-label">${label}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderDashBreakdown(elId, txs, type, total) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!txs.length) { el.innerHTML = ''; return; }
  const totals = {};
  txs.forEach(tx => { totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount; });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const title = type === 'expense' ? 'Расходы по категориям' : 'Доходы по категориям';

  el.innerHTML = `<div class="dash-section-title">${title}</div>
    <div class="dash-breakdown-list">
      ${sorted.map(([catId, amt]) => {
        const cat = getCat(type, catId);
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        return `<div class="dash-breakdown-row">
          <div class="dash-breakdown-left">
            <span class="dash-breakdown-dot" style="background:${escapeHtml(cat.color)}"></span>
            <span class="dash-breakdown-name">${escapeHtml(cleanCatTitle(cat.name))}</span>
          </div>
          <div class="dash-breakdown-right">
            <span class="dash-breakdown-pct">${pct}%</span>
            <span class="dash-breakdown-amt">${fmt(amt)}</span>
          </div>
        </div>
        <div class="dash-breakdown-bar-wrap">
          <div class="dash-breakdown-bar" style="width:${pct}%;background:${escapeHtml(cat.color)}"></div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderDashYearlyDetail() {
  const el = document.getElementById('dashYearlyList');
  if (!el) return;
  const grouped = {};
  state.transactions.forEach(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    const y = d.getFullYear(), m = d.getMonth();
    if (!grouped[y]) grouped[y] = {};
    if (!grouped[y][m]) grouped[y][m] = [];
    grouped[y][m].push(tx);
  });

  const years = Object.keys(grouped).sort((a, b) => b - a);
  if (!years.length) {
    el.innerHTML = '<li class="empty-state visible">Нет данных о транзакциях</li>';
    return;
  }

  el.innerHTML = years.map(y => {
    const isCollapsed = state.collapsedYearsDetail.has(y);
    const yearTxs = Object.values(grouped[y]).flat();
    const yearSum = yearTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const months = Object.keys(grouped[y]).sort((a, b) => b - a);

    const monthsHtml = isCollapsed ? '' : `
      <div class="dash-months-container">
        ${months.map(m => {
          const monthTxs = grouped[y][m];
          const monthIncome = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const monthExpense = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          return `<div class="dash-month-card">
            <div class="dash-month-name">${monthName(parseInt(m))}</div>
            <div class="dash-month-stats">
              <span>Доход: <strong style="color:var(--income)">${fmt(monthIncome)}</strong></span>
              <span>Расход: <strong style="color:var(--expense)">${fmt(monthExpense)}</strong></span>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    return `<li class="dash-year-row">
      <div class="dash-year-head ${isCollapsed ? 'collapsed' : ''}" data-year="${y}">
        <span>${y} год</span>
        <span>${fmt(yearSum)} трат</span>
      </div>
      ${monthsHtml}
    </li>`;
  }).join('');

  el.querySelectorAll('.dash-year-head').forEach(head => {
    head.addEventListener('click', () => {
      const year = head.dataset.year;
      if (state.collapsedYearsDetail.has(year)) state.collapsedYearsDetail.delete(year);
      else state.collapsedYearsDetail.add(year);
      renderDashYearlyDetail();
    });
  });
}

function renderDashTop(txs) {
  const el = document.getElementById('dashTrend');
  if (!el) return;
  if (!txs.length) { el.innerHTML = ''; return; }
  const top = [...txs].sort((a, b) => b.amount - a.amount).slice(0, 5);
  el.innerHTML = `<div class="dash-section-title">Топ-5 крупнейших операций</div>
    <div class="dash-top-list">
      ${top.map(tx => {
        const cat = getCat(tx.type, tx.categoryId);
        return `<div class="dash-top-row">
          ${renderCatBadgeHTML(cat)}
          <div class="dash-top-body">
            <div class="dash-top-cat">${escapeHtml(cleanCatTitle(cat.name))}</div>
            <div class="dash-top-date">${fmtDate(tx.date)}${tx.comment ? ' · ' + escapeHtml(tx.comment) : ''}</div>
          </div>
          <div class="dash-top-amt ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${fmt(tx.amount)}</div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ===== ИИ ФИНАНСОВЫЙ СОВЕТНИК ===== */
function formatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return html;
}

function renderAiMessages() {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  if (!state.aiChatHistory.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = state.aiChatHistory.map(msg => {
    const text = msg.parts[0].text;
    if (text.startsWith('System Context:')) return '';
    const isUser = msg.role === 'user';
    return `<div class="ai-message ${isUser ? 'user' : 'model'}">${formatMarkdown(text)}</div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function callAI(history) {
  const domKey = document.getElementById('aiApiKey')?.value.trim();
  if (domKey) {
    saveAiSettings(false);
  }
  const apiKey = (localStorage.getItem(AI_KEY) || domKey || '').trim();
  const provider = localStorage.getItem(AI_PROVIDER_KEY) || state.aiProvider || 'google';
  let model = (localStorage.getItem(AI_MODEL_KEY) || state.aiModel || 'gemini-2.5-flash').trim();
  const customUrl = (localStorage.getItem(AI_URL_KEY) || state.aiApiUrl || '').trim();
  if (!apiKey) throw new Error('KEY_MISSING');

  if (provider === 'google') {
    const modelsToTry = [model];
    if (model === 'gemini-3.1-flash-lite') {
      modelsToTry.push('gemini-3.1-flash-lite-preview', 'gemini-2.5-flash');
    } else if (!modelsToTry.includes('gemini-2.5-flash')) {
      modelsToTry.push('gemini-2.5-flash');
    }

    let lastErr = null;
    for (const m of modelsToTry) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: history })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text;
        }
        throw new Error('BAD_RESPONSE');
      }
      if (res.status !== 404) {
        let errText = 'API_ERROR';
        try {
          const errJson = await res.json();
          errText = errJson?.error?.message || `HTTP ${res.status}`;
        } catch {}
        throw new Error(errText);
      }
      lastErr = new Error(`Модель ${m} не найдена (404)`);
    }
    throw lastErr || new Error('API_ERROR');
  } else {
    let baseUrl = 'https://api.openai.com/v1';
    if (provider === 'custom' && customUrl) baseUrl = customUrl.replace(/\/+$/, '');
    const messages = history.map(msg => {
      const role = msg.role === 'model' ? 'assistant' : 'user';
      return { role, content: msg.parts[0].text };
    });
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages })
    });
    if (!res.ok) throw new Error('API_ERROR');
    const data = await res.json();
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    throw new Error('BAD_RESPONSE');
  }
}

async function sendAiMessage() {
  const apiKey = (localStorage.getItem(AI_KEY) || document.getElementById('aiApiKey')?.value || '').trim();
  if (!apiKey) {
    showToast('Сначала укажите API Key в Настройках!');
    openSettingsDialog();
    return;
  }
  const inputEl = document.getElementById('aiChatInput');
  const query = inputEl.value.trim();
  if (!query) return;
  inputEl.value = '';

  state.aiChatHistory.push({ role: 'user', parts: [{ text: query }] });
  renderAiMessages();

  const container = document.getElementById('aiChatMessages');
  const loader = document.createElement('div');
  loader.className = 'ai-message model loader';
  loader.textContent = '✨ Думаю...';
  container.appendChild(loader);
  container.scrollTop = container.scrollHeight;

  if (!state.currentAiSessionId) state.currentAiSessionId = uid();

  try {
    const text = await callAI(state.aiChatHistory);
    loader.remove();
    state.aiChatHistory.push({ role: 'model', parts: [{ text }] });
    renderAiMessages();
    saveAiSession();
  } catch (err) {
    loader.remove();
    const errorMsg = document.createElement('div');
    errorMsg.className = 'ai-message model';
    errorMsg.textContent = `❌ Ошибка API: ${err?.message || 'Проверьте настройки ИИ и ключ'}`;
    container.appendChild(errorMsg);
  }
}

async function startAiReport() {
  const apiKey = (localStorage.getItem(AI_KEY) || document.getElementById('aiApiKey')?.value || '').trim();
  if (!apiKey) {
    showToast('Сначала укажите API Key в Настройках!');
    openSettingsDialog();
    return;
  }
  const { from, to } = getDashRange(dashPeriod);
  const txs = state.transactions.filter(t => t.date >= from && t.date <= to);
  if (!txs.length) {
    showToast('Нет транзакций за этот период для анализа');
    return;
  }

  const summary = txs.map(t => {
    const cat = getCat(t.type, t.categoryId);
    return `${t.date}: ${t.type === 'expense' ? 'Расход' : 'Доход'} ${t.amount} ₽ (${cleanCatTitle(cat.name)}) ${t.comment || ''}`;
  }).join('\n');

  state.aiChatHistory = [{
    role: 'user',
    parts: [{ text: `System Context: You are a friendly personal finance advisor. Transactions:\n${summary}\n\nUser Question: Проанализируй мои расходы и дай 3 практичных совета.` }]
  }];
  state.currentAiSessionId = uid();

  document.getElementById('aiPromptCard').style.display = 'none';
  document.getElementById('aiChatBox').style.display = 'flex';
  const container = document.getElementById('aiChatMessages');
  container.innerHTML = '<div class="ai-message model loader">✨ Анализирую ваш бюджет...</div>';

  try {
    const text = await callAI(state.aiChatHistory);
    state.aiChatHistory.push({ role: 'model', parts: [{ text }] });
    renderAiMessages();
    saveAiSession();
  } catch (err) {
    container.innerHTML = `<div class="ai-message model">❌ Не удалось связаться с ИИ: ${escapeHtml(err?.message || 'Проверьте API-ключ.')}</div>`;
  }
}

function saveAiSession() {
  if (!state.currentAiSessionId) return;
  let title = 'Анализ бюджета с ИИ';
  if (!state.aiSessions) state.aiSessions = [];
  const existingIdx = state.aiSessions.findIndex(s => s.id === state.currentAiSessionId);
  const sessionObj = {
    id: state.currentAiSessionId,
    date: new Date().toISOString(),
    title,
    history: state.aiChatHistory
  };
  if (existingIdx !== -1) state.aiSessions[existingIdx] = sessionObj;
  else state.aiSessions.unshift(sessionObj);
  localStorage.setItem('koshelek_ai_sessions', JSON.stringify(state.aiSessions.slice(0, 15)));
  syncItem('ai_sessions', 'upsert', sessionObj);
}

function deleteAiSession(id) {
  state.aiSessions = (state.aiSessions || []).filter(s => s.id !== id);
  localStorage.setItem('koshelek_ai_sessions', JSON.stringify(state.aiSessions));
  openAiHistoryDialog();
  syncItem('ai_sessions', 'delete', { id });
  showToast('Сессия удалена');
}

function openAiHistoryDialog() {
  const container = document.getElementById('aiHistoryList');
  if (!container) return;
  if (!state.aiSessions || !state.aiSessions.length) {
    container.innerHTML = '<li class="empty-state visible">История консультаций пуста</li>';
    document.getElementById('aiHistoryDialog')?.showModal();
    return;
  }
  container.innerHTML = state.aiSessions.map(s => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<li class="cat-item">
      <div style="flex:1;cursor:pointer;" class="ai-history-select" data-id="${escapeHtml(s.id)}">
        <div style="font-weight:700;font-size:14px;">${escapeHtml(s.title)}</div>
        <div style="font-size:11px;color:var(--text3);">${escapeHtml(dateStr)}</div>
      </div>
      <button type="button" class="cat-item-del ai-history-del" data-id="${escapeHtml(s.id)}">×</button>
    </li>`;
  }).join('');

  container.querySelectorAll('.ai-history-select').forEach(el => {
    el.addEventListener('click', () => {
      const s = state.aiSessions.find(x => x.id === el.dataset.id);
      if (s) {
        state.currentAiSessionId = s.id;
        state.aiChatHistory = s.history;
        document.getElementById('aiPromptCard').style.display = 'none';
        document.getElementById('aiChatBox').style.display = 'flex';
        renderAiMessages();
        document.getElementById('aiHistoryDialog')?.close();
      }
    });
  });
  container.querySelectorAll('.ai-history-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteAiSession(btn.dataset.id);
    });
  });
  document.getElementById('aiHistoryDialog')?.showModal();
}

/* ===== ГОЛОСОВОЙ ВВОД ===== */
function initVoiceInput() {
  const voiceBtn = document.getElementById('voiceSearchBtn');
  const textInput = document.getElementById('quickAiAddText');
  if (!voiceBtn || !textInput) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  let isListening = false;

  voiceBtn.addEventListener('click', () => {
    if (isListening) recognition.stop();
    else { try { recognition.start(); } catch {} }
  });
  recognition.onstart = () => {
    isListening = true;
    voiceBtn.classList.add('recording');
    textInput.placeholder = 'Слушаю вас... Говорите...';
  };
  recognition.onend = () => {
    isListening = false;
    voiceBtn.classList.remove('recording');
    textInput.placeholder = 'Например: продукты 525р сегодня';
  };
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      const cur = textInput.value.trim();
      textInput.value = (cur ? cur + ' ' : '') + transcript;
    }
  };
}

/* ===== ПРИВЯЗКА ВСЕХ СОБЫТИЙ ===== */
/* ===== v4: БЫСТРЫЙ ВВОД (запись за 5–10 секунд) ===== */
const LAST_CAT_KEY = 'koshelek_last_cat';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLastCats() {
  try { return JSON.parse(localStorage.getItem(LAST_CAT_KEY)) || {}; } catch { return {}; }
}

function rememberLastCat(type, id) {
  const m = getLastCats();
  m[type] = id;
  try { localStorage.setItem(LAST_CAT_KEY, JSON.stringify(m)); } catch {}
}

function getCategoriesByUsage(type) {
  const cats = state.categories[type] || [];
  const usage = {};
  state.transactions.forEach(t => {
    if (t.type !== type) return;
    if (t.comment && /^Перевод [→←]/.test(t.comment)) return;
    usage[t.categoryId] = (usage[t.categoryId] || 0) + 1;
  });
  return cats.map((c, i) => ({ c, i }))
    .sort((a, b) => ((usage[b.c.id] || 0) - (usage[a.c.id] || 0)) || (a.i - b.i))
    .map(x => x.c);
}

function addTxQuick({ type, amount, categoryId, comment }, silent = false) {
  const date = todayISO();
  const newTx = { id: uid(), type, amount, categoryId, date, comment: comment || '', accountId: 'default', paid: true, recurrence: 'none' };
  const d = new Date(date + 'T00:00:00');
  state.selectedYear = d.getFullYear();
  state.selectedMonth = d.getMonth();
  state.transactions.push(newTx);
  rememberLastCat(type, categoryId);
  saveData();
  render();
  syncItem('transactions', 'upsert', newTx);
  if (!silent) {
    const catName = cleanCatTitle(getCat(type, categoryId).name);
    showToast(`${type === 'expense' ? '−' : '+'}${fmt(amount)} · ${catName}`, () => undoQuickTx([newTx.id]));
  }
  return newTx;
}

function undoQuickTx(ids) {
  ids.forEach(id => {
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.transactions.splice(idx, 1);
      syncItem('transactions', 'delete', { id });
    }
  });
  saveData();
  render();
  showToast('Добавление отменено');
}

function parseQuickSegment(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  const m = text.match(/(\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)/);
  if (!m) return { amount: 0, rest: text };
  const amount = parseFloat(m[1].replace(/[ \u00a0]/g, '').replace(',', '.'));
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    .replace(/₽/g, ' ')
    .replace(/(^|\s)(рублей|рубля|руб\.?|р\.?|rub)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return { amount, rest, plus: /^\s*\+/.test(text) };
}

function normWord(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
}

function findCategoryByText(rest) {
  const words = rest.split(/\s+/).map(normWord).filter(w => w.length >= 3);
  if (!words.length) return null;
  let best = null, bestScore = 0;
  (getFlowType() === 'income' ? ['income', 'expense'] : ['expense', 'income']).forEach(type => {
    (state.categories[type] || []).forEach(c => {
      cleanCatTitle(c.name).split(/\s+/).map(normWord).filter(w => w.length >= 3).forEach(nw => {
        words.forEach(w => {
          const n = Math.min(5, w.length, nw.length);
          if ((n >= 4 || w === nw) && w.slice(0, n) === nw.slice(0, n) && n > bestScore) {
            bestScore = n;
            best = { type, cat: c, word: w };
          }
        });
      });
    });
  });
  if (!best) return null;
  const comment = rest.split(/\s+/).filter(x => normWord(x) !== best.word).join(' ');
  return { type: best.type, cat: best.cat, comment };
}

async function submitQuickZone(raw) {
  const input = document.getElementById('quickZoneInput');
  const segments = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (!segments.length) return;

  const added = [];
  const leftovers = [];
  let noAmount = false;
  segments.forEach(seg => {
    const p = parseQuickSegment(seg);
    if (!p) return;
    if (!(p.amount > 0)) { noAmount = true; return; }
    const hit = findCategoryByText(p.rest);
    if (hit) {
      added.push(addTxQuick({ type: hit.type, amount: p.amount, categoryId: hit.cat.id, comment: hit.comment }, true));
    } else {
      leftovers.push({ seg, p });
    }
  });

  if (added.length) {
    if (input) input.value = '';
    const ids = added.map(t => t.id);
    if (added.length === 1 && !leftovers.length) {
      const t = added[0];
      showToast(`${t.type === 'expense' ? '−' : '+'}${fmt(t.amount)} · ${cleanCatTitle(getCat(t.type, t.categoryId).name)}`, () => undoQuickTx(ids));
    } else {
      showToast(`Добавлено записей: ${added.length}`, () => undoQuickTx(ids));
    }
  }

  if (!leftovers.length) {
    if (!added.length && noAmount) showToast('Добавьте сумму, например: такси 300');
    return;
  }

  // Что не удалось сопоставить с категорией: ИИ (если подключен) или окно с готовой суммой
  const leftText = leftovers.map(l => l.seg).join(', ');
  if (localStorage.getItem(AI_KEY)) {
    const before = state.transactions.length;
    await quickAiSmartImport(leftText);
    if (state.transactions.length > before && input && !added.length) input.value = '';
    return;
  }
  const first = leftovers[0];
  openAddDialog(first.p.plus ? 'income' : getFlowType());
  const amtInput = document.getElementById('txAmount');
  if (amtInput) { amtInput.value = String(first.p.amount); updateTxAmountUI(); }
  const commentEl = document.getElementById('txComment');
  if (commentEl) commentEl.value = first.p.rest;
  if (input) input.value = '';
  showToast('Категорию не определил — выберите в ленте и сохраните');
}

function initQuickZoneVoice() {
  const btn = document.getElementById('quickZoneMicBtn');
  const input = document.getElementById('quickZoneInput');
  if (!btn || !input) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return; }
  const rec = new SR();
  rec.lang = 'ru-RU';
  rec.interimResults = false;
  let listening = false;
  btn.addEventListener('click', () => {
    if (listening) rec.stop();
    else { try { rec.start(); } catch {} }
  });
  rec.onstart = () => { listening = true; btn.classList.add('recording'); input.placeholder = 'Слушаю… например: такси 300'; };
  rec.onend = () => { listening = false; btn.classList.remove('recording'); input.placeholder = getQuickPlaceholder(); };
  rec.onresult = ev => {
    const text = ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
    if (text) { input.value = text; submitQuickZone(text); }
  };
}

function setTxMoreOpen(open) {
  const wrap = document.getElementById('txMoreWrap');
  const btn = document.getElementById('txMoreToggleBtn');
  if (wrap) wrap.hidden = !open;
  if (btn) { btn.setAttribute('aria-expanded', String(!!open)); btn.classList.toggle('open', !!open); }
  updateTxMoreSummary();
}

function updateTxMoreSummary() {
  const el = document.getElementById('txMoreSummary');
  if (!el) return;
  const acc = document.getElementById('txAccount');
  const rec = document.getElementById('txRecurrence');
  const parts = [];
  parts.push(acc && acc.selectedOptions[0] ? acc.selectedOptions[0].textContent : 'По умолчанию');
  if (rec && rec.value !== 'none') parts.push('повтор');
  if (!state.txPaid) parts.push('не оплачено');
  el.textContent = parts.join(' · ');
}

function syncDateChips() {
  const dateEl = document.getElementById('txDate');
  const t = document.getElementById('txDateTodayBtn');
  const y = document.getElementById('txDateYestBtn');
  if (!dateEl || !t || !y) return;
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yIso = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
  t.classList.toggle('active', dateEl.value === todayISO());
  y.classList.toggle('active', dateEl.value === yIso);
}

function bindQuickEvents() {
  const form = document.getElementById('quickZoneForm');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const v = document.getElementById('quickZoneInput').value.trim();
    if (v) submitQuickZone(v);
  });
  safeBind('quickChipsEditBtn', 'click', () => {
    const row = document.getElementById('quickTemplates');
    const btn = document.getElementById('quickChipsEditBtn');
    if (!row || !btn) return;
    const on = row.classList.toggle('editing');
    btn.textContent = on ? 'готово' : 'изменить';
  });
  safeBind('homeAllTxBtn', 'click', () => switchNavTab('transactions'));
  safeBind('txMoreToggleBtn', 'click', () => {
    const wrap = document.getElementById('txMoreWrap');
    setTxMoreOpen(wrap ? wrap.hidden : true);
  });
  safeBind('txDateTodayBtn', 'click', () => {
    document.getElementById('txDate').value = todayISO();
    updateTxDateLabel();
  });
  safeBind('txDateYestBtn', 'click', () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    document.getElementById('txDate').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    updateTxDateLabel();
  });
  safeBind('closeSettingsX', 'click', () => document.getElementById('settingsDialog')?.close());
  safeBind('settingsAdjustBalanceBtn', 'click', promptBalanceAdjustment);
  safeBind('settingsCategoriesBtn', 'click', () => openCategoryDialog(getFlowType()));
  safeBind('saveStartBalanceBtn', 'click', saveStartBalanceFromInput);
  safeBind('startBalanceInput', 'keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveStartBalanceFromInput(); }
  });
  safeBind('txSaveTemplateBtn', 'click', () => {
    if (state.editingId) saveAsTemplate(state.editingId);
  });
  safeBind('txComment', 'input', autosizeTxComment);
  safeBind('groupingSelect', 'change', e => {
    state.txGroupingMode = e.target.value === 'year_month' ? 'year_month' : 'day';
    renderList(getFiltered());
  });
  const txListEl = document.getElementById('transactionList');
  if (txListEl) {
    txListEl.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.tx-item');
      if (item) { e.preventDefault(); openEditDialog(item.dataset.id); }
    });
  }
  safeBind('txAccount', 'change', updateTxMoreSummary);
  safeBind('txRecurrence', 'change', updateTxMoreSummary);
  safeBind('txPaidToggleBtn', 'click', updateTxMoreSummary);
}

function safeBind(id, event, cb) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, cb);
}

function promptBalanceAdjustment() {
  const dialog = document.getElementById('adjustBalanceDialog');
  const inputEl = document.getElementById('adjustBalanceInput');
  if (!dialog || !inputEl) return;
  inputEl.value = String(Math.round(getTotalBalance() * 100) / 100);
  dialog.showModal();
}

function bindBalanceToggle() {
  const btn = document.getElementById('heroBalanceBtn');
  const panel = document.getElementById('balancePanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.classList.toggle('open', !panel.hidden);
  });
}

/* Блокировка любого случайного зума на мобильных устройствах (iOS Safari / Android Chrome) */
function preventMobileZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), { passive: false });
  });
  document.addEventListener('dblclick', e => {
    e.preventDefault();
  }, { passive: false });
}

/* ===== КАЛЕНДАРЬ: ВЫБОР МЕСЯЦА ===== */
function openMonthPicker() {
  let dlg = document.getElementById('monthPickerDialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'monthPickerDialog';
    dlg.className = 'modal month-picker';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  let year = state.selectedYear;
  const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const draw = () => {
    const used = new Set(state.transactions.map(t => t.date.slice(0, 7)));
    const now = new Date();
    dlg.innerHTML = `<div class="modal-content mp-content">
      <div class="mp-year">
        <button type="button" class="mp-arrow" data-y="-1" aria-label="Предыдущий год">‹</button>
        <span class="mp-year-label">${year}</span>
        <button type="button" class="mp-arrow" data-y="1" aria-label="Следующий год">›</button>
      </div>
      <div class="mp-grid">${MONTHS.map((n, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`;
        const sel = state.periodScope === 'month' && year === state.selectedYear && i === state.selectedMonth;
        const cur = year === now.getFullYear() && i === now.getMonth();
        return `<button type="button" class="mp-month${sel ? ' selected' : ''}${cur ? ' current' : ''}${used.has(key) ? ' used' : ''}" data-m="${i}">${n}</button>`;
      }).join('')}</div>
      <div class="mp-actions">
        <button type="button" class="ghost" data-act="today">Сегодня</button>
        <button type="button" class="ghost${state.periodScope === 'all' ? ' active' : ''}" data-act="all">Все периоды</button>
      </div>
    </div>`;
    dlg.querySelectorAll('[data-y]').forEach(b => b.addEventListener('click', () => { year += parseInt(b.dataset.y); draw(); }));
    dlg.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      state.periodScope = 'month';
      state.selectedYear = year;
      state.selectedMonth = parseInt(b.dataset.m);
      dlg.close();
      render();
    }));
    dlg.querySelector('[data-act="today"]').addEventListener('click', () => {
      state.periodScope = 'month';
      state.selectedYear = now.getFullYear();
      state.selectedMonth = now.getMonth();
      dlg.close();
      render();
    });
    dlg.querySelector('[data-act="all"]').addEventListener('click', () => {
      state.periodScope = 'all';
      dlg.close();
      render();
    });
  };
  draw();
  dlg.showModal();
}

function bindEvents() {
  // 1. Нижняя навигация (5 вкладок по референсу)
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.nav !== state.activeNav) {
        state.filters.category = 'all';
        const catFilter = document.getElementById('categoryFilter');
        if (catFilter) catFilter.value = 'all';
      }
      switchNavTab(btn.dataset.nav);
    });
  });

  // 2. Переключение месяцев в верхней шапке (< НОЯБРЬ 2026 Г. >)
  safeBind('prevMonthBtn', 'click', () => shiftMonth(-1));
  safeBind('nextMonthBtn', 'click', () => shiftMonth(1));
  safeBind('monthTitleBtn', 'click', openMonthPicker);

  // 3. Верхняя левая кнопка (на Главной — быстрые действия; на Транзакциях — смена группировки День / Год-Месяц)
  safeBind('topLeftActionBtn', 'click', () => {
    if (state.activeNav === 'transactions') {
      state.txGroupingMode = state.txGroupingMode === 'day' ? 'year_month' : 'day';
      renderList(getFiltered());
      showToast(state.txGroupingMode === 'day' ? 'Группировка по дням' : 'Группировка по годам и месяцам');
    } else {
      switchNavTab('guide');
    }
  });

  // 4. Кнопки быстрого добавления и пустые состояния на Главной
  safeBind('homeAddIncomeBtn', 'click', () => openAddDialog('income'));
  safeBind('homeAddExpenseBtn', 'click', () => openAddDialog('expense'));
  safeBind('homeIncomeEmpty', 'click', () => openAddDialog('income'));
  safeBind('homeExpenseEmpty', 'click', () => openAddDialog('expense'));
  safeBind('homeManageCategoriesBtn', 'click', () => openCategoryDialog('expense'));

  // 5. Диалог корректировки баланса
  safeBind('cancelAdjustBalanceBtn', 'click', () => document.getElementById('adjustBalanceDialog')?.close());
  safeBind('adjustBalanceForm', 'submit', e => {
    e.preventDefault();
    const inputEl = document.getElementById('adjustBalanceInput');
    if (!inputEl) return;
    const newReal = parseFloat(String(inputEl.value).replace(',', '.').replace(/[^0-9.\-]/g, ''));
    if (isNaN(newReal)) {
      showToast('Введите корректное число');
      return;
    }
    const { income, expense } = getFlowTotals();
    setStartBalance(newReal - (income - expense));
    document.getElementById('adjustBalanceDialog')?.close();
    fillSettingsBalance();
    showToast('✅ Баланс обновлён');
  });

  // 6. Плавающие кнопки справа внизу (Сердечко = ИИ/Голос, Плюс = Новая транзакция)
  safeBind('fabPlusBtn', 'click', () => openAddDialog());
  safeBind('fabHeartBtn', 'click', () => {
    const d = document.getElementById('quickAiAddDialog');
    if (d) {
      const textEl = document.getElementById('quickAiAddText');
      if (textEl) textEl.value = '';
      d.showModal();
    }
  });

  // 7. Переключатели РАСХОДЫ / ДОХОД на вкладке Аналитика (Референс 4)
  safeBind('analyticsExpensePill', 'click', () => {
    state.analyticsType = 'expense';
    document.getElementById('analyticsExpensePill')?.classList.add('active-expense');
    document.getElementById('analyticsIncomePill')?.classList.remove('active-income');
    renderDashboard();
  });
  safeBind('analyticsIncomePill', 'click', () => {
    state.analyticsType = 'income';
    document.getElementById('analyticsIncomePill')?.classList.add('active-income');
    document.getElementById('analyticsExpensePill')?.classList.remove('active-expense');
    renderDashboard();
  });

  // 8. Переключатели типа на вкладке Транзакции (Все / Расходы / Доходы)
  document.querySelectorAll('.tx-type-switcher .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      state.filters.category = 'all';
      document.querySelectorAll('.tx-type-switcher .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  // 9. Диалог НОВАЯ ТРАНЗАКЦИЯ и цифровая клавиатура (Референс 3)
  safeBind('addTransaction', 'click', () => openAddDialog());
  safeBind('transactionForm', 'submit', saveTransaction);
  safeBind('cancelTransaction', 'click', () => document.getElementById('transactionDialog')?.close());

  safeBind('deleteTxInModalBtn', 'click', () => {
    if (state.editingId) {
      const idToDelete = state.editingId;
      document.getElementById('transactionDialog')?.close();
      deleteTransaction(idToDelete);
    }
  });

  document.querySelectorAll('.tx-mode-pill').forEach(btn => {
    btn.addEventListener('click', () => setTxModalMode(btn.dataset.txMode));
  });

  safeBind('txCategory', 'change', () => renderTxQuickCategoryBar());
  safeBind('txDate', 'change', updateTxDateLabel);
  safeBind('txPaidToggleBtn', 'click', () => {
    state.txPaid = !state.txPaid;
    updateTxPaidButtonUI();
  });
  safeBind('txQuickCatManageBtn', 'click', () => {
    openCategoryDialog(state.txModalMode === 'income' ? 'income' : 'expense');
  });

  // При наборе заметки скрываем кастомную цифровую панель, чтобы экранная клавиатура не наезжала
  safeBind('txComment', 'focus', () => {
    document.getElementById('transactionForm')?.classList.add('keyboard-open');
  });
  safeBind('txComment', 'blur', () => {
    setTimeout(() => {
      document.getElementById('transactionForm')?.classList.remove('keyboard-open');
    }, 100);
  });
  safeBind('txComment', 'keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  safeBind('txAmountAreaBtn', 'click', () => {
    document.getElementById('txComment')?.blur();
    document.getElementById('transactionForm')?.classList.remove('keyboard-open');
  });

  safeBind('txAmount', 'input', updateTxAmountUI);

  document.querySelectorAll('.kp-btn, .kp-op-btn').forEach(btn => {
    let lastDown = 0;
    // Реагируем на самое касание (без ожидания click) — как в калькуляторе
    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lastDown = Date.now();
      e.preventDefault();
      handleKeypadPress(btn.dataset.key);
    });
    btn.addEventListener('pointercancel', () => { lastDown = 0; });
    // click остаётся для клавиатуры/доступности (detail===0), касание уже обработано
    btn.addEventListener('click', e => {
      if (Date.now() - lastDown < 3000) return;
      handleKeypadPress(btn.dataset.key);
    });
  });

  // Поддержка ввода суммы с физической клавиатуры при открытом диалоге транзакции
  document.addEventListener('keydown', e => {
    const txDialog = document.getElementById('transactionDialog');
    if (!txDialog || !txDialog.open) return;
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (activeTag === 'INPUT' && document.activeElement.id !== 'txAmount')) {
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      handleKeypadPress(e.key);
    } else if (['+', '-', '*', '/'].includes(e.key)) {
      e.preventDefault();
      handleKeypadPress(e.key);
    } else if (e.key === '.' || e.key === ',') {
      e.preventDefault();
      handleKeypadPress('.');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleKeypadPress('BACKSPACE');
    }
  });

  // 10. Действия со списком транзакций
  const txList = document.getElementById('transactionList');
  if (txList) {
    txList.addEventListener('click', e => {
      const paidBtn = e.target.closest('[data-toggle-paid]');
      if (paidBtn) {
        e.stopPropagation();
        toggleTransactionPaid(paidBtn.dataset.togglePaid);
        return;
      }
      const templateBtn = e.target.closest('.tx-btn.template-add');
      const editBtn = e.target.closest('.tx-btn.edit');
      const delBtn = e.target.closest('.tx-btn.del');
      if (templateBtn) { saveAsTemplate(templateBtn.dataset.id); return; }
      if (editBtn) { openEditDialog(editBtn.dataset.id); return; }
      if (delBtn) { deleteTransaction(delBtn.dataset.id); return; }
      const item = e.target.closest('.tx-item');
      if (item && !e.target.closest('.tx-actions')) {
        openEditDialog(item.dataset.id);
      }
    });
  }

  // 11. Категории
  safeBind('manageCategories', 'click', () => openCategoryDialog());
  safeBind('categoryForm', 'submit', addCategory);
  safeBind('closeCategoryDialog', 'click', () => document.getElementById('categoryDialog')?.close());

  document.querySelectorAll('.cat-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.catDialogTab = btn.dataset.catTab;
      cmCloseEditor();
    });
  });

  // v6: менеджер категорий
  safeBind('catAddBtn', 'click', () => cmOpenEditor(null));
  safeBind('cmCancel', 'click', cmCloseEditor);
  safeBind('cmDelete', 'click', () => { if (state.cmEditId) deleteCategory(state.cmEditId); });
  safeBind('catSearch', 'input', renderCategoryList);
  safeBind('categoryName', 'input', cmUpdatePreview);
  const cmEmojiGrid = document.getElementById('cmEmojiGrid');
  if (cmEmojiGrid) {
    cmEmojiGrid.addEventListener('click', e => {
      const b = e.target.closest('.cm-emoji');
      if (!b) return;
      state.cmEmoji = b.dataset.emoji || '';
      cmRenderPickers();
      cmUpdatePreview();
    });
  }
  const cmColorGrid = document.getElementById('cmColorGrid');
  if (cmColorGrid) {
    cmColorGrid.addEventListener('click', e => {
      const b = e.target.closest('button.cm-color');
      if (!b) return;
      state.cmColor = b.dataset.color;
      cmRenderPickers();
      cmUpdatePreview();
    });
    cmColorGrid.addEventListener('input', e => {
      if (e.target.id !== 'categoryColor') return;
      state.cmColor = e.target.value;
      cmColorGrid.querySelectorAll('.cm-color').forEach(el => el.classList.remove('active'));
      const lbl = e.target.closest('.cm-color-custom');
      if (lbl) { lbl.classList.add('active'); lbl.style.background = e.target.value; }
      cmUpdatePreview();
    });
  }

  const catList = document.getElementById('categoryList');
  if (catList) {
    catList.addEventListener('click', e => {
      const item = e.target.closest('.cm-item');
      if (item) cmOpenEditor(item.dataset.id);
    });
    catList.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.cm-item');
      if (item) { e.preventDefault(); cmOpenEditor(item.dataset.id); }
    });
  }

  safeBind('editCategoryForm', 'submit', saveEditCategory);
  safeBind('cancelEditCategory', 'click', () => {
    document.getElementById('editCategoryDialog')?.close();
    document.getElementById('categoryDialog')?.showModal();
  });

  // 12. Вкладка СЧЕТА (Референс 6)
  safeBind('createNewAccountBtn', 'click', () => {
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountInitial').value = '0';
    document.getElementById('accountDialog')?.showModal();
  });
  safeBind('cancelAccountDialog', 'click', () => document.getElementById('accountDialog')?.close());
  safeBind('accountForm', 'submit', e => {
    e.preventDefault();
    const name = document.getElementById('newAccountName').value.trim();
    const initialBalance = parseFloat(document.getElementById('newAccountInitial').value) || 0;
    if (!name) return;
    state.accounts.push({ id: uid(), name, initialBalance });
    saveData();
    render();
    document.getElementById('accountDialog')?.close();
    showToast(`Счет «${name}» создан`);
  });
  safeBind('transferBalanceBtn', 'click', () => {
    if ((state.accounts || []).length < 2) {
      showToast('Сначала создайте второй счёт');
      return;
    }
    document.getElementById('settingsDialog')?.close();
    openAddDialog('transfer');
  });
  safeBind('accountsAdjustBalanceBtn', 'click', promptBalanceAdjustment);
  safeBind('adjustBalanceBtn', 'click', () => openSettingsDialog());

  // 13. Вкладка РУКОВОДСТВО
  safeBind('guideQuickAiBtn', 'click', () => document.getElementById('quickAiAddBtn')?.click());
  safeBind('guideSmartImportBtn', 'click', () => document.getElementById('aiImportBtn')?.click());
  safeBind('guideCategoriesBtn', 'click', () => openCategoryDialog());
  safeBind('guideDemoDataBtn', 'click', loadDemoData);
  safeBind('guideSettingsBtn', 'click', openSettingsDialog);
  safeBind('guideExportCsvBtn', 'click', exportCSV);

  // 14. Фильтры и поиск
  const toggleToolbar = () => {
    const section = document.getElementById('toolbarSection');
    const btn = document.getElementById('toggleFilters');
    state.filtersOpen = !state.filtersOpen;
    if (section) section.classList.toggle('open', state.filtersOpen);
    if (btn) btn.classList.toggle('active', state.filtersOpen);
  };
  safeBind('toggleFilters', 'click', toggleToolbar);
  safeBind('topSearchBtn', 'click', () => {
    if (!state.filtersOpen) toggleToolbar();
    document.getElementById('searchInput')?.focus();
  });

  safeBind('toggleDashFilters', 'click', () => {
    const section = document.getElementById('dashToolbar');
    const btn = document.getElementById('toggleDashFilters');
    state.dashFiltersOpen = !state.dashFiltersOpen;
    if (section) section.classList.toggle('open', state.dashFiltersOpen);
    if (btn) btn.classList.toggle('active', state.dashFiltersOpen);
  });

  safeBind('searchInput', 'input', e => { state.filters.search = e.target.value; render(); });
  safeBind('categoryFilter', 'change', e => { state.filters.category = e.target.value; render(); });
  safeBind('sortSelect', 'change', e => { state.filters.sort = e.target.value; render(); });
  safeBind('dateFrom', 'change', e => { state.filters.dateFrom = e.target.value; render(); });
  safeBind('dateTo', 'change', e => { state.filters.dateTo = e.target.value; render(); });
  safeBind('amountMin', 'input', e => { state.filters.amountMin = e.target.value; render(); });
  safeBind('amountMax', 'input', e => { state.filters.amountMax = e.target.value; render(); });

  safeBind('resetFiltersBtn', 'click', () => {
    state.filters = { search: '', category: 'all', sort: 'date_desc', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };
    ['searchInput', 'dateFrom', 'dateTo', 'amountMin', 'amountMax'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const cat = document.getElementById('categoryFilter'); if (cat) cat.value = 'all';
    const sort = document.getElementById('sortSelect'); if (sort) sort.value = 'date_desc';
    render();
    showToast('Фильтры сброшены');
  });

  safeBind('dashSearchInput', 'input', e => { state.dashFilters.search = e.target.value; renderDashboard(); });
  safeBind('dashCategoryFilter', 'change', e => { state.dashFilters.category = e.target.value; renderDashboard(); });
  safeBind('dashDateFrom', 'change', e => { state.dashFilters.dateFrom = e.target.value; renderDashboard(); });
  safeBind('dashDateTo', 'change', e => { state.dashFilters.dateTo = e.target.value; renderDashboard(); });
  safeBind('dashAmountMin', 'input', e => { state.dashFilters.amountMin = e.target.value; renderDashboard(); });
  safeBind('dashAmountMax', 'input', e => { state.dashFilters.amountMax = e.target.value; renderDashboard(); });

  safeBind('resetDashFiltersBtn', 'click', () => {
    state.dashFilters = { search: '', category: 'all', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' };
    ['dashSearchInput', 'dashDateFrom', 'dashDateTo', 'dashAmountMin', 'dashAmountMax'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const cat = document.getElementById('dashCategoryFilter'); if (cat) cat.value = 'all';
    renderDashboard();
    showToast('Фильтры аналитики сброшены');
  });

  document.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dashPeriod = btn.dataset.period;
      state.dashFilters.dateFrom = '';
      state.dashFilters.dateTo = '';
      renderDashboard();
    });
  });

  // 15. Настройки, Облако и ИИ (мгновенное автосохранение + кнопка сохранения)
  safeBind('themeToggle', 'click', toggleTheme);
  safeBind('settingsBtn', 'click', openSettingsDialog);
  safeBind('saveAiSettingsBtn', 'click', () => saveAiSettings(true));
  safeBind('closeSettingsDialog', 'click', () => {
    saveAiSettings(false);
    document.getElementById('settingsDialog')?.close();
  });

  // Автосохранение ключа и модели ИИ при любом вводе или закрытии окна
  const settingsDialogEl = document.getElementById('settingsDialog');
  if (settingsDialogEl) {
    settingsDialogEl.addEventListener('close', () => saveAiSettings(false));
  }
  ['aiApiKey', 'aiModel', 'aiApiUrl'].forEach(id => {
    safeBind(id, 'input', () => saveAiSettings(false));
    safeBind(id, 'change', () => saveAiSettings(false));
  });
  document.querySelectorAll('.ai-model-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const modelInput = document.getElementById('aiModel');
      if (modelInput) modelInput.value = chip.dataset.model;
      saveAiSettings(true);
    });
  });

  safeBind('supabaseLoginBtn', 'click', () => handleAuthAction('login'));
  safeBind('supabaseRegisterBtn', 'click', () => handleAuthAction('register'));
  safeBind('supabaseLogoutBtn', 'click', handleSupabaseLogout);
  safeBind('fullDisconnectBtn', 'click', handleFullDisconnect);

  safeBind('toggleCloudInstructionBtn', 'click', () => {
    const block = document.getElementById('cloudInstructionBlock');
    if (block) block.style.display = block.style.display === 'none' ? 'flex' : 'none';
  });

  safeBind('cloudStatusBadge', 'click', () => {
    if (state.user) openSettingsDialog();
    else document.getElementById('cloudExplainDialog')?.showModal();
  });
  safeBind('closeCloudExplainBtn', 'click', () => document.getElementById('cloudExplainDialog')?.close());
  safeBind('cloudExplainAuthBtn', 'click', () => {
    document.getElementById('cloudExplainDialog')?.close();
    openSettingsDialog();
  });

  safeBind('exportCsvBtn', 'click', exportCSV);
  safeBind('exportJsonBtn', 'click', exportBackupJSON);
  safeBind('importJsonBtn', 'click', () => document.getElementById('importJsonInput')?.click());
  safeBind('importJsonInput', 'change', e => {
    const file = e.target.files[0];
    if (file) { importBackupJSON(file); e.target.value = ''; }
  });
  safeBind('loadRefDataBtn', 'click', loadRefData);
  safeBind('loadDemoDataBtn', 'click', loadDemoData);
  safeBind('importCsvBtn', 'click', () => document.getElementById('importCsvInput')?.click());
  safeBind('importCsvInput', 'change', e => {
    const file = e.target.files[0];
    if (file) { importCSV(file); e.target.value = ''; }
  });
  safeBind('clearDataBtn', 'click', clearAllData);

  safeBind('clearCloudDataBtn', 'click', () => {
    if (!confirm('Удалить ВСЕ данные из облачного хранилища?')) return;
    document.getElementById('settingsDialog')?.close();
    let secondsLeft = 5;
    window._cloudDeleteCancelled = false;
    const runDeletion = async () => {
      if (window._cloudDeleteCancelled) return;
      if (supabaseClient && state.user) {
        try {
          await Promise.all([
            supabaseClient.from('transactions').delete().eq('user_id', state.user.id),
            supabaseClient.from('categories').delete().eq('user_id', state.user.id),
            supabaseClient.from('templates').delete().eq('user_id', state.user.id),
            supabaseClient.from('ai_sessions').delete().eq('user_id', state.user.id),
            supabaseClient.from('profiles').delete().eq('id', state.user.id)
          ]);
          showToast('Все данные из облака удалены');
        } catch {
          showToast('Ошибка при очистке облака');
        }
      }
    };
    window._cloudDeleteTimeout = setTimeout(runDeletion, 5000);
    const updateCountdown = () => {
      if (window._cloudDeleteCancelled) return;
      if (secondsLeft > 0) {
        showToast(`Удаление из облака через ${secondsLeft} сек...`, () => {
          window._cloudDeleteCancelled = true;
          clearTimeout(window._cloudDeleteTimeout);
          showToast('Удаление отменено');
        });
        secondsLeft--;
        setTimeout(updateCountdown, 1000);
      }
    };
    updateCountdown();
  });

  safeBind('toggleApiKeyVisibility', 'click', () => {
    const input = document.getElementById('aiApiKey');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
      document.getElementById('toggleApiKeyVisibility').textContent = input.type === 'password' ? '👁' : '🙈';
    }
  });

  safeBind('aiProvider', 'change', e => {
    const provider = e.target.value;
    const urlLabel = document.getElementById('aiApiUrlLabel');
    if (urlLabel) urlLabel.style.display = provider === 'custom' ? 'flex' : 'none';
    const modelInput = document.getElementById('aiModel');
    if (modelInput) {
      modelInput.value = provider === 'google' ? 'gemini-2.5-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';
    }
    saveAiSettings(false);
  });

  safeBind('aiInstructionBtn', 'click', () => {
    const block = document.getElementById('aiInstructionBlock');
    if (block) block.style.display = block.style.display === 'none' ? 'flex' : 'none';
  });

  safeBind('generateAiReportBtn', 'click', startAiReport);
  safeBind('aiInfoBtn', 'click', () => {
    const text = document.getElementById('aiIntroText');
    if (text) text.style.display = text.style.display === 'none' ? 'block' : 'none';
  });
  safeBind('sendAiMessageBtn', 'click', sendAiMessage);
  const aiChatInput = document.getElementById('aiChatInput');
  if (aiChatInput) {
    aiChatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendAiMessage(); });
  }
  safeBind('toggleAiFullscreenBtn', 'click', () => {
    const box = document.getElementById('aiChatBox');
    if (box) box.classList.toggle('fullscreen');
  });
  safeBind('resetAiChatBtn', 'click', () => {
    state.currentAiSessionId = uid();
    state.aiChatHistory = [{
      role: 'user',
      parts: [{ text: 'System Context: You are a helpful personal finance assistant.' }]
    }];
    document.getElementById('aiChatBox').style.display = 'flex';
    document.getElementById('aiPromptCard').style.display = 'none';
    renderAiMessages();
    document.getElementById('aiChatInput')?.focus();
  });
  safeBind('closeAiChatBtn', 'click', () => {
    const box = document.getElementById('aiChatBox');
    if (box) { box.style.display = 'none'; box.classList.remove('fullscreen'); }
    const card = document.getElementById('aiPromptCard');
    if (card) card.style.display = 'flex';
  });
  safeBind('aiHistoryBtn', 'click', openAiHistoryDialog);
  safeBind('closeAiHistoryDialog', 'click', () => document.getElementById('aiHistoryDialog')?.close());

  safeBind('aiImportBtn', 'click', () => {
    saveAiSettings(false);
    document.getElementById('settingsDialog')?.close();
    const d = document.getElementById('aiImportDialog');
    if (d) {
      _aiImportFile = null;
      const fileInput = document.getElementById('aiImportFileInput');
      if (fileInput) fileInput.value = '';
      document.getElementById('aiImportFileName').textContent = 'Нажмите или перетащите файл сюда';
      document.getElementById('submitAiImportBtn').disabled = true;
      document.getElementById('aiImportProgress').style.display = 'none';
      d.showModal();
    }
  });

  safeBind('quickAiAddBtn', 'click', () => {
    const d = document.getElementById('quickAiAddDialog');
    if (d) {
      document.getElementById('quickAiAddText').value = '';
      d.showModal();
    }
  });

  safeBind('aiImportFileInput', 'change', e => {
    const file = e.target.files[0];
    _aiImportFile = file || null;
    document.getElementById('aiImportFileName').textContent = file ? `📄 ${file.name}` : 'Нажмите или перетащите файл сюда';
    document.getElementById('submitAiImportBtn').disabled = !file;
  });

  safeBind('submitAiImportBtn', 'click', () => {
    if (_aiImportFile) aiSmartImportFromFile(_aiImportFile);
  });
  safeBind('cancelAiImport', 'click', () => document.getElementById('aiImportDialog')?.close());
  safeBind('cancelQuickAiAdd', 'click', () => document.getElementById('quickAiAddDialog')?.close());

  const quickAiAddForm = document.getElementById('quickAiAddForm');
  if (quickAiAddForm) {
    quickAiAddForm.addEventListener('submit', e => {
      e.preventDefault();
      const txt = document.getElementById('quickAiAddText').value.trim();
      if (txt) quickAiSmartImport(txt);
    });
  }

  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }
}

function init() {
  preventMobileZoom();
  initTheme();
  loadData();
  initAuth();
  initSupabase();
  bindBalanceToggle();
  bindEvents();
  bindQuickEvents();
  initQuickZoneVoice();
  switchNavTab('expense');
  registerSW();
  initVoiceInput();

  const params = new URLSearchParams(location.search);
  if (params.get('tab')) {
    switchNavTab(params.get('tab') === 'income' ? 'income' : 'expense');
  }
  if (params.get('action') === 'add') {
    setTimeout(() => openAddDialog(params.get('tab') === 'income' ? 'income' : 'expense'), 250);
  }
}

document.addEventListener('DOMContentLoaded', init);

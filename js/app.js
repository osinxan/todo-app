// ОСНОВНЫЕ ДАННЫЕ
let todos = JSON.parse(localStorage.getItem('todo_items') || '[]');
let templates = JSON.parse(localStorage.getItem('todo_templates') || '[]');
let categories = JSON.parse(localStorage.getItem('todo_categories') || 'null') || [
  { id: 'cat_1', name: 'Работа' },
  { id: 'cat_2', name: 'Личное' },
  { id: 'cat_3', name: 'Важное' },
  { id: 'cat_4', name: 'Звонки' },
];
let deleteFromOldDay = true;
let editingTaskId = null;
let movingTaskId = null;
let editingTemplateId = null;
let editingCategoryId = null;
let mainCatFilter = null;   // null = все
let incompleteCatFilter = null; // null = все

async function init() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('filterDate').value = today;

  const token = localStorage.getItem('github_token');
  if (!token) {
    showTokenScreen();
    return;
  }
  await syncOnStartup(token);
  render();
}

function saveToStorage() {
  localStorage.setItem('todo_items', JSON.stringify(todos));
  localStorage.setItem('todo_templates', JSON.stringify(templates));
  localStorage.setItem('todo_categories', JSON.stringify(categories));
  render();
  autoSaveToCloud();
}

// РЕНДЕР И ЛОГИКА ЗАДАЧ
function render() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  const filterDate = document.getElementById('filterDate').value;

  let filtered = todos;
  if (filterDate) filtered = todos.filter(t => t.date === filterDate);

  // Рендер пилюль категорий
  const catFilterEl = document.getElementById('mainCatFilter');
  const usedCats = [...new Set(filtered.map(t => t.category).filter(Boolean))];
  if (usedCats.length > 1) {
    catFilterEl.style.display = 'flex';
    catFilterEl.innerHTML =
      `<button class="cat-pill ${mainCatFilter===null?'active':''}" onclick="setMainCatFilter(null)">Все</button>` +
      usedCats.map(c => {
        const label = c;
        return `<button class="cat-pill ${mainCatFilter===c?'active':''}" onclick="setMainCatFilter('${esc(c)}')">${esc(label)}</button>`;
      }).join('');
  } else {
    catFilterEl.style.display = 'none';
    mainCatFilter = null;
  }

  // Применяем фильтр категории
  if (mainCatFilter) {
    filtered = filtered.filter(t => t.category === mainCatFilter);
    // При выборе конкретной категории показываем только невыполненные (новые) задания
    filtered = filtered.filter(t => !t.completed);
  }

  filtered.sort((a, b) => a.completed - b.completed);
  list.innerHTML = '';

  const btnTransfer = document.getElementById('btnTransfer');
  if (filterDate && filtered.some(t => !t.completed)) {
    btnTransfer.style.display = 'inline-flex';
  } else {
    btnTransfer.style.display = 'none';
  }

  if (filtered.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    filtered.forEach(item => {
      const catLabel = item.category;
      const div = document.createElement('div');
      div.className = `task-item ${item.completed ? 'completed' : ''}`;
      div.innerHTML = `
        <div class="checkbox-wrapper" onclick="toggleComplete('${item.id}')"><div class="custom-checkbox"></div></div>
        <div class="task-content">
          <div class="task-title">${esc(item.name)}</div>
          <div class="task-meta"><span class="task-tag">${esc(catLabel)}</span><span>📅 ${formatDate(item.date)}</span></div>
        </div>
        <div class="task-actions">
          <button class="btn btn-blue btn-icon btn-sm" title="Редактировать" onclick="openEditTask('${item.id}', event)">✏️</button>
          <button class="btn btn-orange btn-icon btn-sm" title="Перенести" onclick="openMoveOne('${item.id}', event)">↷</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteTask('${item.id}', event)">✕</button>
        </div>
      `;
      list.appendChild(div);
    });
  }
  updateStats(filtered);
}

function setMainCatFilter(cat) {
  mainCatFilter = cat;
  render();
}

function updateStats(filteredItems) {
  const total = filteredItems.length;
  const done = filteredItems.filter(t => t.completed).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statLeft').textContent = total - done;
}

function populateCategorySelect(selectedVal) {
  const sel = document.getElementById('taskCategory');
  sel.innerHTML = categories.map(c =>
    `<option value="${esc(c.name)}" ${c.name===selectedVal?'selected':''}>${esc(c.name)}</option>`
  ).join('');
}

function openAddTask() {
  editingTaskId = null;
  document.getElementById('modalTaskTitle').textContent = 'Новое задание';
  document.getElementById('taskName').value = '';
  document.getElementById('taskDate').value = document.getElementById('filterDate').value || new Date().toISOString().split('T')[0];
  populateCategorySelect(categories[0]?.name || '');
  openModal('modalTask');
  setTimeout(() => document.getElementById('taskName').focus(), 50);
}

function openEditTask(id, event) {
  event.stopPropagation();
  const item = todos.find(t => t.id === id);
  if (!item) return;
  editingTaskId = id;
  document.getElementById('modalTaskTitle').textContent = 'Редактировать задание';
  document.getElementById('taskName').value = item.name;
  document.getElementById('taskDate').value = item.date;
  populateCategorySelect(item.category);
  openModal('modalTask');
}

function saveTask() {
  const name = document.getElementById('taskName').value.trim();
  const date = document.getElementById('taskDate').value;
  const category = document.getElementById('taskCategory').value;
  if (!name) { showToast('Введите название задания'); return; }
  if (!date) { showToast('Выберите дату'); return; }

  if (editingTaskId) {
    const item = todos.find(t => t.id === editingTaskId);
    if (item) { item.name = name; item.date = date; item.category = category; }
    saveToStorage(); closeModal('modalTask'); showToast('Задание обновлено');
    editingTaskId = null;
  } else {
    todos.push({ id: 'todo_' + Date.now(), name, date, category, completed: false });
    saveToStorage(); closeModal('modalTask'); showToast('Задание добавлено');
  }
}

function toggleComplete(id) {
  const item = todos.find(t => t.id === id);
  if (item) { item.completed = !item.completed; saveToStorage(); }
}

function deleteTask(id, event) {
  event.stopPropagation();
  if (confirm('Удалить это задание?')) {
    todos = todos.filter(t => t.id !== id);
    saveToStorage(); showToast('Задание удалено');
  }
}

// ПЕРЕНОС ОДНОГО ЗАДАНИЯ
function openMoveOne(id, event) {
  event.stopPropagation();
  const item = todos.find(t => t.id === id);
  if (!item) return;
  movingTaskId = id;
  document.getElementById('moveOneTaskName').textContent = '«' + item.name + '»';
  const tomorrow = new Date(item.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('moveOneTargetDate').value = tomorrow.toISOString().split('T')[0];
  openModal('modalMoveOne');
}

function executeMoveOne() {
  const targetDate = document.getElementById('moveOneTargetDate').value;
  if (!targetDate) { showToast('Выберите дату'); return; }
  const item = todos.find(t => t.id === movingTaskId);
  if (!item) return;
  if (item.date === targetDate) { showToast('Выбрана та же дата'); return; }
  item.date = targetDate;
  saveToStorage();
  closeModal('modalMoveOne');
  showToast('Задание перенесено');
  if (window._moveOneCallback) { window._moveOneCallback(); window._moveOneCallback = null; }
  movingTaskId = null;
}

// ШАБЛОНЫ
// ==========================================
// ШАБЛОНЫ — ПАПКИ
// ==========================================
// templates теперь = массив папок:
// { id, name, repeat, weekdays, monthDay, tasks: [{id, name, category}] }

let editingFolderId = null;
let pendingTemplateTask = null; // задание ожидающее выбора папки

function folderRepeatLabel(folder) {
  if (folder.repeat === 'daily') return { text: 'Каждый день', cls: 'badge-daily' };
  if (folder.repeat === 'weekly' && folder.weekdays?.length) {
    const names = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    return { text: folder.weekdays.map(d => names[d]).join(', '), cls: 'badge-weekly' };
  }
  if (folder.repeat === 'monthly' && folder.monthDay) return { text: `${folder.monthDay}-е число`, cls: 'badge-monthly' };
  return { text: 'Вручную', cls: 'badge-manual' };
}

function folderMatchesDate(folder, dateStr) {
  if (folder.repeat === 'daily') return true;
  if (folder.repeat === 'weekly' && folder.weekdays?.length) {
    const [y,m,d] = dateStr.split('-').map(Number);
    return folder.weekdays.includes(new Date(y,m-1,d).getDay());
  }
  if (folder.repeat === 'monthly' && folder.monthDay) {
    return parseInt(dateStr.split('-')[2]) === folder.monthDay;
  }
  return false;
}

function saveAsTemplate() {
  const name = document.getElementById('taskName').value.trim();
  const category = document.getElementById('taskCategory').value;
  if (!name) { showToast('Введите название для шаблона'); return; }

  // Если нет папок — создаём сразу без выбора
  if (!templates.length) {
    showToast('Сначала создайте папку в разделе Шаблоны');
    return;
  }

  pendingTemplateTask = { id: 'tsk_' + Date.now(), name, category };
  document.getElementById('chooseFolderTaskName').textContent = name;

  const list = document.getElementById('chooseFolderList');
  list.innerHTML = templates.map(f => {
    const rl = folderRepeatLabel(f);
    return `<div class="tpl-task-item" style="cursor:pointer;margin-bottom:8px;" onclick="addTaskToFolder('${f.id}')">
      <span style="font-size:16px;">📁</span>
      <span class="tpl-task-name">${esc(f.name)}</span>
      <span class="template-repeat-badge ${rl.cls}">${rl.text}</span>
    </div>`;
  }).join('');

  closeModal('modalTask');
  openModal('modalChooseFolder');
}

function addTaskToFolder(folderId) {
  if (!pendingTemplateTask) return;
  const folder = templates.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.tasks) folder.tasks = [];
  folder.tasks.push(pendingTemplateTask);
  pendingTemplateTask = null;
  saveToStorage();
  closeModal('modalChooseFolder');
  showToast('Задание добавлено в папку!');
}

function openTemplatesModal() {
  renderTemplates();
  openModal('modalTemplates');
}

function openCategoriesModal() {
  renderCategoryManage();
  openModal('modalCategories');
}

// ==========================================
// УПРАВЛЕНИЕ КАТЕГОРИЯМИ
// ==========================================
function renderCategoryManage() {
  const list = document.getElementById('categoryManageList');
  if (!categories.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);">Категорий пока нет.</div>';
    return;
  }
  list.innerHTML = categories.map(c => `
    <div class="cat-manage-item">
      <span class="cat-manage-name">${esc(c.name)}</span>
      <div class="cat-manage-actions">
        <button class="btn btn-blue btn-icon btn-sm" onclick="openEditCategory('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-icon btn-sm" onclick="deleteCategory('${c.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

function openAddCategory() {
  editingCategoryId = null;
  document.getElementById('modalCategoryTitle').textContent = 'Новая категория';
  document.getElementById('categoryName').value = '';
  openModal('modalCategory');
  setTimeout(() => document.getElementById('categoryName').focus(), 50);
}

function openEditCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  editingCategoryId = id;
  document.getElementById('modalCategoryTitle').textContent = 'Редактировать категорию';
  document.getElementById('categoryName').value = cat.name;
  openModal('modalCategory');
}

function saveCategory() {
  const name = document.getElementById('categoryName').value.trim();
  if (!name) { showToast('Введите название категории'); return; }

  if (editingCategoryId) {
    const cat = categories.find(c => c.id === editingCategoryId);
    if (cat) {
      // Обновляем все задания с этой категорией
      todos.forEach(t => { if (t.name && t.category === cat.name) t.category = name; });
      // Обновляем шаблоны
      templates.forEach(f => (f.tasks||[]).forEach(t => { if (t.category === cat.name) t.category = name; }));
      cat.name = name;
    }
    editingCategoryId = null;
    showToast('Категория обновлена');
  } else {
    if (categories.find(c => c.name === name)) { showToast('Такая категория уже есть'); return; }
    categories.push({ id: 'cat_' + Date.now(), name });
    showToast('Категория добавлена');
  }
  saveToStorage();
  closeModal('modalCategory');
  renderCategoryManage();
}

function deleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  const inUse = todos.some(t => t.category === cat.name);
  if (inUse && !confirm(`Категория «${cat.name}» используется в заданиях. Удалить?`)) return;
  if (!inUse && !confirm(`Удалить категорию «${cat.name}»?`)) return;
  categories = categories.filter(c => c.id !== id);
  saveToStorage();
  renderCategoryManage();
  showToast('Категория удалена');
}

function renderTemplates() {
  const list = document.getElementById('templatesList');
  if (!templates.length) {
    list.innerHTML = '<div class="templates-empty">Папок пока нет.<br>Нажмите "+ Папка" чтобы создать.</div>';
    return;
  }
  list.innerHTML = templates.map(f => {
    const rl = folderRepeatLabel(f);
    const tasks = f.tasks || [];
    const tasksHtml = tasks.length
      ? tasks.map(t => `<div class="tpl-task-item">
          <span class="tpl-task-name">${esc(t.name)}</span>
          <span class="tpl-task-tag">${esc(t.category)}</span>
          <div class="tpl-task-actions">
            <button class="btn btn-danger btn-icon btn-sm" onclick="deleteTaskFromFolder('${f.id}','${t.id}')">✕</button>
          </div>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text3);padding:4px 0;">Заданий нет. Добавьте через «Сохранить как шаблон».</div>';

    return `<div class="tpl-folder" id="folder_${f.id}">
      <div class="tpl-folder-header" onclick="toggleFolder('${f.id}')">
        <span class="tpl-folder-icon">📁</span>
        <span class="tpl-folder-name">${esc(f.name)}</span>
        <div class="tpl-folder-meta">
          <span class="template-repeat-badge ${rl.cls}">${rl.text}</span>
          <span class="tpl-folder-count">${tasks.length} зад.</span>
        </div>
        <span class="tpl-folder-chevron">›</span>
      </div>
      <div class="tpl-folder-body">
        <div class="tpl-folder-actions">
          <button class="btn btn-primary btn-sm" onclick="applyFolder('${f.id}')">➕ Добавить на день</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditFolder('${f.id}')">✏️ Изменить</button>
          <button class="btn btn-danger btn-sm" onclick="deleteFolder('${f.id}')">Удалить папку</button>
        </div>
        ${tasksHtml}
      </div>
    </div>`;
  }).join('');
}

function toggleFolder(id) {
  document.getElementById('folder_' + id)?.classList.toggle('open');
}

function deleteTaskFromFolder(folderId, taskId) {
  const folder = templates.find(f => f.id === folderId);
  if (!folder) return;
  folder.tasks = (folder.tasks || []).filter(t => t.id !== taskId);
  saveToStorage(); renderTemplates();
  // Переоткрываем папку
  const el = document.getElementById('folder_' + folderId);
  if (el) el.classList.add('open');
  showToast('Задание удалено из папки');
}

function applyFolder(folderId) {
  const folder = templates.find(f => f.id === folderId);
  if (!folder) return;
  const filterDate = document.getElementById('filterDate').value;
  if (!filterDate) { showToast('Сначала выберите день в фильтре'); return; }
  const tasks = folder.tasks || [];
  if (!tasks.length) { showToast('В папке нет заданий'); return; }
  let added = 0, skipped = 0;
  tasks.forEach(t => {
    const exists = todos.some(td => td.date === filterDate && td.name === t.name);
    if (exists) { skipped++; return; }
    todos.push({ id: 'todo_' + Date.now() + Math.random().toString(36).substring(2,6), name: t.name, date: filterDate, category: t.category, completed: false });
    added++;
  });
  saveToStorage();
  closeModal('modalTemplates');
  if (added && skipped) showToast(`Добавлено ${added}, пропущено ${skipped} (уже есть)`);
  else if (added) showToast(`Добавлено ${added} задани(й)`);
  else showToast('Все задания уже есть на этот день');
}

function applyMatchingFolders() {
  const filterDate = document.getElementById('filterDate').value;
  if (!filterDate) { showToast('Сначала выберите день в фильтре'); return; }
  const matched = templates.filter(f => f.repeat !== 'manual' && folderMatchesDate(f, filterDate));
  if (!matched.length) { showToast('Нет папок с подходящим расписанием для этого дня'); return; }
  let added = 0, skipped = 0;
  matched.forEach(f => {
    (f.tasks || []).forEach(t => {
      const exists = todos.some(td => td.date === filterDate && td.name === t.name);
      if (exists) { skipped++; return; }
      todos.push({ id: 'todo_' + Date.now() + Math.random().toString(36).substring(2,6), name: t.name, date: filterDate, category: t.category, completed: false });
      added++;
    });
  });
  saveToStorage();
  closeModal('modalTemplates');
  if (added && skipped) showToast(`Добавлено ${added}, пропущено ${skipped} (уже есть)`);
  else if (added) showToast(`Добавлено ${added} задани(й) из ${matched.length} папок`);
  else showToast('Все задания уже есть на этот день');
}

// ПАПКИ — создание/редактирование
function openAddFolder() {
  editingFolderId = null;
  document.getElementById('modalFolderTitle').textContent = 'Новая папка';
  document.getElementById('folderName').value = '';
  document.getElementById('folderRepeat').value = 'manual';
  document.getElementById('folderMonthDay').value = '';
  document.querySelectorAll('.weekday-btn').forEach(b => b.classList.remove('active'));
  onFolderRepeatChange();
  openModal('modalFolder');
}

function openEditFolder(id) {
  const folder = templates.find(f => f.id === id);
  if (!folder) return;
  editingFolderId = id;
  document.getElementById('modalFolderTitle').textContent = 'Редактировать папку';
  document.getElementById('folderName').value = folder.name;
  document.getElementById('folderRepeat').value = folder.repeat || 'manual';
  document.getElementById('folderMonthDay').value = folder.monthDay || '';
  document.querySelectorAll('.weekday-btn').forEach(b => {
    b.classList.toggle('active', (folder.weekdays || []).includes(parseInt(b.dataset.day)));
  });
  onFolderRepeatChange();
  openModal('modalFolder');
}

function onFolderRepeatChange() {
  const val = document.getElementById('folderRepeat').value;
  document.getElementById('folderWeekdayGroup').style.display = val === 'weekly' ? 'block' : 'none';
  document.getElementById('folderMonthdayGroup').style.display = val === 'monthly' ? 'block' : 'none';
}

function toggleWeekday(btn) { btn.classList.toggle('active'); }

function saveFolder() {
  const name = document.getElementById('folderName').value.trim();
  const repeat = document.getElementById('folderRepeat').value;
  if (!name) { showToast('Введите название папки'); return; }

  let weekdays = [], monthDay = null;
  if (repeat === 'weekly') {
    weekdays = [...document.querySelectorAll('.weekday-btn.active')].map(b => parseInt(b.dataset.day));
    if (!weekdays.length) { showToast('Выберите хотя бы один день'); return; }
  }
  if (repeat === 'monthly') {
    monthDay = parseInt(document.getElementById('folderMonthDay').value);
    if (!monthDay || monthDay < 1 || monthDay > 31) { showToast('Введите число от 1 до 31'); return; }
  }

  if (editingFolderId) {
    const folder = templates.find(f => f.id === editingFolderId);
    if (folder) { folder.name = name; folder.repeat = repeat; folder.weekdays = weekdays; folder.monthDay = monthDay; }
    editingFolderId = null;
  } else {
    templates.push({ id: 'tpl_' + Date.now(), name, repeat, weekdays, monthDay, tasks: [] });
  }
  saveToStorage();
  closeModal('modalFolder');
  renderTemplates();
  showToast('Папка сохранена');
}

function deleteFolder(id) {
  const folder = templates.find(f => f.id === id);
  if (!folder) return;
  if (confirm(`Удалить папку "${folder.name}" и все задания в ней?`)) {
    templates = templates.filter(f => f.id !== id);
    saveToStorage(); renderTemplates();
    showToast('Папка удалена');
  }
}

// ЛОГИКА ПЕРЕНОСА ЗАДАЧ
function openTransferModal() {
  const filterDate = document.getElementById('filterDate').value;
  let nextDay = new Date(filterDate);
  nextDay.setDate(nextDay.getDate() + 1);
  document.getElementById('transferTargetDate').value = nextDay.toISOString().split('T')[0];
  deleteFromOldDay = true;
  updateTransferCheckboxUI();
  openModal('modalTransfer');
}

function toggleTransferCheck() { deleteFromOldDay = !deleteFromOldDay; updateTransferCheckboxUI(); }

function updateTransferCheckboxUI() {
  const chk = document.getElementById('transferCheckUI');
  if (deleteFromOldDay) {
    chk.style.background = 'var(--green)'; chk.style.borderColor = 'var(--green)';
    chk.innerHTML = '<span style="color:#fff;font-size:12px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-weight:bold;">✓</span>';
  } else {
    chk.style.background = 'transparent'; chk.style.borderColor = 'var(--text3)'; chk.innerHTML = '';
  }
}

function executeTransfer() {
  const filterDate = document.getElementById('filterDate').value;
  const targetDate = document.getElementById('transferTargetDate').value;
  if (!targetDate) { showToast('Выберите дату переноса'); return; }
  if (filterDate === targetDate) { showToast('Выбрана та же дата'); return; }

  const tasksToMove = todos.filter(t => t.date === filterDate && !t.completed);
  let count = tasksToMove.length;

  tasksToMove.forEach(task => {
    if (deleteFromOldDay) { task.date = targetDate; } 
    else {
      todos.push({ id: 'todo_' + Date.now() + Math.random().toString(36).substring(2, 7), name: task.name, date: targetDate, category: task.category, completed: false });
    }
  });

  document.getElementById('filterDate').value = targetDate;
  saveToStorage(); closeModal('modalTransfer');
  showToast(deleteFromOldDay ? `Перенесено: ${count}` : `Скопировано: ${count}`);
}

// ==========================================
// GITHUB GIST СИНХРОНИЗАЦИЯ
// ==========================================

const GIST_ID = '4586ad4369f06a422ecf842e8df5b78b';
const GIST_URL = `https://api.github.com/gists/${GIST_ID}`;
const GIST_FILENAME = 'data.json';

// --- Экран ввода токена при первом запуске ---
function showTokenScreen() {
  document.getElementById('startupOverlay').style.display = 'flex';
}

function hideTokenScreen() {
  document.getElementById('startupOverlay').style.display = 'none';
}

async function submitToken() {
  const token = document.getElementById('startupTokenInput').value.trim();
  if (!token) { alert('Введите токен'); return; }
  localStorage.setItem('github_token', token);
  hideTokenScreen();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('filterDate').value = today;
  await syncOnStartup(token);
  render();
}

// --- Стартовая синхронизация ---
async function syncOnStartup(token) {
  try {
    const response = await fetch(GIST_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!response.ok) return; // тихо пропускаем ошибку сети

    const gist = await response.json();
    const raw = gist.files?.[GIST_FILENAME]?.content;
    if (!raw) return;

    const cloudData = JSON.parse(raw);
    if (!Array.isArray(cloudData.todos)) return;

    const cloudDate = cloudData.savedAt || '';
    const localDate = localStorage.getItem('last_saved_at') || '';

    if (cloudDate > localDate) {
      // Облако новее — тихо загружаем
      todos = cloudData.todos;
      templates = cloudData.templates || [];
      categories = cloudData.categories || categories;
      svcData = cloudData.svcData || { months: [] };
      localStorage.setItem('todo_items', JSON.stringify(todos));
      localStorage.setItem('todo_templates', JSON.stringify(templates));
      localStorage.setItem('todo_categories', JSON.stringify(categories));
      localStorage.setItem('services_data', JSON.stringify(svcData));
      localStorage.setItem('last_saved_at', cloudDate);
    }
  } catch(e) {
    // тихо игнорируем — работаем офлайн
  }
}

// --- Авто-сохранение (с дебаунсом 2 сек) ---
let _autoSaveTimer = null;
function autoSaveToCloud() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_doAutoSave, 2000);
}

async function _doAutoSave() {
  const token = localStorage.getItem('github_token');
  if (!token) return;
  try {
    const now = new Date().toISOString();
    const payload = { todos, templates, categories, svcData, savedAt: now };
    const response = await fetch(GIST_URL, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } }
      })
    });
    if (response.ok) {
      localStorage.setItem('last_saved_at', now);
      showSyncIndicator();
    }
  } catch(e) {
    // тихо — нет интернета, не страшно
  }
}

function showSyncIndicator() {
  const el = document.getElementById('syncIndicator');
  if (!el) return;
  el.textContent = '☁️ Сохранено';
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// --- Ручная синхронизация (на случай нужды) ---
function openSyncModal() {
  document.getElementById('syncStatus').style.display = 'none';
  openModal('modalSync');
}

function toggleTokenVisibility() {
  const input = document.getElementById('syncToken');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function setSyncStatus(msg, color) {
  const el = document.getElementById('syncStatus');
  el.textContent = msg;
  el.style.background = color === 'green' ? 'rgba(52,216,92,0.1)' : color === 'red' ? 'rgba(255,94,87,0.1)' : 'rgba(255,255,255,0.05)';
  el.style.color = color === 'green' ? 'var(--green)' : color === 'red' ? 'var(--red)' : 'var(--text2)';
  el.style.display = 'block';
}

async function loadFromCloud() {
  const token = localStorage.getItem('github_token');
  if (!token) { showToast('Токен не найден'); return; }

  const btn = document.getElementById('btnLoadCloud');
  btn.textContent = '⏳ Загрузка...'; btn.disabled = true;

  try {
    const response = await fetch(GIST_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (response.status === 401) throw new Error('Неверный токен');
    if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);

    const gist = await response.json();
    const raw = gist.files?.[GIST_FILENAME]?.content;
    if (!raw) throw new Error('Файл data.json не найден в Gist');

    const data = JSON.parse(raw);
    if (!Array.isArray(data.todos)) throw new Error('Неверный формат данных');

    todos = data.todos;
    templates = data.templates || [];
    categories = data.categories || categories;
    svcData = data.svcData || { months: [] };
    localStorage.setItem('todo_items', JSON.stringify(todos));
    localStorage.setItem('todo_templates', JSON.stringify(templates));
    localStorage.setItem('todo_categories', JSON.stringify(categories));
    localStorage.setItem('services_data', JSON.stringify(svcData));
    localStorage.setItem('last_saved_at', data.savedAt || '');
    render();
    closeModal('modalSync');
    showToast('✓ Данные загружены из облака!');
  } catch (e) {
    showToast('✗ ' + e.message);
  } finally {
    btn.textContent = '⬇️ Загрузить данные из облака'; btn.disabled = false;
  }
}

function resetToken() {
  if (!confirm('Сбросить токен? Потребуется ввести заново при следующем открытии.')) return;
  localStorage.removeItem('github_token');
  closeModal('modalSync');
  showToast('Токен удалён');
}

// ОКНО НЕВЫПОЛНЕННЫХ ЗАДАНИЙ
let incompletePeriodDays = 7;

function openIncompleteModal() {
  incompletePeriodDays = 7;
  incompleteCatFilter = null;
  document.querySelectorAll('.period-tab').forEach((t,i) => t.classList.toggle('active', i === 0));
  renderIncomplete();
  document.getElementById('overlayIncomplete').classList.add('open');
}

function closeIncompleteModal() {
  document.getElementById('overlayIncomplete').classList.remove('open');
}

function setIncompletePeriod(days, btn) {
  incompletePeriodDays = days;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderIncomplete();
}

function renderIncomplete() {
  const today = new Date().toISOString().split('T')[0];
  let filtered = todos.filter(t => !t.completed);

  if (incompletePeriodDays > 0) {
    const from = new Date();
    from.setDate(from.getDate() - incompletePeriodDays + 1);
    const fromStr = from.toISOString().split('T')[0];
    filtered = filtered.filter(t => t.date >= fromStr);
  }

  // Рендер пилюль категорий для долгов
  const catFilterEl = document.getElementById('incompleteCatFilter');
  const usedCats = [...new Set(filtered.map(t => t.category).filter(Boolean))];
  if (usedCats.length > 1) {
    catFilterEl.style.display = 'flex';
    catFilterEl.innerHTML =
      `<button class="cat-pill ${incompleteCatFilter===null?'active':''}" onclick="setIncompleteCatFilter(null)">Все</button>` +
      usedCats.map(c => {
        const label = c;
        return `<button class="cat-pill ${incompleteCatFilter===c?'active':''}" onclick="setIncompleteCatFilter('${esc(c)}')">${esc(label)}</button>`;
      }).join('');
  } else {
    catFilterEl.style.display = 'none';
    incompleteCatFilter = null;
  }

  // Применяем фильтр категории
  if (incompleteCatFilter) filtered = filtered.filter(t => t.category === incompleteCatFilter);

  // Группируем по дате
  const groups = {};
  filtered.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const list = document.getElementById('incompleteList');
  const badge = document.getElementById('incompleteTotalBadge');
  badge.textContent = filtered.length ? `${filtered.length} задач` : '';

  if (sortedDates.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding: 60px 20px; color: var(--text3)">
      <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
      <div style="font-size: 15px;">Всё выполнено!</div>
    </div>`;
    return;
  }

  list.innerHTML = sortedDates.map(date => {
    const isOverdue = date < today;
    const items = groups[date];
    const dateLabel = formatDateFull(date);
    return `
      <div class="day-group">
        <div class="day-group-header">
          <span>${dateLabel}${isOverdue ? '<span class="overdue-label">просрочено</span>' : ''}</span>
          <span class="day-group-count">${items.length}</span>
        </div>
        ${items.map(item => {
          const catLabel = item.category;
          return `
          <div class="task-item" id="inc_${item.id}">
            <div class="checkbox-wrapper" onclick="incompleteToggle('${item.id}')"><div class="custom-checkbox"></div></div>
            <div class="task-content">
              <div class="task-title">${esc(item.name)}</div>
              <div class="task-meta"><span class="task-tag">${esc(catLabel)}</span></div>
            </div>
            <div class="task-actions" style="opacity:1; pointer-events:auto;">
              <button class="btn btn-orange btn-icon btn-sm" title="Перенести" onclick="incompleteMoveOne('${item.id}')">↷</button>
              <button class="btn btn-danger btn-icon btn-sm" onclick="incompleteDelete('${item.id}')">✕</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }).join('');
}

function setIncompleteCatFilter(cat) {
  incompleteCatFilter = cat;
  renderIncomplete();
}

function incompleteToggle(id) {
  const item = todos.find(t => t.id === id);
  if (!item) return;
  item.completed = true;
  saveToStorage();
  renderIncomplete();
  showToast('Выполнено!');
}

function incompleteDelete(id) {
  if (confirm('Удалить это задание?')) {
    todos = todos.filter(t => t.id !== id);
    saveToStorage();
    renderIncomplete();
    showToast('Задание удалено');
  }
}

function incompleteMoveOne(id) {
  // Переиспользуем существующий модал переноса
  const item = todos.find(t => t.id === id);
  if (!item) return;
  movingTaskId = id;
  document.getElementById('moveOneTaskName').textContent = '«' + item.name + '»';
  const tomorrow = new Date(item.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('moveOneTargetDate').value = tomorrow.toISOString().split('T')[0];
  // После переноса — обновить и этот экран тоже
  window._moveOneCallback = () => renderIncomplete();
  openModal('modalMoveOne');
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const days = ['вс','пн','вт','ср','чт','пт','сб'];
  const dt = new Date(+y, +m-1, +d);
  return `${d} ${months[+m-1]} ${y} (${days[dt.getDay()]})`;
}


function filterTasks() { mainCatFilter = null; render(); }
function setFilterAll() { document.getElementById('filterDate').value = ''; mainCatFilter = null; render(); }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => { el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); }); });

// Ctrl+Enter — сохранить задание, Escape — закрыть активный модал
document.addEventListener('keydown', e => {
  // Insert — открыть форму нового задания
  if (e.key === 'Insert') {
    e.preventDefault();
    openAddTask();
    return;
  }
  // Escape — закрыть верхний открытый модал
  if (e.key === 'Escape') {
    const opened = [...document.querySelectorAll('.modal-overlay.open, .fullscreen-overlay.open')]
      .filter(el => getComputedStyle(el).pointerEvents !== 'none');
    if (opened.length) {
      const top = opened[opened.length - 1];
      if (top.id === 'overlayIncomplete') closeIncompleteModal();
      else closeModal(top.id);
    }
    return;
  }

  // Ctrl+Enter — сохранить задание если открыт modalTask
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.getElementById('modalTask').classList.contains('open')) {
      e.preventDefault();
      saveTask();
    }
  }
});
function esc(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
function formatDate(dateStr) { if (!dateStr) return ''; const [y, m, d] = dateStr.split('-'); return `${d}.${m}.${y}`; }

// ==========================================
// МОДУЛЬ УСЛУГИ
// ==========================================
let svcData = JSON.parse(localStorage.getItem('services_data') || 'null') || { months: [] };
let svcMonthId = null;
let svcObjectId = null;
let svcEditMonthId = null;
let svcEditObjectId = null;
let svcEditServiceId = null;
let svcCopyingMonthId = null;
let svcCopyingServiceId = null;
let svcSelectedNewMonth = null;
let svcSelectedCopyMonth = null;

const SVC_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const SVC_MONTHS_S = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

function svcSave() {
  localStorage.setItem('services_data', JSON.stringify(svcData));
  autoSaveToCloud();
}
function svcUid() { return '_s' + Math.random().toString(36).substr(2,9); }
function svcFmt(v) { return (parseFloat(v)||0).toLocaleString('ru',{minimumFractionDigits:0,maximumFractionDigits:2}); }

function openServicesModule() {
  svcMonthId = null; svcObjectId = null;
  document.getElementById('servicesModule').classList.add('open');
  svcRender();
}
function closeServicesModule() {
  document.getElementById('servicesModule').classList.remove('open');
}
function openSvcModal(id) { document.getElementById(id).classList.add('open'); }
function closeSvcModal(id) { document.getElementById(id).classList.remove('open'); }

function svcNavigate(monthId, objectId) {
  svcMonthId = monthId || null;
  svcObjectId = objectId || null;
  svcRender();
}

function svcRender() {
  svcRenderBreadcrumb();
  svcRenderHeader();
  if (!svcMonthId) svcRenderMonths();
  else if (!svcObjectId) svcRenderObjects();
  else svcRenderServices();
}

function svcRenderBreadcrumb() {
  const bc = document.getElementById('svcBreadcrumb');
  const month = svcMonthId ? svcData.months.find(m => m.id === svcMonthId) : null;
  const obj = (month && svcObjectId) ? month.objects.find(o => o.id === svcObjectId) : null;
  let html = `<span class="svc-bc-item" onclick="svcNavigate()">Все месяцы</span>`;
  if (month) {
    html += `<span style="margin:0 4px">›</span>`;
    html += obj
      ? `<span class="svc-bc-item" onclick="svcNavigate('${month.id}')">${SVC_MONTHS[month.month-1]} ${month.year}</span>`
      : `<span class="svc-bc-item active">${SVC_MONTHS[month.month-1]} ${month.year}</span>`;
  }
  if (obj) {
    html += `<span style="margin:0 4px">›</span><span class="svc-bc-item active">${obj.icon||'🏢'} ${esc(obj.name)}</span>`;
  }
  bc.innerHTML = html;
}

function svcRenderHeader() {
  const title = document.getElementById('svcHeaderTitle');
  const actions = document.getElementById('svcHeaderActions');
  const month = svcMonthId ? svcData.months.find(m => m.id === svcMonthId) : null;
  const obj = (month && svcObjectId) ? month.objects.find(o => o.id === svcObjectId) : null;
  if (!svcMonthId) {
    title.textContent = 'Услуги';
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="svcOpenAddMonth()">+ Месяц</button>`;
  } else if (!svcObjectId) {
    title.textContent = `${SVC_MONTHS[month.month-1]} ${month.year}`;
    if (month.locked) {
      actions.innerHTML = `<button class="btn btn-orange btn-sm" onclick="svcUnlockMonth('${month.id}')">🔓 Разблокировать</button><button class="btn btn-secondary btn-sm" onclick="svcOpenCopyMonth('${month.id}')">⎘ Копировать</button>`;
    } else {
      actions.innerHTML = `<button class="btn btn-green btn-sm" onclick="svcCloseMonth('${month.id}')">✓ Закрыть</button><button class="btn btn-secondary btn-sm" onclick="svcOpenCopyMonth('${month.id}')">⎘ Копировать</button><button class="btn btn-primary btn-sm" onclick="svcOpenAddObject()">+ Объект</button>`;
    }
  } else {
    title.textContent = `${obj.icon||'🏢'} ${obj.name}`;
    actions.innerHTML = month.locked ? `<span style="font-size:11px;color:var(--text3)">🔒 Архив</span>` : `<button class="btn btn-primary btn-sm" onclick="svcOpenAddService()">+ Услуга</button>`;
  }
}

function svcRenderMonths() {
  const body = document.getElementById('svcBody');
  const months = [...svcData.months].sort((a,b) => b.year-a.year||b.month-a.month);
  if (!months.length) {
    body.innerHTML = `<div class="svc-empty"><div class="svc-empty-icon">🗓️</div><p style="margin-bottom:14px">Нет месяцев. Создайте первый!</p><button class="btn btn-primary" onclick="svcOpenAddMonth()">+ Новый месяц</button></div>`;
    return;
  }
  body.innerHTML = months.map(m => {
    const total = m.objects.reduce((s,o)=>s+o.services.length,0);
    const done = m.objects.reduce((s,o)=>s+o.services.filter(s2=>s2.done).length,0);
    const amt = m.objects.reduce((s,o)=>s+o.services.reduce((s2,sv)=>s2+(parseFloat(sv.amount)||0),0),0);
    return `<div class="svc-card ${m.locked?'locked':''}" onclick="svcNavigate('${m.id}')">
      <div class="svc-card-icon">${m.locked?'🔒':'🗓️'}</div>
      <div class="svc-card-info">
        <div class="svc-card-name">${SVC_MONTHS[m.month-1]} ${m.year}</div>
        <div class="svc-card-meta">
          <span class="svc-status ${m.locked?'svc-status-closed':'svc-status-open'}">${m.locked?'Архив':'В работе'}</span>
          <span>${done}/${total} проведено</span>
          ${amt>0?`<span style="color:var(--orange)">${svcFmt(amt)} грн</span>`:''}
        </div>
      </div>
      <div class="svc-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-danger btn-icon btn-sm" onclick="svcDeleteMonth('${m.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function svcRenderObjects() {
  const body = document.getElementById('svcBody');
  const month = svcData.months.find(m => m.id === svcMonthId);
  if (!month) return;
  const total = month.objects.reduce((s,o)=>s+o.services.length,0);
  const done = month.objects.reduce((s,o)=>s+o.services.filter(s2=>s2.done).length,0);
  const amt = month.objects.reduce((s,o)=>s+o.services.reduce((s2,sv)=>s2+(parseFloat(sv.amount)||0),0),0);
  let html = '';
  if (month.locked) html += `<div class="svc-locked-banner">🔒 Месяц в архиве <button class="btn btn-orange btn-sm" style="margin-left:auto" onclick="svcUnlockMonth('${month.id}')">Разблокировать</button></div>`;
  html += `<div class="svc-summary"><div class="svc-sum-item"><div class="svc-sum-val">${total}</div><div class="svc-sum-label">Фактур</div></div><div class="svc-sum-divider"></div><div class="svc-sum-item"><div class="svc-sum-val" style="color:var(--green)">${done}</div><div class="svc-sum-label">Проведено</div></div><div class="svc-sum-divider"></div><div class="svc-sum-item"><div class="svc-sum-val">${total-done}</div><div class="svc-sum-label">Осталось</div></div><div class="svc-sum-total"><div class="svc-sum-val">${svcFmt(amt)}</div><div class="svc-sum-label">Грн всего</div></div></div>`;
  if (!month.objects.length) {
    html += `<div class="svc-empty"><div class="svc-empty-icon">🏢</div><p style="margin-bottom:14px">Нет объектов</p>${!month.locked?`<button class="btn btn-primary" onclick="svcOpenAddObject()">+ Объект</button>`:''}</div>`;
  } else {
    html += month.objects.map(o => {
      const ot = o.services.length, od = o.services.filter(s=>s.done).length;
      const oa = o.services.reduce((s,sv)=>s+(parseFloat(sv.amount)||0),0);
      return `<div class="svc-card" onclick="svcNavigate('${month.id}','${o.id}')">
        <div class="svc-card-icon" style="background:var(--glass2);border-color:var(--glass-border)">${o.icon||'🏢'}</div>
        <div class="svc-card-info">
          <div class="svc-card-name">${esc(o.name)}</div>
          <div class="svc-card-meta"><span>${od}/${ot} проведено</span>${oa>0?`<span style="color:var(--orange)">${svcFmt(oa)} грн</span>`:''}</div>
        </div>
        <div class="svc-card-actions" onclick="event.stopPropagation()">
          ${!month.locked?`<button class="btn btn-secondary btn-icon btn-sm" onclick="svcOpenEditObject('${o.id}')">✏️</button><button class="btn btn-danger btn-icon btn-sm" onclick="svcDeleteObject('${o.id}')">✕</button>`:''}
        </div>
      </div>`;
    }).join('');
  }
  body.innerHTML = html;
}

function svcRenderServices() {
  const body = document.getElementById('svcBody');
  const month = svcData.months.find(m => m.id === svcMonthId);
  const obj = month ? month.objects.find(o => o.id === svcObjectId) : null;
  if (!obj) return;
  const svcs = obj.services;
  const total = svcs.length, done = svcs.filter(s=>s.done).length;
  const amt = svcs.reduce((s,sv)=>s+(parseFloat(sv.amount)||0),0);
  let html = '';
  if (month.locked) html += `<div class="svc-locked-banner">🔒 Архивный месяц — только просмотр.</div>`;
  html += `<div class="svc-summary"><div class="svc-sum-item"><div class="svc-sum-val">${total}</div><div class="svc-sum-label">Фактур</div></div><div class="svc-sum-divider"></div><div class="svc-sum-item"><div class="svc-sum-val" style="color:var(--green)">${done}</div><div class="svc-sum-label">Проведено</div></div><div class="svc-sum-divider"></div><div class="svc-sum-item"><div class="svc-sum-val">${total-done}</div><div class="svc-sum-label">Осталось</div></div><div class="svc-sum-total"><div class="svc-sum-val">${svcFmt(amt)}</div><div class="svc-sum-label">Грн всего</div></div></div>`;
  if (!svcs.length) {
    html += `<div class="svc-empty"><div class="svc-empty-icon">🧾</div><p style="margin-bottom:14px">Нет услуг</p>${!month.locked?`<button class="btn btn-primary" onclick="svcOpenAddService()">+ Услуга</button>`:''}</div>`;
  } else {
    const pending = svcs.filter(s=>!s.done), completed = svcs.filter(s=>s.done);
    if (pending.length) {
      html += `<div class="svc-section-title">Ожидают проводки</div>`;
      html += pending.map(sv => svcServiceHTML(sv, month.locked)).join('');
    }
    if (completed.length) {
      html += `<div class="svc-section-title">Проведено</div>`;
      html += completed.map(sv => svcServiceHTML(sv, month.locked)).join('');
    }
  }
  body.innerHTML = html;
}

function svcServiceHTML(sv, locked) {
  return `<div class="svc-service-item ${sv.done?'done':''}">
    <div class="checkbox-wrapper" ${!locked?`onclick="svcToggle('${sv.id}')"`:''}><div class="custom-checkbox" style="${sv.done?'background:var(--green);border-color:var(--green)':''}"></div></div>
    <div class="svc-svc-info">
      <div class="svc-svc-name">${esc(sv.name)}</div>
      ${sv.note?`<div class="svc-svc-note">${esc(sv.note)}</div>`:''}
    </div>
    <div class="${sv.amount?'svc-svc-amt':'svc-svc-amt empty'}">${sv.amount?svcFmt(sv.amount)+' грн':'— грн'}</div>
    <div class="svc-svc-actions">
      ${!locked?`<button class="btn btn-secondary btn-icon btn-sm" onclick="svcOpenEditService('${sv.id}')">✏️</button>`:''}
      <button class="btn btn-orange btn-icon btn-sm" onclick="svcOpenCopyService('${sv.id}')">⎘</button>
      ${!locked?`<button class="btn btn-danger btn-icon btn-sm" onclick="svcDeleteService('${sv.id}')">✕</button>`:''}
    </div>
  </div>`;
}

// Месяцы
function svcBuildMonthGrid(gridId, selectedVal) {
  document.getElementById(gridId).innerHTML = SVC_MONTHS_S.map((n,i)=>
    `<button class="svc-month-btn ${selectedVal===i+1?'active':''}" onclick="svcSelectMonth('${gridId}',${i+1},this)">${n}</button>`
  ).join('');
}
function svcSelectMonth(gridId, num, btn) {
  document.querySelectorAll(`#${gridId} .svc-month-btn`).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if (gridId==='svcMonthGrid') svcSelectedNewMonth=num;
  else svcSelectedCopyMonth=num;
}
function svcOpenAddMonth() {
  svcEditMonthId=null;
  const now=new Date(); svcSelectedNewMonth=now.getMonth()+1;
  document.getElementById('svcMonthYear').value=now.getFullYear();
  svcBuildMonthGrid('svcMonthGrid',svcSelectedNewMonth);
  document.getElementById('svcModalMonthTitle').textContent='Новый месяц';
  openSvcModal('svcModalMonth');
}
function svcSaveMonth() {
  const year=parseInt(document.getElementById('svcMonthYear').value);
  if (!svcSelectedNewMonth||!year){showToast('Выберите месяц и год');return;}
  if (svcData.months.find(m=>m.month===svcSelectedNewMonth&&m.year===year)){showToast('Такой месяц уже есть');return;}
  svcData.months.push({id:svcUid(),month:svcSelectedNewMonth,year,locked:false,objects:[]});
  svcSave(); closeSvcModal('svcModalMonth'); svcRender(); showToast('Месяц создан');
}
function svcCloseMonth(id) {
  if (!confirm('Закрыть месяц и отправить в архив?')) return;
  const m=svcData.months.find(m=>m.id===id); if(m){m.locked=true; svcSave(); svcRender(); showToast('Месяц закрыт');}
}
function svcUnlockMonth(id) {
  if (!confirm('Разблокировать месяц?')) return;
  const m=svcData.months.find(m=>m.id===id); if(m){m.locked=false; svcSave(); svcRender(); showToast('Разблокировано');}
}
function svcDeleteMonth(id) {
  if (!confirm('Удалить этот месяц и все данные в нём?')) return;
  svcData.months=svcData.months.filter(m=>m.id!==id); svcSave(); svcNavigate(); showToast('Месяц удалён');
}
function svcOpenCopyMonth(id) {
  svcCopyingMonthId=id;
  const m=svcData.months.find(m=>m.id===id);
  document.getElementById('svcCopyFromName').textContent=`${SVC_MONTHS[m.month-1]} ${m.year}`;
  const next=m.month===12?1:m.month+1, nextY=m.month===12?m.year+1:m.year;
  svcSelectedCopyMonth=next;
  document.getElementById('svcCopyMonthYear').value=nextY;
  svcBuildMonthGrid('svcCopyMonthGrid',next);
  document.querySelector('input[name="svcCopyMode"][value="keep"]').checked=true;
  openSvcModal('svcModalCopyMonth');
}
function svcExecuteCopyMonth() {
  const year=parseInt(document.getElementById('svcCopyMonthYear').value);
  if (!svcSelectedCopyMonth||!year){showToast('Выберите месяц и год');return;}
  if (svcData.months.find(m=>m.month===svcSelectedCopyMonth&&m.year===year)){showToast('Такой месяц уже есть');return;}
  const src=svcData.months.find(m=>m.id===svcCopyingMonthId);
  const keep=document.querySelector('input[name="svcCopyMode"]:checked').value==='keep';
  svcData.months.push({id:svcUid(),month:svcSelectedCopyMonth,year,locked:false,
    objects:src.objects.map(o=>({id:svcUid(),name:o.name,icon:o.icon,
      services:o.services.map(sv=>({id:svcUid(),name:sv.name,note:sv.note||'',amount:keep?sv.amount:'',done:false}))}))});
  svcSave(); closeSvcModal('svcModalCopyMonth'); svcNavigate(); showToast('Месяць скопійовано');
}

// Объекты
function svcOpenAddObject() {
  svcEditObjectId=null;
  document.getElementById('svcObjectName').value='';
  document.getElementById('svcObjectIcon').value='🏢';
  document.getElementById('svcModalObjectTitle').textContent='Новый объект';
  openSvcModal('svcModalObject');
}
function svcOpenEditObject(id) {
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===id);
  svcEditObjectId=id;
  document.getElementById('svcObjectName').value=o.name;
  document.getElementById('svcObjectIcon').value=o.icon||'🏢';
  document.getElementById('svcModalObjectTitle').textContent='Редактировать объект';
  openSvcModal('svcModalObject');
}
function svcSaveObject() {
  const name=document.getElementById('svcObjectName').value.trim();
  const icon=document.getElementById('svcObjectIcon').value.trim()||'🏢';
  if (!name){showToast('Введите название');return;}
  const m=svcData.months.find(m=>m.id===svcMonthId);
  if (svcEditObjectId){const o=m.objects.find(o=>o.id===svcEditObjectId);o.name=name;o.icon=icon;svcEditObjectId=null;}
  else m.objects.push({id:svcUid(),name,icon,services:[]});
  svcSave(); closeSvcModal('svcModalObject'); svcRender(); showToast('Объект сохранён');
}
function svcDeleteObject(id) {
  if (!confirm('Удалить объект и все его услуги?')) return;
  const m=svcData.months.find(m=>m.id===svcMonthId);
  m.objects=m.objects.filter(o=>o.id!==id); svcSave(); svcRender(); showToast('Объект удалён');
}

// Услуги
function svcOpenAddService() {
  svcEditServiceId=null;
  document.getElementById('svcServiceName').value='';
  document.getElementById('svcServiceAmount').value='';
  document.getElementById('svcServiceNote').value='';
  document.getElementById('svcModalServiceTitle').textContent='Новая услуга';
  openSvcModal('svcModalService');
}
function svcOpenEditService(id) {
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===svcObjectId);
  const sv=o.services.find(s=>s.id===id);
  svcEditServiceId=id;
  document.getElementById('svcServiceName').value=sv.name;
  document.getElementById('svcServiceAmount').value=sv.amount||'';
  document.getElementById('svcServiceNote').value=sv.note||'';
  document.getElementById('svcModalServiceTitle').textContent='Редактировать услугу';
  openSvcModal('svcModalService');
}
function svcSaveService() {
  const name=document.getElementById('svcServiceName').value.trim();
  const amount=document.getElementById('svcServiceAmount').value.trim();
  const note=document.getElementById('svcServiceNote').value.trim();
  if (!name){showToast('Введите название');return;}
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===svcObjectId);
  if (svcEditServiceId){const sv=o.services.find(s=>s.id===svcEditServiceId);sv.name=name;sv.amount=amount;sv.note=note;svcEditServiceId=null;}
  else o.services.push({id:svcUid(),name,amount,note,done:false});
  svcSave(); closeSvcModal('svcModalService'); svcRender(); showToast('Услуга сохранена');
}
function svcToggle(id) {
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===svcObjectId);
  const sv=o.services.find(s=>s.id===id);
  sv.done=!sv.done; svcSave(); svcRender();
}
function svcDeleteService(id) {
  if (!confirm('Удалить услугу?')) return;
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===svcObjectId);
  o.services=o.services.filter(s=>s.id!==id); svcSave(); svcRender(); showToast('Услуга удалена');
}
function svcOpenCopyService(id) {
  const m=svcData.months.find(m=>m.id===svcMonthId);
  const o=m.objects.find(o=>o.id===svcObjectId);
  const sv=o.services.find(s=>s.id===id);
  svcCopyingServiceId=id;
  document.getElementById('svcCopyServiceName').textContent=sv.name;
  const monthSel=document.getElementById('svcCopyServiceMonth');
  const sorted=[...svcData.months].sort((a,b)=>b.year-a.year||b.month-a.month);
  monthSel.innerHTML=sorted.map(m=>`<option value="${m.id}">${SVC_MONTHS[m.month-1]} ${m.year}${m.locked?' 🔒':''}</option>`).join('');
  monthSel.onchange=svcUpdateCopyObjects;
  svcUpdateCopyObjects();
  openSvcModal('svcModalCopyService');
}
function svcUpdateCopyObjects() {
  const monthId=document.getElementById('svcCopyServiceMonth').value;
  const m=svcData.months.find(m=>m.id===monthId);
  const objSel=document.getElementById('svcCopyServiceObject');
  objSel.innerHTML=m&&m.objects.length
    ? m.objects.map(o=>`<option value="${o.id}">${o.icon||'🏢'} ${esc(o.name)}</option>`).join('')
    : '<option value="">— нет объектов —</option>';
}
function svcExecuteCopyService() {
  const monthId=document.getElementById('svcCopyServiceMonth').value;
  const objId=document.getElementById('svcCopyServiceObject').value;
  if (!monthId||!objId){showToast('Выберите месяц и объект');return;}
  const srcM=svcData.months.find(m=>m.id===svcMonthId);
  const srcO=srcM.objects.find(o=>o.id===svcObjectId);
  const sv=srcO.services.find(s=>s.id===svcCopyingServiceId);
  const destM=svcData.months.find(m=>m.id===monthId);
  const destO=destM.objects.find(o=>o.id===objId);
  destO.services.push({id:svcUid(),name:sv.name,amount:sv.amount,note:sv.note,done:false});
  svcSave(); closeSvcModal('svcModalCopyService'); showToast('Услуга скопирована');
}

// Клик по фону закрывает svc-модалы
document.querySelectorAll('[id^="svcModal"]').forEach(el=>{
  el.addEventListener('click',e=>{if(e.target===el)closeSvcModal(el.id);});
});

init();

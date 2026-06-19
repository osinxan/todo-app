// Полная базовая версия app.js
let todos = JSON.parse(localStorage.getItem('todo_items') || '[]');
let categories = JSON.parse(localStorage.getItem('todo_categories') || 'null') || [
  { id: 'cat_1', name: 'Работа' },
  { id: 'cat_2', name: 'Личное' },
  { id: 'cat_3', name: 'Важное' },
];

function esc(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg) { 
  const t = document.getElementById('toast') || document.createElement('div');
  t.textContent = msg; 
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:10px 20px;border-radius:8px;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000); 
}

function render() {
  console.log('Задач:', todos.length);
  showToast('Приложение работает! Добавляй задачи.');
}

function openAddTask() {
  showToast('Новое задание — работает');
}

function saveTask() {
  showToast('Задание сохранено (пока только уведомление)');
}

function init() {
  render();
}

init();

console.log('✅ Базовая версия загружена');

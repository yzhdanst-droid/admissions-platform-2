const state = {
  user: null,
  specialties: [],
  applicants: [],
  users: []
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  const me = await api('/api/me');
  if (me.user) {
    state.user = me.user;
    await bootstrap();
    showApp();
  }
});

function bindUi() {
  $('#loginForm').addEventListener('submit', login);
  $('#logoutButton').addEventListener('click', logout);
  $$('.nav').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
  $('#contractForm').addEventListener('submit', saveApplicantOnly);
  $('#saveAndPrint').addEventListener('click', saveApplicantAndPrint);
  $('#specialtyForm').addEventListener('submit', saveSpecialty);
  $('#userForm').addEventListener('submit', saveUser);
  $('#uploadEdebo').addEventListener('click', uploadEdebo);
  $('#search').addEventListener('input', renderApplicants);
  $('#specialtyFilter').addEventListener('change', renderApplicants);
  ['surname', 'firstName', 'patronymic'].forEach(name => {
    $('#contractForm').elements[name].addEventListener('blur', lookupEdebo);
  });
}

async function login(event) {
  event.preventDefault();
  $('#loginError').classList.add('hidden');
  try {
    state.user = await api('/api/login', {
      method: 'POST',
      body: formJson(event.target)
    });
    await bootstrap();
    showApp();
  } catch (error) {
    $('#loginError').textContent = error.message;
    $('#loginError').classList.remove('hidden');
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  $('#loginScreen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

async function bootstrap() {
  const [data, info] = await Promise.all([api('/api/bootstrap'), api('/api/info')]);
  Object.assign(state, data);
  $('#sheetLink').href = info.spreadsheetUrl;
  $('#driveLink').href = info.driveFolderUrl;
  renderAll();
}

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userBadge').textContent = `${state.user.login} · ${state.user.role}`;
  const isAdmin = state.user.role === 'Адміністратор';
  $$('.admin-only').forEach(item => item.classList.toggle('hidden', !isAdmin));
  if (!isAdmin) showScreen('contract');
}

function showScreen(screen) {
  $$('.nav').forEach(item => item.classList.toggle('active', item.dataset.screen === screen));
  $$('.screen').forEach(item => item.classList.toggle('active', item.id === screen));
  $('#screenTitle').textContent = document.querySelector(`.nav[data-screen="${screen}"]`)?.textContent || 'Платформа';
}

function renderAll() {
  renderSpecialties();
  renderApplicants();
}

function renderSpecialties() {
  const options = state.specialties
    .filter(item => item.active !== false)
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code ? `${item.code} ${item.name}` : item.name)}</option>`)
    .join('');
  $('#contractForm').elements.specialtyId.innerHTML = `<option value="">Оберіть спеціальність</option>${options}`;
  $('#specialtyFilter').innerHTML = `<option value="">Усі спеціальності</option>${options}`;
}

function renderApplicants() {
  const query = normalize($('#search')?.value || '');
  const specialtyId = $('#specialtyFilter')?.value || '';
  const specialtyName = state.specialties.find(item => item.id === specialtyId)?.name || '';
  const rows = state.applicants
    .filter(item => !query || normalize(`${item.caseNumber} ${item.fullName}`).includes(query))
    .filter(item => !specialtyName || item.caseNumber?.startsWith(state.specialties.find(s => s.id === specialtyId)?.prefix || ''))
    .map(item => `
      <tr>
        <td>${escapeHtml(item.caseNumber)}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${escapeHtml(item.competitiveScore)}</td>
        <td>${escapeHtml(item.submissionMode)}</td>
        <td>${escapeHtml(item.studyPlace)}</td>
        <td>${item.contractDocUrl ? `<a href="${escapeHtml(item.contractDocUrl)}" target="_blank" rel="noreferrer">Відкрити</a>` : '—'}</td>
      </tr>
    `).join('');
  $('#applicantsBody').innerHTML = rows || '<tr><td colspan="6" class="muted">Записів поки немає</td></tr>';
}

async function saveApplicantOnly(event) {
  event.preventDefault();
  const applicant = await saveApplicantFromForm();
  toast(`Збережено: ${applicant.caseNumber}`);
}

async function saveApplicantAndPrint() {
  if (!$('#contractForm').reportValidity()) return;
  const applicant = await saveApplicantFromForm();
  const contract = await api('/api/applicants/contract', { method: 'POST', body: applicant });
  applicant.contractDocUrl = contract.contractDocUrl;
  window.open(contract.contractDocUrl, '_blank', 'noopener');
  toast('Договір сформовано');
}

async function saveApplicantFromForm() {
  const form = $('#contractForm');
  const applicant = await api('/api/applicants', { method: 'POST', body: formJson(form) });
  state.applicants.unshift(applicant);
  form.reset();
  form.elements.submissionMode.value = 'Очно';
  form.elements.studyPlace.value = 'Київ';
  renderApplicants();
  return applicant;
}

async function lookupEdebo() {
  const form = $('#contractForm');
  const fullName = [form.elements.surname.value, form.elements.firstName.value, form.elements.patronymic.value].join(' ').trim();
  if (!fullName) return;
  const data = await api(`/api/edebo/lookup?fullName=${encodeURIComponent(fullName)}`);
  if (!data.fullName) return;
  ['competitiveScore', 'phone', 'email', 'personId', 'educationType', 'educationSeries', 'educationNumber', 'educationDate', 'educationIssuedBy']
    .forEach(name => {
      if (data[name] && !form.elements[name].value) form.elements[name].value = data[name];
    });
  toast('Дані ЄДЕБО підтягнуто');
}

async function saveSpecialty(event) {
  event.preventDefault();
  const specialty = await api('/api/specialties', { method: 'POST', body: formJson(event.target) });
  const index = state.specialties.findIndex(item => item.id === specialty.id);
  if (index >= 0) state.specialties[index] = specialty;
  else state.specialties.push(specialty);
  event.target.reset();
  renderSpecialties();
  toast('Спеціальність збережено');
}

async function saveUser(event) {
  event.preventDefault();
  state.users = await api('/api/users', { method: 'POST', body: formJson(event.target) });
  event.target.reset();
  toast('Користувача додано');
}

async function uploadEdebo() {
  const file = $('#edeboFile').files[0];
  if (!file) return toast('Оберіть файл');
  const body = new FormData();
  body.append('file', file);
  const result = await api('/api/edebo/import', { method: 'POST', body, rawBody: true });
  $('#importResult').textContent = `Імпортовано записів: ${result.count}. Файл: ${result.fileName}`;
  toast('Імпорт завершено');
}

async function api(url, options = {}) {
  const fetchOptions = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (options.body && !options.rawBody) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  } else if (options.body) {
    fetchOptions.body = options.body;
  }
  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Помилка запиту');
  return data;
}

function formJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalize(value) {
  return String(value || '').toLocaleUpperCase('uk-UA').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.add('hidden'), 3200);
}

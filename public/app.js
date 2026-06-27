const state = {
  user: null,
  specialties: [],
  applicants: [],
  users: [],
  openedApplicantId: ''
};

const STATUS_OPTIONS = {
  recommendedStatus: ['Ні', 'Так'],
  applicationStatus: ['Ні', 'Так'],
  militaryDocumentStatus: ['перевіряється', 'не передбачено', 'ВОД', 'в роботі']
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  try {
    const me = await api('/api/me');
    if (me.user) {
      state.user = me.user;
      showApp();
      await bootstrap();
    }
  } catch (error) {
    showLogin();
  }
});

function bindUi() {
  $('#loginForm').addEventListener('submit', login);
  $('#logoutButton').addEventListener('click', logout);
  $$('.nav').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
  $('#contractForm').addEventListener('submit', saveApplicantOnly);
  $('#saveAndPrint').addEventListener('click', saveApplicantAndPrint);
  $('#resetForm').addEventListener('click', resetContractForm);
  $('#specialtyForm').addEventListener('submit', saveSpecialty);
  $('#newSpecialty').addEventListener('click', () => $('#specialtyForm').reset());
  $('#userForm').addEventListener('submit', saveUser);
  $('#uploadEdebo').addEventListener('click', uploadEdebo);
  $('#search').addEventListener('input', renderApplicants);
  $('#specialtyFilter').addEventListener('change', renderApplicants);
  $('#refreshApplicants').addEventListener('click', bootstrap);
  ['surname', 'firstName', 'patronymic'].forEach(name => {
    $('#contractForm').elements[name].addEventListener('input', () => {
      updateDerivedFields();
      scheduleLookupEdebo();
    });
  });
  $('#contractForm').elements.payerIsStudent.addEventListener('change', togglePayerBlock);
}

async function login(event) {
  event.preventDefault();
  $('#loginError').classList.add('hidden');
  try {
    state.user = await api('/api/login', { method: 'POST', body: formJson(event.target) });
    showApp();
    await bootstrap();
  } catch (error) {
    if (state.user) {
      showAppError(error.message);
      toast(error.message);
      return;
    }
    $('#loginError').textContent = error.message;
    $('#loginError').classList.remove('hidden');
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  showLogin();
}

function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

async function bootstrap() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);
  hideAppError();
  try {
    const info = await api('/api/info');
    $('#sheetLink').href = info.spreadsheetUrl;
    $('#driveLink').href = info.driveFolderUrl;
  } catch (error) {
    $('#sheetLink').removeAttribute('href');
    $('#driveLink').removeAttribute('href');
    showAppError(`Посилання Google не підтягнулись: ${error.message}`);
  }
  renderAll();
}

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userBadge').textContent = `${state.user.login} · ${state.user.role}`;
  const isAdmin = isAdminUser();
  $$('.admin-only').forEach(item => item.classList.toggle('hidden', !isAdmin));
  renderAll();
  if (!isAdmin) showScreen('contract');
}

function showAppError(message) {
  const box = $('#appError');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideAppError() {
  $('#appError').classList.add('hidden');
}

function showScreen(screen) {
  if (!isAdminUser() && !['contract', 'applicants'].includes(screen)) {
    toast('Для цієї ролі розділ недоступний');
    return;
  }
  $$('.nav').forEach(item => item.classList.toggle('active', item.dataset.screen === screen));
  $$('.screen').forEach(item => item.classList.toggle('active', item.id === screen));
  $('#screenTitle').textContent = document.querySelector(`.nav[data-screen="${screen}"]`)?.textContent || 'Платформа';
  renderAll();
}

function isAdminUser() {
  return state.user?.role === 'Адміністратор';
}

function renderAll() {
  renderSpecialties();
  renderApplicants();
  renderUsers();
}

function renderSpecialties() {
  const active = (state.specialties || []).filter(item => item.active !== false);
  const options = active
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(formatSpecialtyName(item))}</option>`)
    .join('');
  $('#contractForm').elements.specialtyId.innerHTML = `<option value="">Оберіть спеціальність</option>${options}`;
  $('#specialtyFilter').innerHTML = `<option value="">Усі спеціальності</option>${options}`;
  $('#specialtiesList').innerHTML = (state.specialties || []).map(item => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(formatSpecialtyName(item))}</strong>
        <span>${escapeHtml(item.prefix)} · наступний ${escapeHtml(item.next || 1)}${item.templateId ? ' · шаблон підключено' : ''}</span>
      </div>
      <button class="secondary small" type="button" data-edit-specialty="${escapeHtml(item.id)}">Редагувати</button>
    </div>
  `).join('') || '<p class="muted">Спеціальності ще не додані</p>';
  $$('[data-edit-specialty]').forEach(button => button.addEventListener('click', () => editSpecialty(button.dataset.editSpecialty)));
}

function renderUsers() {
  $('#usersList').innerHTML = (state.users || []).map(user => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(user.login)}</strong>
        <span>${escapeHtml(user.role)}${user.createdAt ? ` · ${escapeHtml(user.createdAt)}` : ''}</span>
      </div>
    </div>
  `).join('') || '<p class="muted">Користувачі відображаються для адміністратора</p>';
}

function renderApplicants() {
  const query = normalize($('#search')?.value || '');
  const specialtyId = $('#specialtyFilter')?.value || '';
  const prefix = (state.specialties || []).find(item => item.id === specialtyId)?.prefix || '';
  const rows = (state.applicants || [])
    .filter(item => !query || normalize(`${item.caseNumber} ${item.fullName} ${item.phone} ${item.email}`).includes(query))
    .filter(item => !prefix || String(item.caseNumber || '').startsWith(prefix))
    .map(item => renderApplicantRow(item))
    .join('');
  $('#applicantsBody').innerHTML = rows || '<tr><td colspan="8" class="muted">Записів поки немає</td></tr>';
  bindApplicantActions();
}

function renderApplicantRow(item) {
  const detailsOpen = state.openedApplicantId === item.id;
  const statusDisabled = isAdminUser() ? '' : ' disabled';
  return `
    <tr>
      <td><strong>${escapeHtml(item.caseNumber)}</strong><span class="cell-muted">${escapeHtml(item.submissionMode || '')} · ${escapeHtml(item.studyPlace || '')}</span></td>
      <td><strong>${escapeHtml(item.fullName)}</strong><span class="cell-muted">${escapeHtml(item.specialtyCode || '')} ${escapeHtml(item.specialtyName || '')}</span></td>
      <td>${escapeHtml(item.competitiveScore || '')}</td>
      <td>${statusSelect(item.id, 'recommendedStatus', item.recommendedStatus || 'Ні', statusDisabled)}</td>
      <td>${statusSelect(item.id, 'applicationStatus', item.applicationStatus || 'Ні', statusDisabled)}</td>
      <td>${statusSelect(item.id, 'militaryDocumentStatus', item.militaryDocumentStatus || 'перевіряється', statusDisabled)}</td>
      <td><span>${escapeHtml(item.phone || '')}</span><span class="cell-muted">${escapeHtml(item.email || '')}</span></td>
      <td class="table-actions">
        <button class="secondary small" data-toggle-details="${escapeHtml(item.id)}">${detailsOpen ? 'Закрити' : 'Деталі'}</button>
        <button class="secondary small" data-print-applicant="${escapeHtml(item.id)}">Друк</button>
        ${item.contractDocUrl ? `<a class="small-link" href="${escapeHtml(item.contractDocUrl)}" target="_blank" rel="noreferrer">Документ</a>` : ''}
      </td>
    </tr>
    ${detailsOpen ? `<tr class="details-row"><td colspan="8">${renderApplicantDetails(item)}</td></tr>` : ''}
  `;
}

function renderApplicantDetails(item) {
  return `
    <div class="details-grid">
      ${detailGroup('Дані вступника', [
        ['ПІБ', item.fullName],
        ['ПРІЗВИЩЕ', item.upperSurname],
        ['Телефон', item.phone],
        ['Пошта', item.email],
        ['Створено', `${item.createdAt || ''} · ${item.createdBy || ''}`],
        ['Оновлено', `${item.updatedAt || ''} · ${item.updatedBy || ''}`]
      ])}
      ${detailGroup('Паспорт', [
        ['Документ', [item.passportSeries, item.passportNumber].filter(Boolean).join(' ')],
        ['Ким видано', item.passportIssuedBy],
        ['Коли видано', item.passportIssuedAt],
        ['ІНН', item.taxId],
        ['Реєстрація', item.registrationAddress]
      ])}
      ${detailGroup('Освіта', [
        ['ID персони', item.personId],
        ['Тип документа', item.educationType],
        ['Серія / номер', [item.educationSeries, item.educationNumber].filter(Boolean).join(' ')],
        ['Дата', item.educationDate],
        ['Ким видано', item.educationIssuedBy]
      ])}
      ${detailGroup('Замовник', [
        ['ПІБ', item.payerIsStudent ? item.fullName : item.payerFullName],
        ['Паспорт', item.payerIsStudent ? [item.passportSeries, item.passportNumber].filter(Boolean).join(' ') : [item.payerPassportSeries, item.payerPassportNumber].filter(Boolean).join(' ')],
        ['ІНН', item.payerIsStudent ? item.taxId : item.payerTaxId],
        ['Телефон', item.payerIsStudent ? item.phone : item.payerPhone],
        ['Адреса', item.payerIsStudent ? item.registrationAddress : item.payerRegistrationAddress]
      ])}
    </div>
  `;
}

function detailGroup(title, rows) {
  return `<div class="detail-card"><h4>${escapeHtml(title)}</h4>${rows.map(([label, value]) => `
    <div class="detail-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>
  `).join('')}</div>`;
}

function statusSelect(id, field, value, disabled) {
  const options = STATUS_OPTIONS[field] || [];
  return `<select class="table-select" data-status-id="${escapeHtml(id)}" data-field="${escapeHtml(field)}"${disabled}>
    ${options.map(option => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}
  </select>`;
}

function bindApplicantActions() {
  $$('[data-toggle-details]').forEach(button => button.addEventListener('click', () => {
    state.openedApplicantId = state.openedApplicantId === button.dataset.toggleDetails ? '' : button.dataset.toggleDetails;
    renderApplicants();
  }));
  $$('[data-print-applicant]').forEach(button => button.addEventListener('click', () => printExistingApplicant(button.dataset.printApplicant)));
  $$('[data-status-id]').forEach(select => select.addEventListener('change', () => updateStatus(select)));
}

async function updateStatus(select) {
  try {
    const result = await api('/api/applicants/status', {
      method: 'POST',
      body: { id: select.dataset.statusId, field: select.dataset.field, value: select.value }
    });
    const index = state.applicants.findIndex(item => item.id === result.id);
    if (index >= 0) state.applicants[index] = { ...state.applicants[index], ...result };
    toast('Статус оновлено');
  } catch (error) {
    toast(error.message);
    await bootstrap();
  }
}

async function printExistingApplicant(id) {
  const applicant = state.applicants.find(item => item.id === id);
  if (!applicant) return;
  const contract = await api('/api/applicants/contract', { method: 'POST', body: applicant });
  applicant.contractDocUrl = contract.contractDocUrl;
  window.open(contract.contractDocUrl, '_blank', 'noopener');
  renderApplicants();
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
  const payload = formJson(form);
  payload.payerIsStudent = form.elements.payerIsStudent.checked;
  const applicant = await api('/api/applicants', { method: 'POST', body: payload });
  state.applicants.unshift(applicant);
  resetContractForm();
  renderApplicants();
  return applicant;
}

function resetContractForm() {
  const form = $('#contractForm');
  form.reset();
  form.elements.submissionMode.value = 'Очно';
  form.elements.studyPlace.value = 'Київ';
  form.elements.payerIsStudent.checked = true;
  updateDerivedFields();
  togglePayerBlock();
}

function updateDerivedFields() {
  const form = $('#contractForm');
  const surname = clean(form.elements.surname.value);
  const firstName = clean(form.elements.firstName.value);
  const patronymic = clean(form.elements.patronymic.value);
  const upperSurname = surname.toLocaleUpperCase('uk-UA');
  form.elements.upperSurname.value = upperSurname;
  form.elements.fullName.value = [surname, firstName, patronymic].filter(Boolean).join(' ');
  form.elements.initialsName.value = [firstName, upperSurname].filter(Boolean).join(' ');
}

function togglePayerBlock() {
  $('#payerBlock').classList.toggle('disabled-block', $('#contractForm').elements.payerIsStudent.checked);
}

function scheduleLookupEdebo() {
  clearTimeout(scheduleLookupEdebo.timer);
  scheduleLookupEdebo.timer = setTimeout(lookupEdebo, 500);
}

async function lookupEdebo() {
  const form = $('#contractForm');
  const fullName = [form.elements.surname.value, form.elements.firstName.value, form.elements.patronymic.value].join(' ').trim();
  if (fullName.split(/\s+/).length < 2) return;
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

function editSpecialty(id) {
  const item = state.specialties.find(specialty => specialty.id === id);
  if (!item) return;
  const form = $('#specialtyForm');
  ['id', 'name', 'code', 'prefix', 'next', 'templateId'].forEach(name => {
    form.elements[name].value = item[name] || '';
  });
}

async function saveUser(event) {
  event.preventDefault();
  state.users = await api('/api/users', { method: 'POST', body: formJson(event.target) });
  event.target.reset();
  renderUsers();
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

function formatSpecialtyName(item) {
  return item.code ? `${item.code} ${item.name}` : item.name;
}

function normalize(value) {
  return String(value || '').toLocaleUpperCase('uk-UA').replace(/\s+/g, ' ').trim();
}

function clean(value) {
  return String(value || '').trim();
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

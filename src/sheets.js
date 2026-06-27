import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import { getGoogleClients, spreadsheetId } from './google.js';

export const SHEETS = {
  applicants: 'Вступники',
  specialties: 'Спеціальності',
  users: 'Користувачі',
  edebo: 'Імпорт ЄДЕБО',
  counters: 'Лічильники',
  audit: 'Журнал',
  documents: 'Договори'
};

export const APPLICANT_HEADERS = [
  'Оформлення', 'Шифр', 'ПІБ', 'бал НМТ', 'Рекомендовано', 'Заява', 'Місце навчання',
  'Військовий док.', 'ЄДЕБО', 'Оплата', 'IT', '№ ОС', 'Прізвище', "Ім'я",
  'По батькові', 'ПРІЗВИЩЕ', 'ПІБ здобувача', 'ПІБ здоб. Ініц', 'Серія_СТ', 'Номер_СТ',
  'Ким видано_СТ', 'Коли видано_СТ', 'ІНН_СТ', 'Номер тел_СТ', 'Пошта_СТ', 'Реєст_СТ',
  'Прізвище_ЗАМ', "Ім'я_ЗАМ", 'По батькові_ЗАМ', 'ПРІЗВИЩЕ', 'ПІБ_ЗАМ', 'ПІБ_ЗАМ_Ініц',
  'Серія_ЗАМ', 'Номер_ЗАМ', 'Ким видано_ЗАМ', 'Коли видано_ЗАМ', 'ІНН_ЗАМ', 'Номер тел_ЗАМ',
  'Реєст_ЗАМ', '', 'Ід персони', 'Тип документу', 'Серія_Ат', 'Номер_Ат', 'Дата_Ат', 'Ким_Ат',
  'ID', 'Створено', 'Створив', 'Оновлено', 'Оновив', 'Шаблон', 'Посилання на договір'
];

export const SPECIALTY_HEADERS = ['ID', 'Назва', 'Код', 'Префікс', 'Наступний номер', 'ID шаблону Google Docs', 'Активна'];
export const USER_HEADERS = ['Логін', 'Хеш пароля', 'Роль', 'Створено'];
export const EDEBO_HEADERS = [
  'ID заяви', 'ID персони', 'ПІБ', 'Ключ ПІБ', 'Спеціальність', 'Конкурсний бал',
  'Телефон', 'Електронна пошта', 'Тип документа', 'Серія документа', 'Номер документа',
  'Дата видачі', 'Ким видано'
];

let setupReady = false;
let sheetMetaCache = null;

export function hashPassword(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeKey(value) {
  return clean(value)
    .toLocaleUpperCase('uk-UA')
    .replace(/[ʼ’`']/g, '')
    .replace(/\s+/g, ' ');
}

export function todayDateTime() {
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Kyiv'
  }).format(new Date());
}

async function getSpreadsheetMeta() {
  if (sheetMetaCache) return sheetMetaCache;
  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  sheetMetaCache = response.data.sheets || [];
  return sheetMetaCache;
}

async function ensureSheet(title, headers) {
  const { sheets } = getGoogleClients();
  const meta = await getSpreadsheetMeta();
  const existing = meta.find(item => item.properties?.title === title);
  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: { requests: [{ addSheet: { properties: { title } } }] }
    });
    sheetMetaCache = null;
  }

  const values = await getValues(title);
  if (!values.length) {
    await setValues(`${title}!A1`, [headers]);
  }
}

export async function ensureSetup() {
  if (setupReady) return;
  await ensureSheet(SHEETS.applicants, APPLICANT_HEADERS);
  await ensureSheet(SHEETS.specialties, SPECIALTY_HEADERS);
  await ensureSheet(SHEETS.users, USER_HEADERS);
  await ensureSheet(SHEETS.edebo, EDEBO_HEADERS);
  await ensureSheet(SHEETS.counters, ['Ключ', 'Значення']);
  await ensureSheet(SHEETS.audit, ['Дата', 'Оператор', 'Дія', 'ID вступника', 'ПІБ']);
  await ensureSheet(SHEETS.documents, ['Дата', 'ID вступника', 'ПІБ', 'ID документа', 'Посилання']);
  await ensureAdminUser();
  setupReady = true;
}

export async function getValues(range) {
  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
    valueRenderOption: 'FORMATTED_VALUE'
  }).catch(error => {
    if (error.code === 400) return { data: { values: [] } };
    throw error;
  });
  return response.data.values || [];
}

export async function setValues(range, values) {
  const { sheets } = getGoogleClients();
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range,
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

async function clearValues(range) {
  const { sheets } = getGoogleClients();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range
  });
}

async function appendValues(range, values) {
  const { sheets } = getGoogleClients();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}

async function ensureAdminUser() {
  const users = await listUsers(true);
  if (users.length) return;
  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  await appendValues(`${SHEETS.users}!A:D`, [[login, hashPassword(password), 'Адміністратор', todayDateTime()]]);
}

export async function authenticate(login, password) {
  await ensureSetup();
  const users = await listUsers(true);
  const found = users.find(user => user.login === clean(login) && user.passwordHash === hashPassword(password));
  if (!found) return null;
  return { login: found.login, role: found.role };
}

export async function listUsers(includeHash = false) {
  const rows = (await getValues(SHEETS.users)).slice(1);
  return rows.filter(row => clean(row[0])).map(row => ({
    login: clean(row[0]),
    passwordHash: includeHash ? clean(row[1]) : undefined,
    role: clean(row[2]) || 'Оператор',
    createdAt: clean(row[3])
  }));
}

export async function saveUser(payload) {
  await ensureSetup();
  const login = clean(payload.login);
  if (!login || !payload.password) throw new Error('Вкажіть логін і пароль.');
  const users = await listUsers(true);
  if (users.some(user => user.login === login)) throw new Error('Такий користувач вже існує.');
  await appendValues(`${SHEETS.users}!A:D`, [[login, hashPassword(payload.password), clean(payload.role) || 'Оператор', todayDateTime()]]);
  return listUsers();
}

export async function listSpecialties() {
  await ensureSetup();
  const rows = (await getValues(SHEETS.specialties)).slice(1);
  return rows.filter(row => clean(row[0])).map(row => ({
    id: clean(row[0]),
    name: clean(row[1]),
    code: clean(row[2]),
    prefix: clean(row[3]),
    next: Number(row[4] || 1),
    templateId: clean(row[5]),
    active: clean(row[6] || 'Так') !== 'Ні'
  }));
}

export async function saveSpecialty(payload) {
  await ensureSetup();
  const values = await getValues(SHEETS.specialties);
  const rows = values.slice(1);
  const item = {
    id: clean(payload.id) || crypto.randomUUID(),
    name: clean(payload.name),
    code: clean(payload.code),
    prefix: clean(payload.prefix).endsWith('/') ? clean(payload.prefix) : `${clean(payload.prefix)}/`,
    next: Number(payload.next || 1),
    templateId: clean(payload.templateId),
    active: payload.active !== false
  };
  if (!item.name || !item.prefix) throw new Error('Вкажіть назву і префікс спеціальності.');
  const index = rows.findIndex(row => clean(row[0]) === item.id);
  if (index >= 0) {
    values[index + 1] = specialtyRow(item);
    await setValues(`${SHEETS.specialties}!A1:G${values.length}`, values);
  } else {
    await appendValues(`${SHEETS.specialties}!A:G`, [specialtyRow(item)]);
  }
  await ensureSpecialtyTab(item);
  return item;
}

function specialtyRow(item) {
  return [item.id, item.name, item.code, item.prefix, item.next, item.templateId, item.active ? 'Так' : 'Ні'];
}

async function ensureSpecialtyTab(specialty) {
  const title = `${specialty.code} ${specialty.name}`.trim().slice(0, 99);
  await ensureSheet(title, APPLICANT_HEADERS);
}

async function getCounter(key, fallback = 1) {
  const rows = await getValues(SHEETS.counters);
  const found = rows.slice(1).find(row => clean(row[0]) === key);
  return found ? Number(found[1] || fallback) : fallback;
}

async function setCounter(key, value) {
  const rows = await getValues(SHEETS.counters);
  const index = rows.slice(1).findIndex(row => clean(row[0]) === key);
  if (index >= 0) {
    rows[index + 1] = [key, value];
    await setValues(`${SHEETS.counters}!A1:B${rows.length}`, rows);
  } else {
    await appendValues(`${SHEETS.counters}!A:B`, [[key, value]]);
  }
}

export async function listApplicants() {
  await ensureSetup();
  const rows = (await getValues(SHEETS.applicants)).slice(1);
  return rows.filter(row => clean(row[2])).map(rowToApplicant);
}

function rowToApplicant(row) {
  return {
    submissionMode: clean(row[0]),
    caseNumber: clean(row[1]),
    fullName: clean(row[2]),
    competitiveScore: clean(row[3]),
    recommendedStatus: clean(row[4]),
    applicationStatus: clean(row[5]),
    studyPlace: clean(row[6]),
    militaryDocumentStatus: clean(row[7]),
    specialtyCode: clean(row[1]).split('/')[0]?.replace(/[^\d]/g, ''),
    surname: clean(row[12]),
    firstName: clean(row[13]),
    patronymic: clean(row[14]),
    upperSurname: clean(row[15]),
    initialsName: clean(row[17]),
    passportSeries: clean(row[18]),
    passportNumber: clean(row[19]),
    passportIssuedBy: clean(row[20]),
    passportIssuedAt: clean(row[21]),
    taxId: clean(row[22]),
    phone: clean(row[23]),
    email: clean(row[24]),
    registrationAddress: clean(row[25]),
    payerSurname: clean(row[26]),
    payerFirstName: clean(row[27]),
    payerPatronymic: clean(row[28]),
    payerUpperSurname: clean(row[29]),
    payerFullName: clean(row[30]),
    payerInitialsName: clean(row[31]),
    payerPassportSeries: clean(row[32]),
    payerPassportNumber: clean(row[33]),
    payerPassportIssuedBy: clean(row[34]),
    payerPassportIssuedAt: clean(row[35]),
    payerTaxId: clean(row[36]),
    payerPhone: clean(row[37]),
    payerRegistrationAddress: clean(row[38]),
    personId: clean(row[40]),
    educationType: clean(row[41]),
    educationSeries: clean(row[42]),
    educationNumber: clean(row[43]),
    educationDate: clean(row[44]),
    educationIssuedBy: clean(row[45]),
    id: clean(row[46]) || clean(row[1]),
    createdAt: clean(row[47]),
    createdBy: clean(row[48]),
    updatedAt: clean(row[49]),
    updatedBy: clean(row[50]),
    templateId: clean(row[51]),
    contractDocUrl: clean(row[52])
  };
}

export async function saveApplicant(payload, operator) {
  await ensureSetup();
  const specialties = await listSpecialties();
  const specialty = specialties.find(item => item.id === clean(payload.specialtyId));
  if (!specialty) throw new Error('Спеціальність не знайдено.');

  const next = await getCounter(`CASE:${specialty.id}`, specialty.next || 1);
  const caseNumber = `${specialty.prefix}${next}`;
  await setCounter(`CASE:${specialty.id}`, next + 1);

  const data = normalizeApplicant(payload, specialty, caseNumber, operator);
  await appendValues(`${SHEETS.applicants}!A:BA`, [applicantRow(data)]);
  await appendValues(`${SHEETS.audit}!A:E`, [[todayDateTime(), operator, 'Оформлено вступника', data.id, data.fullName]]);
  await ensureSpecialtyTab(specialty);
  await appendValues(`${`${specialty.code} ${specialty.name}`.trim().slice(0, 99)}!A:BA`, [applicantRow(data)]);
  return data;
}

function normalizeApplicant(payload, specialty, caseNumber, operator) {
  const surname = clean(payload.surname);
  const firstName = clean(payload.firstName);
  const patronymic = clean(payload.patronymic);
  const upperSurname = surname.toLocaleUpperCase('uk-UA');
  const fullName = [surname, firstName, patronymic].filter(Boolean).join(' ');
  const initialsName = [firstName, upperSurname].filter(Boolean).join(' ');
  const payerIsStudent = payload.payerIsStudent === true || payload.payerIsStudent === 'true' || payload.payerIsStudent === 'on';
  const payerSurname = payerIsStudent ? surname : clean(payload.payerSurname);
  const payerFirstName = payerIsStudent ? firstName : clean(payload.payerFirstName);
  const payerPatronymic = payerIsStudent ? patronymic : clean(payload.payerPatronymic);
  const payerUpperSurname = payerSurname.toLocaleUpperCase('uk-UA');
  const payerFullName = [payerSurname, payerFirstName, payerPatronymic].filter(Boolean).join(' ');
  const payerInitialsName = [payerFirstName, payerUpperSurname].filter(Boolean).join(' ');
  return {
    ...payload,
    id: crypto.randomUUID(),
    caseNumber,
    specialtyName: specialty.name,
    specialtyCode: specialty.code,
    specialtyPrefix: specialty.prefix,
    templateId: specialty.templateId,
    surname,
    firstName,
    patronymic,
    upperSurname,
    fullName,
    initialsName,
    payerIsStudent,
    payerSurname,
    payerFirstName,
    payerPatronymic,
    payerUpperSurname,
    payerFullName,
    payerInitialsName,
    payerPassportSeries: payerIsStudent ? clean(payload.passportSeries) : clean(payload.payerPassportSeries),
    payerPassportNumber: payerIsStudent ? clean(payload.passportNumber) : clean(payload.payerPassportNumber),
    payerPassportIssuedBy: payerIsStudent ? clean(payload.passportIssuedBy) : clean(payload.payerPassportIssuedBy),
    payerPassportIssuedAt: payerIsStudent ? clean(payload.passportIssuedAt) : clean(payload.payerPassportIssuedAt),
    payerTaxId: payerIsStudent ? clean(payload.taxId) : clean(payload.payerTaxId),
    payerPhone: payerIsStudent ? clean(payload.phone) : clean(payload.payerPhone),
    payerRegistrationAddress: payerIsStudent ? clean(payload.registrationAddress) : clean(payload.payerRegistrationAddress),
    submissionMode: clean(payload.submissionMode) || 'Очно',
    studyPlace: clean(payload.studyPlace) || 'Київ',
    recommendedStatus: clean(payload.recommendedStatus) || 'Ні',
    applicationStatus: clean(payload.applicationStatus) || 'Ні',
    militaryDocumentStatus: clean(payload.militaryDocumentStatus) || 'перевіряється',
    createdAt: todayDateTime(),
    createdBy: operator,
    updatedAt: todayDateTime(),
    updatedBy: operator
  };
}

function applicantRow(data) {
  return [
    data.submissionMode, data.caseNumber, data.fullName, clean(data.competitiveScore), data.recommendedStatus,
    data.applicationStatus, data.studyPlace, data.militaryDocumentStatus, '', '', '', data.caseNumber,
    data.surname, data.firstName, data.patronymic, data.upperSurname, data.fullName, data.initialsName,
    clean(data.passportSeries), clean(data.passportNumber), clean(data.passportIssuedBy), clean(data.passportIssuedAt),
    clean(data.taxId), clean(data.phone), clean(data.email), clean(data.registrationAddress),
    clean(data.payerSurname), clean(data.payerFirstName), clean(data.payerPatronymic), clean(data.payerUpperSurname),
    clean(data.payerFullName), clean(data.payerInitialsName), clean(data.payerPassportSeries), clean(data.payerPassportNumber),
    clean(data.payerPassportIssuedBy), clean(data.payerPassportIssuedAt), clean(data.payerTaxId), clean(data.payerPhone),
    clean(data.payerRegistrationAddress), '', clean(data.personId), clean(data.educationType), clean(data.educationSeries),
    clean(data.educationNumber), clean(data.educationDate), clean(data.educationIssuedBy), data.id, data.createdAt,
    data.createdBy, data.updatedAt, data.updatedBy, data.templateId, clean(data.contractDocUrl)
  ];
}

export async function updateApplicantStatus(payload, operator) {
  await ensureSetup();
  const allowed = ['recommendedStatus', 'applicationStatus', 'militaryDocumentStatus'];
  const field = clean(payload.field);
  if (!allowed.includes(field)) throw new Error('Недозволене поле статусу.');
  const rows = await getValues(SHEETS.applicants);
  const index = rows.slice(1).findIndex(row => clean(row[46]) === clean(payload.id));
  if (index < 0) throw new Error('Вступника не знайдено.');
  const rowNumber = index + 2;
  const columnByField = { recommendedStatus: 'E', applicationStatus: 'F', militaryDocumentStatus: 'H' };
  await setValues(`${SHEETS.applicants}!${columnByField[field]}${rowNumber}`, [[clean(payload.value)]]);
  await setValues(`${SHEETS.applicants}!AX${rowNumber}:AY${rowNumber}`, [[todayDateTime(), operator]]);
  await appendValues(`${SHEETS.audit}!A:E`, [[todayDateTime(), operator, `Змінено статус: ${field}`, clean(payload.id), clean(rows[index + 1][2])]]);
  return { id: clean(payload.id), [field]: clean(payload.value), updatedAt: todayDateTime(), updatedBy: operator };
}

export async function saveEdeboImport(file) {
  await ensureSetup();
  let rows;
  if (file.originalname.toLocaleLowerCase().endsWith('.csv')) {
    rows = parse(file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, bom: true });
  } else {
    const workbook = xlsx.read(file.buffer, { type: 'buffer', cellText: true, cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  }

  const normalized = rows.map(mapEdeboRow).filter(row => row[2]);
  await clearValues(SHEETS.edebo);
  await setValues(`${SHEETS.edebo}!A1:M${Math.max(normalized.length + 1, 1)}`, [EDEBO_HEADERS, ...normalized]);
  return { count: normalized.length, fileName: file.originalname, importedAt: todayDateTime() };
}

function mapEdeboRow(row) {
  const keys = Object.keys(row);
  const find = labels => {
    const key = keys.find(item => labels.some(label => normalizeKey(item).includes(normalizeKey(label))));
    return key ? clean(row[key]) : '';
  };
  const fullName = find(['ПІБ', 'Прізвище']);
  return [
    find(['ID заяви', 'заяви']),
    find(['ID персони', 'персони']),
    fullName,
    normalizeKey(fullName),
    find(['Спеціальність']),
    find(['Конкурсний бал', 'бал']),
    find(['Телефон']),
    find(['пошта', 'email', 'електрон']),
    find(['Тип документа']),
    find(['Серія документа', 'Серія']),
    find(['Номер документа', 'Номер']),
    find(['Дата видачі', 'Дата документа']),
    find(['Ким видано', 'Ким виданий'])
  ];
}

export async function lookupEdebo(fullName) {
  await ensureSetup();
  const key = normalizeKey(fullName);
  if (!key) return null;
  const rows = (await getValues(SHEETS.edebo)).slice(1);
  const found = rows.find(row => clean(row[3]) === key || normalizeKey(row[2]) === key);
  if (!found) return null;
  return {
    applicationId: clean(found[0]),
    personId: clean(found[1]),
    fullName: clean(found[2]),
    specialty: clean(found[4]),
    competitiveScore: clean(found[5]),
    phone: clean(found[6]),
    email: clean(found[7]),
    educationType: clean(found[8]),
    educationSeries: clean(found[9]),
    educationNumber: clean(found[10]),
    educationDate: clean(found[11]),
    educationIssuedBy: clean(found[12])
  };
}

export async function recordDocument(applicant, document) {
  await appendValues(`${SHEETS.documents}!A:E`, [[todayDateTime(), applicant.id, applicant.fullName, document.id, document.webViewLink]]);
}

export async function updateApplicantDocumentLink(applicantId, documentUrl) {
  const rows = await getValues(SHEETS.applicants);
  const index = rows.slice(1).findIndex(row => clean(row[46]) === clean(applicantId));
  if (index < 0) return;
  const rowNumber = index + 2;
  await setValues(`${SHEETS.applicants}!BA${rowNumber}`, [[documentUrl]]);
}

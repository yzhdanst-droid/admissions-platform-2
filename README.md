# Вступники та договори: Render + Google

Це окрема серверна версія платформи. Вона не змінює Apps Script-проєкт і працює через Google API:

- Google Sheets: база вступників, спеціальностей, користувачів, імпорту ЄДЕБО.
- Google Drive: папка для договорів.
- Google Docs: шаблони договорів з тегами.
- Render: сервер і вебінтерфейс.

## Що вже є

- Вхід за логіном і паролем.
- Ролі: `Адміністратор` і `Оператор`.
- Оформлення вступника.
- Автоматичне присвоєння шифру за спеціальністю.
- Імпорт ЄДЕБО з CSV/XLSX.
- Автопідтягування даних ЄДЕБО за ПІБ.
- Додавання спеціальностей.
- Додавання користувачів.
- Формування договору через Google Docs API.

## Що потрібно підготувати в Google

1. Створити або вибрати Google-таблицю.
2. Створити папку Google Drive для договорів.
3. Підготувати шаблони договорів у форматі Google Docs.
4. Створити Google Cloud Project.
5. Увімкнути API:
   - Google Sheets API;
   - Google Drive API;
   - Google Docs API.
6. Створити Service Account.
7. Створити JSON-ключ для Service Account.
8. Надати доступ email сервісного акаунта:
   - до Google-таблиці як редактору;
   - до папки договорів як редактору;
   - до шаблонів Google Docs як редактору.

## Змінні середовища для Render

У Render потрібно додати:

```text
SESSION_SECRET=будь-який-довгий-секретний-текст
ADMIN_LOGIN=admin
ADMIN_PASSWORD=ваш_пароль_адміністратора
GOOGLE_SPREADSHEET_ID=ID_вашої_таблиці
GOOGLE_DRIVE_FOLDER_ID=ID_папки_договорів
GOOGLE_SERVICE_ACCOUNT_JSON=повний_JSON_ключ_сервісного_акаунта
```

ID таблиці береться з посилання:

```text
https://docs.google.com/spreadsheets/d/ОЦЕ_ID_ТАБЛИЦІ/edit
```

ID папки береться з посилання:

```text
https://drive.google.com/drive/folders/ОЦЕ_ID_ПАПКИ
```

## Як завантажити на Render

1. Створіть репозиторій на GitHub.
2. Завантажте туди папку `render-google-platform`.
3. У Render натисніть `New +`.
4. Оберіть `Web Service`.
5. Підключіть GitHub-репозиторій.
6. У полі `Root Directory` вкажіть:

```text
render-google-platform
```

7. Build Command:

```text
npm install
```

8. Start Command:

```text
npm start
```

9. Додайте змінні середовища.
10. Натисніть `Deploy`.

## Теги договору

У шаблон Google Docs можна вставляти такі теги:

```text
{{caseNumber}}
{{fullName}}
{{surname}}
{{firstName}}
{{patronymic}}
{{upperSurname}}
{{initialsName}}
{{specialtyName}}
{{specialtyCode}}
{{competitiveScore}}
{{submissionMode}}
{{studyPlace}}
{{recommendedStatus}}
{{applicationStatus}}
{{militaryDocumentStatus}}
{{passportSeries}}
{{passportNumber}}
{{passportIssuedBy}}
{{passportIssuedAt}}
{{taxId}}
{{phone}}
{{email}}
{{registrationAddress}}
{{personId}}
{{educationType}}
{{educationSeries}}
{{educationNumber}}
{{educationDate}}
{{educationIssuedBy}}
{{payerFullName}}
{{payerTaxId}}
{{createdAt}}
{{createdBy}}
{{updatedAt}}
{{updatedBy}}
```

## Важливо

Це перша серверна версія. Вона потрібна, щоб перевірити сам підхід: Render + Google Sheets/Drive/Docs.

Поточна Apps Script-версія залишається окремо і не змінюється.

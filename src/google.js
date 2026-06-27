import { google } from 'googleapis';

const scopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents'
];

function getServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }

  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  throw new Error('Не налаштовано доступ Google. Додайте GOOGLE_SERVICE_ACCOUNT_JSON у Render.');
}

let cachedAuth;

export function getAuth() {
  if (!cachedAuth) {
    const account = getServiceAccount();
    cachedAuth = new google.auth.JWT({
      email: account.client_email,
      key: account.private_key,
      scopes
    });
  }
  return cachedAuth;
}

export function getGoogleClients() {
  const auth = getAuth();
  return {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
    docs: google.docs({ version: 'v1', auth })
  };
}

export function spreadsheetId() {
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    throw new Error('Не вказано GOOGLE_SPREADSHEET_ID.');
  }
  return process.env.GOOGLE_SPREADSHEET_ID;
}

export function contractsFolderId() {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Не вказано GOOGLE_DRIVE_FOLDER_ID.');
  }
  return process.env.GOOGLE_DRIVE_FOLDER_ID;
}

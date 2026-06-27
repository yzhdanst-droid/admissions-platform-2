import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const moduleDirs = [
  __dirname,
  projectRoot,
  process.cwd(),
  path.join(process.cwd(), 'src'),
  path.join(process.cwd(), 'render-google-platform', 'src')
];
const modulePath = name => {
  const found = moduleDirs.find(candidate => fs.existsSync(path.join(candidate, name)));
  if (!found) throw new Error(`Не знайдено файл ${name}. Перевірте структуру GitHub: файли мають бути у папці src або поруч із package.json.`);
  return pathToFileURL(path.join(found, name)).href;
};
const {
  authenticate,
  ensureSetup,
  listApplicants,
  listSpecialties,
  listUsers,
  lookupEdebo,
  saveApplicant,
  saveEdeboImport,
  saveSpecialty,
  saveUser,
  updateApplicantStatus
} = await import(modulePath('sheets.js'));
const { generateContract } = await import(modulePath('documents.js'));
const { contractsFolderId, spreadsheetId } = await import(modulePath('google.js'));
const publicDir = [
  process.cwd(),
  path.join(process.cwd(), 'public'),
  projectRoot,
  path.join(projectRoot, 'public'),
  __dirname,
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'render-google-platform', 'public')
].find(candidate => fs.existsSync(path.join(candidate, 'index.html'))) || path.join(process.cwd(), 'public');
const serverVersion = 'render-google-platform-2026-06-27-login-bootstrap-fix';
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(session({
  name: 'admissions.sid',
  secret: process.env.SESSION_SECRET || 'local-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.type('html').send(`<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Вступники та договори</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f7;color:#17202f;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(560px,100%);padding:28px;border:1px solid #d6e0ea;border-radius:8px;background:#fff;box-shadow:0 24px 56px rgba(16,32,39,.12)}
    h1{margin:0 0 10px;font-size:26px} p{color:#667085;line-height:1.5} code{display:block;padding:10px;background:#f7fafc;border:1px solid #d6e0ea;border-radius:8px;white-space:pre-wrap}
  </style>
</head>
<body>
  <main>
    <h1>Платформа запущена</h1>
    <p>Сервер працює, але не знайшов файл <strong>index.html</strong>. Перевірте, щоб у GitHub була папка <strong>public</strong> з файлами інтерфейсу.</p>
    <code>Шукав тут: ${escapeHtml_(publicDir)}</code>
  </main>
</body>
</html>`);
});

app.get('/debug', (req, res) => {
  res.json({
    ok: true,
    version: serverVersion,
    cwd: process.cwd(),
    dirname: __dirname,
    publicDir,
    indexExists: fs.existsSync(path.join(publicDir, 'index.html')),
    rootFiles: fs.readdirSync(process.cwd()).slice(0, 80),
    publicFiles: fs.existsSync(publicDir) ? fs.readdirSync(publicDir).slice(0, 80) : []
  });
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    if (acceptsHtml) return res.redirect('/');
    return res.status(401).json({ error: 'Потрібно увійти в систему.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role !== 'Адміністратор') return res.status(403).json({ error: 'Розділ доступний лише адміністратору.' });
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function escapeHtml_(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

app.get('/api/health', asyncRoute(async (req, res) => {
  await ensureSetup();
  res.json({ ok: true });
}));

app.post('/api/login', asyncRoute(async (req, res) => {
  const user = await authenticate(req.body.login, req.body.password);
  if (!user) return res.status(401).json({ error: 'Невірний логін або пароль.' });
  req.session.user = user;
  res.json(user);
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/info', requireAuth, (req, res) => {
  res.json({
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/edit`,
    driveFolderUrl: `https://drive.google.com/drive/folders/${contractsFolderId()}`
  });
});

app.get('/api/bootstrap', requireAuth, asyncRoute(async (req, res) => {
  const [specialties, applicants, users] = await Promise.all([
    listSpecialties(),
    listApplicants(),
    req.session.user.role === 'Адміністратор' ? listUsers() : Promise.resolve([])
  ]);
  res.json({ user: req.session.user, specialties, applicants, users });
}));

app.post('/api/specialties', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const specialty = await saveSpecialty(req.body);
  res.json(specialty);
}));

app.post('/api/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const users = await saveUser(req.body);
  res.json(users);
}));

app.post('/api/edebo/import', requireAuth, requireAdmin, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Оберіть CSV або Excel файл.' });
  res.json(await saveEdeboImport(req.file));
}));

app.get('/api/edebo/lookup', requireAuth, asyncRoute(async (req, res) => {
  res.json(await lookupEdebo(req.query.fullName || '') || {});
}));

app.post('/api/applicants', requireAuth, asyncRoute(async (req, res) => {
  const applicant = await saveApplicant(req.body, req.session.user.login);
  res.json(applicant);
}));

app.post('/api/applicants/contract', requireAuth, asyncRoute(async (req, res) => {
  const result = await generateContract(req.body);
  res.json(result);
}));

app.post('/api/applicants/status', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await updateApplicantStatus(req.body, req.session.user.login);
  res.json(result);
}));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Помилка сервера.' });
});

app.listen(port, () => {
  console.log(`Admissions platform started on port ${port}`);
});

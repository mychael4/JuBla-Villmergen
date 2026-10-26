const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const SRC_DIR = path.join(__dirname, 'src');
const ROOT_DIR = __dirname;
const LOGINS_DIR = path.join(ROOT_DIR, 'logins');
const PICTURES_DIR = path.join(ROOT_DIR, 'pictures');
const EVENTS_FILE = path.join(SRC_DIR, 'events.json');
const USERS_FILE = path.join(LOGINS_DIR, 'users.json');

fs.mkdirSync(PICTURES_DIR, { recursive: true });

function isPastEventDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  const eventDate = new Date(dateString + 'T00:00:00');
  if (Number.isNaN(eventDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

function prunePastEvents(events) {
  return (Array.isArray(events) ? events : []).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    return !(item.date && isPastEventDate(item.date));
  });
}

function sanitizeFileName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'leader';
}

function getLeaderPicturePath(username, pictureData) {
  if (!pictureData || typeof pictureData !== 'string') return '';

  const match = pictureData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return '';

  const mimeType = match[1];
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpg') || mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('gif') ? 'gif' : 'png';
  const safeBaseName = sanitizeFileName(username);
  const fileName = `${safeBaseName}.${ext}`;
  const targetPath = path.join(PICTURES_DIR, fileName);

  if (fs.existsSync(targetPath)) {
    return `pictures/${fileName}`;
  }

  fs.writeFileSync(targetPath, Buffer.from(match[2], 'base64'));
  return `pictures/${fileName}`;
}

app.use(express.static(SRC_DIR));
app.use('/logins', express.static(LOGINS_DIR));
app.use('/pictures', express.static(PICTURES_DIR));
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/events', (req, res) => {
  fs.readFile(EVENTS_FILE, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Events-Datei konnte nicht gelesen werden.' });
    }
    try {
      const parsed = JSON.parse(data || '[]');
      const events = prunePastEvents(parsed);

      if (events.length !== parsed.length) {
        fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8', () => {});
      }

      res.json(events);
    } catch (e) {
      res.status(500).json({ error: 'Events-Datei ist ungültig.' });
    }
  });
});

app.post('/leaders', (req, res) => {
  const payload = req.body || {};
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const telephone = typeof payload.telephone === 'string' ? payload.telephone.trim() : '';
  const picture = typeof payload.picture === 'string' ? payload.picture.trim() : '';
  const role = typeof payload.role === 'string' ? payload.role.trim() : 'Leiterin / Leiter';

  if (!username || (!email && !telephone)) {
    return res.status(400).json({ error: 'Name und Kontaktangaben sind erforderlich.' });
  }

  fs.readFile(USERS_FILE, 'utf8', (err, data) => {
    let users = [];
    if (!err) {
      try {
        users = JSON.parse(data || '[]');
      } catch (parseError) {
        users = [];
      }
    }

    const normalized = users.map((user) => {
      if (!user || typeof user !== 'object') return null;
      return {
        ...user,
        username: typeof user.username === 'string' ? user.username.trim() : user.username,
        email: typeof user.email === 'string' ? user.email.trim() : user.email || '',
        telephone: typeof user.telephone === 'string' ? user.telephone.trim() : user.telephone || '',
        picture: typeof user.picture === 'string' ? user.picture.trim() : user.picture || '',
        role: typeof user.role === 'string' ? user.role.trim() : user.role || 'Leiterin / Leiter'
      };
    }).filter(Boolean);

    const duplicate = normalized.some((user) => user.username && user.username.toLowerCase() === username.toLowerCase());
    if (duplicate) {
      return res.status(409).json({ error: 'Dieser Leiter existiert bereits.' });
    }

    const storedPicture = getLeaderPicturePath(username, picture);
    normalized.push({ username, email, telephone, picture: storedPicture || '', role });

    fs.writeFile(USERS_FILE, JSON.stringify(normalized, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Leiter konnte nicht gespeichert werden.' });
      }
      res.status(201).json({ success: true, leader: { username, email, telephone, picture: storedPicture || '', role } });
    });
  });
});

app.post('/events', (req, res) => {
  const { title, date, info, infos } = req.body || {};
  const cleanInfo = typeof info === 'string' ? info.trim() : (typeof infos === 'string' ? infos.trim() : '');
  if (!title || !date || !cleanInfo) return res.status(400).json({ error: 'Titel, Datum und Infos sind erforderlich.' });

  fs.readFile(EVENTS_FILE, 'utf8', (err, data) => {
    let events = [];
    if (!err) {
      try { events = JSON.parse(data || '[]'); } catch(e) { events = []; }
    }
    const activeEvents = prunePastEvents(events);
    activeEvents.push({ title, date, info: cleanInfo });
    fs.writeFile(EVENTS_FILE, JSON.stringify(activeEvents, null, 2), 'utf8', (werr) => {
      if (werr) return res.status(500).json({ error: 'Konnte Ereignis nicht speichern.' });
      res.status(201).json({ success: true });
    });
  });
});

app.post('/events/sync', (req, res) => {
  const incoming = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!incoming.length) return res.status(200).json({ success: true, imported: 0 });

  fs.readFile(EVENTS_FILE, 'utf8', (err, data) => {
    let events = [];
    if (!err) {
      try { events = JSON.parse(data || '[]'); } catch (e) { events = []; }
    }

    const filteredEvents = prunePastEvents(events);
    const existingKeys = new Set(filteredEvents.map((item) => `${item.date}::${item.title}`));
    const toAdd = incoming.filter((item) => {
      if (!item || !item.title || !item.date || isPastEventDate(item.date)) return false;
      const info = typeof item.info === 'string' ? item.info.trim() : (typeof item.infos === 'string' ? item.infos.trim() : '');
      if (!info) return false;
      return !existingKeys.has(`${item.date}::${item.title}`);
    }).map((item) => ({
      title: item.title,
      date: item.date,
      info: typeof item.info === 'string' ? item.info.trim() : (typeof item.infos === 'string' ? item.infos.trim() : '')
    }));
    filteredEvents.push(...toAdd);

    fs.writeFile(EVENTS_FILE, JSON.stringify(filteredEvents, null, 2), 'utf8', (werr) => {
      if (werr) return res.status(500).json({ error: 'Konnte Ereignisse synchronisieren.' });
      res.status(200).json({ success: true, imported: toAdd.length });
    });
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  console.log(`Öffentlich erreichbar über http://0.0.0.0:${PORT}`);
});

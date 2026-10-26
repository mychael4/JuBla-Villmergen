const yearElement = document.querySelector('#year');

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}


function getSession() {
    const raw = localStorage.getItem('jubla-session');
    return raw ? JSON.parse(raw) : null;
}

function setSession(username) {
    localStorage.setItem('jubla-session', JSON.stringify({ username, loggedInAt: Date.now() }));
}

function clearSession() {
    localStorage.removeItem('jubla-session');
}

function getExtraLeaders() {
    try {
        const raw = localStorage.getItem('jubla-extra-leaders');
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        return [];
    }
}

function sanitizeLeaderForStorage(leader) {
    const safe = normalizeLeader(leader);
    if (!safe) return null;
    if (safe.picture && safe.picture.length > 180000) {
        safe.picture = '';
    }
    return safe;
}

function saveExtraLeaders(leaders) {
    const compact = (leaders || []).map((leader) => {
        const safe = sanitizeLeaderForStorage(leader);
        if (!safe) return null;
        return {
            username: safe.username,
            email: safe.email,
            telephone: safe.telephone,
            picture: '',
            role: safe.role
        };
    }).filter(Boolean);
    try {
        localStorage.setItem('jubla-extra-leaders', JSON.stringify(compact));
        return;
    } catch (error) {
        try {
            localStorage.setItem('jubla-extra-leaders', JSON.stringify([]));
        } catch (storageError) {
            console.warn('Leiterdaten konnten nicht gespeichert werden:', storageError);
        }
    }
}

function normalizeLeader(data) {
    if (!data || !data.username) return null;
    return {
        username: String(data.username).trim(),
        email: data.email ? String(data.email).trim() : '',
        telephone: data.telephone ? String(data.telephone).trim() : '',
        picture: data.picture ? String(data.picture).trim() : '',
        role: data.role ? String(data.role).trim() : 'Leiterin / Leiter'
    };
}

function resolveLeaderImage(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.startsWith('data:')) {
        return path;
    }
    if (path.startsWith('/')) {
        return path;
    }
    if (path.startsWith('../')) {
        return path;
    }
    return `../${path}`;
}

function getLeaderInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'JB';
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

const hiddenLeaderNames = new Set(['Max Oeschger']);

async function loadLeaders() {
    try {
        const response = await fetch('/logins/users.json');
        if (!response.ok) {
            throw new Error('Leiterliste konnte nicht geladen werden.');
        }
        const users = await response.json();
        const baseLeaders = Array.isArray(users) ? users.map(normalizeLeader).filter(Boolean) : [];
        const extraLeaders = getExtraLeaders().map(normalizeLeader).filter(Boolean);
        const merged = [...baseLeaders, ...extraLeaders];
        const unique = new Map();
        merged.forEach((leader) => {
            if (!leader || !leader.username) return;
            const key = leader.username.toLowerCase();
            if (!unique.has(key)) {
                unique.set(key, leader);
            }
        });
        return [...unique.values()].filter((leader) => !hiddenLeaderNames.has(leader.username));
    } catch (error) {
        return getExtraLeaders().map(normalizeLeader).filter(Boolean).filter((leader) => !hiddenLeaderNames.has(leader.username));
    }
}

function isSchaarLeader(leader) {
    const role = leader && leader.role ? String(leader.role).toLowerCase() : '';
    return role.includes('schaar');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showLeaderModal(leader) {
    let overlay = document.querySelector('.leader-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'leader-modal-overlay';
        overlay.innerHTML = `
            <div class="leader-modal" role="dialog" aria-modal="true" aria-label="Leiter Kontakt">
                <button class="btn-close" aria-label="Schliessen">&times;</button>
                <div class="leader-modal-header">
                    <div class="leader-modal-avatar"></div>
                    <div>
                        <h4 class="leader-modal-name"></h4>
                        <p class="leader-role leader-modal-role"></p>
                    </div>
                </div>
                <div class="leader-modal-body">
                    <div class="leader-meta leader-modal-meta"></div>
                </div>
                <div class="leader-actions"><button class="btn-close action-close">Schliessen</button></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close when clicking outside modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('is-open');
            }
        });

        // Close buttons
        overlay.querySelectorAll('.btn-close, .action-close').forEach((btn) => {
            btn.addEventListener('click', () => overlay.classList.remove('is-open'));
        });

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') overlay.classList.remove('is-open');
        });
    }

    const nameEl = overlay.querySelector('.leader-modal-name');
    const roleEl = overlay.querySelector('.leader-modal-role');
    const avatarEl = overlay.querySelector('.leader-modal-avatar');
    const metaEl = overlay.querySelector('.leader-modal-meta');

    nameEl.textContent = leader.username || '';
    roleEl.textContent = leader.role || '';

    metaEl.innerHTML = '';
    if (leader.email) {
        const p = document.createElement('p');
        p.innerHTML = '<strong>E-Mail:</strong> <a href="mailto:' + escapeHtml(leader.email) + '">' + escapeHtml(leader.email) + '</a>';
        metaEl.appendChild(p);
    }
    if (leader.telephone) {
        const p = document.createElement('p');
        p.innerHTML = '<strong>Telefon:</strong> <a href="tel:' + escapeHtml(leader.telephone) + '">' + escapeHtml(leader.telephone) + '</a>';
        metaEl.appendChild(p);
    }
    if (!leader.email && !leader.telephone) {
        const p = document.createElement('p');
        p.textContent = 'Keine Kontaktangaben hinterlegt.';
        metaEl.appendChild(p);
    }

    if (leader.picture) {
        const imgSrc = resolveLeaderImage(leader.picture);
        avatarEl.innerHTML = '<img src="' + imgSrc + '" alt="' + escapeHtml(leader.username) + '">';
    } else {
        avatarEl.textContent = getLeaderInitials(leader.username);
    }

    overlay.classList.add('is-open');
}

function createLeaderCard(leader) {
    const card = document.createElement('article');
    card.className = 'leader-card';

    const summary = document.createElement('div');
    summary.className = 'leader-summary';
    summary.setAttribute('role', 'button');
    summary.setAttribute('tabindex', '0');
    summary.setAttribute('aria-expanded', 'false');

    const avatar = document.createElement('div');
    avatar.className = 'leader-avatar';

    if (leader.picture) {
        const image = document.createElement('img');
        image.src = resolveLeaderImage(leader.picture);
        image.alt = leader.username;
        avatar.appendChild(image);
    } else {
        avatar.textContent = getLeaderInitials(leader.username);
    }

    const content = document.createElement('div');
    content.className = 'leader-content';

    const name = document.createElement('h3');
    name.textContent = leader.username;

    const role = document.createElement('p');
    role.className = 'leader-role';
    role.textContent = leader.role || 'Leiterin / Leiter';

    const hint = document.createElement('p');
    hint.className = 'leader-toggle-hint';
    hint.textContent = 'Kontakt anzeigen';

    content.appendChild(name);
    content.appendChild(role);
    content.appendChild(hint);

    summary.appendChild(avatar);
    summary.appendChild(content);

    summary.addEventListener('click', () => showLeaderModal(leader));
    summary.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            showLeaderModal(leader);
        }
    });

    card.appendChild(summary);
    return card;
}

function setStatus(message, type, element) {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('success', 'error');
    if (type) {
        element.classList.add(type);
    }
}

async function loadUsers() {
    const response = await fetch('/logins/users.json');
    if (!response.ok) {
        throw new Error('Login-Datei konnte nicht geladen werden.');
    }
    return response.json();
}

const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const currentUser = document.getElementById('current-user');
const logoutButton = document.getElementById('logout-button');

async function renderLeaderGrid() {
    const grid = document.getElementById('leader-grid');
    if (!grid) return;

    try {
        const leaders = await loadLeaders();
        grid.innerHTML = '';

        if (!leaders.length) {
            const empty = document.createElement('p');
            empty.className = 'leader-empty';
            empty.textContent = 'Noch keine Leiter eingetragen.';
            grid.appendChild(empty);
            return;
        }

        const groups = [
            {
                title: 'Schaarleiter',
                leaders: leaders.filter(isSchaarLeader)
            },
            {
                title: 'Weitere Leiter',
                leaders: leaders.filter((leader) => !isSchaarLeader(leader))
            }
        ];

        groups.forEach((group) => {
            if (!group.leaders.length) {
                return;
            }

            const section = document.createElement('div');
            section.className = 'leader-group';

            const heading = document.createElement('h3');
            heading.className = 'leader-group-title';
            heading.textContent = group.title;

            const list = document.createElement('div');
            list.className = 'leader-group-list';

            group.leaders.forEach((leader) => {
                list.appendChild(createLeaderCard(leader));
            });

            section.appendChild(heading);
            section.appendChild(list);
            grid.appendChild(section);
        });
    } catch (error) {
        grid.innerHTML = '<p class="leader-empty">Die Leiterliste konnte nicht geladen werden.</p>';
    }
}

const addLeaderForm = document.getElementById('add-leiter-form');
const addLeaderStatus = document.getElementById('add-leiter-status');

if (addLeaderForm) {
    addLeaderForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('leiter-name').value.trim();
        const email = document.getElementById('leiter-email').value.trim();
        const telephone = document.getElementById('leiter-telephone').value.trim();
        const fileInput = document.getElementById('leiter-picture');

        if (!name || !email || !telephone) {
            setStatus('Bitte Name, E-Mail und Telefon angeben.', 'error', addLeaderStatus);
            return;
        }

        try {
            let picture = '';
            const file = fileInput && fileInput.files && fileInput.files[0];
            if (file) {
                if (file.size > 900000) {
                    setStatus('Bild ist zu gross und wurde ohne Foto gespeichert.', 'success', addLeaderStatus);
                } else {
                    picture = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
                        reader.readAsDataURL(file);
                    });
                }
            }

            const leader = normalizeLeader({
                username: name,
                email,
                telephone,
                picture,
                role: 'Leiterin / Leiter'
            });

            const leaderApiUrl = new URL('/leaders', window.location.origin || 'http://localhost:3000').toString();
            const response = await fetch(leaderApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: leader.username,
                    email: leader.email,
                    telephone: leader.telephone,
                    picture: leader.picture,
                    role: leader.role
                })
            });

            let result = {};
            try {
                result = await response.json();
            } catch (error) {
                result = {};
            }

            if (!response.ok) {
                const message = result.error || (response.status === 413 ? 'Das Bild ist zu gross für den Server.' : 'Leiter konnte nicht gespeichert werden.');
                throw new Error(message);
            }

            saveExtraLeaders(getExtraLeaders().filter((item) => {
                const normalized = normalizeLeader(item);
                return normalized && normalized.username.toLowerCase() !== leader.username.toLowerCase();
            }));

            setStatus('Leiter erfolgreich hinzugefügt.', 'success', addLeaderStatus);
            addLeaderForm.reset();
            window.setTimeout(() => {
                window.location.href = 'UnsereLeiter.html';
            }, 700);
        } catch (error) {
            setStatus(error.message || 'Leiter konnte nicht gespeichert werden.', 'error', addLeaderStatus);
        }
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) {
            setStatus('Bitte Benutzername und Passwort eingeben.', 'error', loginStatus);
            return;
        }

        try {
            const users = await loadUsers();
            const validUser = users.find(
                (user) => user.username === username && user.password === password
            );

            if (!validUser) {
                setStatus('Benutzername oder Passwort ist falsch.', 'error', loginStatus);
                return;
            }

            setSession(username);
            setStatus('Login erfolgreich. Weiterleitung...', 'success', loginStatus);
            window.setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 500);
        } catch (error) {
            setStatus(error.message || 'Beim Login ist ein Fehler aufgetreten.', 'error', loginStatus);
        }
    });
}

if (currentUser) {
    const session = getSession();
    if (!session) {
        window.location.href = 'login.html';
    } else {
        currentUser.textContent = session.username;
        const welcomeName = document.getElementById('welcome-name');
        if (welcomeName) {
            welcomeName.textContent = session.username;
        }
    }
}

if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        clearSession();
        window.location.href = 'login.html';
    });
}

renderLeaderGrid();

function isPastEventDate(dateString){
    if (!dateString || typeof dateString !== 'string') return false;
    const eventDate = new Date(dateString + 'T00:00:00');
    if (Number.isNaN(eventDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
}

function filterActiveEvents(events){
    return (events || []).filter((event) => !isPastEventDate(event && event.date));
}

function formatDate(dateString){
    const date = new Date(dateString + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

async function renderHomepageEvents(){
    const list = document.getElementById('homepage-events-list');
    if (!list) return;

    let events = [];
    try {
        const res = await fetch('/events');
        if (!res.ok) throw new Error('Events konnten nicht geladen werden.');
        events = await res.json();
    } catch (error) {
        try {
            const res = await fetch('events.json');
            if (!res.ok) throw new Error('Fallback konnte nicht geladen werden.');
            events = await res.json();
        } catch (fallbackError) {
            list.innerHTML = '<li class="event-empty">Aktuell keine Anlässe verfügbar.</li>';
            return;
        }
    }

    const parsedEvents = Array.isArray(events) ? events : [];
    const upcoming = filterActiveEvents(parsedEvents).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);
    list.innerHTML = '';

    if (!upcoming.length) {
        const empty = document.createElement('li');
        empty.className = 'event-empty';
        empty.textContent = 'Aktuell keine Anlässe verfügbar.';
        list.appendChild(empty);
        return;
    }

    upcoming.forEach((event) => {
        const item = document.createElement('li');
        item.className = 'event-item home-event-item';

        const dateBadge = document.createElement('span');
        dateBadge.className = 'event-date';
        dateBadge.textContent = formatDate(event.date);

        const textWrap = document.createElement('div');
        textWrap.className = 'event-text';

        const title = document.createElement('span');
        title.className = 'event-title';
        title.textContent = event.title;
        textWrap.appendChild(title);

        const info = document.createElement('small');
        info.className = 'event-info';
        const infoText = typeof event.info === 'string' ? event.info.trim() : (typeof event.infos === 'string' ? event.infos.trim() : '');
        if (infoText) {
            info.textContent = infoText;
            textWrap.appendChild(info);
        }

        item.appendChild(dateBadge);
        item.appendChild(textWrap);
        list.appendChild(item);
    });
}

renderHomepageEvents();

const currentPath = window.location.pathname;
if (currentPath.endsWith('/src/login.html') && getSession()) {
}

// --- Events: load from JSON and allow creating new events ---
(async function attachEventsFeature(){
    const eventsList = document.getElementById('events-list');
    const statusEl = document.getElementById('events-status');
    if (!eventsList) return; // not on dashboard

    const nextEventName = document.getElementById('next-event-name');
    const nextEventDate = document.getElementById('next-event-date');
    const upcomingCount = document.getElementById('upcoming-count');
    const totalEvents = document.getElementById('total-events');
    const newEventBtn = document.getElementById('new-event-btn');
    const newEventForm = document.getElementById('new-event-form');
    const cancelEventBtn = document.getElementById('cancel-event-btn');
    const titleInput = document.getElementById('event-title');
    const dateInput = document.getElementById('event-date');
    const infoInput = document.getElementById('event-info');

    function setEventsStatus(msg, type){
        setStatus(msg, type, statusEl);
    }

    function getPendingEvents(){
        try { return JSON.parse(localStorage.getItem('pending-events') || '[]'); }
        catch (e) { return []; }
    }

    function savePendingEvents(events){
        localStorage.setItem('pending-events', JSON.stringify(events));
    }

    function addPendingEvent(ev){
        const pending = getPendingEvents();
        pending.push(ev);
        savePendingEvents(pending);
    }

    async function syncPendingEvents(){
        const pending = getPendingEvents();
        if (!pending.length) return;

        try {
            const res = await fetch('/events/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: pending })
            });

            if (!res.ok) throw new Error('Sync fehlgeschlagen');
            savePendingEvents([]);
            await loadEvents();
        } catch (e) {
            // keep queued locally until server is available
        }
    }

    async function loadEvents(){
        let events = [];
        try {
            const res = await fetch('/events');
            if (!res.ok) throw new Error('Events konnten nicht geladen werden.');
            events = await res.json();
        } catch (err) {
            try {
                const r2 = await fetch('events.json');
                if (!r2.ok) throw err;
                events = await r2.json();
            } catch (e) {
                setEventsStatus(e.message || 'Fehler beim Laden der Anlässe.', 'error');
                events = [];
            }
        }

        const pending = getPendingEvents();
        if (pending.length) {
            const marked = pending.map((p) => ({ ...p, _pending: true }));
            events = filterActiveEvents((events || []).concat(marked));
        } else {
            events = filterActiveEvents(events);
        }
        renderEvents(events);
    }

    function updateDashboardSummary(events){
        const active = filterActiveEvents(events || []);
        const sorted = [...active].sort((a, b) => new Date(a.date) - new Date(b.date));
        const next = sorted[0] || null;

        if (nextEventName) {
            nextEventName.textContent = next ? next.title : 'Keine';
        }
        if (nextEventDate) {
            nextEventDate.textContent = next ? formatDate(next.date) : 'Noch kein Termin geplant';
        }
        if (upcomingCount) {
            upcomingCount.textContent = String(sorted.length);
        }
        if (totalEvents) {
            totalEvents.textContent = String((events || []).length);
        }
    }

    function renderEvents(events){
        eventsList.innerHTML = '';
        events = filterActiveEvents(events);
        if (events.length === 0){
            const li = document.createElement('li');
            li.className = 'event-empty';
            li.textContent = 'Keine Anlässe vorhanden.';
            eventsList.appendChild(li);
            updateDashboardSummary(events);
            return;
        }

        events.sort((a, b) => new Date(a.date) - new Date(b.date));
        for (const ev of events){
            const li = document.createElement('li');
            li.className = 'event-item';

            const dateBadge = document.createElement('span');
            dateBadge.className = 'event-date';
            dateBadge.textContent = formatDate(ev.date);

            const textWrap = document.createElement('div');
            textWrap.className = 'event-text';

            const title = document.createElement('span');
            title.className = 'event-title';
            title.textContent = ev.title;

            textWrap.appendChild(title);

            const infoText = typeof ev.info === 'string' ? ev.info.trim() : (typeof ev.infos === 'string' ? ev.infos.trim() : '');
            if (infoText) {
                const info = document.createElement('small');
                info.className = 'event-info';
                info.textContent = infoText;
                textWrap.appendChild(info);
            }

            if (ev._pending) {
                const note = document.createElement('small');
                note.className = 'event-note';
                note.textContent = 'lokal gespeichert';
                textWrap.appendChild(note);
            }

            li.appendChild(dateBadge);
            li.appendChild(textWrap);
            eventsList.appendChild(li);
        }

        updateDashboardSummary(events);
    }

    function toggleForm(show){
        if (!newEventForm) return;
        if (show){
            newEventForm.classList.remove('hidden');
            newEventForm.setAttribute('aria-hidden', 'false');
            if (titleInput) titleInput.focus();
        } else {
            newEventForm.classList.add('hidden');
            newEventForm.setAttribute('aria-hidden', 'true');
            newEventForm.reset();
        }
    }

    if (newEventBtn) newEventBtn.addEventListener('click', () => toggleForm(true));
    if (cancelEventBtn) cancelEventBtn.addEventListener('click', () => toggleForm(false));

    if (newEventForm) newEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        const date = dateInput.value;
        const info = infoInput ? infoInput.value.trim() : '';
        if (!title || !date || !info) return setEventsStatus('Bitte Titel, Datum und Infos angeben.', 'error');

        const payload = { title, date, info };

        try {
            const res = await fetch('/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Speichern fehlgeschlagen');
            setEventsStatus('Anlass gespeichert.', 'success');
            toggleForm(false);
            await loadEvents();
        } catch (err) {
            addPendingEvent(payload);
            setEventsStatus('Server nicht erreichbar — Anlass wird lokal gespeichert und später synchronisiert.', 'success');
            toggleForm(false);
            await loadEvents();
        }
    });

    await loadEvents();
    await syncPendingEvents();
})();

// --- Lager: Upload von Bildern (localStorage) ---
(function attachLagerUploadFeature(){
    const form = document.getElementById('lager-upload-form');
    if (!form) return; // not on dashboard

    const statusEl = document.getElementById('lager-upload-status');
    const fileInput = document.getElementById('lager-file');
    const titleInput = document.getElementById('lager-title');

    const session = getSession();
    if (!session) {
        // Sicherstellen, dass nur eingeloggte Nutzer Zugriff haben
        form.style.display = 'none';
        if (statusEl) setStatus('Bitte einloggen, um Lagerbilder hochzuladen.', 'error', statusEl);
        return;
    }

    function getLagerUploads(){
        try {
            return JSON.parse(localStorage.getItem('lager-uploads') || '[]');
        } catch (e) {
            return [];
        }
    }

    function updateLagerCount(){
        const countEl = document.getElementById('lager-count');
        if (!countEl) return;
        countEl.textContent = String(getLagerUploads().length);
    }

    function saveLagerUpload(item){
        try {
            const arr = getLagerUploads();
            arr.push(item);
            localStorage.setItem('lager-uploads', JSON.stringify(arr));
            updateLagerCount();
        } catch (e) {
            throw e;
        }
    }

    updateLagerCount();

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const file = fileInput.files && fileInput.files[0];
        const title = titleInput.value && titleInput.value.trim();
        if (!file || !title) return setStatus('Bitte Titel und Bild angeben.', 'error', statusEl);

        const reader = new FileReader();
        reader.onload = function(ev){
            const dataUrl = ev.target.result;
            const item = {
                id: 'lid_' + Date.now(),
                title,
                filename: file.name,
                dataUrl,
                uploadedAt: Date.now(),
                uploader: session.username
            };
            try {
                saveLagerUpload(item);
                setStatus('Bild hochgeladen.', 'success', statusEl);
                form.reset();
            } catch (err) {
                setStatus('Fehler beim Speichern des Bildes.', 'error', statusEl);
            }
        };
        reader.readAsDataURL(file);
    });
})();


const yearElement = document.querySelector('#year');

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}

// Alte lokale Login-Funktionen wurden entfernt.
// Die Anmeldung und der Logout werden durch Supabase geregelt.

function getExtraLeaders() {
    try {
        return JSON.parse(localStorage.getItem('jubla-extra-leaders') || '[]');
    } catch {
        return [];
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
    if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('/')) {
        return path;
    }
    if (path.startsWith('../')) return path;
    return `../${path}`;
}

function getLeaderInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'JB';
    return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

const hiddenLeaderNames = new Set(['Max Oeschger']);

async function loadLeaders() {
    try {
        const response = await fetch('/logins/users.json');
        if (!response.ok) throw new Error('Leiterliste konnte nicht geladen werden.');

        const users = await response.json();
        const baseLeaders = Array.isArray(users) ? users.map(normalizeLeader).filter(Boolean) : [];
        const extraLeaders = getExtraLeaders().map(normalizeLeader).filter(Boolean);

        const unique = new Map();

        [...baseLeaders, ...extraLeaders].forEach(leader => {
            const key = leader.username.toLowerCase();
            if (!unique.has(key)) unique.set(key, leader);
        });

        return [...unique.values()].filter(leader => !hiddenLeaderNames.has(leader.username));
    } catch {
        return getExtraLeaders()
            .map(normalizeLeader)
            .filter(Boolean)
            .filter(leader => !hiddenLeaderNames.has(leader.username));
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
                <div class="leader-actions">
                    <button class="btn-close action-close">Schliessen</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            if (event.target === overlay) overlay.classList.remove('is-open');
        });

        overlay.querySelectorAll('.btn-close').forEach(button => {
            button.addEventListener('click', () => overlay.classList.remove('is-open'));
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') overlay.classList.remove('is-open');
        });
    }

    overlay.querySelector('.leader-modal-name').textContent = leader.username;
    overlay.querySelector('.leader-modal-role').textContent = leader.role || '';

    const avatar = overlay.querySelector('.leader-modal-avatar');
    const meta = overlay.querySelector('.leader-modal-meta');

    meta.innerHTML = '';

    if (leader.email) {
        const p = document.createElement('p');
        p.innerHTML = '<strong>E-Mail:</strong> <a href="mailto:' +
            escapeHtml(leader.email) + '">' + escapeHtml(leader.email) + '</a>';
        meta.appendChild(p);
    }

    if (leader.telephone) {
        const p = document.createElement('p');
        p.innerHTML = '<strong>Telefon:</strong> <a href="tel:' +
            escapeHtml(leader.telephone) + '">' + escapeHtml(leader.telephone) + '</a>';
        meta.appendChild(p);
    }

    if (!leader.email && !leader.telephone) {
        meta.textContent = 'Keine Kontaktangaben hinterlegt.';
    }

    if (leader.picture) {
        avatar.innerHTML = '<img src="' + resolveLeaderImage(leader.picture) +
            '" alt="' + escapeHtml(leader.username) + '">';
    } else {
        avatar.textContent = getLeaderInitials(leader.username);
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

    content.append(name, role, hint);
    summary.append(avatar, content);

    summary.addEventListener('click', () => showLeaderModal(leader));
    summary.addEventListener('keydown', event => {
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
    if (type) element.classList.add(type);
}

async function renderLeaderGrid() {
    const grid = document.getElementById('leader-grid');
    if (!grid) return;

    try {
        const leaders = await loadLeaders();
        grid.innerHTML = '';

        if (!leaders.length) {
            grid.textContent = 'Noch keine Leiter eingetragen.';
            return;
        }

        const groups = [
            { title: 'Schaarleiter', leaders: leaders.filter(isSchaarLeader) },
            { title: 'Weitere Leiter', leaders: leaders.filter(leader => !isSchaarLeader(leader)) }
        ];

        groups.forEach(group => {
            if (!group.leaders.length) return;

            const section = document.createElement('div');
            section.className = 'leader-group';

            const heading = document.createElement('h3');
            heading.className = 'leader-group-title';
            heading.textContent = group.title;

            const list = document.createElement('div');
            list.className = 'leader-group-list';

            group.leaders.forEach(leader => list.appendChild(createLeaderCard(leader)));

            section.append(heading, list);
            grid.appendChild(section);
        });
    } catch {
        grid.textContent = 'Die Leiterliste konnte nicht geladen werden.';
    }
}

const addLeaderForm = document.getElementById('add-leiter-form');
const addLeaderStatus = document.getElementById('add-leiter-status');

if (addLeaderForm) {
    addLeaderForm.addEventListener('submit', async event => {
        event.preventDefault();
        setStatus(
            'Die bisherige Leiterverwaltung benötigt noch eine gemeinsame Datenbank-Anbindung.',
            'error',
            addLeaderStatus
        );
    });
}

function isPastEventDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return false;
    const eventDate = new Date(dateString + 'T00:00:00');
    if (Number.isNaN(eventDate.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
}

function filterActiveEvents(events) {
    return (events || []).filter(event => !isPastEventDate(event && event.date));
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

async function loadEvents() {
    const { data, error } = await supabaseClient
        .from('events')
        .select('*')
        .order('date', { ascending: true });

    if (error) throw error;

    return data || [];
}

async function renderHomepageEvents() {
    const list = document.getElementById('homepage-events-list');
    if (!list) return;

    try {
        const events = await loadEvents();
        const upcoming = filterActiveEvents(events)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);

        list.innerHTML = '';

        if (!upcoming.length) {
            list.innerHTML = '<li class="event-empty">Aktuell keine Anlässe verfügbar.</li>';
            return;
        }

        upcoming.forEach(event => {
            const item = document.createElement('li');
            item.className = 'event-item home-event-item';

            const date = document.createElement('span');
            date.className = 'event-date';
            date.textContent = formatDate(event.date);

            const wrap = document.createElement('div');
            wrap.className = 'event-text';

            const title = document.createElement('span');
            title.className = 'event-title';
            title.textContent = event.title;
            wrap.appendChild(title);

            if (event.info) {
                const info = document.createElement('small');
                info.className = 'event-info';
                info.textContent = event.info;
                wrap.appendChild(info);
            }

            item.append(date, wrap);
            list.appendChild(item);
        });
    } catch {
        list.innerHTML = '<li class="event-empty">Aktuell keine Anlässe verfügbar.</li>';
    }
}

renderHomepageEvents();
renderLeaderGrid();


(function attachEventsFeature() {
    const newEventBtn = document.getElementById('new-event-btn');
    const newEventForm = document.getElementById('new-event-form');
    const titleInput = document.getElementById('event-title');
    const dateInput = document.getElementById('event-date');
    const infoInput = document.getElementById('event-info');
    const cancelBtn = document.getElementById('cancel-event-btn');
    const eventsList = document.getElementById('events-list');
    const statusEl = document.getElementById('events-status');

    if (!newEventForm) return;

    function setEventsStatus(message, type) {
        setStatus(message, type, statusEl);
    }

    function toggleForm(show) {
        newEventForm.classList.toggle('hidden', !show);
        newEventForm.setAttribute('aria-hidden', String(!show));

        if (show) titleInput.focus();
        else newEventForm.reset();
    }

    async function refreshEvents() {
        try {
            const events = await loadEvents();
            const activeEvents = filterActiveEvents(events);

            eventsList.innerHTML = '';

            if (!activeEvents.length) {
                eventsList.innerHTML = '<li>Aktuell keine Anlässe vorhanden.</li>';
            } else {
                activeEvents.forEach(event => {
                    const item = document.createElement('li');
                    item.className = 'event-item';

                    const title = document.createElement('strong');
                    title.textContent = event.title;

                    const date = document.createElement('span');
                    date.textContent = formatDate(event.date);

                    const info = document.createElement('p');
                    info.textContent = event.info;

                    item.append(title, date, info);
                    eventsList.appendChild(item);
                });
            }

            const upcomingCount = document.getElementById('upcoming-count');
            const totalEvents = document.getElementById('total-events');
            const nextEventName = document.getElementById('next-event-name');
            const nextEventDate = document.getElementById('next-event-date');

            if (upcomingCount) upcomingCount.textContent = activeEvents.length;
            if (totalEvents) totalEvents.textContent = events.length;

            if (activeEvents.length) {
                if (nextEventName) nextEventName.textContent = activeEvents[0].title;
                if (nextEventDate) nextEventDate.textContent = formatDate(activeEvents[0].date);
            } else {
                if (nextEventName) nextEventName.textContent = 'Keine';
                if (nextEventDate) nextEventDate.textContent = 'Noch kein Termin geplant';
            }
        } catch (error) {
            console.error('Fehler beim Laden der Anlässe:', error);
            setEventsStatus('Anlässe konnten nicht geladen werden: ' + error.message, 'error');
        }
    }

    if (newEventBtn) {
        newEventBtn.addEventListener('click', () => {
            toggleForm(true);
            setEventsStatus('', '');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            toggleForm(false);
            setEventsStatus('', '');
        });
    }

    newEventForm.addEventListener('submit', async event => {
        event.preventDefault();

        const payload = {
            title: titleInput.value.trim(),
            date: dateInput.value,
            info: infoInput.value.trim()
        };

        if (!payload.title || !payload.date || !payload.info) {
            setEventsStatus('Bitte alle Felder ausfüllen.', 'error');
            return;
        }

        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            setEventsStatus('Du bist nicht angemeldet.', 'error');
            return;
        }

        const { error } = await supabaseClient
            .from('events')
            .insert({
                ...payload,
                created_by: user.id
            });

        if (error) {
            console.error('Fehler beim Speichern:', error);
            setEventsStatus('Fehler beim Speichern: ' + error.message, 'error');
            return;
        }

        setEventsStatus('Anlass erfolgreich gespeichert!', 'success');
        toggleForm(false);
        await refreshEvents();
    });

    refreshEvents();
})();

(function attachLagerUploadFeature() {
    const form = document.getElementById('lager-upload-form');
    if (!form) return;

    const statusEl = document.getElementById('lager-upload-status');
    const countEl = document.getElementById('lager-count');

    form.addEventListener('submit', event => {
        event.preventDefault();
        setStatus(
            'Der Bilderupload benötigt noch eine gemeinsame Speicherlösung.',
            'error',
            statusEl
        );
    });

    if (countEl) countEl.textContent = '0';
})();

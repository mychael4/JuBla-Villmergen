async function initDashboardLogout() {
    const logoutButton = document.getElementById('logout-button');

    if (!logoutButton) return;

    logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        logoutButton.textContent = 'Abmelden...';

        try {
            const { error } = await supabaseClient.auth.signOut();

            if (error) {
                console.error('Fehler beim Abmelden:', error);
                logoutButton.disabled = false;
                logoutButton.textContent = 'Abmelden';
                return;
            }

            window.location.href = 'login.html';
        } catch (error) {
            console.error('Fehler beim Abmelden:', error);
            logoutButton.disabled = false;
            logoutButton.textContent = 'Abmelden';
        }
    });
}

async function initAdminUserManagement() {
    const section = document.getElementById('admin-user-section');
    const list = document.getElementById('admin-user-list');
    const status = document.getElementById('admin-user-status');
    const count = document.getElementById('admin-user-count');
    const toggle = document.getElementById('admin-user-toggle');
    const content = document.getElementById('admin-user-content');

    if (!section || !list || !status || !count || !toggle || !content) return;

    async function loadCurrentProfile() {
        try {
            const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
            if (userError || !user) {
                window.currentProfile = null;
                return;
            }

            const { data, error } = await supabaseClient
                .from('profiles')
                .select('id, full_name, role, status')
                .eq('id', user.id)
                .single();

            if (error || !data) {
                window.currentProfile = null;
                return;
            }

            window.currentProfile = data;
            const currentUser = document.getElementById('current-user');
            if (currentUser) currentUser.textContent = data.full_name || 'Unbekannt';
        } catch {
            window.currentProfile = null;
        }
    }

    await loadCurrentProfile();
    section.classList.remove('hidden');

    // Benutzerverwaltung auf- und zuklappen
    toggle.addEventListener('click', () => {
        const isOpen = !content.classList.contains('hidden');

        content.classList.toggle('hidden', isOpen);
        toggle.setAttribute('aria-expanded', String(!isOpen));
        toggle.innerHTML = isOpen
            ? 'Verwalten <span class="admin-toggle-icon">⌄</span>'
            : 'Schliessen <span class="admin-toggle-icon">⌃</span>';
    });

    async function loadUsers() {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, role, status, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            list.textContent = 'Benutzer konnten nicht geladen werden.';
            return;
        }

        const pendingUsers = data.filter(user => user.status === 'pending');

        count.textContent = `${pendingUsers.length} offen`;
        count.classList.toggle('has-pending', pendingUsers.length > 0);

        list.innerHTML = '';

        if (!data.length) {
            list.textContent = 'Keine Benutzer vorhanden.';
            return;
        }

        if (!data.some(user => user.status === 'pending')) {
            list.innerHTML = '<p>Keine ausstehenden Registrierungen.</p>';
            return;
        }

        // Ausstehende Registrierungen zuerst anzeigen
        data.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        data.forEach(user => {
            const card = document.createElement('div');
            card.className = 'admin-user-card';

            const info = document.createElement('div');
            info.className = 'admin-user-info';

            const name = document.createElement('strong');
            name.textContent = user.full_name || 'Unbekannter Nutzer';

            const details = document.createElement('span');
            details.className = 'admin-user-details';
            details.textContent = `${user.status || 'unknown'} · ${user.role || 'user'}`;

            info.append(name, details);

            const actions = document.createElement('div');
            actions.className = 'admin-user-actions';

            const currentProfileId = window.currentProfile && window.currentProfile.id ? window.currentProfile.id : null;
            const isCurrentUser = currentProfileId && user.id === currentProfileId;

            if (!isCurrentUser) {
                if (user.status !== 'approved') {
                    const approve = document.createElement('button');
                    approve.type = 'button';
                    approve.textContent = 'Freischalten';
                    approve.className = 'admin-approve-btn';
                    approve.addEventListener('click', () =>
                        updateUser(user.id, { status: 'approved' })
                    );
                    actions.appendChild(approve);
                }

                if (user.status !== 'rejected') {
                    const reject = document.createElement('button');
                    reject.type = 'button';
                    reject.textContent = 'Ablehnen';
                    reject.className = 'admin-reject-btn';
                    reject.addEventListener('click', () =>
                        updateUser(user.id, { status: 'rejected' })
                    );
                    actions.appendChild(reject);
                }

                const makeLeader = document.createElement('button');
                makeLeader.type = 'button';
                makeLeader.textContent = 'Leiter';
                makeLeader.addEventListener('click', () =>
                    updateUser(user.id, { role: 'leader' })
                );

                const makeAdmin = document.createElement('button');
                makeAdmin.type = 'button';
                makeAdmin.textContent = 'Admin';
                makeAdmin.addEventListener('click', () =>
                    updateUser(user.id, { role: 'admin' })
                );

                actions.append(makeLeader, makeAdmin);
            }

            card.append(info, actions);
            list.appendChild(card);
        });
    }

    async function updateUser(userId, changes) {
        status.textContent = '';

        const { error } = await supabaseClient
            .from('profiles')
            .update(changes)
            .eq('id', userId);

        if (error) {
            console.error(error);
            status.textContent = 'Fehler: ' + error.message;
            status.className = 'status-message error';
            return;
        }

        status.textContent = 'Benutzer erfolgreich aktualisiert.';
        status.className = 'status-message success';

        await loadUsers();
    }

    await loadUsers();

    // Neue Registrierungen automatisch erkennen
    supabaseClient
        .channel('admin-new-registrations')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'profiles'
            },
            () => loadUsers()
        )
        .subscribe();
}

initDashboardLogout();
initAdminUserManagement();
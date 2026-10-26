
(async function protectDashboard() {
    const { data: { session }, error } =
        await supabaseClient.auth.getSession();

    if (error || !session) {
        window.location.replace('login.html');
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('full_name, role, status')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile || profile.status !== 'approved') {
        await supabaseClient.auth.signOut();
        window.location.replace('login.html');
        return;
    }

    window.currentProfile = {
        ...profile,
        id: session.user.id
    };

    const nameElements = [
        document.getElementById('welcome-name'),
        document.getElementById('current-user')
    ];

    nameElements.forEach(element => {
        if (element) element.textContent = profile.full_name;
    });

    const logoutButton = document.getElementById('logout-button');

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.replace('login.html');
        });
    }

    document.body.classList.add('dashboard-authenticated');

    if (profile.role === 'admin') {
        initAdminUserManagement();
    }
})();


async function initAdminUserManagement() {
    const section = document.getElementById('admin-user-section');
    const list = document.getElementById('admin-user-list');
    const status = document.getElementById('admin-user-status');

    if (!section || !list || !status) return;

    section.classList.remove('hidden');

    // Hinweis für neue Registrierungen
    const notification = document.createElement('p');
    notification.className = 'status-message';
    notification.setAttribute('aria-live', 'polite');
    section.insertBefore(notification, list);

    async function loadUsers() {
        list.textContent = 'Benutzer werden geladen ...';

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, role, status, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            list.textContent = 'Benutzer konnten nicht geladen werden.';
            notification.textContent = '';
            return;
        }

        const pendingUsers = data.filter(user => user.status === 'pending');

        if (pendingUsers.length > 0) {
            notification.textContent =
                `🔔 ${pendingUsers.length} neue Registrierung(en) warten auf Freischaltung.`;
            notification.className = 'status-message warning';
        } else {
            notification.textContent = 'Keine offenen Registrierungen.';
            notification.className = 'status-message';
        }

        list.innerHTML = '';

        if (!data.length) {
            list.textContent = 'Keine Benutzer vorhanden.';
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

            const name = document.createElement('h3');
            name.textContent = user.full_name;

            const details = document.createElement('p');
            details.textContent =
                'Status: ' + user.status + ' | Rolle: ' + user.role;

            const actions = document.createElement('div');
            actions.className = 'admin-user-actions';

            if (user.id !== window.currentProfile.id) {
                if (user.status !== 'approved') {
                    const approve = document.createElement('button');
                    approve.type = 'button';
                    approve.textContent = 'Freischalten';
                    approve.addEventListener('click', () =>
                        updateUser(user.id, { status: 'approved' })
                    );
                    actions.appendChild(approve);
                }

                if (user.status !== 'rejected') {
                    const reject = document.createElement('button');
                    reject.type = 'button';
                    reject.textContent = 'Ablehnen';
                    reject.addEventListener('click', () =>
                        updateUser(user.id, { status: 'rejected' })
                    );
                    actions.appendChild(reject);
                }

                const makeLeader = document.createElement('button');
                makeLeader.type = 'button';
                makeLeader.textContent = 'Als Leiter setzen';
                makeLeader.addEventListener('click', () =>
                    updateUser(user.id, { role: 'leader' })
                );

                const makeAdmin = document.createElement('button');
                makeAdmin.type = 'button';
                makeAdmin.textContent = 'Als Admin setzen';
                makeAdmin.addEventListener('click', () =>
                    updateUser(user.id, { role: 'admin' })
                );

                actions.append(makeLeader, makeAdmin);
            }

            card.append(name, details, actions);
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

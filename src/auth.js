
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggleButton = document.getElementById('toggle-auth');
const authTitle = document.getElementById('auth-title');
const statusElement = document.getElementById('login-status');

function showStatus(message, type = '') {
    statusElement.textContent = message;
    statusElement.className = 'status-message';

    if (type) {
        statusElement.classList.add(type);
    }
}

function showRegister(show) {
    loginForm.hidden = show;
    registerForm.hidden = !show;

    authTitle.textContent = show ? 'Registrieren' : 'Anmelden';
    toggleButton.textContent = show
        ? 'Bereits ein Konto? Anmelden'
        : 'Noch kein Konto? Registrieren';

    showStatus('');
}

toggleButton.addEventListener('click', () => {
    console.log('Registrieren-Button wurde geklickt');
    showRegister(!registerForm.hidden);
});

// Anmeldung
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    showStatus('Anmeldung läuft ...');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        showStatus('Anmeldung fehlgeschlagen. Bitte überprüfe deine Angaben.', 'error');
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('full_name, role, status')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
        await supabaseClient.auth.signOut();
        showStatus('Dein Benutzerprofil konnte nicht geladen werden.', 'error');
        return;
    }

    if (profile.status !== 'approved') {
        await supabaseClient.auth.signOut();

        if (profile.status === 'pending') {
            showStatus('Dein Konto wartet noch auf die Freischaltung durch den Administrator.');
        } else {
            showStatus('Deine Registrierung wurde nicht freigeschaltet.', 'error');
        }

        return;
    }

    showStatus('Anmeldung erfolgreich. Weiterleitung ...', 'success');
    window.location.href = 'dashboard.html';
});

// Registrierung
registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!fullName) {
        showStatus('Bitte gib deinen Namen ein.', 'error');
        return;
    }

    showStatus('Registrierung läuft ...');

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            }
        }
    });

    if (error) {
        showStatus('Registrierung fehlgeschlagen: ' + error.message, 'error');
        return;
    }

    if (data.session) {
        await supabaseClient.auth.signOut();
    }

    showStatus(
        'Registrierung erfolgreich! Dein Konto muss jetzt noch vom Administrator freigeschaltet werden.',
        'success'
    );

    registerForm.reset();
    showRegister(false);
});

// Bereits angemeldete Benutzer direkt weiterleiten
(async function checkExistingSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        window.location.href = 'dashboard.html';
    }
})();

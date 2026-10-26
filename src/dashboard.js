
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

    window.currentProfile = profile;

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
})();

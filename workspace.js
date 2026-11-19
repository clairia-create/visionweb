(() => {
  const panel = document.getElementById('dashboardPanel');
  if (!panel) return;

  function addWorkspaceNavigation() {
    if (panel.hidden || panel.dataset.workspaceReady === 'true') return;
    panel.dataset.workspaceReady = 'true';

    const content = document.createElement('div');
    content.className = 'workspace-content';

    const sidebar = document.createElement('aside');
    sidebar.className = 'workspace-sidebar';
    sidebar.setAttribute('aria-label', 'Workspace navigation');
    sidebar.innerHTML = [
      '<div class="workspace-sidebar-brand"><strong>VISIONWEB</strong><span>YOUR DIGITAL STUDIO</span></div>',
      '<div class="workspace-nav-label">MAIN MENU</div>',
      '<nav class="workspace-nav">',
      '<a href="#workspaceOverview" aria-current="page">Overview</a>',
      '<a href="#websites">My Websites</a>',
      '<a href="#aiStudio">Create Website</a>',
      '<a href="clients.html">My Clients</a>',
      '<a href="#reviews">Private Reviews</a>',
      '<a href="#publishing">Publishing</a>',
      '<a href="#inbox">Client Requests</a>',
      '<a href="#analytics">Analytics</a>',
      '<a href="#settings">Settings</a>',
      '</nav>',
      '<div class="workspace-sidebar-footer"><a href="showcase.html">View public showcase ↗</a><p>One workspace for every client website.</p></div>'
    ].join('');

    const originalChildren = Array.from(panel.children);
    originalChildren.forEach(node => content.appendChild(node));

    const websiteToolbar = Array.from(content.querySelectorAll('.dashboard-toolbar'))
      .find(node => /Website library|Portfolio projects/i.test(node.querySelector('h2')?.textContent || ''));
    if (websiteToolbar) websiteToolbar.id = 'websites';

    const reviews = content.querySelector('.admin-feedback-panel');
    if (reviews) reviews.id = 'reviews';
    const inbox = content.querySelector('.admin-inquiry-panel');
    if (inbox) inbox.id = 'inbox';

    const settings = document.createElement('section');
    settings.className = 'workspace-settings-panel';
    settings.id = 'settings';
    settings.innerHTML = [
      '<div><span class="workspace-settings-label">ACCOUNT SETTINGS</span><h2>Administrator account</h2>',
      '<p>Manage access to your private VisionWeb workspace. Your administrator account and permissions remain protected by Supabase.</p>',
      '<div class="workspace-account-email" id="workspaceAccountEmail">Administrator account</div></div>',
      '<button type="button" class="admin-quiet-button" data-workspace-signout>Sign out of VisionWeb</button>'
    ].join('');
    content.appendChild(settings);

    panel.appendChild(sidebar);
    panel.appendChild(content);
    panel.classList.add('workspace-layout');

    sidebar.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.querySelectorAll('a[aria-current="page"]').forEach(item => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
      });
    });

    sidebar.querySelector('[data-workspace-signout]')?.addEventListener('click', () => {
      document.getElementById('signOutButton')?.click();
    });
    const accountEmail = document.getElementById('signedInEmail')?.textContent || 'Administrator';
    const settingsEmail = document.getElementById('workspaceAccountEmail');
    if (settingsEmail) settingsEmail.textContent = accountEmail;
  }

  if (!panel.hidden) addWorkspaceNavigation();
  const observer = new MutationObserver(addWorkspaceNavigation);
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();
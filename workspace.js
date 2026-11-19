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
      '<div class="workspace-nav-label">WORKSPACE</div>',
      '<nav class="workspace-nav">',
      '<a href="#workspaceOverview" aria-current="page">Overview</a>',
      '<a href="#websites">My websites</a>',
      '<a href="#aiStudio">AI Website Studio</a>',
      '<a href="clients.html">Clients</a>',
      '<a href="#reviews">Private reviews</a>',
      '<a href="#inbox">Client inbox</a>',
      '</nav>',
      '<div class="workspace-nav-label">PUBLIC</div>',
      '<nav class="workspace-nav"><a href="showcase.html">Client showcase ↗</a></nav>',
      '<div class="workspace-sidebar-footer"><a href="showcase.html">View public website ↗</a><p>Manage every client website from one workspace.</p></div>'
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

    panel.appendChild(sidebar);
    panel.appendChild(content);
    panel.classList.add('workspace-layout');

    sidebar.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.querySelectorAll('a[aria-current="page"]').forEach(item => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
      });
    });
  }

  if (!panel.hidden) addWorkspaceNavigation();
  const observer = new MutationObserver(addWorkspaceNavigation);
  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();
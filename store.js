(() => {
  const labels = {
    restaurant: 'Restaurant', hotel: 'Hotel & stay', beauty: 'Beauty & wellness',
    retail: 'Boutique & retail', other: 'Other business'
  };
  const config = window.VISIONWEB_SUPABASE_CONFIG || {};
  const configured = Boolean(
    window.supabase &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '') &&
    config.anonKey && !String(config.anonKey).includes('YOUR_')
  );
  const client = configured ? window.supabase.createClient(config.url, config.anonKey) : null;
  let projects = [];
  let activeFilter = 'all';

  const grid = document.getElementById('projectGrid');
  const filters = document.getElementById('filters');
  const searchInput = document.getElementById('projectSearch');
  const emptyState = document.getElementById('emptyState');
  const projectCount = document.getElementById('projectCount');
  const projectDialog = document.getElementById('projectDialog');
  const storeStatus = document.getElementById('storeStatus');

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  function formatPrice(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 2
    }).format(Number(value));
  }

  function fromDatabase(row) {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: labels[row.category] || labels.other,
      type: row.project_type || 'Website project',
      location: row.location || '',
      description: row.description || '',
      price: Number(row.price),
      priceIncludes: row.price_includes || '',
      features: Array.isArray(row.features) ? row.features : [],
      image: row.image_url || '',
      imageAlt: row.image_alt || row.title,
      url: row.website_url || ''
    };
  }

  function purchaseURL(project) {
    const phone = String((window.VISIONWEB_CONTACT || {}).whatsapp || '25766532541').replace(/\D/g, '');
    const message = `Hello VisionWeb, I am interested in the ${project.title} website (${formatPrice(project.price)}). Could you share the details and next steps?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function revisionURL(project) {
    const phone = String((window.VISIONWEB_CONTACT || {}).whatsapp || '25766532541').replace(/\D/g, '');
    const message = `Hello VisionWeb, I would like to request modifications to the ${project.title} website. Here are the changes I would like to discuss: `;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function cardMarkup(project, index) {
    return `
      <article class="project-card" style="--card-index:${index}">
        <button class="project-open" type="button" data-project-id="${escapeHTML(project.id)}" aria-label="View details for ${escapeHTML(project.title)}">
          <span class="project-image-wrap">
            <img class="project-image" src="${escapeHTML(project.image)}" alt="${escapeHTML(project.imageAlt || project.title)}" loading="lazy">
            <span class="project-image-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="project-arrow" aria-hidden="true">↗</span>
          </span>
          <span class="project-meta"><span>${escapeHTML(project.categoryLabel)}</span><span class="concept-label">${escapeHTML(project.type)}</span></span>
          <span class="project-title-row"><span class="project-title">${escapeHTML(project.title)}</span><span class="project-location">${escapeHTML(project.location)}</span></span>
        </button>
        ${project.url ? `<a class="project-demo-link" href="${escapeHTML(project.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open the live demo for ${escapeHTML(project.title)}">View live demo <span aria-hidden="true">↗</span></a>` : ''}
        <p class="project-card-description">${escapeHTML(project.description)}</p>
        <div class="project-purchase">
          <div class="project-price-line"><span>PRICE · USD</span><strong>${formatPrice(project.price)}</strong></div>
          <p class="project-includes">${escapeHTML(project.priceIncludes)}</p>
          <a class="get-website-button" href="${purchaseURL(project)}" target="_blank" rel="noopener noreferrer">I want to buy this website <span>↗</span></a>
          <a class="get-website-button request-changes-button" href="${revisionURL(project)}" target="_blank" rel="noopener noreferrer">Request modifications <span>↗</span></a>
        </div>
      </article>`;
  }

  function renderCounts() {
    const total = filters.querySelector('[data-count="all"]');
    if (total) total.textContent = String(projects.length).padStart(2, '0');
    Object.keys(labels).forEach(category => {
      const node = filters.querySelector(`[data-count="${category}"]`);
      if (node) {
        const count = projects.filter(project => project.category === category).length;
        node.textContent = count ? String(count).padStart(2, '0') : '';
      }
    });
  }

  function renderProjects() {
    const query = searchInput.value.trim().toLowerCase();
    const visible = projects.filter(project => {
      const matchesCategory = activeFilter === 'all' || project.category === activeFilter;
      const haystack = [project.title, project.categoryLabel, project.location, project.description,
        project.priceIncludes, ...project.features].join(' ').toLowerCase();
      return matchesCategory && haystack.includes(query);
    });
    grid.innerHTML = visible.map(cardMarkup).join('');
    emptyState.hidden = visible.length !== 0;
    if (projects.length === 0) {
      document.getElementById('emptyTitle').textContent = configured ? 'Your collection is getting ready.' : 'The VisionWeb collection is being set up.';
      document.getElementById('emptyDescription').textContent = configured
        ? 'No published projects yet. New websites will appear here when VisionWeb publishes them.'
        : 'The public portfolio needs its Supabase project connected before your projects can appear here.';
    } else if (visible.length === 0) {
      document.getElementById('emptyTitle').textContent = 'No projects found.';
      document.getElementById('emptyDescription').textContent = 'Try a different search or choose another category.';
    }
    projectCount.textContent = `${String(visible.length).padStart(2, '0')} PROJECT${visible.length === 1 ? '' : 'S'} · ${Object.keys(labels).length} CATEGORIES`;
    renderCounts();
  }

  function openProject(id) {
    const project = projects.find(item => String(item.id) === String(id));
    if (!project) return;
    document.getElementById('dialogImage').src = project.image;
    document.getElementById('dialogImage').alt = project.imageAlt || project.title;
    document.getElementById('dialogCategory').textContent = `${project.categoryLabel} · ${project.location}`;
    document.getElementById('dialogTitle').textContent = project.title;
    document.getElementById('dialogDescription').textContent = project.description;
    document.getElementById('dialogPrice').textContent = formatPrice(project.price);
    document.getElementById('dialogPriceIncludes').textContent = project.priceIncludes;
    document.getElementById('dialogGetWebsite').href = purchaseURL(project);
    document.getElementById('dialogRequestChanges').href = revisionURL(project);
    document.getElementById('dialogTags').innerHTML = project.features.map(feature => `<span>${escapeHTML(feature)}</span>`).join('');
    const liveLink = document.getElementById('dialogLiveLink');
    const note = document.getElementById('dialogNote');
    if (project.url) {
      liveLink.href = project.url;
      liveLink.hidden = false;
      note.textContent = 'Open the live website in a new tab to explore the project.';
    } else {
      liveLink.hidden = true;
      note.textContent = 'A live preview link is not available for this project yet. Contact VisionWeb for more information.';
    }
    projectDialog.showModal();
  }

  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    renderProjects();
  });
  searchInput.addEventListener('input', renderProjects);
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-project-id]');
    if (button) openProject(button.dataset.projectId);
  });
  document.getElementById('dialogClose').addEventListener('click', () => projectDialog.close());
  projectDialog.addEventListener('click', event => {
    if (event.target === projectDialog) projectDialog.close();
  });

  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
    nav.classList.toggle('is-open', !isOpen);
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('is-open');
  }));

  async function loadProjects() {
    if (!configured) {
      storeStatus.hidden = false;
      storeStatus.textContent = 'Setup needed: connect your own Supabase project to make the admin dashboard and public collection work together.';
      projects = [];
      renderProjects();
      return;
    }
    storeStatus.hidden = true;
    const { data, error } = await client
      .from('visionweb_projects')
      .select('id,title,category,project_type,location,description,price,price_includes,features,image_url,image_alt,website_url,is_published,created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) {
      storeStatus.hidden = false;
      storeStatus.textContent = 'The project library could not load. Please check the Supabase setup and database policies.';
      console.error('VisionWeb project loading error:', error);
      projects = [];
    } else {
      projects = (data || []).map(fromDatabase);
    }
    renderProjects();
  }

  loadProjects();
})();

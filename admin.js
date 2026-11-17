(() => {
  const config = window.VISIONWEB_SUPABASE_CONFIG || {};
  const configured = Boolean(
    window.supabase &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '') &&
    config.anonKey && !String(config.anonKey).includes('YOUR_')
  );
  const client = configured ? window.supabase.createClient(config.url, config.anonKey) : null;
  const loginPanel = document.getElementById('loginPanel');
  const dashboardPanel = document.getElementById('dashboardPanel');
  const loginForm = document.getElementById('loginForm');
  const loginFeedback = document.getElementById('loginFeedback');
  const editorDialog = document.getElementById('editorDialog');
  const editorForm = document.getElementById('projectEditorForm');
  const editorFeedback = document.getElementById('editorFeedback');
  const projectList = document.getElementById('adminProjectList');
  let currentUser = null;
  let projects = [];
  let editingId = null;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  function setFeedback(node, message, isError = false) {
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  }

  function showLogin(message = '') {
    loginPanel.hidden = false;
    dashboardPanel.hidden = true;
    if (message) setFeedback(loginFeedback, message, true);
  }

  function showDashboard(user) {
    currentUser = user;
    document.getElementById('signedInEmail').textContent = user.email || 'Administrator';
    loginPanel.hidden = true;
    dashboardPanel.hidden = false;
  }

  async function isAdmin(user) {
    const { data, error } = await client
      .from('visionweb_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async function verifyUser(user) {
    try {
      if (!await isAdmin(user)) {
        await client.auth.signOut();
        showLogin('This account does not have administrator access. Add it to the VisionWeb administrator list, then sign in again.');
        return false;
      }
      showDashboard(user);
      await loadAdminProjects();
      await loadStudioOverview();
      return true;
    } catch (error) {
      console.error(error);
      showLogin('We could not confirm administrator access. Check the database setup and try again.');
      return false;
    }
  }

  async function loadAdminProjects() {
    projectList.innerHTML = '<p class="admin-loading">Loading your projects…</p>';
    document.getElementById('listStatus').textContent = '';
    const { data, error } = await client
      .from('visionweb_projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      projectList.innerHTML = '';
      document.getElementById('listStatus').textContent = 'Your projects could not be loaded. Check the database connection and access settings.';
      console.error(error);
      return;
    }
    projects = data || [];
    document.getElementById('totalCount').textContent = projects.length;
    document.getElementById('publishedCount').textContent = projects.filter(item => item.is_published).length;
    document.getElementById('draftCount').textContent = projects.filter(item => !item.is_published).length;
    renderAdminProjects();
  }


  async function loadStudioOverview() {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [sitesResult, inquiriesResult, notificationsResult, visitsResult, feedbackResult] = await Promise.all([
      client.from('visionweb_ai_sites').select('id,view_count,status,client_id'),
      client.from('visionweb_inquiries').select('id,site_id,inquiry_type,customer_name,customer_email,customer_phone,requested_date,details,status,created_at').order('created_at',{ascending:false}).limit(30),
      client.from('visionweb_notifications').select('id,event_type,title,message,read_at,created_at').order('created_at',{ascending:false}).limit(12),
      client.from('visionweb_site_visits').select('site_id,page_path,referrer_host,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(5000),
      client.from('visionweb_site_feedback').select('id,site_id,reviewer_name,message,approved,created_at').order('created_at',{ascending:false}).limit(30)
    ]);

    const sites = sitesResult.data || [];
    const inquiries = inquiriesResult.data || [];
    document.getElementById('metricClientSites').textContent = sites.filter(site=>site.client_id).length;
    document.getElementById('metricSiteViews').textContent = sites.reduce((total,site)=>total+Number(site.view_count||0),0).toLocaleString();
    document.getElementById('metricInquiries').textContent = inquiries.length;

    const trafficNode=document.getElementById('adminTrafficTrend');
    if(visitsResult.error) {
      $('metricSiteViews7d').textContent='—';
      $('metricTopReferrer').textContent='—';
      trafficNode.innerHTML='<p class="admin-loading">Traffic analytics need the client management migration.</p>';
    } else {
      const visits=visitsResult.data || [];
      $('metricSiteViews7d').textContent=visits.length.toLocaleString();
      const referrers=new Map();
      for(const visit of visits) {
        const source=visit.referrer_host || 'Direct / unknown';
        referrers.set(source,(referrers.get(source)||0)+1);
      }
      const topReferrer=[...referrers.entries()].sort((a,b)=>b[1]-a[1])[0];
      $('metricTopReferrer').textContent=topReferrer ? topReferrer[0] : '—';
      const days=[];
      for(let offset=6;offset>=0;offset--) {
        const date=new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate()-offset);
        const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
        days.push({key,label:date.toLocaleDateString(undefined,{weekday:'short'}),count:0});
      }
      const dayMap=new Map(days.map(day=>[day.key,day]));
      visits.forEach(visit=>{
        const date=new Date(visit.created_at);
        const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
        if(dayMap.has(key)) dayMap.get(key).count++;
      });
      const max=Math.max(1,...days.map(day=>day.count));
      trafficNode.innerHTML=days.map(day=>`
        <div class="traffic-day"><span>${escapeHTML(day.label)}</span><div class="traffic-track"><i style="width:${Math.round(day.count/max*100)}%"></i></div><strong>${day.count}</strong></div>`).join('');
    }

    const notificationNode=document.getElementById('adminNotificationsList');
    if(notificationsResult.error) {
      notificationNode.innerHTML='<p class="admin-loading">Run the client management migration to enable activity notifications.</p>';
    } else if(!notificationsResult.data?.length) {
      notificationNode.innerHTML='<p class="admin-loading">No new activity yet. Client feedback and website enquiries will appear here.</p>';
    } else {
      notificationNode.innerHTML=notificationsResult.data.map(n=>`
        <article class="admin-notification-row ${n.read_at?'is-read':''}">
          <div><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>
          ${n.read_at?'':'<button type="button" data-mark-notification="'+escapeHTML(n.id)+'">Mark read</button>'}
        </article>`).join('');
    }

    const feedbackNode=document.getElementById('adminFeedbackList');
    if(feedbackResult.error) {
      feedbackNode.innerHTML='<p class="admin-loading">Review history is unavailable. Run the client-management SQL migration to enable it.</p>';
    } else if(!feedbackResult.data?.length) {
      feedbackNode.innerHTML='<p class="admin-loading">No client feedback has been submitted yet.</p>';
    } else {
      const feedbackSiteIds=[...new Set(feedbackResult.data.map(item=>item.site_id))];
      const {data:feedbackSites}=await client.from('visionweb_ai_sites').select('id,business_name').in('id',feedbackSiteIds);
      const feedbackNames=new Map((feedbackSites||[]).map(site=>[site.id,site.business_name]));
      feedbackNode.innerHTML=feedbackResult.data.map(item=>`
        <article class="admin-feedback-row">
          <div><span>${item.approved?'CLIENT APPROVED':'CHANGES REQUESTED'}</span><h3>${escapeHTML(feedbackNames.get(item.site_id)||'Website project')}</h3><p><strong>${escapeHTML(item.reviewer_name)}</strong></p><p>${escapeHTML(item.message)}</p><small>${new Date(item.created_at).toLocaleString()}</small></div>
        </article>`).join('');
    }

    const inquiryNode=document.getElementById('adminInquiriesList');
    if(inquiriesResult.error) {
      inquiryNode.innerHTML='<p class="admin-loading">Run the client management migration to enable the enquiries inbox.</p>';
    } else if(!inquiries.length) {
      inquiryNode.innerHTML='<p class="admin-loading">There are no customer enquiries yet.</p>';
    } else {
      const siteIds=[...new Set(inquiries.map(i=>i.site_id))];
      const {data:siteRows}=await client.from('visionweb_ai_sites').select('id,business_name').in('id',siteIds);
      const siteNames=new Map((siteRows||[]).map(s=>[s.id,s.business_name]));
      inquiryNode.innerHTML=inquiries.map(i=>`
        <article class="admin-inquiry-row">
          <div class="admin-inquiry-main">
            <span>${escapeHTML(i.inquiry_type.toUpperCase())} · ${escapeHTML(i.status.toUpperCase())}</span>
            <h3>${escapeHTML(i.customer_name)}</h3>
            <p>${escapeHTML(siteNames.get(i.site_id)||'Client website')} · ${escapeHTML(i.customer_email)} · ${escapeHTML(i.customer_phone)}</p>
            <p>${escapeHTML(JSON.stringify(i.details||{}))}</p>
            <small>${new Date(i.created_at).toLocaleString()}${i.requested_date?' · Requested date: '+escapeHTML(i.requested_date):''}</small>
          </div>
          <label>Update status
            <select data-inquiry-status="${escapeHTML(i.id)}">
              ${['new','reviewing','confirmed','declined','completed'].map(s=>'<option value="'+s+'" '+(i.status===s?'selected':'')+'>'+s.replaceAll('_',' ')+'</option>').join('')}
            </select>
          </label>
        </article>`).join('');
    }
  }

  function renderAdminProjects() {
    if (!projects.length) {
      projectList.innerHTML = '<div class="admin-empty"><strong>No portfolio projects yet.</strong><p>Add a completed website project here. You can keep it as a draft or publish it when it is ready.</p></div>';
      return;
    }
    projectList.innerHTML = projects.map(project => `
      <article class="admin-project-row">
        <img src="${escapeHTML(project.image_url || '')}" alt="" loading="lazy">
        <div class="admin-project-info"><span>${escapeHTML(project.category)} · ${project.is_published ? 'PUBLISHED' : 'DRAFT'}</span><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.location || project.description)}</p></div>
        <strong class="admin-project-price">$${Number(project.price).toFixed(2)}</strong>
        <div class="admin-row-actions"><button type="button" data-edit="${escapeHTML(project.id)}">Edit</button><button type="button" data-delete="${escapeHTML(project.id)}">Delete</button></div>
      </article>`).join('');
  }

  function validHttpUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function resetEditor() {
    editorForm.reset();
    document.getElementById('editorId').value = '';
    document.getElementById('editorPublished').checked = true;
    document.getElementById('editorTitle').innerHTML = 'Add a <em>project.</em>';
    document.getElementById('currentImageNote').textContent = 'Choose a JPG, PNG, WebP or AVIF image (maximum 5 MB), or paste an image URL below.';
    editingId = null;
    setFeedback(editorFeedback, '');
  }

  function openEditor(project = null) {
    resetEditor();
    if (project) {
      editingId = project.id;
      document.getElementById('editorId').value = project.id;
      document.getElementById('editorName').value = project.title || '';
      document.getElementById('editorCategory').value = project.category || 'other';
      document.getElementById('editorLocation').value = project.location || '';
      document.getElementById('editorDescription').value = project.description || '';
      document.getElementById('editorImageUrl').value = project.image_url || '';
      document.getElementById('editorPrice').value = project.price || '';
      document.getElementById('editorWebsiteUrl').value = project.website_url || '';
      document.getElementById('editorIncludes').value = project.price_includes || '';
      document.getElementById('editorFeatures').value = Array.isArray(project.features) ? project.features.join(', ') : '';
      document.getElementById('editorPublished').checked = Boolean(project.is_published);
      document.getElementById('editorTitle').innerHTML = 'Edit your <em>project.</em>';
      document.getElementById('currentImageNote').textContent = project.image_url ? 'Current image is saved. Choose a new file or paste a different image URL to replace it.' : 'No image saved yet. Choose a JPG, PNG, WebP or AVIF image (maximum 5 MB), or paste an image URL.';
    }
    editorDialog.showModal();
  }

  async function uploadImage(file) {
    if (!file) return '';
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!allowed.includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or AVIF image.');
    if (file.size > 5 * 1024 * 1024) throw new Error('The image must be 5 MB or smaller.');
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project-image';
    const path = `${currentUser.id}/${Date.now()}-${safeName}`;
    const { error } = await client.storage.from('visionweb-project-images').upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type
    });
    if (error) throw error;
    const { data } = client.storage.from('visionweb-project-images').getPublicUrl(path);
    return data.publicUrl;
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!configured) {
      setFeedback(loginFeedback, 'Add your Supabase project URL and public key to supabase-config.js before signing in.', true);
      return;
    }
    const button = document.getElementById('loginButton');
    button.disabled = true;
    button.textContent = 'Signing in…';
    setFeedback(loginFeedback, '');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    button.disabled = false;
    button.innerHTML = 'Sign in <span>↗</span>';
    if (error) {
      setFeedback(loginFeedback, 'We could not sign you in. Check your email and password, then try again.', true);
      console.error(error);
      return;
    }
    await verifyUser(data.user);
  });

  document.getElementById('addProjectButton').addEventListener('click', () => openEditor());
  document.getElementById('signOutButton').addEventListener('click', async () => {
    await client.auth.signOut();
    currentUser = null;
    showLogin('You have signed out of the VisionWeb workspace.');
  });
  document.getElementById('editorClose').addEventListener('click', () => editorDialog.close());
  document.getElementById('editorCancel').addEventListener('click', () => editorDialog.close());
  editorDialog.addEventListener('click', event => {
    if (event.target === editorDialog) editorDialog.close();
  });


  document.getElementById('adminNotificationsList').addEventListener('click', async event => {
    const button=event.target.closest('[data-mark-notification]');
    if(!button) return;
    button.disabled=true;
    const {error}=await client.from('visionweb_notifications').update({read_at:new Date().toISOString()}).eq('id',button.dataset.markNotification);
    if(error) { button.disabled=false; return; }
    await loadStudioOverview();
  });

  document.getElementById('adminInquiriesList').addEventListener('change', async event => {
    const select=event.target.closest('[data-inquiry-status]');
    if(!select) return;
    select.disabled=true;
    const {error}=await client.from('visionweb_inquiries').update({status:select.value,updated_at:new Date().toISOString()}).eq('id',select.dataset.inquiryStatus);
    if(error) {
      select.disabled=false;
      document.getElementById('listStatus').textContent='The enquiry status could not be updated.';
      console.error(error);
      return;
    }
    await loadStudioOverview();
  });

  projectList.addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      const project = projects.find(item => item.id === editButton.dataset.edit);
      if (project) openEditor(project);
      return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      const project = projects.find(item => item.id === deleteButton.dataset.delete);
      if (!project || !confirm(`Delete “${project.title}” from your VisionWeb library?`)) return;
      const { error } = await client.from('visionweb_projects').delete().eq('id', project.id);
      if (error) {
        document.getElementById('listStatus').textContent = 'Project could not be deleted. Please try again.';
        console.error(error);
      } else {
        await loadAdminProjects();
      }
    }
  });

  editorForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentUser) {
      setFeedback(editorFeedback, 'Your session has expired. Sign in again to save this project.', true);
      return;
    }
    const title = document.getElementById('editorName').value.trim();
    const category = document.getElementById('editorCategory').value;
    const location = document.getElementById('editorLocation').value.trim();
    const description = document.getElementById('editorDescription').value.trim();
    const rawImageUrl = document.getElementById('editorImageUrl').value.trim();
    const rawWebsiteUrl = document.getElementById('editorWebsiteUrl').value.trim();
    const price = Number(document.getElementById('editorPrice').value);
    const priceIncludes = document.getElementById('editorIncludes').value.trim();
    const websiteUrl = validHttpUrl(rawWebsiteUrl);
    const imageUrl = validHttpUrl(rawImageUrl);
    if (rawWebsiteUrl && !websiteUrl) return setFeedback(editorFeedback, 'Enter a valid live website URL beginning with https://.', true);
    if (rawImageUrl && !imageUrl) return setFeedback(editorFeedback, 'Enter a valid image URL beginning with https://.', true);
    if (!title || !description || !priceIncludes || !Number.isFinite(price) || price <= 0) {
      return setFeedback(editorFeedback, 'Complete all required fields and enter a valid price in USD.', true);
    }

    const saveButton = document.getElementById('saveProjectButton');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    setFeedback(editorFeedback, 'Saving your project…');
    try {
      const existing = editingId ? projects.find(item => item.id === editingId) : null;
      const chosenFile = document.getElementById('editorImageFile').files[0];
      let finalImage = imageUrl || (existing && existing.image_url) || '';
      if (chosenFile) finalImage = await uploadImage(chosenFile);
      if (!finalImage) throw new Error('Add a project preview image or image URL.');

      const features = document.getElementById('editorFeatures').value.split(',').map(value => value.trim()).filter(Boolean);
      const payload = {
        title,
        category,
        project_type: websiteUrl ? 'Live website' : 'Website project',
        location,
        description,
        price,
        price_includes: priceIncludes,
        features,
        image_url: finalImage,
        image_alt: `${title} website preview`,
        website_url: websiteUrl || null,
        is_published: document.getElementById('editorPublished').checked,
        updated_at: new Date().toISOString()
      };

      let result;
      if (editingId) {
        result = await client.from('visionweb_projects').update(payload).eq('id', editingId);
      } else {
        result = await client.from('visionweb_projects').insert(payload);
      }
      if (result.error) throw result.error;
      editorDialog.close();
      await loadAdminProjects();
    } catch (error) {
      console.error(error);
      setFeedback(editorFeedback, error.message || 'The project could not be saved. Check your connection and try again.', true);
    } finally {
      saveButton.disabled = false;
      saveButton.innerHTML = 'Save project <span>↗</span>';
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editorDialog.open) editorDialog.close();
  });

  if (!configured) {
    document.getElementById('configWarning').hidden = false;
    document.getElementById('loginButton').disabled = true;
    setFeedback(loginFeedback, 'Complete Supabase setup before signing in.', true);
    return;
  }

  client.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      showLogin('Could not restore the previous session. Please sign in again.');
      return;
    }
    if (data.session && data.session.user) await verifyUser(data.session.user);
  });
})();

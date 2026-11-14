(() => {
  const config = window.VISIONWEB_SUPABASE_CONFIG || {};
  const configured = Boolean(
    window.supabase &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '') &&
    config.anonKey && !String(config.anonKey).includes('YOUR_')
  );
  const client = configured ? window.supabase.createClient(config.url, config.anonKey) : null;

  const el = id => document.getElementById(id);
  const chatLog = el('aiChatLog');
  const previewFrame = el('aiPreviewFrame');
  const sitePicker = el('aiSavedSites');
  const form = el('aiComposerForm');
  const promptInput = el('aiPrompt');
  const filesInput = el('aiImageFiles');

  let currentUser = null;
  let currentSiteId = null;
  let currentHtml = '';
  let currentSummary = '';
  let messages = [];
  let assets = [];
  let signedAssets = [];
  let busy = false;

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);

  function setStatus(message, isError = false) {
    const node = el('aiStudioStatus');
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  }

  function setBusy(value) {
    busy = value;
    el('aiGenerateButton').disabled = value;
    el('aiGenerateButton').textContent = value ? 'VisionWeb AI is working…' : 'Create / refine with AI ↗';
    filesInput.disabled = value;
    promptInput.disabled = value;
  }

  function renderMessages() {
    if (!messages.length) {
      chatLog.innerHTML = '<div class="ai-chat-empty"><span>VW / AI</span><strong>Your ideas start here.</strong><p>Describe the website in your own words. You do not need technical language. VisionWeb AI will plan the design and build the first version.</p></div>';
      return;
    }
    chatLog.innerHTML = messages.map(message => {
      const isUser = message.role === 'user';
      return `<article class="ai-message ${isUser ? 'is-user' : 'is-assistant'}"><span>${isUser ? 'YOUR INSTRUCTION' : 'VISIONWEB AI'}</span><p>${escapeHTML(message.content)}</p></article>`;
    }).join('');
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function clearPreview() {
    currentHtml = '';
    currentSummary = '';
    previewFrame.srcdoc = '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f2f1e9;color:#333;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center"><div><div style="font-size:12px;letter-spacing:.2em">VISIONWEB AI</div><h1 style="font-size:32px">Your website preview<br>will appear here.</h1><p>Describe your idea and ask VisionWeb AI to build it.</p></div></body></html>';
    el('aiSaveDraftButton').disabled = true;
    el('aiPrivateReviewButton').disabled = true;
    el('aiPublishClientButton').disabled = true;
    el('aiPublishPortfolioButton').disabled = true;
  }

  function signedHtml() {
    let html = currentHtml;
    for (const asset of signedAssets) html = html.split(asset.token).join(asset.url);
    return html;
  }

  function renderPreview() {
    if (!currentHtml) return clearPreview();
    previewFrame.srcdoc = signedHtml();
    el('aiSaveDraftButton').disabled = false;
  }

  async function checkAdmin(user) {
    if (!user || !client) return false;
    const { data, error } = await client
      .from('visionweb_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async function refreshSitePicker(selectedId = '') {
    const { data, error } = await client
      .from('visionweb_ai_sites')
      .select('id,business_name,business_type,status,updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      setStatus('The AI Studio database is not ready yet. Run the VisionWeb AI migration in Supabase.', true);
      return false;
    }
    const sites = data || [];
    sitePicker.innerHTML = '<option value="">＋ Start a new website</option>' + sites.map(site =>
      `<option value="${escapeHTML(site.id)}">${escapeHTML(site.business_name)} · ${escapeHTML(site.status)}</option>`
    ).join('');
    if (selectedId) sitePicker.value = selectedId;
    return true;
  }

  async function signAssets() {
    signedAssets = [];
    for (let index = 0; index < assets.length && index < 4; index++) {
      const asset = assets[index];
      const { data, error } = await client.storage
        .from('visionweb-ai-assets')
        .createSignedUrl(asset.object_path, 3600);
      if (error) throw error;
      signedAssets.push({
        url: data.signedUrl,
        token: `{{VISIONWEB_IMAGE_${index + 1}}}`,
        name: asset.file_name
      });
    }
  }

  async function loadSite(siteId) {
    const { data: site, error } = await client
      .from('visionweb_ai_sites')
      .select('*')
      .eq('id', siteId)
      .single();
    if (error) throw error;

    currentSiteId = site.id;
    currentHtml = site.generated_html || '';
    currentSummary = site.ai_summary || '';
    el('aiBusinessName').value = site.business_name || '';
    el('aiBusinessType').value = site.business_type || 'other';
    el('aiDesignDirection').value = site.design_direction || '';

    const [messageResult, assetResult] = await Promise.all([
      client.from('visionweb_ai_site_messages').select('role,content,created_at').eq('site_id', siteId).order('created_at', { ascending: true }),
      client.from('visionweb_ai_site_assets').select('id,object_path,file_name,mime_type').eq('site_id', siteId).order('created_at', { ascending: true })
    ]);
    if (messageResult.error) throw messageResult.error;
    if (assetResult.error) throw assetResult.error;
    messages = messageResult.data || [];
    assets = assetResult.data || [];
    await signAssets();
    renderMessages();
    renderPreview();
    el('aiAttachedNote').textContent = assets.length
      ? `${assets.length} private reference photo(s) saved with this project.`
      : 'Your original photos stay in private VisionWeb storage.';
    setStatus(currentHtml ? 'Draft loaded. Continue the conversation to refine it.' : 'Draft loaded. Add your instructions to begin.');
  }

  async function createOrUpdateSite() {
    const businessName = el('aiBusinessName').value.trim();
    const businessType = el('aiBusinessType').value;
    const designDirection = el('aiDesignDirection').value.trim();
    if (!businessName) throw new Error('Enter a name for this website first.');

    const payload = {
      admin_user_id: currentUser.id,
      business_name: businessName,
      business_type: businessType,
      design_direction: designDirection,
      updated_at: new Date().toISOString()
    };

    if (currentSiteId) {
      const { error } = await client.from('visionweb_ai_sites').update(payload).eq('id', currentSiteId);
      if (error) throw error;
    } else {
      const { data, error } = await client.from('visionweb_ai_sites').insert({
        ...payload,
        initial_brief: promptInput.value.trim(),
        status: 'draft'
      }).select('id').single();
      if (error) throw error;
      currentSiteId = data.id;
      await refreshSitePicker(currentSiteId);
    }
    return currentSiteId;
  }

  async function uploadNewImages(siteId) {
    const selected = Array.from(filesInput.files || []);
    if (!selected.length) return;
    if (assets.length + selected.length > 4) throw new Error('Keep up to four reference photos in each project.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

    for (const file of selected) {
      if (!allowed.includes(file.type)) throw new Error('Use JPG, PNG, WebP or AVIF photos.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Each photo must be 5 MB or smaller.');

      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'reference-image';
      const path = `${currentUser.id}/${siteId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await client.storage.from('visionweb-ai-assets').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
      if (uploadError) throw uploadError;

      const { data, error } = await client.from('visionweb_ai_site_assets').insert({
        site_id: siteId,
        admin_user_id: currentUser.id,
        object_path: path,
        file_name: file.name,
        mime_type: file.type
      }).select('id,object_path,file_name,mime_type').single();

      if (error) {
        await client.storage.from('visionweb-ai-assets').remove([path]);
        throw error;
      }
      assets.push(data);
    }

    filesInput.value = '';
    await signAssets();
    el('aiAttachedNote').textContent = `${assets.length} private reference photo(s) saved with this project.`;
  }

  async function saveMessage(role, content) {
    const { error } = await client.from('visionweb_ai_site_messages').insert({
      site_id: currentSiteId,
      admin_user_id: currentUser.id,
      role,
      content
    });
    if (error) throw error;
  }

  async function generateWebsite(event) {
    event.preventDefault();
    if (busy) return;
    if (!currentUser) {
      setStatus('Sign in to your VisionWeb administrator account first.', true);
      return;
    }

    const prompt = promptInput.value.trim();
    if (!prompt) {
      setStatus('Describe what you want the website to look like or what you want to change.', true);
      promptInput.focus();
      return;
    }

    setBusy(true);
    setStatus('Preparing your website project…');
    try {
      const siteId = await createOrUpdateSite();
      await uploadNewImages(siteId);
      const historyForAI = messages.slice(-10).map(item => ({ role: item.role, content: item.content }));
      const userMessage = prompt + (signedAssets.length ? `\nReference photos available: ${signedAssets.map(item => item.name).join(', ')}.` : '');

      messages.push({ role: 'user', content: userMessage });
      renderMessages();
      await saveMessage('user', userMessage);
      promptInput.value = '';
      setStatus('VisionWeb AI is understanding your idea and building the website…');

      const { data, error } = await client.functions.invoke('visionweb-ai', {
        body: {
          siteId,
          businessName: el('aiBusinessName').value.trim(),
          businessType: el('aiBusinessType').value,
          prompt,
          currentHtml,
          history: historyForAI,
          images: signedAssets
        }
      });

      if (error) {
        let details = '';
        try {
          const body = await error.context.json();
          details = body.error || '';
        } catch {
          details = error.message || '';
        }
        throw new Error(details || 'VisionWeb AI could not connect. Check that the Edge Function is deployed.');
      }
      if (!data || !data.html_document) throw new Error(data?.error || 'The AI did not return a website. Please try again.');

      currentHtml = data.html_document;
      currentSummary = data.design_summary || '';
      const assistantMessage = data.assistant_message || 'I have updated your website preview.';
      messages.push({ role: 'assistant', content: assistantMessage });
      await saveMessage('assistant', assistantMessage);

      const { error: updateError } = await client.from('visionweb_ai_sites').update({
        generated_html: currentHtml,
        ai_summary: currentSummary,
        initial_brief: prompt,
        status: 'draft',
        updated_at: new Date().toISOString()
      }).eq('id', currentSiteId);
      if (updateError) throw updateError;

      renderMessages();
      renderPreview();
      setStatus('Your website draft is ready. Review it on the right and ask for any changes.');
      await refreshSitePicker(currentSiteId);
    } catch (error) {
      console.error('VisionWeb AI Studio:', error);
      setStatus(error.message || 'Something went wrong. Please try again.', true);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!currentSiteId || !currentHtml) return;
    const { error } = await client.from('visionweb_ai_sites').update({
      generated_html: currentHtml,
      ai_summary: currentSummary,
      updated_at: new Date().toISOString()
    }).eq('id', currentSiteId);
    if (error) {
      setStatus('Your draft could not be saved. Please try again.', true);
      return;
    }
    setStatus('Your AI website draft is saved privately in VisionWeb.');
    await refreshSitePicker(currentSiteId);
  }

  function startNewProject() {
    currentSiteId = null;
    currentHtml = '';
    currentSummary = '';
    messages = [];
    assets = [];
    signedAssets = [];
    sitePicker.value = '';
    el('aiBusinessName').value = '';
    el('aiBusinessType').value = 'other';
    el('aiDesignDirection').value = '';
    promptInput.value = '';
    filesInput.value = '';
    el('aiAttachedNote').textContent = 'Your original photos stay in private VisionWeb storage.';
    renderMessages();
    clearPreview();
    setStatus('New project ready. Give it a name and describe your idea.');
  }

  el('aiNewProjectButton').addEventListener('click', startNewProject);
  el('aiComposerForm').addEventListener('submit', generateWebsite);
  el('aiSaveDraftButton').addEventListener('click', saveDraft);
  el('aiOpenPreviewButton').addEventListener('click', () => {
    if (!currentHtml) return;
    renderPreview();
    setStatus('Preview refreshed. Generated code stays inside the protected preview frame.');
  });

  sitePicker.addEventListener('change', async () => {
    if (!sitePicker.value) {
      startNewProject();
      return;
    }
    try {
      setStatus('Loading your saved website draft…');
      await loadSite(sitePicker.value);
    } catch (error) {
      setStatus(error.message || 'The website draft could not be opened.', true);
    }
  });

  el('aiPrivateReviewButton').addEventListener('click', () => {
    setStatus('Private Review link sharing is the next publishing module. The current draft remains private.');
  });
  el('aiPublishClientButton').addEventListener('click', () => {
    setStatus('Client publishing will be enabled after the private review and deployment modules are connected.');
  });
  el('aiPublishPortfolioButton').addEventListener('click', () => {
    setStatus('VisionWeb portfolio publishing will be enabled as a separate approval step.');
  });

  async function activateForUser(user) {
    if (!user || !client || (currentUser && currentUser.id === user.id)) return;
    try {
      const allowed = await checkAdmin(user);
      if (!allowed) return;
      currentUser = user;
      const databaseReady = await refreshSitePicker();
      startNewProject();
      if (databaseReady) setStatus('AI Studio is ready. Add your website idea to begin.');
    } catch (error) {
      console.error(error);
      setStatus('AI Studio could not verify your administrator access. Check the Supabase migration.', true);
    }
  }

  if (!configured) {
    setStatus('Connect VisionWeb to Supabase before using AI Studio.', true);
  } else {
    client.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        activateForUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentSiteId = null;
        startNewProject();
        setStatus('Sign in to your administrator account to use AI Studio.');
      }
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session?.user) activateForUser(data.session.user);
    });
  }
})();

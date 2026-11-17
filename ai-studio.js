(() => {
  const cfg = window.VISIONWEB_SUPABASE_CONFIG || {};
  const ready = Boolean(window.supabase && cfg.url && cfg.anonKey);
  const db = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  const $ = id => document.getElementById(id);
  const api = 'http://127.0.0.1:11434';
  const schema = {
    type: 'object',
    properties: {
      assistant_message: { type: 'string' },
      design_summary: { type: 'string' },
      html_document: { type: 'string' }
    },
    required: ['assistant_message', 'design_summary', 'html_document']
  };
  let admin = null, siteId = null, html = '', summary = '', messages = [], assets = [], photos = [], busy = false;

  function status(message, error = false) {
    $('aiStudioStatus').textContent = message;
    $('aiStudioStatus').classList.toggle('is-error', error);
  }
  function escape(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function renderMessages() {
    $('aiChatLog').innerHTML = messages.length ? messages.map(m =>
      '<article class="ai-message ' + (m.role === 'user' ? 'is-user' : 'is-assistant') +
      '"><span>' + (m.role === 'user' ? 'YOUR BRIEF' : 'STUDIO RESPONSE') +
      '</span><p>' + escape(m.content) + '</p></article>').join('') :
      '<div class="ai-chat-empty"><span>VISIONWEB / STUDIO</span><strong>Your project starts here.</strong><p>Share the brief and we will prepare a first website draft for your review.</p></div>';
  }
  function setBusy(value) {
    busy = value;
    ['aiGenerateButton','aiCheckLocalButton','aiPrompt','aiImageFiles','aiModel'].forEach(id => { $(id).disabled = value; });
    $('aiGenerateButton').textContent = value ? 'Preparing your website…' : 'Generate website ↗';
  }
  function clearPhotos() {
    photos.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
    photos = [];
  }
  function renderPreview() {
    if (!html) {
      $('aiPreviewFrame').srcdoc = '<!doctype html><html><body style="font-family:Arial;background:#f2f1e9;display:grid;place-items:center;min-height:100vh;text-align:center"><div><h1>Website preview</h1><p>Your first draft will appear here.</p></div></body></html>';
      $('aiSaveDraftButton').disabled = true;
      return;
    }
    let preview = html;
    photos.forEach(p => { preview = preview.split(p.token).join(p.url); });
    $('aiPreviewFrame').srcdoc = preview;
    $('aiSaveDraftButton').disabled = false;
  }
  function selectedModel() {
    const name = $('aiModel').value.trim();
    if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(name)) throw new Error('Enter a valid model name, for example qwen3-vl:2b.');
    localStorage.setItem('visionweb-local-ai-model', name);
    return name;
  }
  async function checkLocal(show = true) {
    const name = selectedModel();
    let response;
    try { response = await fetch(api + '/api/tags'); }
    catch { throw new Error('Ollama is not running. Open Ollama on this computer, then test the connection again.'); }
    if (!response.ok) throw new Error('Ollama could not be reached (error ' + response.status + ').');
    const data = await response.json();
    const found = (data.models || []).find(m => m.name === name || m.model === name);
    if (!found) throw new Error('The selected model is not installed. In PowerShell, run: ollama pull ' + name);
    if (show) status('Connection successful. ' + found.name + ' is ready.');
    return found.name;
  }
  function blobBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Could not read one of the photos.'));
      reader.readAsDataURL(blob);
    });
  }
  async function loadPhotos() {
    clearPhotos();
    for (let i = 0; i < assets.length && i < 4; i++) {
      const a = assets[i];
      const result = await db.storage.from('visionweb-ai-assets').download(a.object_path);
      if (result.error) throw result.error;
      photos.push({
        token: '{{VISIONWEB_IMAGE_' + (i + 1) + '}}',
        name: a.file_name,
        url: URL.createObjectURL(result.data),
        base64: await blobBase64(result.data)
      });
    }
  }
  async function refreshPicker(selected = '') {
    const result = await db.from('visionweb_ai_sites').select('id,business_name,status').order('updated_at', {ascending:false});
    if (result.error) { status('Complete the Website Studio database setup in Supabase first.', true); return false; }
    $('aiSavedSites').innerHTML = '<option value="">＋ Start a new website</option>' +
      (result.data || []).map(s => '<option value="' + escape(s.id) + '">' + escape(s.business_name) + ' · ' + escape(s.status) + '</option>').join('');
    if (selected) $('aiSavedSites').value = selected;
    return true;
  }
  async function saveMessage(role, content) {
    const result = await db.from('visionweb_ai_site_messages').insert({site_id:siteId,admin_user_id:admin.id,role,content});
    if (result.error) throw result.error;
  }
  async function createSite() {
    const name = $('aiBusinessName').value.trim();
    if (!name) throw new Error('Enter the business name before continuing.');
    const row = {
      admin_user_id:admin.id,
      business_name:name,
      business_type:$('aiBusinessType').value,
      design_direction:$('aiDesignDirection').value.trim(),
      updated_at:new Date().toISOString()
    };
    if (siteId) {
      const result = await db.from('visionweb_ai_sites').update(row).eq('id',siteId);
      if (result.error) throw result.error;
    } else {
      const result = await db.from('visionweb_ai_sites').insert({...row,initial_brief:$('aiPrompt').value.trim(),status:'draft'}).select('id').single();
      if (result.error) throw result.error;
      siteId = result.data.id;
      await refreshPicker(siteId);
    }
    return siteId;
  }
  async function uploadPhotos(id) {
    const files = Array.from($('aiImageFiles').files || []);
    if (!files.length) return;
    if (assets.length + files.length > 4) throw new Error('You can attach up to four reference photos to each project.');
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('Choose photos in JPG, PNG, WebP or AVIF format.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Each photo must be no larger than 5 MB.');
      const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-') || 'reference-image';
      const path = admin.id + '/' + id + '/' + crypto.randomUUID() + '-' + safe;
      const upload = await db.storage.from('visionweb-ai-assets').upload(path,file,{upsert:false,contentType:file.type});
      if (upload.error) throw upload.error;
      const saved = await db.from('visionweb_ai_site_assets').insert({
        site_id:id,admin_user_id:admin.id,object_path:path,file_name:file.name,mime_type:file.type
      }).select('id,object_path,file_name,mime_type').single();
      if (saved.error) { await db.storage.from('visionweb-ai-assets').remove([path]); throw saved.error; }
      assets.push(saved.data);
    }
    $('aiImageFiles').value = '';
    await loadPhotos();
    $('aiAttachedNote').textContent = assets.length + ' reference photo(s) stored privately.';
  }
  async function buildSite(prompt, prior) {
    const model = await checkLocal(false);
    const detail = [
      'Business: ' + $('aiBusinessName').value.trim(),
      'Business type: ' + $('aiBusinessType').value,
      'Design direction: ' + $('aiDesignDirection').value.trim(),
      'My instruction: ' + prompt,
      photos.length ? 'Reference photos are attached. Keep unchanged and use these exact img src placeholders: ' + photos.map(p=>p.name + ' = ' + p.token).join('; ') : 'No reference photos attached.',
      html ? 'Edit this existing HTML and preserve its working parts:\n' + html : 'Create the first complete website.'
    ].join('\n\n');
    const chat = [
      {role:'system',content:'You are the lead web designer and front-end developer for VisionWeb. Turn the client brief into a polished, responsive website with a clear visual identity, strong typography, balanced spacing and thoughtful details. Understand plain language, incomplete notes and spelling mistakes. Write concise, natural website copy tailored to the business. Do not use generic filler, exaggerated claims or phrases that sound like automated marketing. Never invent business facts, prices, contact details, opening hours, policies or testimonials; omit unknown details or use clearly labelled neutral placeholders only when necessary. Keep uploaded original photos unchanged and use the exact VisionWeb placeholders in image sources. Do not mention AI, language models, prompts, Ollama or automated generation in public-facing website copy unless the brief explicitly asks for it. Return a complete, self-contained HTML document with inline CSS and any required JavaScript. Do not add external scripts, trackers or requests for credentials. Respond only as valid JSON with assistant_message, design_summary and html_document.'},
      ...prior.slice(-8).map(m=>({role:m.role === 'assistant' ? 'assistant' : 'user',content:String(m.content || '').slice(0,7000)})),
      {role:'user',content:detail,...(photos.length ? {images:photos.map(p=>p.base64)} : {})}
    ];
    let response;
    try {
      response = await fetch(api + '/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        model,messages:chat,stream:false,format:schema,options:{temperature:0.65}
      })});
    } catch { throw new Error('Could not connect to the local design engine. Make sure Ollama is open and that this dashboard is authorised to connect.'); }
    if (!response.ok) throw new Error('The design engine returned error ' + response.status + '. Check that the model is running and your computer has enough available memory.');
    const payload = await response.json();
    const text = payload && payload.message && payload.message.content;
    if (!text) throw new Error('No result was returned. Try a shorter brief with fewer requirements.');
    let result;
    try { result = JSON.parse(String(text).trim().replace(/^```json\s*/i,'').replace(/\s*```$/,'')); }
    catch { throw new Error('The first draft could not be completed. Simplify the brief and try again.'); }
    const page = String(result.html_document || '').trim();
    if (page.length < 100 || page.length > 240000 || !/<html[\s>]/i.test(page)) throw new Error('The website draft is incomplete. Try a shorter brief or review the request.');
    return {model,html:page,message:String(result.assistant_message || 'I updated the website preview.'),summary:String(result.design_summary || '')};
  }
  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!admin) return status('Sign in with an approved VisionWeb administrator account first.',true);
    const prompt = $('aiPrompt').value.trim();
    if (!prompt) return status('Add a project brief or describe the changes you need.',true);
    setBusy(true);
    try {
      const id = await createSite();
      await uploadPhotos(id);
      const before = messages.slice();
      const note = prompt + (photos.length ? '\\nPhotos attached: ' + photos.map(p=>p.name).join(', ') : '');
      messages.push({role:'user',content:note});
      renderMessages();
      await saveMessage('user',note);
      $('aiPrompt').value = '';
      status('Preparing your website draft. This may take a little while…');
      const result = await buildSite(prompt,before);
      html = result.html;
      summary = result.summary;
      const answer = result.message + (result.summary ? '\\n\\nDesign: ' + result.summary : '');
      messages.push({role:'assistant',content:answer});
      await saveMessage('assistant',answer);
      const saved = await db.from('visionweb_ai_sites').update({
        generated_html:html,ai_summary:summary,initial_brief:prompt,status:'draft',updated_at:new Date().toISOString()
      }).eq('id',siteId);
      if (saved.error) throw saved.error;
      renderMessages();
      renderPreview();
      status('Your website draft is ready. Review the preview and describe any changes you would like.');
      await refreshPicker(siteId);
    } catch (error) {
      console.error('VisionWeb local AI:',error);
      status(error.message || 'Something went wrong. Try again.',true);
    } finally { setBusy(false); }
  }
  async function loadSite(id) {
    const result = await db.from('visionweb_ai_sites').select('*').eq('id',id).single();
    if (result.error) throw result.error;
    siteId = id; html = result.data.generated_html || ''; summary = result.data.ai_summary || '';
    $('aiBusinessName').value = result.data.business_name || '';
    $('aiBusinessType').value = result.data.business_type || 'other';
    $('aiDesignDirection').value = result.data.design_direction || '';
    const rows = await Promise.all([
      db.from('visionweb_ai_site_messages').select('role,content').eq('site_id',id).order('created_at'),
      db.from('visionweb_ai_site_assets').select('id,object_path,file_name,mime_type').eq('site_id',id).order('created_at')
    ]);
    if (rows[0].error) throw rows[0].error;
    if (rows[1].error) throw rows[1].error;
    messages = rows[0].data || []; assets = rows[1].data || [];
    await loadPhotos(); renderMessages(); renderPreview();
    $('aiAttachedNote').textContent = assets.length + ' private original photo(s) saved.';
    status('Project opened. You can review the draft or request changes.');
  }
  async function saveDraft() {
    if (!siteId || !html) return;
    const result = await db.from('visionweb_ai_sites').update({generated_html:html,ai_summary:summary,updated_at:new Date().toISOString()}).eq('id',siteId);
    if (result.error) return status('Could not save the draft.',true);
    status('Draft saved to your VisionWeb workspace.');
    await refreshPicker(siteId);
  }
  function newProject() {
    siteId=null; html=''; summary=''; messages=[]; assets=[]; clearPhotos();
    $('aiSavedSites').value=''; $('aiBusinessName').value=''; $('aiBusinessType').value='other';
    $('aiDesignDirection').value=''; $('aiPrompt').value=''; $('aiImageFiles').value='';
    $('aiAttachedNote').textContent='Reference photos are stored privately with this project.';
    renderMessages(); renderPreview(); status('A new website project is ready. Add a brief to get started.');
  }
  async function activate(account) {
    if (!account || !db || (admin && admin.id === account.id)) return;
    try {
      const result = await db.from('visionweb_admins').select('user_id').eq('user_id',account.id).maybeSingle();
      if (result.error || !result.data) return;
      admin=account;
      const ok=await refreshPicker();
      newProject();
      status(ok ? 'Workspace ready. Open Ollama, then test the design engine connection.' : 'Complete the Website Studio database setup in Supabase before continuing.',!ok);
    } catch (error) { status(error.message || 'Could not verify administrator access.',true); }
  }
  const savedModel=localStorage.getItem('visionweb-local-ai-model');
  if (savedModel) $('aiModel').value=savedModel;
  $('aiNewProjectButton').addEventListener('click',newProject);
  $('aiComposerForm').addEventListener('submit',generate);
  $('aiSaveDraftButton').addEventListener('click',saveDraft);
  $('aiOpenPreviewButton').addEventListener('click',()=>{renderPreview();status('Preview refreshed.');});
  $('aiCheckLocalButton').addEventListener('click',async()=>{try{await checkLocal(true);}catch(error){status(error.message || 'Could not connect to the local AI.',true);}});
  $('aiSavedSites').addEventListener('change',async e=>{
    if(!e.target.value) return newProject();
    try{status('Loading saved draft…');await loadSite(e.target.value);}catch(error){status(error.message || 'Could not load this draft.',true);}
  });
  $('aiPrivateReviewButton').addEventListener('click',()=>status('Client review links are not available yet. This draft remains private.'));
  $('aiPublishClientButton').addEventListener('click',()=>status('Client website publishing is not available yet. This draft remains private.'));
  $('aiPublishPortfolioButton').addEventListener('click',()=>status('Portfolio publishing is not available yet. This draft remains private.'));
  if(!ready) status('Connect VisionWeb to Supabase before creating and saving website drafts.',true);
  else {
    db.auth.onAuthStateChange((event,session)=>{
      if(session && session.user) activate(session.user);
      else if(event==='SIGNED_OUT'){admin=null;newProject();status('Sign in to manage website projects.');}
    });
    db.auth.getSession().then(({data})=>{if(data.session && data.session.user) activate(data.session.user);});
  }
})();
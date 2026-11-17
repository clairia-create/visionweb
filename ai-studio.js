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
  let admin = null, siteId = null, html = '', summary = '', messages = [], assets = [], photos = [], busy = false, siteStatus = 'draft', siteClientId = null;

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
      $('aiPrivateReviewButton').disabled = true;
      $('aiPublishClientButton').disabled = true;
      $('aiReviewShare').hidden = true;
      $('aiPublishedPanel').hidden = true;
      return;
    }
    let preview = html;
    photos.forEach(p => { preview = preview.split(p.token).join(p.url); });
    $('aiPreviewFrame').srcdoc = preview;
    $('aiSaveDraftButton').disabled = false;
    $('aiPrivateReviewButton').disabled = !siteId || !siteClientId;
    $('aiPublishClientButton').disabled = !siteId || !siteClientId;
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
        object_path: a.object_path,
        url: URL.createObjectURL(result.data),
        base64: await blobBase64(result.data),
        mime_type: a.mime_type || result.data.type || 'image/jpeg'
      });
    }
  }
  async function refreshPicker(selected = '') {
    const result = await db.from('visionweb_ai_sites').select('id,business_name,status,client_id,published_url').order('updated_at', {ascending:false});
    if (result.error) { status('Complete the Website Studio database setup in Supabase first.', true); return false; }
    $('aiSavedSites').innerHTML = '<option value="">＋ Start a new website</option>' +
      (result.data || []).map(s => '<option value="' + escape(s.id) + '">' + escape(s.business_name) + ' · ' + escape(s.status.replaceAll('_',' ')) + '</option>').join('');
    if (selected) $('aiSavedSites').value = selected;
    return true;
  }
  async function loadClients(selected = '') {
    const result = await db.from('visionweb_clients').select('id,company_name,full_name,email').eq('is_active',true).order('company_name');
    if (result.error) {
      $('aiClientId').innerHTML = '<option value="">Client management setup required</option>';
      return false;
    }
    $('aiClientId').innerHTML = '<option value="">Internal VisionWeb project</option>' +
      (result.data || []).map(client => '<option value="' + escape(client.id) + '">' + escape(client.company_name) + ' · ' + escape(client.full_name) + '</option>').join('');
    if (selected) $('aiClientId').value = selected;
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
      client_id:$('aiClientId').value || null,
      custom_domain:$('aiCustomDomain').value.trim().toLowerCase() || null,
      updated_at:new Date().toISOString()
    };
    siteClientId = row.client_id;
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
      {role:'system',content:'You are the senior website designer and front-end developer at VisionWeb, an independent professional web studio. Your work must look art-directed by an experienced human designer, not like a generic AI template. Study the business type, audience, project brief, visual direction and reference photos before designing. Create a distinctive visual concept for this specific business: choose a coherent colour system, typography pairing, layout rhythm, image treatment and small interface details. Avoid repetitive template layouts, oversized gradients, random decorative shapes, generic slogans, fake badges and stock phrases such as “Welcome to our website”, “Elevate your experience” or “Where passion meets excellence”. Write concise, specific, natural copy that explains what this business offers and what visitors should do next. Build a complete, polished, mobile-first website with a clear navigation, a strong but tasteful hero, useful business-specific sections, credible calls to action, and a consistent footer. Include pages or sections suited to the business rather than forcing every business into the same structure. Use semantic HTML, accessible colour contrast, visible keyboard focus, readable type sizes, responsive layouts for small phones through large desktop screens, and lightweight inline CSS and JavaScript. If the site needs bookings, orders or contact messages, include a real form marked data-visionweb-inquiry="booking", "order" or "message" as appropriate, with named input fields for name, email, phone and date when relevant. Do not claim that payment processing is available. Never invent the business address, phone number, prices, opening hours, credentials, awards, customer reviews or policies. Omit unknown details or use clearly marked editable placeholders. Preserve all uploaded original photos exactly as provided and use the exact VisionWeb image placeholders in their image sources. Do not mention AI, language models, prompts, Ollama or automated generation anywhere in public-facing website content. Return one complete, self-contained HTML document with inline CSS and only the JavaScript needed for the page. Do not add third-party scripts, trackers or requests for passwords or credentials. Return only valid JSON with assistant_message, design_summary and html_document.'},
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

  async function invalidateOldReviewLinks() {
    if (!siteId) return;
    const result = await db.from('visionweb_site_review_links')
      .update({revoked_at:new Date().toISOString()})
      .eq('site_id',siteId)
      .is('revoked_at',null);
    if (result.error) console.warn('Could not invalidate older client review links:',result.error);
  }

  async function createReviewLink() {
    if (!siteId || !html) return status('Save a website draft before creating a review link.',true);
    if (!siteClientId) return status('Assign this website to a client before creating a review link.',true);
    const businessName=$('aiBusinessName').value.trim();
    if(!businessName) return status('Enter the business name before sharing this website.',true);
    const saved=await db.from('visionweb_ai_sites').update({
      business_name:businessName,
      business_type:$('aiBusinessType').value,
      design_direction:$('aiDesignDirection').value.trim(),
      generated_html:html,ai_summary:summary,client_id:siteClientId,
      custom_domain:$('aiCustomDomain').value.trim().toLowerCase() || null,
      updated_at:new Date().toISOString()
    }).eq('id',siteId);
    if(saved.error) return status('Save the website draft before sharing it.',true);
    let reviewHtml=html;
    for (const photo of photos) {
      // Keep review images inside the protected HTML snapshot; do not leave separate signed URLs behind.
      const dataUrl='data:'+(photo.mime_type || 'image/jpeg')+';base64,'+photo.base64;
      reviewHtml=reviewHtml.split(photo.token).join(dataUrl);
    }
    if (/\{\{VISIONWEB_IMAGE_\d+\}\}/.test(reviewHtml)) {
      return status('One or more reference photos are not connected to the preview. Regenerate the draft or remove the unused image placeholders.',true);
    }
    const {data,error}=await db.rpc('create_private_review_link',{p_site_id:siteId,p_preview_html:reviewHtml});
    if(error) { console.error(error); return status('Could not create the private review link. Check that the publishing migration has been run.',true); }
    const url=new URL('review.html',location.href);
    url.searchParams.set('token',data);
    $('aiReviewUrl').value=url.toString();
    $('aiReviewShare').hidden=false;
    siteStatus='private_review';
    status('Private review link created. Send it to the client for feedback and approval.');
    await refreshPicker(siteId);
    renderPreview();
  }

  async function publishClientWebsite() {
    if(!siteId || !html) return status('Create and save a website draft first.',true);
    if(!siteClientId) return status('Assign the website to a client before publishing.',true);
    const {data:site,error:loadError}=await db.from('visionweb_ai_sites').select('status,client_id,admin_user_id').eq('id',siteId).single();
    if(loadError) return status('Could not verify the client approval status.',true);
    if(site.admin_user_id!==admin.id || site.client_id!==siteClientId) return status('The client assignment changed. Save the project and create a new review link before publishing.',true);
    siteStatus=site.status;
    if(!['client_approved','published_client'].includes(siteStatus)) {
      return status('The client must approve the website through the private review page before publication.',true);
    }
    let publicHtml=html;
    photos.forEach(photo=>{
      const dataUrl='data:'+(photo.mime_type || 'image/jpeg')+';base64,'+photo.base64;
      publicHtml=publicHtml.split(photo.token).join(dataUrl);
    });
    if (/\{\{VISIONWEB_IMAGE_\d+\}\}/.test(publicHtml)) {
      return status('One or more reference photos are not connected to the website. Regenerate the draft or remove the unused image placeholders before publishing.',true);
    }
    const formMarkup=[...publicHtml.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(match=>match[0]);
    for (const form of formMarkup) {
      const opening=form.match(/^<form\b[^>]*>/i)?.[0] || '';
      if (!/data-visionweb-inquiry\s*=\s*["'](?:message|booking|order)["']/i.test(opening)) {
        return status('A website form is not connected yet. Ask the Studio to connect it as a booking request, order request or contact message before publishing.',true);
      }
      if (!/name\s*=\s*["'](?:customer_name|customerName|name|full_name|fullName|first_name|firstName)["']/i.test(form)) {
        return status('A website form needs a customer-name field before it can be published.',true);
      }
    }
    const publishScript = `
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script>
<script>
(() => {
  const db = window.supabase.createClient(${JSON.stringify(cfg.url)},${JSON.stringify(cfg.anonKey)});
  const siteId = ${JSON.stringify(siteId)};
  const referrerHost = (() => { try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch { return ''; } })();
  db.rpc('record_client_site_visit',{
    p_site_id:siteId,
    p_page_path:location.pathname.slice(0,300) || '/',
    p_referrer_host:referrerHost.slice(0,253)
  });
  document.querySelectorAll('form[data-visionweb-inquiry]').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      if (submit) { submit.disabled = true; submit.dataset.originalText = submit.textContent; submit.textContent = 'Sending…'; }
      const values = Object.fromEntries(new FormData(form).entries());
      const pick = (...keys) => { for (const key of keys) if (values[key]) return String(values[key]); return ''; };
      const type = form.dataset.visionwebInquiry || 'message';
      const firstName=pick('first_name','firstName');
      const lastName=pick('last_name','lastName');
      const customerName=pick('customer_name','customerName','name','full_name','fullName') || [firstName,lastName].filter(Boolean).join(' ');
      const rawDate = pick('requested_date','requestedDate','booking_date','bookingDate','date');
      const dateCandidate = rawDate.slice(0,10);
      const validRequestedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate) ? dateCandidate : null;
      const {error} = await db.rpc('submit_website_inquiry',{
        p_site_id:siteId,
        p_inquiry_type:type,
        p_customer_name:customerName,
        p_customer_email:pick('customer_email','customerEmail','email'),
        p_customer_phone:pick('customer_phone','customerPhone','phone','whatsapp','telephone'),
        p_requested_date:validRequestedDate,
        p_details:values
      });
      const note = form.querySelector('[data-visionweb-inquiry-status]') || (() => { const p=document.createElement('p'); p.setAttribute('data-visionweb-inquiry-status',''); form.appendChild(p); return p; })();
      note.textContent = error ? 'Your request could not be sent. Please contact the business directly.' : 'Thank you. Your request has been sent.';
      if (submit) { submit.disabled = false; submit.textContent = submit.dataset.originalText || 'Send'; }
    });
  });
})();
</script>`;
    if (/<\/body>/i.test(publicHtml)) publicHtml=publicHtml.replace(/<\/body>/i,publishScript+'\n</body>');
    else publicHtml += publishScript;
    const objectPath=admin.id+'/'+siteId+'/index.html';
    const {error:uploadError}=await db.storage.from('visionweb-client-sites').upload(
      objectPath,new Blob([publicHtml],{type:'text/html;charset=utf-8'}),
      {contentType:'text/html',cacheControl:'60',upsert:true}
    );
    if(uploadError) { console.error(uploadError); return status('The website could not be published. Check the client website storage bucket and policies.',true); }
    const {data:publicData}=db.storage.from('visionweb-client-sites').getPublicUrl(objectPath);
    const customDomain=$('aiCustomDomain').value.trim().toLowerCase() || null;
    const {error:updateError}=await db.from('visionweb_ai_sites').update({
      status:'published_client',published_url:publicData.publicUrl,published_at:new Date().toISOString(),
      client_id:siteClientId,custom_domain:customDomain,generated_html:html,ai_summary:summary,updated_at:new Date().toISOString()
    }).eq('id',siteId);
    if(updateError) { console.error(updateError); return status('The website file was uploaded but its project record could not be updated. Please contact support before publishing again.',true); }
    const notification=await db.rpc('notify_visionweb_client_site_published',{p_site_id:siteId});
    if(notification.error) console.warn('Client publication notification:',notification.error);
    $('aiPublishedUrl').value=publicData.publicUrl;
    $('aiPublishedPanel').hidden=false;
    $('aiDomainNote').textContent=customDomain ? 'The requested domain is '+customDomain+'. It still needs DNS and hosting configuration before it can be used.' : 'The site is live at this public URL. A custom domain can be connected separately.';
    siteStatus='published_client';
    status('The client website is now published. Copy the public link and share it with the client.');
    renderPreview(); await refreshPicker(siteId);
  }

  async function copyField(id) {
    const value=$(id).value;
    try { await navigator.clipboard.writeText(value); status('Link copied.'); }
    catch { $(id).focus(); $(id).select(); status('Select and copy the link shown in the field.'); }
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
      await invalidateOldReviewLinks();
      siteStatus='draft';
      $('aiPublishedPanel').hidden = true;
      $('aiReviewShare').hidden = true;
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
    siteStatus = result.data.status || 'draft';
    const savedClientId = result.data.client_id || null;
    $('aiBusinessName').value = result.data.business_name || '';
    $('aiBusinessType').value = result.data.business_type || 'other';
    $('aiDesignDirection').value = result.data.design_direction || '';
    $('aiCustomDomain').value = result.data.custom_domain || '';
    $('aiClientId').value = savedClientId || '';
    siteClientId = $('aiClientId').value || null;
    if (savedClientId && !siteClientId) {
      status('This website is assigned to an archived client. Restore the client account before creating a review link or publishing.',true);
    }
    $('aiReviewShare').hidden = true;
    if (result.data.published_url) {
      $('aiPublishedUrl').value = result.data.published_url;
      $('aiPublishedPanel').hidden = false;
    } else {
      $('aiPublishedPanel').hidden = true;
    }
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
    renderPreview();
  }
  async function saveDraft() {
    if (!siteId || !html) return;
    const businessName=$('aiBusinessName').value.trim();
    if(!businessName) return status('Enter the business name before saving this website.',true);
    const result = await db.from('visionweb_ai_sites').update({
      business_name:businessName,
      business_type:$('aiBusinessType').value,
      design_direction:$('aiDesignDirection').value.trim(),
      generated_html:html,
      ai_summary:summary,
      client_id:$('aiClientId').value || null,
      custom_domain:$('aiCustomDomain').value.trim().toLowerCase() || null,
      status:'draft',
      updated_at:new Date().toISOString()
    }).eq('id',siteId);
    if (result.error) return status('Could not save the draft.',true);
    await invalidateOldReviewLinks();
    siteStatus='draft';
    $('aiReviewShare').hidden=true;
    siteClientId = $('aiClientId').value || null;
    status('Draft saved to your VisionWeb workspace.');
    renderPreview();
    await refreshPicker(siteId);
  }
  function newProject() {
    siteId=null; html=''; summary=''; messages=[]; assets=[]; clearPhotos(); siteStatus='draft'; siteClientId=null;
    $('aiSavedSites').value=''; $('aiBusinessName').value=''; $('aiBusinessType').value='other';
    $('aiDesignDirection').value=''; $('aiPrompt').value=''; $('aiImageFiles').value='';
    $('aiClientId').value=''; $('aiCustomDomain').value='';
    $('aiAttachedNote').textContent='Reference photos are stored privately with this project.';
    $('aiReviewShare').hidden=true; $('aiPublishedPanel').hidden=true;
    renderMessages(); renderPreview(); status('A new website project is ready. Add a brief to get started.');
  }
  async function activate(account) {
    if (!account || !db || (admin && admin.id === account.id)) return;
    try {
      const result = await db.from('visionweb_admins').select('user_id').eq('user_id',account.id).maybeSingle();
      if (result.error || !result.data) return;
      admin=account;
      const ok=await refreshPicker();
      await loadClients();
      newProject();
      status(ok ? 'Workspace ready. Add a client, prepare the brief and test the local design engine.' : 'Complete the Website Studio database setup in Supabase before continuing.',!ok);
    } catch (error) { status(error.message || 'Could not verify administrator access.',true); }
  }
  const savedModel=localStorage.getItem('visionweb-local-ai-model');
  if (savedModel) $('aiModel').value=savedModel;
  $('aiNewProjectButton').addEventListener('click',newProject);
  $('aiComposerForm').addEventListener('submit',generate);
  $('aiSaveDraftButton').addEventListener('click',saveDraft);
  $('aiOpenPreviewButton').addEventListener('click',()=>{renderPreview();status('Preview refreshed.');});
  $('aiCheckLocalButton').addEventListener('click',async()=>{try{await checkLocal(true);}catch(error){status(error.message || 'Could not connect to the local design engine.',true);}});
  $('aiClientId').addEventListener('change',()=>{
    siteClientId=$('aiClientId').value || null;
    renderPreview();
    if(siteId) status('Client assignment changed. Save the draft and create a new private review before publishing.');
  });
  $('aiSavedSites').addEventListener('change',async e=>{
    if(!e.target.value) return newProject();
    try{status('Loading saved draft…');await loadSite(e.target.value);}catch(error){status(error.message || 'Could not load this draft.',true);}
  });
  $('aiPrivateReviewButton').addEventListener('click',async()=>{try{await createReviewLink();}catch(error){status(error.message || 'Could not create a client review link.',true);}});
  $('aiPublishClientButton').addEventListener('click',async()=>{try{await publishClientWebsite();}catch(error){console.error(error);status(error.message || 'Could not publish the client website.',true);}});
  $('aiCopyReviewUrlButton').addEventListener('click',()=>copyField('aiReviewUrl'));
  $('aiCopyPublishedUrlButton').addEventListener('click',()=>copyField('aiPublishedUrl'));
  $('aiPublishPortfolioButton').addEventListener('click',()=>status('To feature this client website in the public VisionWeb portfolio, get the client’s permission and add it as a portfolio project.'));
  if(!ready) status('Connect VisionWeb to Supabase before creating and saving website drafts.',true);
  else {
    db.auth.onAuthStateChange((event,session)=>{
      if(session && session.user) activate(session.user);
      else if(event==='SIGNED_OUT'){admin=null;newProject();status('Sign in to manage website projects.');}
    });
    db.auth.getSession().then(({data})=>{if(data.session && data.session.user) activate(data.session.user);});
  }
})();
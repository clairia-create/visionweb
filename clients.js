(() => {
  const config = window.VISIONWEB_SUPABASE_CONFIG || {};
  const configured = Boolean(window.supabase && config.url && config.anonKey && !String(config.anonKey).includes('YOUR_'));
  const db = configured ? window.supabase.createClient(config.url, config.anonKey) : null;
  const $ = id => document.getElementById(id);
  let admin = null;
  let clients = [];
  let editingClientId = null;
  const safe = value => String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  function message(text, error=false) { $('clientFormStatus').textContent=text; $('clientFormStatus').classList.toggle('is-error',error); }
  async function loadClients() {
    $('clientListStatus').textContent='Loading client records…';
    const {data,error}=await db.from('visionweb_clients').select('*').order('created_at',{ascending:false});
    if(error) { $('clientListStatus').textContent='Client records could not be loaded. Check the client management migration.'; return; }
    clients=data || [];
    $('clientCount').textContent=clients.length+' CLIENT'+(clients.length===1?'':'S');
    $('clientListStatus').textContent='';
    $('clientList').innerHTML=clients.length ? clients.map(c=>`
      <article class="client-row" data-client="${safe(c.id)}">
        <div>
          <span class="client-state">${c.auth_user_id?'ACCOUNT CONNECTED':'ACCOUNT NOT CONNECTED'}</span>
          <h3>${safe(c.company_name)}</h3>
          <p><strong>${safe(c.full_name)}</strong> · ${safe(c.email)}</p>
          <p>${safe(c.phone || 'No phone added')}</p>
          <p>${safe(c.notes)}</p>
        </div>
        <div class="client-row-tools">
          <button class="client-delete-button" type="button" data-edit-client="${safe(c.id)}">Edit details</button>
          <form class="client-link-form" data-link-form="${safe(c.id)}">
          <input name="auth_user_id" aria-label="Supabase user UUID" placeholder="Paste client's Supabase user UUID" value="${safe(c.auth_user_id || '')}" pattern="[0-9a-fA-F-]{36}" title="Enter the UUID shown in Supabase Authentication → Users">
          <button type="submit">Connect account</button>
          <button class="client-delete-button" type="button" data-delete-client="${safe(c.id)}">Delete client record</button>
        </form>
        </div>
        <p class="client-row-status" id="client-status-${safe(c.id)}"></p>
      </article>`).join('') : '<div class="admin-empty"><strong>Your client directory is empty.</strong><p>Add the first client to start organising their website projects.</p></div>';
  }
  $('clientCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('saveClientButton'); button.disabled=true; button.textContent='Saving…'; message('');
    const wasEditing=Boolean(editingClientId);
    const payload={
      admin_user_id:admin.id,
      full_name:$('clientName').value.trim(),
      company_name:$('clientCompany').value.trim(),
      email:$('clientEmail').value.trim(),
      phone:$('clientPhone').value.trim(),
      notes:$('clientNotes').value.trim(),
      updated_at:new Date().toISOString()
    };
    const result = editingClientId
      ? await db.from('visionweb_clients').update(payload).eq('id',editingClientId)
      : await db.from('visionweb_clients').insert(payload);
    button.disabled=false; button.innerHTML='Save client <span>↗</span>';
    if(result.error) { message('The client record could not be saved. Check the database migration and required fields.',true); console.error(result.error); return; }
    editingClientId=null; $('clientCreateForm').reset(); $('cancelClientEditButton').hidden=true;
    $('saveClientButton').innerHTML='Save client <span>↗</span>';
    document.querySelector('.client-form .eyebrow').textContent='NEW CLIENT';
    document.querySelector('.client-form h2').innerHTML='Add a <em>client.</em>';
    message(wasEditing ? 'Client details updated.' : 'Client added to your directory.'); await loadClients();
  });
  $('clientList').addEventListener('submit',async event=>{
    const form=event.target.closest('[data-link-form]'); if(!form) return;
    event.preventDefault();
    const id=form.dataset.linkForm, raw=new FormData(form).get('auth_user_id').trim();
    const status=$('client-status-'+id);
    if(!/^[0-9a-fA-F-]{36}$/.test(raw)) { status.textContent='Enter the full UUID from Supabase Authentication → Users.'; return; }
    const {error}=await db.from('visionweb_clients').update({auth_user_id:raw,updated_at:new Date().toISOString()}).eq('id',id);
    status.textContent=error ? 'Could not connect this account. Check that the UUID exists and is not linked to another client.' : 'Client account connected.';
    if(error) console.error(error); else await loadClients();
  });
  $('clientList').addEventListener('click',async event=>{
    const editButton=event.target.closest('[data-edit-client]');
    if(editButton) {
      const c=clients.find(item=>item.id===editButton.dataset.editClient); if(!c) return;
      editingClientId=c.id;
      $('clientName').value=c.full_name || '';
      $('clientCompany').value=c.company_name || '';
      $('clientEmail').value=c.email || '';
      $('clientPhone').value=c.phone || '';
      $('clientNotes').value=c.notes || '';
      $('saveClientButton').innerHTML='Save changes <span>↗</span>';
      $('cancelClientEditButton').hidden=false;
      document.querySelector('.client-form .eyebrow').textContent='EDIT CLIENT';
      document.querySelector('.client-form h2').innerHTML='Update <em>client.</em>';
      message('Update the client details, then save your changes.');
      $('clientName').focus();
      return;
    }
    const button=event.target.closest('[data-delete-client]'); if(!button) return;
    const c=clients.find(item=>item.id===button.dataset.deleteClient); if(!c) return;
    if(!confirm('Delete the client record for '+c.company_name+'? Assigned projects will become unassigned.')) return;
    const {error}=await db.from('visionweb_clients').delete().eq('id',c.id);
    if(error) { $('client-status-'+c.id).textContent='Could not delete this record.'; return; }
    await loadClients();
  });
  $('cancelClientEditButton').addEventListener('click',()=>{
    editingClientId=null;
    $('clientCreateForm').reset();
    $('cancelClientEditButton').hidden=true;
    $('saveClientButton').innerHTML='Save client <span>↗</span>';
    document.querySelector('.client-form .eyebrow').textContent='NEW CLIENT';
    document.querySelector('.client-form h2').innerHTML='Add a <em>client.</em>';
    message('Edit cancelled.');
  });
  async function boot() {
    if(!configured) { $('clientListStatus').textContent='Connect the VisionWeb Supabase project first.'; $('saveClientButton').disabled=true; return; }
    const {data,error}=await db.auth.getSession();
    if(error || !data.session) { $('clientListStatus').textContent='Sign in to your VisionWeb administrator account first.'; $('saveClientButton').disabled=true; return; }
    const user=data.session.user;
    const {data:row,error:checkError}=await db.from('visionweb_admins').select('user_id').eq('user_id',user.id).maybeSingle();
    if(checkError || !row) { $('clientListStatus').textContent='This account does not have VisionWeb administrator access.'; $('saveClientButton').disabled=true; return; }
    admin=user; await loadClients();
  }
  boot();
})();
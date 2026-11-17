(() => {
  const cfg=window.VISIONWEB_SUPABASE_CONFIG || {};
  const ready=Boolean(window.supabase && cfg.url && cfg.anonKey && !String(cfg.anonKey).includes('YOUR_'));
  // Keep client portal sessions separate from the admin dashboard session in the same browser.
  const db=ready ? window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{storageKey:'visionweb-client-auth'}}) : null;
  const $=id=>document.getElementById(id);
  let clientProfile=null, inquiries=[];
  const esc=v=>String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  function inquiryTypeLabel(type) {
    return ({booking:'BOOKING REQUEST',order:'ORDER REQUEST',message:'CONTACT MESSAGE'})[type] || String(type).toUpperCase();
  }
  function renderDetails(details) {
    const entries=Object.entries(details || {}).filter(([key,value])=>!['customer_name','name','full_name','customer_email','email','customer_phone','phone','whatsapp','date','requested_date'].includes(key.toLowerCase()) && value!=='' && value!==null && value!==undefined);
    if(!entries.length) return '<p class="portal-muted">No additional details were provided.</p>';
    return '<dl class="inquiry-details">'+entries.map(([key,value])=>{
      const label=String(key).replace(/[_-]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
      const detail=typeof value==='object' ? JSON.stringify(value) : String(value);
      return '<div><dt>'+esc(label)+'</dt><dd>'+esc(detail.slice(0,600))+'</dd></div>';
    }).join('')+'</dl>';
  }
  function loginStatus(text,error=false){$('clientLoginStatus').textContent=text;$('clientLoginStatus').classList.toggle('is-error',error);}
  async function loadWorkspace(user) {
    const {data:profile,error}=await db.from('visionweb_clients').select('*').eq('auth_user_id',user.id).maybeSingle();
    if(error || !profile) {
      await db.auth.signOut();
      loginStatus('This account is not linked to a VisionWeb client profile. Contact your website provider.',true);
      return;
    }
    if(profile.is_active===false) {
      await db.auth.signOut();
      loginStatus('Access to this client workspace is currently paused. Contact VisionWeb for assistance.',true);
      return;
    }
    clientProfile=profile;
    $('clientLoginPanel').hidden=true; $('clientWorkspace').hidden=false; $('clientSignOut').hidden=false;
    $('clientWelcome').innerHTML='Hello, <em>'+esc(profile.full_name)+'</em>.';
    $('clientAccountEmail').textContent=user.email || profile.email;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [sitesResult,inqResult,notResult,visitsResult]=await Promise.all([
      db.from('visionweb_ai_sites').select('id,business_name,business_type,status,published_url,custom_domain,view_count,updated_at').eq('client_id',profile.id).order('updated_at',{ascending:false}),
      db.from('visionweb_inquiries').select('*').eq('client_id',profile.id).order('created_at',{ascending:false}),
      db.from('visionweb_notifications').select('*').order('created_at',{ascending:false}).limit(15),
      db.from('visionweb_site_visits').select('site_id,page_path,referrer_host,created_at').eq('client_id',profile.id).gte('created_at',since).order('created_at',{ascending:false}).limit(2000)
    ]);
    if(sitesResult.error) $('clientWorkspaceStatus').textContent='Website projects could not be loaded.';
    const sites=sitesResult.data || []; inquiries=inqResult.data || [];
    $('clientSiteCount').textContent=sitesResult.error?'—':sites.length;
    $('clientViewCount').textContent=sitesResult.error?'—':sites.reduce((n,s)=>n+Number(s.view_count||0),0);
    $('clientOpenCount').textContent=inqResult.error?'—':inquiries.filter(i=>['new','reviewing'].includes(i.status)).length;
    if(visitsResult.error) {
      $('clientVisits7d').textContent='—';
      $('clientTopPage').textContent='—';
      $('clientTrafficTrend').innerHTML='<p class="admin-loading">Traffic data is not available yet.</p>';
    } else {
      const visits=visitsResult.data || [];
      $('clientVisits7d').textContent=visits.length.toLocaleString();
      const pageCounts=new Map();
      visits.forEach(v=>pageCounts.set(v.page_path,(pageCounts.get(v.page_path)||0)+1));
      const top=[...pageCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
      $('clientTopPage').textContent=top ? top[0] : '—';
      const days=[];
      for(let offset=6;offset>=0;offset--) {
        const date=new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate()-offset);
        const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
        days.push({key,label:date.toLocaleDateString(undefined,{weekday:'short'}),count:0});
      }
      const byDay=new Map(days.map(d=>[d.key,d]));
      visits.forEach(v=>{
        const date=new Date(v.created_at);
        const key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
        if(byDay.has(key)) byDay.get(key).count++;
      });
      const max=Math.max(1,...days.map(d=>d.count));
      $('clientTrafficTrend').innerHTML=days.map(d=>`<div class="traffic-day"><span>${esc(d.label)}</span><div class="traffic-track"><i style="width:${Math.round(d.count/max*100)}%"></i></div><strong>${d.count}</strong></div>`).join('');
    }
    $('clientSites').innerHTML=sites.length ? sites.map(s=>`
      <article class="client-site-card">
        <span class="client-site-status">${esc(s.published_url && s.status!=='published_client' ? 'LIVE SITE · '+(s.status==='client_approved'?'UPDATE APPROVED':'UPDATE IN PROGRESS') : s.status.replaceAll('_',' ').toUpperCase())}</span>
        <h3>${esc(s.business_name)}</h3><p>${esc(s.business_type)} · Updated ${new Date(s.updated_at).toLocaleDateString()}</p>
        <p>${Number(s.view_count||0).toLocaleString()} website visits</p>
        ${s.published_url ? '<a class="underlined-link" href="'+esc(s.published_url)+'" target="_blank" rel="noopener">Open website <span>↗</span></a>' : '<p class="portal-muted">Your website is not published yet.</p>'}
        ${s.custom_domain ? '<p class="portal-muted">Requested domain (not connected): '+esc(s.custom_domain)+'</p>':''}
      </article>`).join('') : '<div class="admin-empty"><strong>No websites assigned yet.</strong><p>Your provider will add your project here when it is ready.</p></div>';
    $('clientInquiries').innerHTML=inqResult.error
      ? '<div class="admin-empty"><strong>Customer requests are unavailable.</strong><p>Check that the client-management migration has been run.</p></div>'
      : (inquiries.length ? inquiries.map(i=>`
      <article class="client-inquiry-row">
        <div><span class="client-site-status">${esc(inquiryTypeLabel(i.inquiry_type))} · ${esc(i.status.toUpperCase())}</span><h3>${esc(i.customer_name)}</h3><p>${esc(i.customer_email)} · ${esc(i.customer_phone)}</p>${renderDetails(i.details)}<small>${new Date(i.created_at).toLocaleString()}</small></div>
        <div class="client-inquiry-actions">
          ${i.status==='new' ? '<button data-set-status="'+i.id+'" data-status="reviewing">Mark in review</button>':''}
          ${['new','reviewing'].includes(i.status) ? '<button data-set-status="'+i.id+'" data-status="confirmed">Confirm</button><button data-set-status="'+i.id+'" data-status="declined">Decline</button>':''}
          ${i.status==='confirmed' ? '<button data-set-status="'+i.id+'" data-status="completed">Mark complete</button>':''}
        </div>
      </article>`).join('') : '<div class="admin-empty"><strong>No customer requests yet.</strong><p>Booking requests, order requests and contact messages from your website will appear here.</p></div>');
    $('clientNotifications').innerHTML=notResult.error
      ? '<p class="portal-muted">Updates are unavailable. Check the client-management migration.</p>'
      : (notResult.data?.length ? notResult.data.map(n=>'<article class="client-notice '+(n.read_at?'is-read':'')+'"><div><strong>'+esc(n.title)+'</strong><p>'+esc(n.message)+'</p><small>'+new Date(n.created_at).toLocaleString()+'</small></div>'+(n.read_at?'':'<button type="button" data-mark-client-notification="'+esc(n.id)+'">Mark read</button>')+'</article>').join('') : '<p class="portal-muted">You are all caught up. There are no new updates.</p>');
  }
  $('clientLoginForm').addEventListener('submit',async e=>{
    e.preventDefault(); if(!ready) return loginStatus('The VisionWeb database is not configured yet.',true);
    const button=$('clientLoginButton'); button.disabled=true; button.textContent='Signing in…';
    const {data,error}=await db.auth.signInWithPassword({email:$('clientLoginEmail').value.trim(),password:$('clientLoginPassword').value});
    button.disabled=false; button.innerHTML='Sign in <span>↗</span>';
    if(error) return loginStatus('Sign-in failed. Check your details and try again.',true);
    await loadWorkspace(data.user);
  });
  $('clientInquiries').addEventListener('click',async e=>{
    const b=e.target.closest('[data-set-status]'); if(!b) return;
    b.disabled=true;
    const {error}=await db.rpc('client_update_inquiry_status',{p_inquiry_id:b.dataset.setStatus,p_status:b.dataset.status});
    if(error) { $('clientWorkspaceStatus').textContent='The enquiry could not be updated.'; b.disabled=false; return; }
    await loadWorkspace((await db.auth.getUser()).data.user);
  });
  $('clientNotifications').addEventListener('click',async e=>{
    const button=e.target.closest('[data-mark-client-notification]'); if(!button) return;
    button.disabled=true;
    const {error}=await db.from('visionweb_notifications').update({read_at:new Date().toISOString()}).eq('id',button.dataset.markClientNotification);
    if(error) { button.disabled=false; $('clientWorkspaceStatus').textContent='Could not mark this update as read.'; return; }
    const user=(await db.auth.getUser()).data.user; await loadWorkspace(user);
  });
  $('clientSignOut').addEventListener('click',async()=>{await db.auth.signOut();clientProfile=null;$('clientWorkspace').hidden=true;$('clientLoginPanel').hidden=false;$('clientSignOut').hidden=true;});
  async function boot(){if(!ready){loginStatus('Connect the VisionWeb database before using this workspace.',true);return;}const {data}=await db.auth.getSession();if(data.session) await loadWorkspace(data.session.user);}
  boot();
})();
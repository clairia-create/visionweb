(() => {
  const cfg=window.VISIONWEB_SUPABASE_CONFIG || {};
  const ready=Boolean(window.supabase && cfg.url && cfg.anonKey && !String(cfg.anonKey).includes('YOUR_'));
  const db=ready ? window.supabase.createClient(cfg.url,cfg.anonKey) : null;
  const $=id=>document.getElementById(id);
  const token=new URLSearchParams(location.search).get('token');
  let site=null;
  function status(text,error=false){$('reviewStatus').textContent=text;$('reviewStatus').classList.toggle('is-error',error);}
  async function load(){
    if(!ready) return status('The review page is not connected to the VisionWeb database.',true);
    if(!token) return status('This review link is incomplete. Please contact VisionWeb.',true);
    const {data,error}=await db.rpc('get_private_review',{p_token:token});
    if(error || !data?.length) return status('This review link has expired or is no longer available. Please contact VisionWeb for a new link.',true);
    site=data[0];
    $('reviewTitle').innerHTML='Review your<br><em>'+String(site.business_name).replace(/[&<>"']/g,'')+'.</em>';
    $('reviewIntro').textContent='Please check the design and content, then tell us whether you approve it or would like changes.';
    $('reviewFrame').srcdoc=site.generated_html; $('reviewFrame').hidden=false; $('reviewForm').hidden=false;
    status('Your private website preview is ready.');
  }
  async function submit(approved){
    if(!site) return;
    const message=$('reviewMessage').value.trim() || (approved?'I approve this website.':'Please contact me to discuss changes.');
    $('approveButton').disabled=true; $('requestChangesButton').disabled=true;
    const {error}=await db.rpc('submit_private_review_feedback',{
      p_token:token,p_reviewer_name:$('reviewerName').value.trim(),p_message:message,p_approved:approved
    });
    $('approveButton').disabled=false; $('requestChangesButton').disabled=false;
    if(error) return status('Your feedback could not be sent. Please try again or contact VisionWeb.',true);
    status(approved?'Thank you. Your approval has been sent to VisionWeb.':'Thank you. Your requested changes have been sent to VisionWeb.');
    $('reviewForm').hidden=true;
  }
  $('approveButton').addEventListener('click',()=>submit(true));
  $('requestChangesButton').addEventListener('click',()=>submit(false));
  load();
})();
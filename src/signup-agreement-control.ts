import {customerLanguage} from './customer-i18n.js';
import type {PublicAgreement,AgreementAcceptance,AgreementAudience} from './agreement-types.js';
const e=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const labels={en:{loading:'Loading registration terms…',terms:'Read and save the terms',privacy:'Read and save the privacy notice',accept:'I agree to the registration terms and acknowledge the privacy notice.',error:'Could not load the registration terms. Reopen this form and try again.',required:'Please read and accept the registration terms.'},fr:{loading:'Chargement des conditions…',terms:'Lire et conserver les conditions',privacy:'Lire et conserver la politique de confidentialité',accept:'J’accepte les conditions d’inscription et reconnais avoir pris connaissance de la politique de confidentialité.',error:'Impossible de charger les conditions. Rouvrez le formulaire et réessayez.',required:'Veuillez lire et accepter les conditions.'},ar:{loading:'جارٍ تحميل شروط التسجيل…',terms:'قراءة الشروط وحفظها',privacy:'قراءة إشعار الخصوصية وحفظه',accept:'أوافق على شروط التسجيل وأقرّ بالاطلاع على إشعار الخصوصية.',error:'تعذّر تحميل الشروط. أعد فتح النموذج وحاول مجددًا.',required:'يرجى قراءة شروط التسجيل والموافقة عليها.'}};

export function mountSignupAgreement(form:HTMLFormElement,slug:string,forAudience:AgreementAudience='customer') {
  const lang=customerLanguage(),copy=labels[lang],root=document.createElement('section');root.className='signup-agreement wide';root.lang=lang;root.dir=lang==='ar'?'rtl':'ltr';root.innerHTML=`<p role="status">${copy.loading}</p>`;
  const submit=form.querySelector<HTMLButtonElement>('[type=submit]');if(submit){submit.before(root);submit.disabled=true;}else form.append(root);
  let ready=false,agreement:PublicAgreement|null=null;
  const loaded=(async()=>{try{
    const response=await fetch(`/api/public/${encodeURIComponent(slug)}/registration-agreements/${forAudience}?language=${lang}`,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error(copy.error);
    const result=await response.json() as {agreement:PublicAgreement|null};agreement=result.agreement;
    if(!form.isConnected)return;
    root.innerHTML=agreement?`<p>${e(agreement.summary)}</p><p class="agreement-links"><a href="${e(agreement.termsUrl)}" target="_blank" rel="noopener">${copy.terms} ↗</a><a href="${e(agreement.privacyUrl)}" target="_blank" rel="noopener">${copy.privacy} ↗</a></p><label class="signup-agreement-check"><input type="checkbox" name="registrationAgreement" required><span>${copy.accept}</span></label>`:'';
    root.hidden=!agreement;ready=true;if(submit)submit.disabled=false;
  }catch{if(form.isConnected)root.innerHTML=`<p role="alert">${copy.error}</p>`;}})();
  return {async value():Promise<AgreementAcceptance|undefined>{await loaded;if(!ready)throw Error(copy.error);if(!agreement)return undefined;if(!root.querySelector<HTMLInputElement>('input')?.checked)throw Error(copy.required);return {version:agreement.version,language:lang,accepted:true};}};
}

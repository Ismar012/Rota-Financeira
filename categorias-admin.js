(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const setStatus=(message='',kind='')=>{const el=$('categoryStatus');el.textContent=message;el.className='rf-category-status '+kind;};
 async function api(url,options={}) {
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível concluir.'),{status:response.status});
   return data;
 }
 function render(categories) {
   for(const kind of ['income','expense']) {
     const list=$(kind+'CategoryList');
     list.replaceChildren(...(categories[kind]||[]).map(name=>{const li=document.createElement('li');li.textContent=name;return li;}));
   }
 }
 async function init() {
   try {
     const auth=await api('/api/auth/me');
     if(!auth.authenticated||auth.user?.role!=='admin') {location.replace('/login.html');return;}
     document.body.style.visibility='visible';
     const result=await api('/api/admin/finance-categories');
     render(result.categories);
   } catch(error) {
     if(error.status===401||error.status===403) {location.replace('/login.html');return;}
     document.body.style.visibility='visible';setStatus(error.message,'error');
   }
 }
 $('categoryForm').addEventListener('submit',async event=>{
   event.preventDefault();const button=$('categorySubmit');
   button.disabled=true;setStatus('Salvando categoria...');
   try{
     const result=await api('/api/admin/finance-categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:$('categoryKind').value,name:$('categoryName').value.trim()})});
     render(result.categories);$('categoryName').value='';$('categoryName').focus();setStatus('Categoria adicionada. Já está disponível para os clientes.','success');
   }catch(error){setStatus(error.message,'error');}
   finally{button.disabled=false;}
 });
 init();
})();

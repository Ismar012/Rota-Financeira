/* Camada de navegação; autorização real é aplicada pelo servidor. */
(async function(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(r.status===401){location.replace('/login.html');return;}
    if(!r.ok)return;
    const d=await r.json();
    if(d.user?.role==='client'&&d.user.status?.core_blocked){
      location.replace(d.user.status.blocked?'/renovar.html':'/servicos.html');
    }
  }catch(e){/* Uma falha transitória não altera permissões no servidor. */}
})();

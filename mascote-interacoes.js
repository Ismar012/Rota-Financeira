/* Rota Financeira — mascote fotográfico articulado em 2,5D.
   Sem troca de poses ou dependências externas. Preserva os eventos de login existentes. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instances=[];
  const html = `<div class="rf-photo-rig" role="img" aria-label="Mascote executivo da Rota Financeira com movimentos de cabeça, mão e corpo">
    <img class="rf-rig-body" src="mascotes/mascote-rig-corpo.webp" alt="" draggable="false">
    <img class="rf-rig-head" src="mascotes/mascote-rig-cabeca.webp" alt="" draggable="false">
    <img class="rf-rig-hand" src="mascotes/mascote-rig-mao.webp" alt="" draggable="false">
  </div>`;
  const phrases = {presenting:'Olá! Vamos construir sua rota financeira.',pointing:'É por aqui! Dê o próximo passo na sua rota.',writing:'Vamos organizar seus próximos passos.',ok:'Tudo certo. Seguimos juntos na sua rota!'};
  function initialize(area){
    const stage=area.querySelector('[data-rf-mascot-stage]');
    if(!stage)return;
    const holder=stage.querySelector('[data-rf-mascot-motion]');
    if(!holder)return;
    holder.innerHTML=html;
    const rig=holder.querySelector('.rf-photo-rig');
    const msg=stage.querySelector('.rf-mascot-message');
    let pose='presenting',targetX=0,targetY=0,curX=0,curY=0,arm=0,currentArm=0,headX=0,headY=0,bodyLean=0;
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const currentSpeech=()=> msg && (msg.textContent=msg.dataset['copy'+pose[0].toUpperCase()+pose.slice(1)]||phrases[pose]);
    function setPose(next,copy){
      pose=phrases[next]?next:'presenting';
      stage.dataset.pose=pose;
      if(msg)msg.textContent=copy||msg.dataset['copy'+pose[0].toUpperCase()+pose.slice(1)]||phrases[pose];
      if(reduced){rig.style.setProperty('--rf-arm-deg',pose==='pointing'?'-6deg':'0deg');}
    }
    function updatePoint(clientX,clientY){
      const box=area.getBoundingClientRect();
      targetX=clamp(((clientX-box.left)/box.width-.5)*2,-1,1);
      targetY=clamp(((clientY-box.top)/box.height-.5)*2,-1,1);
    }
    area.addEventListener('pointermove',e=>{
      if(reduced || e.pointerType==='touch')return;
      updatePoint(e.clientX,e.clientY);
    },{passive:true});
    area.addEventListener('pointerleave',()=>{targetX=targetY=0;setPose('presenting');});
    area.addEventListener('pointerover',e=>{
      const el=e.target.closest('[data-rf-pose],.rf-submit-btn');
      if(el)setPose(el.dataset.rfPose||'pointing');
    });
    area.addEventListener('pointerout',e=>{
      const el=e.target.closest('[data-rf-pose],.rf-submit-btn');
      if(el && !el.contains(e.relatedTarget))setPose('presenting');
    });
    area.addEventListener('focusin',e=>{
      if(e.target.id==='email')setPose('pointing','Digite seu e-mail para começarmos.');
      else if(e.target.id==='senha')setPose('writing','Sua senha está protegida.');
      else if(e.target.matches('[data-rf-pose],.rf-submit-btn'))setPose(e.target.dataset.rfPose||'pointing');
    });
    area.addEventListener('focusout',e=>{
      if(e.target.matches('#email,#senha,[data-rf-pose],.rf-submit-btn'))setPose('presenting');
    });
    function animate(t){
      if(!rig.isConnected)return;
      const s=t/1000;
      curX+=(targetX-curX)*.08;
      curY+=(targetY-curY)*.08;
      const aimArm=pose==='pointing'?-10:pose==='writing'?4:pose==='ok'?-5:0;
      currentArm+=(aimArm-currentArm)*.064;
      // Independent joints: neck, thumb/forearm and trunk, no image swapping.
      headX+=(curX*6.5 + Math.sin(s*.68)*1.2 -headX)*.075;
      headY+=(curY*5.3-headY)*.075;
      bodyLean+=(curX*1.9-bodyLean)*.065;
      const breath=Math.sin(s*1.65);
      const gesture=currentArm+Math.sin(s*1.13)*.9;
      rig.style.setProperty('--rf-head-angle',headX.toFixed(2)+'deg');
      rig.style.setProperty('--rf-head-shift',(-headY*.36).toFixed(2)+'px');
      rig.style.setProperty('--rf-head-x',(curX*3).toFixed(2)+'px');
      rig.style.setProperty('--rf-arm-deg',gesture.toFixed(2)+'deg');
      rig.style.setProperty('--rf-body-deg',(bodyLean + breath*.28).toFixed(2)+'deg');
      rig.style.setProperty('--rf-breath',(1+breath*.003).toFixed(4));
      rig.style.setProperty('--rf-lateral',(curX*5).toFixed(2)+'px');
      requestAnimationFrame(animate);
    }
    setPose('presenting');
    if(!reduced)requestAnimationFrame(animate);
    instances.push({setPose});
  }
  function boot(){document.querySelectorAll('.rf-interactive-area').forEach(initialize);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.RotaMascote={setPose:(pose,message)=>instances.forEach(i=>i.setPose(pose,message))};
})();

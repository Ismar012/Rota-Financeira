/* Rota Financeira: mascote articulado 2D. Sem troca de imagens entre poses.
   Todas as articulações são elementos SVG independentes. */
(() => {
 'use strict';
 const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
 const defaults = {presenting:'Olá! Vamos colocar seus planos no caminho certo.',pointing:'É por aqui! Dê o próximo passo na sua rota.',writing:'Organização é o primeiro passo para avançar.',ok:'Boa escolha. Vamos construir essa rota juntos.'};
 const instances = [...document.querySelectorAll('.rf-interactive-area')].map(area => {
  const stage=area.querySelector('[data-rf-mascot-stage]');
  if(!stage)return null;
  const puppet=stage.querySelector('.rf-puppet'), message=stage.querySelector('.rf-mascot-message');
  let pose='presenting', targetX=0,targetY=0, x=0,y=0, last=0, blinkTimer=0;
  const joint = n => puppet.querySelector('.rf-joint-'+n);
  const setPose=(next,custom) => {
    if(!defaults[next])next='presenting';
    pose=next;stage.dataset.pose=pose;
    if(message){const key='copy'+pose[0].toUpperCase()+pose.slice(1);const copy=message.dataset[key]||defaults[pose];if(message.textContent!==(custom||copy))message.textContent=custom||copy;}
  };
  const ease=(v,t,k)=>v+(t-v)*k;
  function tick(now){
   const dt=Math.min(40,now-last||16);last=now;
   const f=1-Math.exp(-dt/135);x=ease(x,targetX,f);y=ease(y,targetY,f);
   const breath=reduced?0:Math.sin(now/850)*1.2;
   const gesture=reduced?0:Math.sin(now/360)*3;
   const pointing=pose==='pointing', writing=pose==='writing', ok=pose==='ok';
   const headAngle=reduced?0:x*8+breath*.55;
   joint('head').style.transform=`rotate(${headAngle}deg) translate(${x*2.6}px,${y*1.7}px)`;
   joint('body').style.transform=`rotate(${reduced?0:x*2.2+breath*.35}deg)`;
   joint('armFront').style.transform=`rotate(${pointing?-28+gesture:writing?18:ok?-10+gesture:-3+gesture*.4}deg)`;
   joint('armBack').style.transform=`rotate(${pointing?-30+gesture:writing?-8:ok?8+gesture:3-gesture*.5}deg)`;
   joint('legFront').style.transform=`rotate(${reduced?0:Math.sin(now/1600)*1.2}deg)`;
   joint('legBack').style.transform=`rotate(${reduced?0:-Math.sin(now/1600)*1.2}deg)`;
   puppet.style.transform=`translate3d(calc(-50% + ${reduced?0:x*5}px),${reduced?0:y*3+breath}px,0)`;
   if(!reduced){blinkTimer+=dt;if(blinkTimer>3400){stage.classList.add('rf-blink');if(blinkTimer>3520){stage.classList.remove('rf-blink');blinkTimer=0;}}}
   requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  area.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    const r=stage.getBoundingClientRect();targetX=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.5)));
    targetY=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height*.5)));
    const target=e.target.closest('[data-rf-pose]');
    if(target)setPose(target.dataset.rfPose);
    else if(e.target.closest('#email,#senha'))setPose('writing');
    else if(e.target.closest('.rf-auth-card'))setPose('pointing');
    else if(stage.contains(e.target))setPose(targetX>.25?'pointing':'presenting');
    else setPose('presenting');
  },{passive:true});
  area.addEventListener('pointerleave',()=>{targetX=targetY=0;setPose('presenting')});
  area.addEventListener('focusin',e=>{if(e.target.matches('#email'))setPose('writing','Vamos começar pelo seu e-mail.');if(e.target.matches('#senha'))setPose('writing','Digite sua senha com segurança.')});
  area.addEventListener('input',e=>{if(!e.target.matches('#email,#senha'))return;const em=area.querySelector('#email'),pw=area.querySelector('#senha');if(em?.checkValidity()&&em.value&&pw?.value)setPose('ok','Tudo pronto! Vamos entrar na sua rota.');else setPose('writing')});
  area.addEventListener('submit',e=>{if(e.target.matches('#loginForm'))setPose('pointing','Só um instante. Estou preparando sua rota.')});
  setPose('presenting');return {setPose};
 }).filter(Boolean);
 window.RotaMascote={setPose(pose,message){instances[0]?.setPose(pose,message)}};
})();

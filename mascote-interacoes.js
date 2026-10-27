/* Rota Financeira: mascote vetorial articulado, sem troca de imagens ou dependências externas. */
(() => {
'use strict';
const svg = `<svg class="rf-live-svg" viewBox="0 0 320 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Guia animado da Rota Financeira">
<defs><linearGradient id="rfcoat" x2="1" y2="1"><stop stop-color="#f8cb67"/><stop offset="1" stop-color="#bd801d"/></linearGradient><linearGradient id="rfpants" x2="1" y2="1"><stop stop-color="#333b47"/><stop offset="1" stop-color="#121820"/></linearGradient></defs>
<ellipse cx="159" cy="478" rx="98" ry="13" fill="#000" opacity=".3"/>
<g id="rf-character">
 <g id="rf-leg-left" class="rf-leg"><path d="M123 315 Q118 373 110 432 L139 435 157 329Z" fill="url(#rfpants)"/><path d="M110 426 Q99 440 85 447 Q73 460 88 466 L145 466 Q154 455 139 431Z" fill="#171b20" stroke="#d9ad54" stroke-width="3"/></g>
 <g id="rf-leg-right" class="rf-leg"><path d="M160 324 L180 435 210 432 Q206 365 195 312Z" fill="url(#rfpants)"/><path d="M181 432 L209 427 Q218 448 231 451 Q240 465 222 466 L180 466 Q169 454 181 432Z" fill="#171b20" stroke="#d9ad54" stroke-width="3"/></g>
 <g id="rf-arm-left" class="rf-arm"><path d="M114 205 Q91 205 84 234 L67 303 Q63 324 79 326 Q93 327 99 307 L126 248Z" fill="url(#rfcoat)" stroke="#8e651f" stroke-width="3"/><g id="rf-hand-left"><ellipse cx="75" cy="327" rx="15" ry="20" fill="#b8754b"/><path d="M65 323 L57 308" stroke="#b8754b" stroke-width="9" stroke-linecap="round"/></g></g>
 <g id="rf-torso"><path d="M119 198 Q159 185 202 200 L221 314 Q161 343 102 313Z" fill="url(#rfcoat)" stroke="#966b25" stroke-width="3"/><path d="M142 195 L158 248 177 196" fill="#fff5df"/><path d="M158 239 L150 257 159 298 169 257Z" fill="#242c35"/><path d="M121 204 L150 255 139 277 114 228 M198 204 L169 255 181 277 209 228" fill="none" stroke="#fff0c8" stroke-width="6"/><path d="M171 285 L195 285" stroke="#5a421c" stroke-width="4"/><text x="178" y="306" font-size="15" font-weight="900" fill="#382b18">RF</text></g>
 <g id="rf-arm-right" class="rf-arm"><path d="M200 207 Q229 203 238 237 L257 305 Q262 323 247 329 Q233 333 227 314 L199 249Z" fill="url(#rfcoat)" stroke="#8e651f" stroke-width="3"/><g id="rf-hand-right"><ellipse cx="251" cy="329" rx="15" ry="20" fill="#b8754b"/><path d="M261 327 L274 313" stroke="#b8754b" stroke-width="9" stroke-linecap="round"/></g></g>
 <g id="rf-head"><path d="M148 176 L147 206 Q159 221 177 205 L174 174Z" fill="#b8754b"/><ellipse cx="161" cy="122" rx="66" ry="78" fill="#c88a60"/><ellipse cx="99" cy="135" rx="10" ry="17" fill="#b8754b"/><ellipse cx="222" cy="135" rx="10" ry="17" fill="#b8754b"/><path d="M96 114 Q90 37 155 36 Q224 30 229 111 Q209 92 195 72 Q157 101 104 98Z" fill="#24211e"/><path d="M111 94 Q157 82 191 57" fill="none" stroke="#39312a" stroke-width="12" stroke-linecap="round"/><g id="rf-eyes"><ellipse cx="137" cy="133" rx="13" ry="9" fill="#fff"/><ellipse cx="184" cy="133" rx="13" ry="9" fill="#fff"/><g id="rf-pupils"><circle cx="139" cy="133" r="5" fill="#222"/><circle cx="186" cy="133" r="5" fill="#222"/></g></g><path d="M125 118 Q138 111 150 118 M173 118 Q186 111 198 118" stroke="#38251e" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M159 138 L153 158 Q161 164 170 157" fill="none" stroke="#9e603f" stroke-width="3"/><path d="M139 175 Q160 192 183 174" fill="none" stroke="#6b302a" stroke-width="5" stroke-linecap="round"/><path d="M134 174 Q161 182 187 173" fill="none" stroke="#fff2e4" stroke-width="3"/></g>
</g></svg>`;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const messages = {presenting:'Olá! Vamos colocar seus planos no caminho certo.',pointing:'É por aqui! Dê o próximo passo na sua rota.',writing:'Organização é o primeiro passo para avançar.',ok:'Boa escolha! Vamos construir essa rota juntos.'};
const instances=[];
function initialize(area){
 const stage=area.querySelector('[data-rf-mascot-stage]'); if(!stage)return;
 const holder=stage.querySelector('[data-rf-mascot-motion]'); if(!holder)return;
 holder.innerHTML=svg;
 const parts={body:holder.querySelector('#rf-character'),head:holder.querySelector('#rf-head'),left:holder.querySelector('#rf-arm-left'),right:holder.querySelector('#rf-arm-right'),legL:holder.querySelector('#rf-leg-left'),legR:holder.querySelector('#rf-leg-right'),pupils:holder.querySelector('#rf-pupils')};
 const msg=stage.querySelector('.rf-mascot-message');
 let pose='presenting',tx=0,ty=0,x=0,y=0,phase=0;
 function setPose(next,custom){pose=messages[next]?next:'presenting';stage.dataset.pose=pose;if(msg){const key='copy'+pose[0].toUpperCase()+pose.slice(1);msg.textContent=custom||msg.dataset[key]||messages[pose];}}
 area.addEventListener('pointermove',e=>{if(reduced||e.pointerType==='touch')return;const r=area.getBoundingClientRect();tx=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2));ty=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2));},{passive:true});
 area.addEventListener('pointerleave',()=>{tx=0;ty=0;setPose('presenting');});
 area.addEventListener('pointerover',e=>{const el=e.target.closest('[data-rf-pose]');if(el)setPose(el.dataset.rfPose);});
 area.addEventListener('focusin',e=>{if(e.target.matches('#email'))setPose('pointing','Digite seu e-mail para começarmos.');if(e.target.matches('#senha'))setPose('writing','Sua senha está protegida.');});
 area.addEventListener('focusout',e=>{if(e.target.matches('#email,#senha'))setPose('presenting');});
 function animate(t){if(!document.contains(holder))return;phase=t/1000;x+=(tx-x)*.065;y+=(ty-y)*.065;const breath=Math.sin(phase*2)*2;const walk=Math.sin(phase*2.6)*1.6;const arm=pose==='pointing'?-94:pose==='ok'?-57:pose==='writing'?18:-8;
 parts.body.setAttribute('transform',reduced?'':`translate(${(x*5).toFixed(2)} ${breath.toFixed(2)}) rotate(${(x*1.8).toFixed(2)} 160 280)`);
 parts.head.setAttribute('transform',reduced?'':`rotate(${(x*10+Math.sin(phase*.9)*1.3).toFixed(2)} 160 187) translate(0 ${(y*3).toFixed(2)})`);
 parts.pupils.setAttribute('transform',reduced?'':`translate(${(x*4).toFixed(2)} ${(y*2).toFixed(2)})`);
 parts.right.setAttribute('transform',reduced?'':`rotate(${(arm+Math.sin(phase*2)*3).toFixed(2)} 208 216)`);
 parts.left.setAttribute('transform',reduced?'':`rotate(${(pose==='ok'? -35:pose==='writing'?18:Math.sin(phase*1.8)*4).toFixed(2)} 113 217)`);
 parts.legL.setAttribute('transform',reduced?'':`rotate(${walk.toFixed(2)} 140 326)`);
 parts.legR.setAttribute('transform',reduced?'':`rotate(${(-walk).toFixed(2)} 176 326)`);
 requestAnimationFrame(animate);}
 if(!reduced)requestAnimationFrame(animate);
 instances.push({setPose});
}
function boot(){document.querySelectorAll('.rf-interactive-area').forEach(initialize);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.RotaMascote={setPose:(pose,message)=>instances.forEach(i=>i.setPose(pose,message))};
})();

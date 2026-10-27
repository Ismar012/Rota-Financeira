/* Rota Financeira — mascote volumétrico WebGL 3D (sem trocar fotografias).
   Modelo original criado com malhas 3D articuladas e detalhe facial da referência.
   Escopo: somente index.html e login.html. Sem dependências externas. */
(function () {
  'use strict';
  const stages = Array.from(document.querySelectorAll('[data-rf-mascot-stage]'));
  if (!stages.length) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phrases = { presenting: 'Olá! Vamos colocar seus planos no caminho certo.', pointing: 'É por aqui! Dê o próximo passo na sua rota.', writing: 'Confira seus dados com calma. Vamos seguir juntos.', ok: 'Boa escolha. Vamos construir essa rota juntos.' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => a + (b - a) * k;
  const I = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const multiply = (a,b) => { const o=new Float32Array(16); for(let j=0;j<4;j++) for(let i=0;i<4;i++) for(let k=0;k<4;k++) o[j*4+i]+=a[k*4+i]*b[j*4+k]; return o; };
  const shift = (x,y,z) => {const m=I();m[12]=x;m[13]=y;m[14]=z;return m;};
  const scale = (x,y,z) => {const m=I();m[0]=x;m[5]=y;m[10]=z;return m;};
  const rotateX=a=>{const m=I(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;};
  const rotateY=a=>{const m=I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;};
  const rotateZ=a=>{const m=I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;};
  const compose=(...args)=>args.reduce((a,b)=>multiply(a,b),I());
  const ortho=(l,r,b,t,n,f)=>new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);
  function makeSphere(rings=18, segments=28) {const p=[],n=[],uv=[],idx=[];for(let a=0;a<=rings;a++){let phi=a*Math.PI/rings;for(let b=0;b<=segments;b++){let th=b*2*Math.PI/segments,x=Math.sin(phi)*Math.cos(th),y=Math.cos(phi),z=Math.sin(phi)*Math.sin(th);p.push(x,y,z);n.push(x,y,z);uv.push(b/segments,1-a/rings);}}
    for(let a=0;a<rings;a++)for(let b=0;b<segments;b++){let q=a*(segments+1)+b;idx.push(q,q+segments+1,q+1,q+1,q+segments+1,q+segments+2);}return {p,n,uv,idx}; }
  function cylinder(seg=24){const p=[],n=[],uv=[],idx=[]; for(let i=0;i<=seg;i++){let q=i*2*Math.PI/seg,x=Math.sin(q),z=Math.cos(q);p.push(x,-.5,z,x,.5,z);n.push(x,0,z,x,0,z);uv.push(i/seg,0,i/seg,1);}for(let i=0;i<seg;i++){let k=2*i;idx.push(k,k+1,k+2,k+1,k+3,k+2);}return {p,n,uv,idx};}
  function flat(points) {const p=[],n=[],uv=[],idx=[];points.forEach(([x,y,z],i)=>{p.push(x,y,z);n.push(0,0,1);uv.push(i%2,Math.floor(i/2));});for(let i=1;i<points.length-1;i++)idx.push(0,i,i+1);return{p,n,uv,idx};}
  // Pele fotográfica aplicada à SUPERFÍCIE CURVA da cabeça, com volume real e rig 3D.
  function clothSurface(){const p=[],n=[],uv=[],idx=[]; const rows=24,cols=20;
    for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){let x=(j/cols-.5)*1.02,y=(.5-i/rows)*1.43;let z=.32+.05*(1-x*x/0.31);p.push(x,y,z);n.push(x*.14,0,1);uv.push(j/cols,1-i/rows);}for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){let k=i*(cols+1)+j;idx.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}return{p,n,uv,idx};}
  function facialMesh(){const p=[],n=[],uv=[],idx=[];const rows=28,cols=20;for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){let x=(j/cols-.5)*.89,y=(.5-i/rows)*1.13; const edge=1-Math.pow(x/.55,2);let z=.30+.12*Math.max(0,edge)*(1-Math.pow(y/.69,2));p.push(x,y,z);n.push(x*.24,0,1);uv.push(j/cols,1-i/rows);}for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){let k=i*(cols+1)+j;idx.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}return{p,n,uv,idx};}
  const meshes={sphere:makeSphere(),cylinder:cylinder(),face:facialMesh(),cloth:clothSurface(), lapelLeft:flat([[-.52,.58,.36],[-.08,.13,.5],[-.28,-.29,.47],[-.40,.29,.42]]),lapelRight:flat([[.52,.58,.36],[.08,.13,.5],[.28,-.29,.47],[.40,.29,.42]])};
  const shaderVS=`#version 300 es
  precision highp float; in vec3 pos; in vec3 normal; in vec2 uv;uniform mat4 model;uniform mat4 projection;out vec3 vNormal;out vec2 vUv;out vec3 vWorld;void main(){vec4 p=model*vec4(pos,1.);vWorld=p.xyz;vNormal=mat3(model)*normal;vUv=uv;gl_Position=projection*p;}`;
  const shaderFS=`#version 300 es
  precision mediump float;in vec3 vNormal;in vec2 vUv;in vec3 vWorld;uniform vec4 baseColor;uniform sampler2D photo;uniform bool useTexture;out vec4 outColor;void main(){vec3 n=normalize(vNormal);vec3 sun=normalize(vec3(-.7,1.1,1.8));float brightness=.57+.44*max(0.,dot(n,sun));float rim=.24*pow(1.-abs(n.z),2.);vec4 albedo=useTexture?texture(photo,vUv):baseColor;if(albedo.a<.10)discard;vec3 c=albedo.rgb*(brightness+rim);c+=vec3(.055,.028,.009)*max(0.,dot(n,normalize(vec3(.8,.2,.5))));outColor=vec4(c,albedo.a*baseColor.a);}`;
  function init(stage){
    const holder=stage.querySelector('[data-rf-mascot-motion]'); if(!holder)return;
    const canvas=document.createElement('canvas');canvas.className='rf-mascot-3d';canvas.setAttribute('aria-label','Representante 3D da Rota Financeira, animado e interativo');canvas.setAttribute('role','img');
    const fallback=new Image();fallback.src='mascotes/mascote-apresentacao.webp';fallback.alt='Representante da Rota Financeira';fallback.className='rf-mascot-static-fallback';fallback.hidden=true;
    holder.replaceChildren(canvas,fallback);
    const showFallback=()=>{canvas.style.display='none';fallback.hidden=false;stage.setAttribute('data-3d','indisponivel');};
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!gl){showFallback();return;}
    const program=gl.createProgram();for(const [src,type] of [[shaderVS,gl.VERTEX_SHADER],[shaderFS,gl.FRAGMENT_SHADER]]){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn('RF WebGL shader',gl.getShaderInfoLog(s));showFallback();return;}gl.attachShader(program,s);}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){showFallback();return;}
    const loc={pos:gl.getAttribLocation(program,'pos'),normal:gl.getAttribLocation(program,'normal'),uv:gl.getAttribLocation(program,'uv'),model:gl.getUniformLocation(program,'model'),projection:gl.getUniformLocation(program,'projection'),baseColor:gl.getUniformLocation(program,'baseColor'),useTexture:gl.getUniformLocation(program,'useTexture')};
    const gpu={}; for(const [key,mesh] of Object.entries(meshes)) {const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vert=new Float32Array(mesh.p.length/3*8);for(let i=0;i<mesh.p.length/3;i++){vert.set(mesh.p.slice(i*3,i*3+3),i*8);vert.set(mesh.n.slice(i*3,i*3+3),i*8+3);vert.set(mesh.uv.slice(i*2,i*2+2),i*8+6);}
      const v=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,vert,gl.STATIC_DRAW);const e=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,e);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.idx),gl.STATIC_DRAW);for(const [id,size,offset] of [[loc.pos,3,0],[loc.normal,3,12],[loc.uv,2,24]]){gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,size,gl.FLOAT,false,32,offset);}gpu[key]={vao,count:mesh.idx.length}; }
    gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,0]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const face=new Image();face.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,face);state.faceReady=true;};face.src='mascotes/rosto-avatar-3d.png';
    const clothTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,clothTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([18,18,18,0]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const clothImage=new Image();clothImage.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,clothTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,clothImage);state.clothReady=true;};clothImage.src='mascotes/terno-textura-3d.png';
    const colors={skin:[.77,.43,.27,1],skinLight:[.89,.54,.35,1],fabric:[.072,.068,.066,1],suit:[.095,.088,.081,1],lapel:[.17,.16,.15,1],shirt:[.036,.035,.036,1],hair:[.055,.030,.025,1],gold:[.94,.62,.13,1],shoe:[.038,.032,.030,1]};
    function draw(type,color,m,usePhoto=false){let g=gpu[type];if(usePhoto){gl.bindTexture(gl.TEXTURE_2D,usePhoto==='cloth'?clothTexture:texture);}gl.bindVertexArray(g.vao);gl.uniformMatrix4fv(loc.model,false,m);gl.uniform4fv(loc.baseColor,color);gl.uniform1i(loc.useTexture,usePhoto);gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_SHORT,0);}
    const ball=(parent,co,x,y,z,sx,sy,sz)=>draw('sphere',co,compose(parent,shift(x,y,z),scale(sx,sy,sz)));
    const bone=(parent,co,x,y,z,length,width,depth)=>draw('cylinder',co,compose(parent,shift(x,y-length/2,z),scale(width,length,depth)));
    const state={pose:'presenting',message:'',tx:0,ty:0,px:0,py:0,poseProgress:0,bodyYaw:0,headYaw:0,headPitch:0,faceReady:false,clothReady:false,active:true,armAngleR:-.16,armAngleL:.18,elapsedStart:performance.now()};
    function say(pose,custom){let label=stage.querySelector('.rf-mascot-message');if(label){const attr=label.getAttribute('data-copy-'+pose);label.textContent=custom||attr||phrases[pose]||phrases.presenting;}}
    const controls=window.RotaMascote||{};const existing=controls.setPose;
    controls.setPose=function(pose,message){if(!['presenting','pointing','writing','ok'].includes(pose))pose='presenting';for(const st of stages){st.dispatchEvent(new CustomEvent('rf-pose',{detail:{pose,message}}));}if(typeof existing==='function'&&!existing.__rf3d){/* interface antiga não é executada */}};
    controls.setPose.__rf3d=true;window.RotaMascote=controls;
    stage.addEventListener('rf-pose',e=>{state.pose=e.detail.pose;say(state.pose,e.detail.message);});
    const move=e=>{const rect=stage.getBoundingClientRect(); const x=e.clientX-rect.left,y=e.clientY-rect.top;state.tx=clamp((x/rect.width-.5)*2,-1,1);state.ty=clamp((.5-y/rect.height)*2,-1,1);};
    const onPageMove=e=>{const r=stage.getBoundingClientRect(); if(r.width<=0)return;state.tx=clamp(((e.clientX-(r.left+r.width/2))/Math.max(300,r.width))*1.25,-1,1);state.ty=clamp(((r.top+r.height/2-e.clientY)/Math.max(300,r.height))*1.25,-1,1);};
    document.addEventListener('pointermove',onPageMove,{passive:true});stage.addEventListener('pointerenter',move,{passive:true});
    const effects=()=>{let w=canvas.clientWidth,h=canvas.clientHeight;if(w===0||h===0)return null;let dpr=Math.min(window.devicePixelRatio||1,2);let rw=Math.round(w*dpr),rh=Math.round(h*dpr);if(canvas.width!==rw||canvas.height!==rh){canvas.width=rw;canvas.height=rh;gl.viewport(0,0,rw,rh);}let aspect=rw/rh;const worldH=5.02;const worldW=worldH*aspect;const zoom=1.04;gl.uniformMatrix4fv(loc.projection,false,ortho(-worldW/2*zoom,worldW/2*zoom,-.13,4.89,-20,20));return aspect;};
    const arm=(side,parent,pose,t)=>{
      const shoulder=compose(parent,shift(side*.60,3.43,0));
      const amplitude=pose==='pointing'?1:pose==='ok'?.65:pose==='writing'?.4:0;
      let a=side===1?(-.14 - .72*amplitude):(.15+.25*amplitude);
      // A rotação Z levanta o braço articulado em direção ao botão (no lado direito).
      a=side===1?state.armAngleR:state.armAngleL;
      a+=Math.sin(t*1.2+side)*.019;
      const upper=compose(shoulder,rotateZ(a));ball(upper,colors.suit,0,-.29,0,.215,.41,.22);bone(upper,colors.suit,0,-.18,0,.72,.19,.18);
      const elbow=compose(upper,shift(0,-.73,0),rotateZ(side===1? (pose==='pointing'?.16:pose==='ok'?-.38:-.20):-.20));ball(elbow,colors.suit,0,0,0,.19,.21,.19);bone(elbow,colors.suit,0,-.30,0,.64,.155,.155);
      const palm=compose(elbow,shift(0,-.67,.02));ball(palm,colors.skin,0,-.11,.01,.142,.205,.115);
      if(side===1&&pose==='pointing'){ // mão apontando e dedo independente 3D
         ball(palm,colors.skinLight,.07,-.20,.03,.054,.18,.06);
      }
      if(side===1&&pose==='ok'){
         ball(palm,colors.skinLight,.07,-.21,.08,.085,.08,.07);
      }
      // Botões de punho e relógio dourado.
      ball(elbow,colors.gold,.15,-.57,.03,.035,.040,.040);
    };
    const limb=(parent,side,t)=>{
      let hip=compose(parent,shift(side*.275,1.91,0),rotateZ(side*.035));ball(hip,colors.fabric,0,-.47,0,.27,.58,.275);bone(hip,colors.fabric,0,-.50,0,.92,.22,.23);
      let knee=compose(hip,shift(0,-.98,0),rotateZ(-side*.03+Math.sin(t*.75+side)*.012));ball(knee,colors.fabric,0,-.02,0,.225,.21,.22);bone(knee,colors.fabric,0,-.38,0,.84,.19,.195);
      const foot=compose(knee,shift(0,-.84,.10));ball(foot,colors.shoe,0,.03,.14,.228,.15,.43);ball(foot,colors.gold,0,.14,.18,.066,.018,.11);
    };
    function render(t){if(!state.active)return; let aspect=effects();if(aspect===null)return;
      const age=(performance.now()-state.elapsedStart)/1000;
      const rightGoal=state.pose==='pointing'?(stage.classList.contains('rf-login-stage')?1.35:-1.35):state.pose==='ok'?2.05:state.pose==='writing'?-.7:-.16;
      const welcome=state.pose==='presenting'&&!reduced&&age<2.5? Math.sin(Math.PI*Math.min(age/2.5,1))*1.8:0;
      state.armAngleR=mix(state.armAngleR,rightGoal+welcome,.055);
      state.armAngleL=mix(state.armAngleL,state.pose==='writing'?.43:.18,.055);
      const lerpFactor=reduced?.035:.075;state.px=mix(state.px,state.tx,lerpFactor);state.py=mix(state.py,state.ty,lerpFactor);state.bodyYaw=mix(state.bodyYaw,state.px*.21,.052);state.headYaw=mix(state.headYaw,state.px*.38,.073);state.headPitch=mix(state.headPitch,state.py*.18,.069);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);let phase=t*.001;
      const breath=reduced?0:Math.sin(phase*2.15)*.014,sway=reduced?0:Math.sin(phase*.9)*.028;
      const figure=compose(shift(sway,breath*.55,0),rotateY(-state.bodyYaw),rotateZ(sway*.03));
      // Corpo físico e pernas montados em transformações hierárquicas 3D.
      limb(figure,-1,phase);limb(figure,1,phase);
      const root=compose(figure,shift(0,2.52,0),rotateX(-.035),rotateZ(sway*.045));
      ball(root,colors.suit,0,.40,0,.68,.88,.33);
      ball(root,colors.suit,0,-.38,0,.51,.27,.295);
      ball(root,colors.shirt,0,.45,.297,.235,.58,.050);
      if(state.clothReady)draw('cloth',[1,1,1,1],compose(root,shift(0,.15,.015)),'cloth');
      draw('lapelLeft',colors.lapel,compose(root,shift(0,.35,0)));
      draw('lapelRight',colors.lapel,compose(root,shift(0,.35,0)));
      // Lapelas, bolso e botões em relevo com brilho dourado.
      ball(root,colors.gold,.405,.48,.331,.07,.075,.024);
      ball(root,colors.gold,.40,.47,.352,.024,.026,.015);
      ball(root,colors.gold,-.09,-.10,.332,.025,.025,.025);
      ball(root,colors.gold,-.09,-.39,.312,.029,.025,.023);
      ball(root,colors.gold,.31,-.33,.331,.11,.017,.017);
      ball(root,colors.fabric,0,-.73,0,.47,.17,.29);
      // Cinto 3D e fivela.
      ball(root,colors.shoe,0,-.69,.29,.49,.06,.025);
      ball(root,colors.gold,0,-.69,.33,.10,.060,.03);
      // Braços animados independentes da inclinação do tronco.
      arm(-1,figure,state.pose,phase);arm(1,figure,state.pose,phase);
      // Cabeça real com profundidade; o recorte de face é apenas uma textura sobre malha curva.
      const neck=compose(root,shift(0,1.17,0));ball(neck,colors.skin,0,-.015,.03,.17,.22,.16);
      const head=compose(neck,rotateY(-state.headYaw),rotateX(state.headPitch),rotateZ(.04));
      ball(head,colors.skin,0,.45,.035,.44,.57,.375);
      // Volume do cabelo encaracolado, sobrancelhas e barba lateral.
      ball(head,colors.hair,0,.88,.04,.47,.22,.38);
      ball(head,colors.hair,-.41,.49,-.06,.075,.28,.28);
      ball(head,colors.hair,.41,.49,-.06,.075,.28,.28);
      ball(head,colors.hair,0,.095,.07,.36,.17,.35);
      for(let i=0;i<10;i++){let x=-.37+i*.082;ball(head,colors.hair,x,.98+Math.sin(i*.9)*.025,.15,.09,.07,.12);}
      if(state.faceReady){ // frente fotográfica capturada do mascote original, sem alternância de imagem.
         draw('face',[1,1,1,1],compose(head,shift(0,.48,.126)),true);
      }
      gl.flush();}
    let raf=0,last=0;function frame(time){if(!document.hidden && time-last>= (reduced?65:30)){render(time);last=time;}raf=requestAnimationFrame(frame);}
    const obs=new IntersectionObserver(entries=>{state.active=entries[0].isIntersecting;if(state.active&&!raf)raf=requestAnimationFrame(frame);},{threshold:0});obs.observe(stage);raf=requestAnimationFrame(frame);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;showFallback();});
    stage.dataset.rf3d='ativo';
    document.querySelectorAll('[data-rf-pose]').forEach(el=>{el.addEventListener('pointerenter',()=>controls.setPose(el.dataset.rfPose));el.addEventListener('pointerleave',()=>controls.setPose('presenting'));el.addEventListener('focus',()=>controls.setPose(el.dataset.rfPose));});
    if(stage.classList.contains('rf-login-stage')){
      const email=document.getElementById('email'),pwd=document.getElementById('senha');if(email)email.addEventListener('focus',()=>controls.setPose('pointing','Vamos começar pelo seu e-mail.'));if(pwd)pwd.addEventListener('focus',()=>controls.setPose('writing','Sua senha é confidencial. Vamos seguir juntos.'));
    }
  }
  stages.forEach(init);
})();

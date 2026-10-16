(() => {
  const types={clt:'Emprego CLT',motorista:'Motorista de aplicativo',autonomo:'Profissional autônomo',empresa:'Empresa',outro:'Outra atividade'};
  const cadences={diario:'Diariamente',semanal:'Semanalmente',quinzenal:'Quinzenalmente',mensal:'Mensalmente',variavel:'Por serviço ou em datas variáveis'};
  const tips={clt:'Acompanhe as datas do salário e os compromissos entre recebimentos.',motorista:'Registre combustível, aluguel e manutenção separadamente dos gastos pessoais.',autonomo:'Separe os recebimentos previstos dos confirmados e acompanhe os atrasos.',empresa:'Separe o caixa empresarial das retiradas pessoais. Caixa disponível não representa lucro.',outro:'Registre cada recebimento e acompanhe seus vencimentos.'};
  function el(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function select(map,value){const s=el('select');for(const [k,v]of Object.entries(map)){const o=el('option',v);o.value=k;s.append(o);}s.value=value;return s;}
  const editing=location.pathname==='/perfil.html';
  const admin=location.pathname==='/admin.html';
  const host=admin?document.getElementById('clientDetail'):document.querySelector('main .container, .planning-container, main');
  if(!host)return;
  const panel=el('section');panel.className='financial-profile-panel';
  panel.append(el('h2',editing?'Meu perfil financeiro':'Perfil financeiro'));
  const body=el('div');panel.append(body);host.append(panel);
  let sequence=0;
  async function load(clientId){
    const ticket=++sequence;body.replaceChildren(el('p','Carregando perfil financeiro…'));
    try{
      const r=await fetch(clientId?`/api/admin/clients/${clientId}/financial-profile`:'/api/financial-profile',{credentials:'same-origin'});
      const data=await r.json();if(ticket!==sequence)return;if(!r.ok)throw Error(data.error||'Não foi possível carregar o perfil.');
      body.replaceChildren();if(editing)renderForm(data.profile);else renderSummary(data.profile);
    }catch(e){if(ticket===sequence)body.replaceChildren(el('p',e.message));}
  }
  function renderSummary(p){
    if(!p){body.append(el('p','Perfil ainda não configurado.'));if(!admin){const a=el('a','Configurar minhas atividades');a.href='/perfil.html';body.append(a);}return;}
    body.append(el('p',`Atividade principal: ${types[p.primary]||'Não informada'}`));
    const list=el('ul');for(const activity of p.activities)list.append(el('li',`${types[activity]} — ${tips[activity]}`));body.append(list);
    for(const s of p.sources)body.append(el('p',`${s.name} · ${types[s.activity]} · ${cadences[s.cadence]}`));
    body.append(el('small','As fontes cadastradas aqui não criam lançamentos nem representam recebimentos confirmados.'));
  }
  function renderForm(p){
    p=p||{primary:'clt',activities:['clt'],sources:[]};
    const form=el('form'),fieldset=el('fieldset');fieldset.append(el('legend','Quais atividades fazem parte da sua renda?'));
    const checks=[];
    for(const[k,v]of Object.entries(types)){const label=el('label'),input=el('input');input.type='checkbox';input.value=k;input.checked=p.activities.includes(k);label.append(input,document.createTextNode(' '+v));fieldset.append(label);checks.push(input);}
    form.append(fieldset);const primaryLabel=el('label','Atividade principal');const primary=select(types,p.primary);primaryLabel.append(primary);form.append(primaryLabel);
    form.append(el('h3','Fontes de renda'));
    form.append(el('p','Cadastre, por exemplo, salário, corridas ou atendimentos. Não informe valores aqui: os recebimentos continuam sendo registrados no planejamento.'));
    const rows=el('div');form.append(rows);const sources=[];
    function add(s={name:'',activity:primary.value,cadence:'variavel'}){
      if(sources.length>=12)return;
      const row=el('div');row.className='financial-source';
      const name=el('input');name.type='text';name.required=true;name.maxLength=80;name.value=s.name;name.setAttribute('aria-label','Nome da fonte de renda');name.placeholder='Nome da fonte de renda';
      const activity=select(types,s.activity);activity.setAttribute('aria-label','Atividade da fonte');
      const cadence=select(cadences,s.cadence);cadence.setAttribute('aria-label','Frequência de recebimento');
      const remove=el('button','Remover');remove.type='button';const item={row,name,activity,cadence};remove.onclick=()=>{sources.splice(sources.indexOf(item),1);row.remove();};
      row.append(name,activity,cadence,remove);rows.append(row);sources.push(item);
    }
    p.sources.forEach(add);const plus=el('button','Adicionar fonte de renda');plus.type='button';plus.onclick=()=>add();form.append(plus);
    const save=el('button','Salvar perfil financeiro');save.type='submit';save.className='btn btn-gold';form.append(save);const status=el('p');status.setAttribute('role','status');form.append(status);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;status.textContent='Salvando…';try{
      const profile={primary:primary.value,activities:checks.filter(c=>c.checked).map(c=>c.value),sources:sources.map(s=>({name:s.name.value,activity:s.activity.value,cadence:s.cadence.value}))};
      const r=await fetch('/api/financial-profile',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível salvar.');status.textContent='Perfil financeiro salvo.';
    }catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
    body.append(form);
  }
  if(admin){document.addEventListener('rota-client-loading',()=>{sequence++;body.replaceChildren();});document.addEventListener('rota-consultation',e=>load(e.detail.client.id));}
  else load();
})();

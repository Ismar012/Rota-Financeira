'use strict';
const TYPES = Object.freeze({clt:'Emprego CLT', motorista:'Motorista de aplicativo', autonomo:'Profissional autônomo', empresa:'Empresa', outro:'Outra atividade'});
const CADENCES = Object.freeze({diario:'Diariamente', semanal:'Semanalmente', quinzenal:'Quinzenalmente', mensal:'Mensalmente', variavel:'Por serviço ou em datas variáveis'});
function normalize(value) {
  if (!value || !Array.isArray(value.activities) || !value.activities.length || value.activities.length > 5) throw new Error('Selecione entre uma e cinco atividades.');
  const activities = [...new Set(value.activities)];
  if (activities.some(x=>!Object.hasOwn(TYPES,x))) throw new Error('Atividade inválida.');
  if (!activities.includes(value.primary)) throw new Error('Escolha a atividade principal entre as selecionadas.');
  if (!Array.isArray(value.sources) || value.sources.length > 12) throw new Error('Cadastre no máximo doze fontes de renda.');
  const sources = value.sources.map(s=> {
    if (!s || typeof s.name !== 'string' || !s.name.trim() || s.name.trim().length > 80) throw new Error('Cada fonte precisa de um nome de até 80 caracteres.');
    if (!activities.includes(s.activity) || !Object.hasOwn(CADENCES,s.cadence)) throw new Error('Revise a atividade e a frequência das fontes.');
    return {name:s.name.trim(), activity:s.activity, cadence:s.cadence};
  });
  return {primary:value.primary,activities,sources};
}
module.exports={TYPES,CADENCES,normalize};

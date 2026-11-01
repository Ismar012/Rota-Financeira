(() => {
  'use strict';
  const defaults = {
    income: ['Salário', 'Benefício', 'Diária', 'Extra', 'Outros'],
    expense: ['Casa', 'Veículo', 'Lazer', 'Alimentação', 'Outros', 'Estudos']
  };
  let choices = {...defaults};
  let loading = null;
  function get(type) {return [...(choices[type] || choices.expense)];}
  async function load(force = false) {
    if (loading && !force) return loading;
    loading = (async () => {
      const response = await fetch('/api/finance/categories', {credentials:'same-origin',cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Falha ao consultar categorias.');
      if (!Array.isArray(data.categories?.income) || !Array.isArray(data.categories?.expense)) throw new Error('Catálogo de categorias indisponível.');
      choices = {income:data.categories.income,expense:data.categories.expense};
      document.dispatchEvent(new CustomEvent('rf-categories-loaded', {detail:{categories:choices}}));
      return choices;
    })();
    try {return await loading;} finally {loading = null;}
  }
  function fill(select,type,selected='Outros') {
    if (!select) return;
    const names = get(type);
    const previous = String(selected || 'Outros').trim() || 'Outros';
    select.replaceChildren(...names.map(x=>new Option(x,x)));
    if (!names.includes(previous)) select.add(new Option(previous+' (categoria anterior)',previous));
    select.value=previous;
  }
  window.RotaFinanceCategories = Object.freeze({get,load,fill});
})();

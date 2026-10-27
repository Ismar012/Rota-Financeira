# Alterações — abas financeiras e relatórios

## Navegação e ajuda
- Adicionada a opção **Reserva da Liberdade** à barra lateral.
- Mantido um único botão **Como usar esta tela** no rodapé da barra lateral. O tutorial considera a rota/aba atual, incluindo Despesas, Receitas, Metas e Relatórios.
- Atualizadas as versões de cache dos arquivos compartilhados e dos scripts alterados.

## Planejamento financeiro
- A página principal continua reunindo os recursos existentes: meta, ganhos, despesas, saldo, cadastro de ganhos/despesas, descansos, meta mensal e reserva.
- Adicionado **Baixar relatório geral** para exportar o relatório executivo consolidado.

## Despesas
- Criada visão dedicada a despesas do mês: pagas, pendentes e total do período.
- Gráfico de linha com a movimentação diária prevista/paga e gráfico por categoria.
- Tabela do mês com busca, filtro por situação e ações existentes de confirmar, desfazer e editar.
- Não há botão de relatório individual nesta aba.

## Receitas
- Criada visão dedicada a ganhos previstos, recebidos e total do mês.
- Gráfico de duas linhas (previstos e recebidos), gráfico por categoria/tipo e tabela com busca/filtro e ações de confirmação/edição existentes.
- Não há botão de relatório individual nesta aba.

## Metas
- Criada tabela do mês completo com meta diária, despesa prevista/paga, ganho previsto/recebido e situação do dia.
- A tabela é reconstruída com os dados atuais do planejamento após os eventos de atualização dos lançamentos.
- Adicionado botão **Baixar relatório de metas**. A configuração completa da meta permanece no Planejamento financeiro.

## Relatórios
- Criada aba com gráficos de evolução diária e distribuição por categoria/tipo.
- Adicionado botão **Baixar relatório geral**; não há relatórios separados nas abas Despesas ou Receitas.

## Resumo de casa e PDFs
- Adicionado botão para baixar o resumo da casa do mês escolhido.
- O relatório geral reúne o dashboard/planejamento, fluxo de caixa diário, composição da meta, gráficos de resultados, tabelas de despesas e receitas, categorias e resumo de casa.
- O relatório de metas contém a meta diária e a tabela diária do mês; o relatório do resumo de casa contém moradores, saldos, despesas, acertos e contas fixas.
- Para relatórios mensais, pagamentos/recebimentos confirmados usam a data efetiva; itens não confirmados usam o vencimento previsto.

## Validações
- Validada a sintaxe dos arquivos JavaScript.
- Conferidos os links estáticos referenciados nas páginas e a ausência de IDs duplicados nas páginas HTML verificadas.
- Gerados e renderizados PDFs sintéticos de exemplo para verificar estrutura e paginação.
- A integração real com o banco da aplicação não foi executada nesta sessão; testar os fluxos com uma base de teste antes de publicar.

# Rota Financeira — atualização visual da tela inicial

## O que foi aplicado

- Removidas da tela inicial a frase abaixo da saudação e a legenda superior “Organize suas finanças em um só lugar”.
- Cabeçalho simplificado para título da página, botão de notificações e saída.
- Acesso “Como usar esta tela” movido para a parte inferior da navegação lateral, logo após Configurações, com ícone de interrogação discreto.
- Resumo financeiro organizado em quatro cartões na mesma linha em telas largas, com quebra para duas ou uma coluna em larguras menores.
- Acessos rápidos apresentados em cartões com ícones, descrições e ações consistentes.
- Nova área “Pendências para confirmar” alimentada pelo resumo financeiro real da API, com acesso ao fluxo de confirmação existente para pagamentos e recebimentos.
- A largura do conteúdo central passou a aproveitar a área disponível após descontar a navegação lateral.
- As referências de CSS/JavaScript foram atualizadas para reduzir o risco de cache antigo.

## Integração de confirmação

Os botões de pagamento/recebimento levam ao planejamento com o ID do lançamento. O planejamento reutiliza o modal existente de confirmação de data efetiva; nenhuma nova chamada de gravação foi criada para a tela inicial.

## Validações realizadas

- `node --check` nos arquivos JavaScript alterados.
- Parse do CSS com `tinycss2`, sem erros de sintaxe.
- Verificação de IDs duplicados e de referências locais em `dashboard.html` e `planejamento.html`.
- Verificação dos nomes e versões dos arquivos CSS/JavaScript atualizados.

A captura automática em Chromium não foi concluída neste ambiente. Recomenda-se conferir visualmente no navegador local e testar a confirmação de um lançamento num ambiente conectado ao backend de teste antes de publicar.

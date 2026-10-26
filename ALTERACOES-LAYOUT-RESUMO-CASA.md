# Atualização de layout — navegação lateral e Resumo de casa

## O que mudou

- Incluída a navegação lateral responsiva na área do cliente, com Início, Planejamento financeiro, Despesas, Receitas, Resumo de casa, Metas e Relatórios, além de Configurações.
- Os atalhos de Despesas e Receitas abrem os lançamentos do planejamento já filtrados. Metas e Relatórios levam às respectivas áreas do planejamento.
- Ajustados largura útil, cabeçalhos e espaçamento das páginas de cliente para telas de notebook e computador. Em telas estreitas, a navegação vira uma barra compacta na parte inferior; em telas médias, vira uma faixa lateral de ícones.
- Redesenhada a página Resumo de casa sem trocar os IDs usados pela lógica existente de saldo, divisão, pagamentos, moradores, contas fixas e histórico.
- O cadastro individual de despesa agora abre em janela própria, acionado por “Lançar uma despesa”. O botão separado “Lançar em massa” abre uma tabela editável.
- A tabela em massa da casa permite descrição, valor, repetição, data/primeiro vencimento, situação e quem pagou. Só as linhas completas são enviadas; linhas incompletas ou com erro ficam na tabela para correção.
- “Registrar devolução” também abre uma janela própria. A edição de pessoas e a confirmação de pagamentos continuam disponíveis.

## Integração e preservação

- Reutilizados os endpoints atuais `/api/house`, `/api/house/recurring`, `/api/house/settle` e `/api/house/people`; não foi adicionada migração de banco.
- As despesas em massa são enviadas uma por vez, usando a API atual. Se uma linha falhar, as linhas já salvas não são revertidas automaticamente; a linha com erro permanece para correção.
- Os links da navegação apontam para páginas/áreas já existentes. Despesas, Receitas, Metas e Relatórios não passaram a ser páginas independentes.
- Os arquivos originais do cadastro de despesas em massa do planejamento foram preservados.

## Verificações feitas

- Verificada a sintaxe JavaScript de `app-shell.js`, `resumo-casa.js` e `planejamento.js`.
- Verificados IDs duplicados e referências a CSS/JavaScript inexistentes nas páginas principais da área do cliente.
- A navegação e os envios precisam ser confirmados também no ambiente de teste conectado à API e ao banco de dados da aplicação. Nenhuma publicação no GitHub/Render foi feita por esta atualização.

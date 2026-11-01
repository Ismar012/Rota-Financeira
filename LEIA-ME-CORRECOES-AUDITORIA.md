# Correções da auditoria — Rota Financeira

Este pacote parte do ZIP enviado pelo proprietário. A estrutura das páginas, o visual aprovado da abertura e os menus de três pontinhos foram preservados. Não houve publicação no Render nem alteração no banco de produção durante a preparação deste pacote.

## Correções incluídas

- Exclusão em massa com escolha de ganhos, despesas ou ambos e escolha entre mês e todo o histórico. Primeiro revisa quantidade, total e período; depois confirma em “Sim, excluir” ou cancela. O mês é a data efetiva dos confirmados e o vencimento dos pendentes. Registros da casa, descanso e reserva continuam vinculados aos seus módulos; o aviso explica isso.
- Na casa, limpeza por mês de vencimento das despesas e data das devoluções, ou de todo o histórico. Exclusão mensal mantém as outras ocorrências e a série; exclusão total encerra as séries incluídas.
- Transação de limpeza do Planejamento usa uma única conexão. A confirmação é recusada se a quantidade ou total mudou desde a revisão. Exclusões mensais de recorrências não são recriadas automaticamente.
- Cadastro em massa de ganhos reutiliza o formulário existente, com nome, categoria, valor e datas. As sugestões de categorias de ganhos incluem salário, corridas, serviços, vendas e renda extra; as de despesas foram mantidas.
- Categoria da casa no cadastro individual e em massa; edição de categoria de uma despesa já existente sem alterar pagamentos ou divisão. O gráfico usa pagamentos efetivos por categoria. A categoria da casa acompanha sua parte no Planejamento.
- Receitas mostra “Saldo inicial em conta”, sua data e composição, separado dos ganhos do mês. O saldo pode ser editado para zero. A configuração da base e dos prazos da meta volta a ficar acessível na aba Metas.
- Busca e filtro de situação são preservados ao retornar e após atualizar dados. Mês de cada tela e mês da casa são lembrados na sessão. O botão Voltar não manda para o login quando não há uma tela anterior; retorna ao Início. O histórico do Planejamento é identificado como consulta do mês.
- Ações de excluir também disponíveis nas tabelas de Receitas e Despesas; registros vinculados continuam sendo gerenciados na origem.
- Estados internos da meta são traduzidos. Dias de descanso não exibem exigência de produção. Metas históricas são identificadas; a limpeza em massa remove os registros de metas do período incluído, mantendo o histórico de auditoria das operações.
- Exportações geral e da casa: corrigida ambiguidade de colunas na consulta compartilhada. Falhas de exportação mantêm o cliente na tela. PDFs usam o fuso da Bahia, traços legíveis e título menor para evitar sobreposição.
- Serviços bloqueados não deixam os botões da casa disponíveis após a resposta de bloqueio.
- Correções de textos em ganhos e na primeira pessoa e tratamento de linhas vazias no cadastro da casa.
- Administrador: cartões de pedidos e permissões, identificação do cliente e serviço, data da solicitação, estado de acesso e ações de aprovar/recusar/liberar/retirar mais legíveis, com adaptação para telas estreitas. As funções continuam as mesmas.

## Instalação e atualização

1. Preserve sua cópia atual e o backup do banco antes de atualizar.
2. Substitua o código pelo conteúdo desta pasta. Preserve as variáveis de ambiente atualmente configuradas no Render.
3. Instale as dependências com `npm ci` e inicie com `npm start`, seguindo o fluxo habitual de publicação.
4. As colunas de categoria da casa e o controle de ocorrências excluídas são criados automaticamente na inicialização. Não há migração destrutiva das tabelas existentes.
5. Após publicar, recarregue a plataforma e refaça os testes com a conta de teste.

`node_modules` não acompanha o ZIP; a instalação recompõe as dependências a partir do arquivo de versões. Não há dados fictícios de teste adicionados ao banco de produção. A configuração original enviada no pacote não foi usada para conectar a produção durante os testes.

## Validação executada

`npm test` executa a aplicação com PostgreSQL embarcado (PGlite), dados fictícios e sessões locais. Os testes não se conectam ao Render. O simulador de telas usa JSDOM.

Foram aprovados: seleção mensal e manutenção do outro mês; isolamento de outro usuário; proteção de registros vinculados; revisão desatualizada recusada; categoria da casa e sincronização com Planejamento; edição da categoria; exclusão mensal da casa; geração dos três PDFs; saldo inicial em zero sem criar receita; preservação da recorrência após exclusão de um mês; idempotência de cadastro; descanso sem meta de produção; ganhos em massa; busca e filtro preservados; cancelamento da limpeza; campos da casa; cartões e aprovação de acesso pelo administrador.

Também foram realizadas checagens de sintaxe e inspeção da primeira página renderizada do PDF de Metas corrigido.

## Limites e próximos testes

Não é uma declaração de cobertura de 100%. O navegador remoto não alcançou o servidor local, portanto a revisão visual final em navegador real — inclusive celular, rolagem, modais e gráficos — precisa ser feita após a publicação. O banco isolado valida SQL e regras, mas não substitui o PostgreSQL do Render em rede nem testes concorrentes de produção. As permissões foram exercitadas em ambiente local; não foi conduzida uma auditoria de segurança completa.

Antes de liberar aos clientes: testar exclusão mensal e total com a conta de teste, abrir os três PDFs no Render, aprovar/recusar um serviço, navegar com filtros ativos e zerar o saldo inicial em Receitas. A conta publicada ainda pode conter o saldo inicial de R$ 1.000 mencionado na auditoria; este pacote permite editá-lo, mas não o altera automaticamente.

As sugestões de gestão central de categorias e de classificação pessoal/profissional no próprio cadastro continuam como evoluções opcionais. A classificação existente em Atividades e fluxo de caixa foi mantida; não foram introduzidas novas regras de cálculo para esses caixas.


## Reteste e ajuste de layout — 01/11/2026

O painel “Entender a meta e ajustar o planejamento” agora ocupa uma linha inteira após os quatro indicadores, preservando a grade do painel. O atalho de cadastrar descanso passou a abrir o formulário existente. Os menus de três pontos foram preservados. Arquivos estáticos receberam nova versão para evitar cache antigo.

Na versão publicada foram conferidos: ganhos e despesas em massa; edição e pagamento/desfazimento; preservação de filtros ao voltar; cancelamento e confirmação da exclusão; exclusão mensal preservando outros meses e parcelas futuras; categorias da casa e gráfico; acertos; descanso e cancelamento de reserva; downloads dos PDFs de Metas, geral e casa. Os três arquivos baixados eram PDFs válidos. A conta foi limpa e, após recarregar, ganhos, despesas, saldo e meta diária estavam zerados.

Os testes locais de integração e interface passaram, incluindo regressão da posição do painel e do atalho de descanso. A correção visual deste pacote ainda precisa ser publicada e revista no navegador; não foi aplicada automaticamente ao Render. A área real de administrador não foi validada nesta rodada pela conta de cliente; há testes locais de suas interações. Não é uma certificação de cobertura integral da plataforma.

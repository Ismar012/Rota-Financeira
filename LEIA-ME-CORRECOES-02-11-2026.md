# Rota Financeira — correções de 02/11/2026

Base: Rota-Financeira-categorias-administrador.zip. Original preservado separadamente.

Correções: sino abre notificações sem navegar; receitas com repetição única, diária, semanal, quinzenal e mensal nos dois cadastros; botões diretos de cadastro em massa em despesas e receitas; campos padronizados; caixas acima do menu; orientação resumida com “Saiba mais”.

Diária cria um lançamento por dia entre início e fim. Semanal repete a cada sete dias. Quinzenal segue dois dias fixos escolhidos por mês, igual às despesas. Cadastro não confirma recebimento. Séries de receitas continuam como receitas ao ampliar o horizonte. Encerrar repetição preserva recebimentos confirmados.

Notificações administrativas aproveitam a central existente. Clientes veem pendências do mês até hoje.

## Instalação

Preserve o código atual e faça backup recuperável do banco. Substitua os arquivos do projeto pelos deste pacote, mantendo variáveis de ambiente e configurações do Render. Faça deploy e atualize a página. Os arquivos alterados têm nova versão de cache.

## Validação

Passaram: npm test (integração PostgreSQL isolado/PGlite e interface JSDOM), node test/receitas-recorrentes.cjs e node test/ganho-fixo.cjs. Cobrem gravação, datas, continuidade, ausência de confirmação automática, categorias, exclusão, isolamento de usuários, despesas da casa, relatórios e saldo inicial. Na interface, seletor em massa, campos diário/quinzenal e sino sem navegação. Sintaxe JavaScript validada.

Não foi publicado nem alterado o banco de produção. A conferência visual real em desktop e celular após instalação permanece pendente: JSDOM verifica comportamento, mas não desenha as camadas. Cobrança não foi retestada nesta entrega.

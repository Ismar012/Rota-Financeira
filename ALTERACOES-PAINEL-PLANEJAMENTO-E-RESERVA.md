# Alterações — painel de planejamento e solicitação da Reserva da Liberdade

## Planejamento financeiro
- O painel principal passa a utilizar a largura útil depois da barra lateral, com limite generoso para monitores amplos.
- Meta diária, ganhos, despesas e saldo aparecem alinhados na mesma faixa em telas largas e se reorganizam em notebooks menores.
- As cinco ações rápidas ficam compactas e uniformes.
- Pendências passam a usar colunas para tipo, descrição, valor, vencimento e ações, mantendo os botões conectados aos handlers originais de confirmação/exclusão.
- Movimentação diária e despesas por categoria ficam lado a lado em telas amplas. O gráfico de categorias e sua tabela foram agrupados para usar melhor a largura do painel.
- As mudanças de layout são limitadas à aba principal do Planejamento Financeiro; as demais abas e o Resumo de casa não recebem o novo grid.

## Solicitação da Reserva da Liberdade
- A chamada para iniciar a Reserva abre um diálogo Sim/Não, sem redirecionar para Instagram ou WhatsApp; o texto de apoio também informa que o acesso depende da análise da solicitação.
- Ao responder Sim, é criada uma solicitação persistente no PostgreSQL; o cliente volta imediatamente ao Início e vê a mensagem “Sua solicitação foi enviada” por cerca de 3,6 segundos.
- Quando o pedido continua pendente, a página da Reserva mostra “Sua solicitação está sendo analisada”. Uma solicitação negada permite tentar novamente.
- O administrador passa a ver a quantidade de pedidos pendentes no sino administrativo (atualização periódica). Ao abrir a solicitação, um diálogo mostra nome, e-mail e data para liberar ou negar.
- A aprovação habilita a modalidade inicial de 50 valores e preserva qualquer cadastro anterior do desafio; o cliente passa pela tela de regras/aceite existente antes de iniciar o jogo.
- A tabela `challenge_access_requests` é criada automaticamente na inicialização do servidor, com estados pendente/aprovado/rejeitado e registro do administrador que decidiu.

## Validação e limites
- Foi verificada a sintaxe dos arquivos JavaScript alterados e a presença dos novos endpoints/IDs.
- O servidor exige `requireUser` para solicitações de clientes e `requireAdmin` para listar, notificar e decidir. As requisições de escrita continuam protegidas pela checagem de mesma origem existente.
- Não houve publicação no GitHub/Render. A verificação automatizada de navegador não concluiu neste ambiente. Ainda é necessário testar com banco de teste real, duas sessões distintas (cliente e administrador) e conferir a aparência visual no navegador antes de produção.

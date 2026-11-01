# Serviços por plano — 01/11/2026

A tela Meus serviços mostra planos ativos com validade, teste gratuito ou liberação manual, créditos avulsos e todos os serviços separados entre liberados e disponíveis para contratação. Consultoria liberada aponta para o agendamento. Novas contratações seguem para os planos e checkout InfinitePay, sem gerar pedido de aprovação manual.

Na administração, Planos e acessos dos clientes mostra o plano na seleção e sua validade no resumo. A consulta usa os dados completos do cliente e o identificador do serviço para calcular a mesma autorização usada pelo cliente. Liberações e revogações administrativas continuam disponíveis e têm precedência segundo as regras existentes.

O catálogo de benefícios e os valores foram mantidos. Premium e Parceiros incluem plataforma, planejamento, divisão da casa, consultoria e acompanhamento; Plataforma inclui as três ferramentas digitais; Mentoria mensal inclui acompanhamento. Consultoria diagnóstica e sessão de mentoria avulsas concedem um crédito cada. Os planos de compra agora mostram os serviços incluídos.

A confirmação continua exigindo payment_check da InfinitePay com success=true, paid=true e valor correto. Webhook ou retorno do checkout sem essa validação não liberam acesso. Mensalidades vencidas não mantêm os benefícios pagos; pagamento mensal não significa débito recorrente automático. Restrições administrativas continuam prevalecendo.

Clientes antigos liberados manualmente aparecem como Liberação manual: o sistema não inventa um plano Premium ou Parceiros sem registro de compra. O novo pacote não migra permissões antigas nem altera preços.

## Aplicação

Substitua o projeto no repositório usado pelo Render e faça o deploy, preservando suas variáveis de ambiente. Nenhuma nova variável é necessária. As mudanças deste pacote ainda não foram publicadas no serviço em produção.

Arquivos alterados: casa-produtos-api.js, server-pagamentos.js, servicos.html, servicos.js, servicos.css, planos.html, produtos-admin.html e produtos-admin.js. Teste novo: test/services-access.cjs.

## Validação

Passaram npm test, test/billing-access.cjs, test/billing-flow.cjs e test/services-access.cjs. Este último usa banco PostgreSQL isolado em memória, servidor HTTP e DOM, cobrindo os seis produtos, pagamento pendente e confirmado, duplicidade, expiração, concordância cliente/administrador, apresentação dos serviços, concessão e revogação manual e encaminhamento da contratação sem solicitação manual. A resposta externa da InfinitePay foi simulada; pagamento real e reativação em produção ainda exigem validação após o deploy.


## Correção adicional: cadastro em massa

O formulário do planejamento (ganhos e despesas, também nas telas Receitas e Despesas) ficava na camada 120, abaixo da navegação lateral na camada 1400. As janelas do planejamento agora ficam em 2000 e o cadastro em massa em 2100. Foi mantida a rolagem horizontal da tabela e habilitada a rolagem vertical da caixa quando necessária. O CSS recebeu versão nova no HTML para evitar cache antigo.

A outra tela com cadastro em massa é Resumo de casa. Ela usa dialog.showModal(), na camada superior nativa do navegador, e não precisa dessa alteração. As regras de cálculo e salvamento não foram modificadas.

O cadastro obrigatório de cartão sem cobrança inicial e assinatura após 30 dias NÃO foi implementado: a API atual da InfinitePay não fornece tokenização ou recorrência e não se integra ao produto Planos e Recorrência. Fonte: https://www.infinitepay.io/checkout-documentacao. O teste gratuito e o checkout existente continuam funcionando como antes. Uma integração própria de assinaturas com teste gratuito será necessária para esse segundo pedido.


## Pagamento avulso com validade de 30 dias e agenda de mentoria

A partir desta versão, novos pagamentos confirmados dos planos Plataforma (R$ 29,90), Premium (R$ 499,99), Parceiros (R$ 149,99) e Mentoria mensal (R$ 399,90) concedem exatamente 30 dias. Renovar antes do vencimento acrescenta 30 dias ao prazo vigente do mesmo plano; renovar depois inicia 30 dias da confirmação. Confirmações duplicadas não acrescentam prazo. Datas de acessos já concedidos não foram recalculadas retroativamente. Não há cartão salvo nem débito automático.

Consultoria diagnóstica (R$ 179,90) e Sessão de mentoria avulsa/extra (R$ 119,90) permanecem produtos de pagamento único com um crédito, sem mensalidade nem validade de 30 dias. O produto Mentoria mensal é distinto da sessão avulsa.

No retorno do checkout confirmado, a página encaminha para a agenda de consultoria ou mentoria conforme a compra, com link visível de continuidade. O cliente escolhe um horário e confirma: pagamento não reserva horário sozinho. A agenda exige disponibilidades cadastradas pelo administrador e antecedência mínima já existente de dois dias. Se o cliente não retornar do checkout, o serviço e o link da agenda ficam em Meus serviços após confirmação do webhook.

Mentoria e consultoria compartilham disponibilidades para evitar dupla reserva. Os registros identificam o tipo do atendimento para cliente e administrador. O crédito correto é reservado ao agendar e devolvido no cancelamento antes do início, inclusive se o administrador retirar a disponibilidade. A contratação avulsa permite agendamento mesmo sem plano ativo da plataforma. Mensalidades vigentes Premium/Parceiros e liberações administrativas seguem suas regras de autorização; Mentoria mensal libera o atendimento correspondente durante sua vigência.

A agenda recebe uma coluna service_slug com padrão consultoria; registros existentes são preservados. Os testes test/one-time-booking.cjs e test/services-access.cjs cobrem os novos fluxos em banco isolado: ambos os atendimentos avulsos, encaminhamento do pagamento, bloqueio do tipo errado e de uso sem crédito, cancelamento/reagendamento, duração exata e renovação antecipada idempotente. Também passaram os testes gerais de integração/UI e os testes anteriores de acesso e cobrança. Pagamento real em produção ainda não foi executado. Este pacote inclui as correções anteriores de serviços e sobreposição dos formulários e ainda requer deploy no Render.

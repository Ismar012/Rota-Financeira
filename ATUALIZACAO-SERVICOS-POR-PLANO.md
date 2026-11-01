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


## Revisão ao vivo de serviços — 01/11/2026

A conta de teste mostrou teste encerrado, sem assinatura ativa e sem créditos pagos disponíveis. Entretanto, consultoria e acompanhamento constavam como liberados: são permissões anteriores/extras que não estavam identificadas na tela. Não alteramos permissões dessa conta em produção. Todos os seis produtos aparecem na página de planos. O checkout de Consultoria diagnóstica abriu com R$ 179,90; nenhum pagamento foi realizado. A agenda não tinha horários disponíveis, impedindo testar uma reserva pela interface publicada.

O pacote agora identifica a origem do acesso em cada serviço (plano, crédito avulso, administrador ou liberação anterior). Foi retirado o aviso legado que ainda dizia que toda contratação dependia de aprovação. A página de planos recebe descrições do que está incluído e do que não está incluído. Ao vir de um serviço, as opções correspondentes aparecem primeiro e são identificadas; todos os produtos permanecem disponíveis.

Quando o atendimento não está contratado, a agenda bloqueia a seleção e apresenta link para consultar o valor e contratar o serviço adequado. O servidor continua impedindo agendamento sem permissão. O cálculo de autorização da agenda passou a usar a mesma fonte do catálogo, evitando mostrar um acesso anterior como liberado e depois exigir crédito indevidamente. Permissões administrativas e anteriores existentes são preservadas. O acesso pago exclusivamente à Plataforma não inclui consultoria ou acompanhamento; produtos de atendimento não incluem ferramentas da plataforma; Premium e Parceiros têm os cinco serviços do catálogo.

Passaram novamente os testes de integração/UI e a matriz de seis planos; também os testes de autorização, agendamento avulso, bloqueio de atendimento no plano Plataforma, liberação manual e a interface de oferta de contratação. Cenários com pagamento confirmado usam resposta simulada da InfinitePay. A versão deste pacote ainda precisa ser publicada; os resultados de produção e de testes isolados são distintos.


## Criar meu plano, desconto e Programa Parceiros — 01/11/2026

A página de planos foi reorganizada com listas verticais e ícones de marcação sob Serviços inclusos. Valores de planos de 30 dias exibem (mês) pequeno e dourado. Os preços existentes foram mantidos. Programa Parceiros recebeu destaque exclusivo, animação discreta desativada quando o usuário prefere movimento reduzido, todos os cinco serviços ilimitados, indicação de marketing compartilhado obrigatório e adesão sujeita à análise. Atendimentos continuam dependendo de horários disponíveis.

O novo cartão Criar meu plano começa em R$ 0,00 e abre um dialog nativo com duração de 1 a 12 períodos de 30 dias (30 a 360 dias), acesso opcional à plataforma e de 0 a 12 consultorias e sessões de mentoria por período. Não é possível contratar uma combinação vazia. O pagamento é único e antecipado para todo o período, sem cobrança automática. Consultoria usa R$ 179,90 por atendimento; sessão de mentoria usa R$ 119,90. Mentoria mensal e Premium prontos foram preservados como produtos distintos.

Ao escolher plataforma por dois períodos ou mais, o valor por período cai de R$ 29,90 para R$ 26,91 (10% fixos, não acumulativos). Dois períodos custam R$ 53,82; doze custam R$ 322,92. Não há desconto nos atendimentos. O resumo exibe um selo verde Você ganhou −10% na mensalidade!, valor original riscado, novo valor e economia total da parcela referente à plataforma. O selo desaparece ao voltar para um único mês ou retirar a plataforma. A seleção é recalculada no servidor e o servidor ignora totais enviados pelo navegador.

Após confirmação válida da InfinitePay, pedidos personalizados estendem o direito à plataforma pelo número de dias comprado, se esse componente estiver presente. Cada atendimento contratado gera um crédito separado: o primeiro lote é disponibilizado na confirmação e os seguintes a cada 30 dias. Créditos ainda não liberados não podem ser usados. Créditos não usados permanecem disponíveis. A tela Meus serviços mostra o cronograma dos créditos. Agendar reserva um crédito; cancelamento válido devolve o crédito; confirmação duplicada do mesmo pagamento não duplica prazo nem créditos. Configurações sem plataforma não concedem ferramentas digitais fora do teste gratuito ou de permissões administrativas preexistentes.

Solicitações de parceria são feitas sem cobrança na página de planos. Em Pagamentos e assinaturas o administrador pode aprovar ou recusar a análise; somente aprovação permite abrir checkout de Parceiros. Aprovação não libera os serviços sem pagamento. Direitos de planos Parceiros já pagos continuam preservados.

A correção de sobreposição do cadastro em massa do planejamento passou a usar um dialog nativo aberto por showModal(), na camada superior do navegador, em lugar de somente aumentar z-index. Resumo da casa já usava dialog nativo. Também foi corrigido o texto do botão de ganhos após salvamento parcial. O navegador de inspeção não alcançou o servidor local (conexão recusada); por isso o visual desta nova versão e a sobreposição devem ser conferidos após deploy.

Novos arquivos: planos.js, planos.css, server-plano-personalizado.js, test/custom-plan.cjs. As migrações adicionam custom_config em billing_orders, billing_session_credits e billing_partner_applications; não apagam dados. Levar o pacote completo ao repositório e fazer deploy no Render. Não há novas variáveis de ambiente. A tela de pagamentos administrativos recebeu a fila de análise de parcerias.

Validação: passaram npm test (integração e UI), test/custom-plan.cjs, test/services-access.cjs, test/booking-offer-ui.cjs, test/billing-access.cjs, test/billing-flow.cjs e test/one-time-booking.cjs. O teste personalizado cobre cálculo de 1, 2 e 12 meses, desconto não acumulado, quantidades inválidas/vazias, total adulterado, pagamento pendente/valor divergente, 60 dias, créditos disponíveis/futuros, duplicidade de pagamento, reserva/cancelamento, pacote somente de mentoria sem plataforma, aprovação prévia de Parceiros e selo verde que aparece/desaparece no DOM. A InfinitePay foi simulada; não houve pagamento real nem publicação desta versão.

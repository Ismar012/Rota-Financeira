# Integração InfinitePay — Rota Financeira (etapa inicial)

**Não foi feito deploy.** Este pacote altera uma cópia da plataforma em PostgreSQL e mantém os módulos financeiros anteriores. Não inclui chaves, bancos de dados ou histórico pessoal. Faça backup do projeto em produção e do banco antes de implantar.

## Render / ambiente

Configure (no backend):
- `INFINITEPAY_API_KEY`: a chave secreta já cadastrada no Render; nunca compartilhar ou incluir no front-end.
- `INFINITEPAY_HANDLE`: sua InfiniteTag, sem `$`.
- `PUBLIC_BASE_URL`: a URL HTTPS pública exata da plataforma, por exemplo `https://seu-servico.onrender.com` (sem barra final).
- `DATABASE_URL`: manter a variável PostgreSQL atual.

Habilite Checkout Integrado na InfinitePay. Não use endpoints do site `infinitypay.me`, que é outro serviço.

## Telas adicionadas

- `/planos.html` apresenta os preços fixados no servidor e leva ao checkout da InfinitePay.
- `/pagamento-retorno.html` solicita confirmação de um pagamento e apresenta o resultado.
- `servicos.html` ganha um link para contratação sem alterar o fluxo anterior de solicitações e permissões administrativas.

## API adicionada

- `GET /api/billing/catalog` — preços e modalidades;
- `POST /api/billing/checkout` — cria pedido e link de pagamento para usuário autenticado; payload `{ "plan":"premium" }`;
- `POST /api/webhooks/infinitepay` — recebe eventos e confere no `/payment_check` antes de dar acesso (a InfinitePay não assina os webhooks);
- `POST /api/billing/verify` — confirmação no retorno de checkout (exige usuário dono do pedido);
- `GET /api/billing/status` — assinaturas e datas vigentes do usuário.

## Valores

- Plataforma: R$ 29,90/mês;
- Consultoria diagnóstica: R$ 179,90 avulso;
- Sessão avulsa/extra: R$ 119,90;
- Mentoria mensal: R$ 399,90/mês;
- Premium: R$ 499,99/mês;
- Programa Parceiros: R$ 149,99/mês.

Para planos mensais, o código acumula mais um mês a cada pagamento aprovado, com dia âncora inicial igual ao dia do cadastro do usuário. No mês sem aquele dia, usa o último dia e volta ao dia original nos meses posteriores. O código **não cria cobranças automaticamente**, nem captura/salva cartões.

## Ativação e alertas

Ao receber confirmação de pagamento no servidor, atualiza pedidos, direitos mensais e permissões. Premium e Parceiros liberam os produtos existentes `plataforma`, `planejamento`, `divisao-casa`, `consultoria`, `acompanhamento`. Plataforma libera sua área financeira e divisão de casa. Sessões avulsas não liberam um mês de acesso. Clientes com uma assinatura de plataforma/Premium/Parceiros já registrada e sem nenhuma vigente ficam bloqueados nas APIs protegidas, mas podem entrar novamente para renovar via `/planos.html`. Autorizações manuais preexistentes são preservadas, exceto bloqueio por vencimento da assinatura paga de acesso à plataforma.

### Limitações importantes antes de homologar

1. Não existe cobrança recorrente automática com o Checkout Integrado; o cliente precisa pagar um novo link em cada renovação. Implementar lembretes e geração de cobrança agendada é um passo separado.
2. A data âncora do cadastro do cliente é preservada; quando o pagamento acontece após o vencimento, começa nova competência de um mês. Validar se esta é a política comercial pretendida.
3. Não há mecanismo de estorno/revogação automática de direitos nem agendamento automático de reuniões por pagamento; eventos de reembolso precisam de acompanhamento administrativo antes de produção.
4. Não há ambiente sandbox InfinitePay: a confirmação ponta a ponta exige um teste real de pequeno valor em ambiente de homologação controlado, e conferência do valor exato, período de acesso e logs. Não execute pagamentos de produção apenas para testar sem preparar isso.
5. A versão integrada veio de `Rota-Financeira-layout-corrigido.zip` no Library; verifique se corresponde à versão em produção antes de substituir arquivos no Render. **Não substituir cegamente a base em produção.**
6. Nos serviços existentes, o botão "Solicitar contratação" ainda envia pedidos administrativos. O fluxo de pagamento novo está na página "Planos e pagamentos". Essa separação preserva as regras atuais.

## Validação necessária

- Implantar primeiro numa instância/branch de homologação vinculada a banco próprio.
- Confirmar credenciais e URL HTTPS nas variáveis, sem registrar ou enviar a chave.
- Testar usuário em período gratuito, cliente vencido, permissões e acesso Admin.
- Testar pagamento com comprovante válido, webhook repetido, retorno repetido e tentativa forjada; nunca liberar apenas pelo redirect.
- Conferir integridade das páginas e do painel financeiro após implantação.

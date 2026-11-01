# Rota Financeira — controle de assinaturas, 1º/nov/2026

## Atenção: pacote para HOMOLOGAÇÃO

Esta cópia preserva os arquivos do projeto usado no último checkout e acrescenta o controle de acesso por mensalidade. NÃO substitua diretamente o serviço Render antes de criar um backup do código e uma cópia recuperável do PostgreSQL. Nenhum banco de dados do usuário foi acessado ou modificado durante a preparação deste pacote. As migrações são executadas automaticamente na inicialização, quando você publicar esta versão.

## 1. O que mudou

- `server-acesso.js`: decisão de acesso centralizada, baseada em vencimento real do pagamento confirmado, 30 dias gratuitos e concessões explícitas do administrador.
- `server-pagamentos.js`: validação de pagamento com a InfinitePay por `payment_check`, valores definidos no servidor, processamento idempotente, pedidos e mensalidades, créditos avulsos de consultoria/mentoria, listagem administrativa.
- `server.js`: preserva a sessão de clientes vencidos para permitir renovação e protege operações financeiras no backend; status atual é exibido também ao administrador.
- `casa-produtos-api.js`: direitos pagos deixam de depender de `user_services`/`product_permissions` persistidos para sempre. Administração usa uma tabela separada de permissões manuais.
- `agendamentos-api.js`: o pagamento único de consultoria concede 1 crédito, consumido quando a reserva é confirmada; um cancelamento válido devolve o crédito. Premium/Parceiros vigentes e concessões manuais continuam com tratamento próprio.
- `renovar.html`, `acesso-cliente.js`, `login.html`, `planos.html`, `pagamento-retorno.html`: acesso vencido, direcionamento para renovação, estado atual da assinatura e consulta da confirmação de pagamento.
- `pagamentos-admin.html`: novos pedidos e consumo manual de créditos da mentoria avulsa após atendimento concluído. Link acessível na administração.

## 2. Regras essenciais

- **Teste gratuito**: 30 dias a partir da criação da conta; últimos cinco dias identificados como `trial`.
- **Assinatura mensal**: direito válido até `expires_at`; vencimento bloqueia APIs financeiras mesmo se a antiga tabela de serviços mostrar permissões pagas antigas. O cliente mantém sessão e dados e pode renovar.
- **Renovação antecipada**: acrescenta um mês ao vencimento ainda válido; duas confirmações do mesmo pedido NÃO somam dois meses. O dia original de vencimento é preservado quando possível (dia 31 ajustado ao fim do mês curto).
- **Assinatura Premium ou Parceiros**: libera plataforma, planejamento, despesas da casa, consultoria e acompanhamento enquanto vigente.
- **Mentoria mensal avulsa**: concede acesso apenas a acompanhamento; não libera ferramentas financeiras se o plano de plataforma venceu. Cliente mantém acesso à tela de serviços.
- **Consultoria diagnóstica avulsa**: 1 crédito por pagamento confirmado, reservado ao criar um agendamento; cancelamento antecipado elegível devolve o crédito.
- **Sessão de mentoria avulsa**: 1 crédito liberado e marcado como utilizado pelo administrador após a sessão, na tela de pagamentos. Sem controle de agenda específico para mentoria ainda.
- **Suspensão administrativa** (`inadimplente`/`cancelado`): prevalece sobre planos e créditos. `pagante` manual é uma concessão explícita para a plataforma; não reativa benefícios Premium vencidos automaticamente.
- **Permissões de produto**: concessões e revogações administrativas novas são independentes das mensalidades. Períodos vencidos não apagam lançamentos.
- **Pagamentos**: chegar ao Pix, retornar ao navegador ou receber webhook NÃO é confirmação; a autorização exige uma resposta `paid=true` do endpoint oficial `/payment_check` com pedido e valor conferidos.
- **Renovações**: pagamento manual pela InfinitePay; não há débito recorrente automático no checkout implementado.

## 3. Instalação no Render

1. Faça o backup RECUPERÁVEL do PostgreSQL e preserve o pacote anterior do código. Se houver clientes reais, use antes uma instância de teste com um banco separado.
2. Abra a pasta do projeto e substitua os arquivos por esta versão (mantenha o mesmo layout/estrutura; não remova outros arquivos). Faça commit e deploy no serviço Web Service.
3. Confira no Render as variáveis **já existentes**: `DATABASE_URL`, `ADMIN_EMAIL`, `SESSION_SECRET`, `INFINITEPAY_API_KEY`, `INFINITEPAY_HANDLE`, `PUBLIC_BASE_URL`. Não publique nem compartilhe as chaves.
4. Aguarde o status `Live` e confira os logs de inicialização, em especial os comandos de criação de tabelas. Se houver erro de migração, interrompa a publicação e revise os logs, sem alterar manualmente dados dos clientes.
5. Em ambiente de teste, passe pelos cenários listados abaixo antes de ativar na plataforma pública.

### Migrações automáticas

Criam `billing_manual_service_grants`, `billing_legacy_status_audit`, `billing_one_time_credits` e índices. Nenhum dado financeiro é apagado. O código antigo marcava `users.billing_status='pagante'` sem expiração; para usuários que POSSUEM pagamentos de mensalidade registrados em `billing_entitlements`, essa marca antiga é documentada em `billing_legacy_status_audit` e retirada **uma única vez** para evitar acesso eterno. Status `pagante` atribuído manualmente a clientes sem assinatura registrada é mantido, mas deve ser auditado pela administração. Operações futuras do administrador são mantidas.

### Consultas opcionais de auditoria (somente leitura)

```sql
SELECT u.id,u.name,u.email,u.billing_status,e.plan_code,e.expires_at
FROM users u LEFT JOIN billing_entitlements e ON e.user_id=u.id
WHERE u.role='client' ORDER BY u.id,e.plan_code;

SELECT * FROM billing_legacy_status_audit ORDER BY migrated_at DESC;

SELECT o.id,o.user_id,o.plan_code,o.status,o.amount_cents,o.paid_at
FROM billing_orders o ORDER BY o.created_at DESC LIMIT 50;
```

## 4. Checklist de homologação obrigatória

1. Cliente gratuito novo abre ferramentas e visualiza dias restantes.
2. Cliente com 30 dias gratuitos encerrados **consegue entrar**, vê a tela de renovação e não consegue chamar diretamente endpoints financeiros.
3. Um checkout PIX *gerado mas não pago* não libera serviços.
4. Pagamento REAL de teste de um dos planos: webhook de aprovação, confirmação `/payment_check`, `billing_orders.status='paid'`, vencimento futuro em `billing_entitlements` e acesso reaberto.
5. Enviar o mesmo webhook novamente: não prolonga o vencimento.
6. Vencer artificialmente uma assinatura apenas no **banco isolado de teste**: bloquear planejamento, preservar dados e manter renovação disponível.
7. Renovar antes do vencimento: adicionar um mês ao vencimento anterior (não a partir do dia em que foi pago).
8. Administrador: liberar, revogar, suspender e restaurar acesso; verificar se o painel reflete a permissão efetiva.
9. Cliente só com mentoria mensal: ter acompanhamento, mas não planejamento financeiro sem assinatura correspondente.
10. Comprar consultoria avulsa, agendar uma vez, tentar uma segunda reserva (sem crédito) e cancelar a primeira (devolução).
11. Comprar mentoria avulsa, registrar conclusão em Pagamentos e conferir crédito consumido.
12. Conferir preservação de lançamentos e arquivos financeiros antes/depois de suspender e renovar.

## 5. Testes executados nesta preparação

- `node --check` dos módulos alterados: OK.
- `node test/billing-access.cjs`: OK, testes isolados de regras de acesso, permissões legadas e datas especiais.
- `node test/billing-flow.cjs`: OK, simulação de pedido pendente, valor incorreto, confirmação válida e webhook repetido.
- **Não executados**: integração em PostgreSQL real, webhook externo real, renderização integral em navegadores e pagamento confirmado na conta InfinitePay. O `npm ci` necessário para o teste integrado local não completou no ambiente de preparação.

## 6. Limites e ações operacionais

- A InfinitePay declara que o webhook simples não tem assinatura: o código confirma avisos mediante `payment_check` antes de conceder acesso. Conferir documentação oficial: https://www.infinitepay.io/checkout-documentacao.
- Estorno/refund e chargeback não são cancelados automaticamente pelo fluxo de pagamento aprovado. Faça conciliação com o extrato da InfinitePay; quando necessário, suspenda o acesso no administrador e documente o motivo. Não confie cegamente em webhook de estorno sem verificação autenticada do provedor.
- Esta atualização NÃO cria débito automático ou emissão periódica de cobrança, e não implementa agenda/consumo automático das sessões de **mentoria**; o crédito da mentoria avulsa é baixado pela administração. Isso exige uma etapa específica de produto e operação para ficar totalmente automático.
- Se a publicação falhar, retorne ao código anterior e ao backup coerente do banco. Não exclua tabelas novas manualmente, pois podem conter pagamentos já efetuados.

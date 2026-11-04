# Rota Financeira — edição e casa compartilhada

## Alterações

- Editar ganho ou despesa permite marcar **Ganho recebido** / **Despesa paga**, escolher a data efetiva e salvar tudo em uma operação. Desmarcar retorna a previsto. O vencimento original é mantido separado da data efetiva.
- Em Resumo de casa, **Editar** agora altera descrição, categoria, valor, vencimento, pagamento e quem pagou. A edição modifica somente a parcela selecionada; não reescreve toda uma série.
- **Convidar pessoa** usa o e-mail de uma conta já cadastrada. O convite gera um código individual de oito dígitos, exibido apenas para quem convida, com aviso de não compartilhá-lo com qualquer pessoa. Nenhum e-mail é enviado: o convite aparece na plataforma da pessoa ao atualizar a página.
- Código válido por cinco minutos, verificados pelo servidor. Cinco tentativas incorretas bloqueiam o convite. Reenviar invalida o convite anterior da mesma pessoa. Códigos são guardados como hash e vinculados à conta convidada. Convites aceitos não precisam ser validados novamente.
- Quem já participa pode convidar outra pessoa para a mesma casa. Os vínculos existentes continuam válidos; um novo convite não refaz as confirmações anteriores.
- Os participantes podem cadastrar, editar, excluir, confirmar pagamentos e registrar acertos da mesma casa. Não recebem acesso às receitas e despesas pessoais dos demais. No planejamento individual, cada conta recebe somente sua parte da despesa compartilhada.
- **Divisão** mostra os percentuais de cada morador: por padrão 50% / 50% para duas pessoas; para mais pessoas, partes iguais com ajuste de centésimos. É possível ajustar de 0% a 100%, com soma obrigatória de 100%. Os valores em dinheiro são distribuídos em centavos sem perda de total.
- Mudanças de divisão valem para novos lançamentos e contas fixas futuras ainda não pagas. Lançamentos anteriores mantêm a divisão já registrada. Ao adicionar uma nova pessoa (sem substituir um morador cadastrado), a divisão fica igual entre os moradores e pode ser ajustada em seguida.

## Como usar

1. Abra **Resumo de casa** e clique em **Convidar pessoa**.
2. Informe o e-mail cadastrado. Se a pessoa já consta em Pessoas da casa, selecione seu nome em **Vincular a**. Escolha Nova pessoa apenas para acrescentar outro morador.
3. Compartilhe o código somente com essa pessoa. Ela atualiza a página e informa o código em até cinco minutos.
4. Após validar, ambos passam a acessar a mesma casa. Os demais moradores já vinculados continuam vinculados.
5. Em **Divisão**, ajuste os percentuais e salve.

## Históricos e limites

Uma conta participa de uma casa compartilhada por vez, com até 20 moradores. Contas já vinculadas a outra casa ou que já possuam lançamentos próprios da casa não são unidas automaticamente. A aceitação é bloqueada nesses casos para não misturar históricos, saldos e divisões desconhecidos. Os registros são preservados. Esta atualização não inclui migração entre casas nem remoção de contas vinculadas pelo cadastro de nomes.

O acesso continua dependendo dos serviços e da situação de assinatura de cada usuário. Um convite não libera planos nem substitui a autenticação.

## Instalação

O ZIP original enviado foi mantido intacto. Esta entrega é uma cópia atualizada do projeto, sem node_modules.

1. Guarde um backup do banco de produção antes de atualizar.
2. Substitua os arquivos do projeto e mantenha as variáveis atuais de ambiente, especialmente DATABASE_URL e SESSION_SECRET.
3. Execute `npm install` e reinicie com `npm start`. No Render, publique o código atualizado pelo fluxo habitual.
4. A inicialização cria as tabelas de vínculos e convites e ajusta a unicidade das projeções da casa para permitir uma parte financeira por usuário. Não é necessário executar SQL manualmente.
5. Atualize o navegador com Ctrl+F5. Não restaure um banco antigo sobre o atual para instalar esta atualização.

## Validação executada

`npm test` cobre a divisão em centavos para 2 a 20 pessoas, edição atômica de ganhos/despesas, datas futuras inválidas, autorização por usuário, privacidade dos lançamentos pessoais, divisão 60/40, confirmação por outro morador, terceiro participante sem revalidar os anteriores, expiração, cinco tentativas, uso do código por outra conta, reutilização idempotente, edição/exclusão compartilhadas, contas fixas, percentuais zero e migração de dados existentes.

Os testes de integração usam o motor PostgreSQL embarcado PGlite, com sessões e rotas HTTP reais. O bloqueio consultivo de PostgreSQL é simulado nessa suíte; a concorrência com múltiplas conexões de produção não foi reproduzida. A suíte DOM usa jsdom para os formulários e pop-ups. A verificação visual em navegador real e a publicação no Render não foram realizadas nesta sessão.

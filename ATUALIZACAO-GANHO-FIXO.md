# Inclusão de ganhos fixos mensais — Rota Financeira

- No cadastro individual de ganhos: campo **Tipo de ganho**, com **Ganho avulso** e **Ganho fixo (mensal)**.
- No cadastro em massa de ganhos: mesmas duas opções em cada linha.
- Um ganho fixo cria o primeiro lançamento e três previsões futuras, a cada mês no dia definido; dias 29/30/31 ajustam-se para o último dia do mês curto.
- As próximas previsões são renovadas automaticamente pela mesma rotina de horizonte já usada para despesas fixas, por usuário, enquanto a série estiver ativa.
- Recebimentos NÃO são confirmados automaticamente, e cada confirmação tem a sua própria data efetiva.
- Para impedir que uma previsão mensal fique distribuída desde o primeiro cadastro, a data inicial de cada ocorrência futura de ganho fixo começa no dia seguinte à previsão anterior.
- O botão **Encerrar repetição** de ganhos fixos interrompe a geração futura, remove previsões não recebidas da ocorrência selecionada em diante e preserva ganhos já confirmados.
- Editar um ganho fixo altera a ocorrência selecionada; não modifica toda a série. Para alterar o valor das próximas previsões, encerre a série anterior e cadastre a nova para os meses desejados.
- Categorias, despesas, integração de pagamentos, assinaturas e dados existentes foram preservados. Não foi criada nova migração de banco de dados.
- A alteração ainda precisa ser publicada no servidor e confirmada com uma conta de testes e banco persistente antes de ser considerada homologada.

# Ajustes de abas e Reserva da Liberdade

## Abas financeiras
- Os blocos gerais do Planejamento (meta diária, cartões de ganhos/despesas/saldo e atalhos) permanecem na aba Planejamento financeiro.
- Nas visões de Despesas, Receitas, Metas e Relatórios, os elementos irmãos do conteúdo específico são ocultados também com `display:none!important`. Isso evita que regras visuais dos cartões sobreponham o atributo HTML `hidden` e façam os blocos reaparecerem no fim da página.
- O botão geral do cabeçalho é ocultado nessas visões para evitar duplicação; o botão próprio de baixar relatório continua na aba Relatórios. O link de Atividades e fluxo de caixa continua na navegação existente.
- A tela Resumo de casa não foi alterada nesta revisão.

## Reserva da Liberdade
- Quando o usuário ainda não tem modalidade liberada, a tela apresenta uma chamada para iniciar a Reserva da Liberdade e um link para falar com a equipe.
- Enquanto o acesso estiver bloqueado, as regras operacionais, dados, formulários e histórico do jogo ficam ocultos.
- Quando a equipe libera uma modalidade, a página volta a mostrar o fluxo normal de aceite, participação e acompanhamento.

## Navegação
- Os links de retorno no Desafio, Atividades e Importação foram reduzidos a um botão discreto com seta, mantendo nome acessível e dica de contexto.

## Validação
- Sintaxe JavaScript conferida com `node --check` nos arquivos alterados.
- HTML verificado quanto a IDs duplicados.
- Integridade do ZIP conferida com `unzip -t`.
- Não houve publicação no GitHub ou Render. A confirmação visual e a integração com o banco de dados real devem ser feitas em ambiente local/de teste.

# Ajustes globais de navegação, suporte e marca

## Navegação nas telas autenticadas

- Padronizados os controles no cabeçalho das nove telas da área do cliente: sino, **Voltar** e **Sair**, com aparência compacta e consistente.
- O botão **Voltar** usa uma pilha de navegação por sessão para retornar à rota interna anterior. Quando não há rota anterior registrada, retorna à tela de login. Links externos e links abertos em nova aba não são incluídos nessa pilha.
- O botão **Sair** encerra a sessão pela rota existente `/api/auth/logout` e limpa a pilha de navegação da sessão.
- O sino aparece uma única vez em cada tela do cliente. Nas telas secundárias ele leva às pendências de confirmação da página inicial; na tela inicial, leva diretamente à seção de pendências.
- A tela de agendamento de consultoria passou a usar o mesmo cabeçalho e controles globais.

## Central de suporte

- Adicionado o item **Falar com o suporte** logo abaixo de **Como usar esta tela** na navegação lateral.
- O modal apresenta duas opções: atendimento via WhatsApp usando o contato já configurado no projeto e uma lista de dúvidas frequentes.
- As respostas cobrem preços dos serviços, reativação de plano, agendamento de consultoria, recuperação de senha, lançamento de ganhos/despesas, relatórios, Reserva da Liberdade e Resumo de casa.
- Cada resposta permite abrir a área correspondente quando aplicável e inclui o link sublinhado **Falar com a equipe**.
- A central é responsiva e pode ser fechada pelo botão, clicando fora ou com `Esc`.

## Marca RF

- Criado o novo recurso `marca-rf.png` a partir do conceito visual do monograma RF.
- A marca é usada no símbolo do menu lateral da área do cliente e na barra superior administrativa; o nome **ROTA FINANCEIRA** continua em texto separado, sem alterar o nome da marca.

## Notificações administrativas

- Incluídos o sino e a pilha de navegação nas quatro telas administrativas: painel, agendamentos, desafios e produtos.
- O sino consulta `/api/admin/reserva-liberdade/notificacoes`; ao abrir, lista solicitações pendentes de `/api/admin/reserva-liberdade/solicitacoes`.
- Ao selecionar uma solicitação, o administrador vê o nome/e-mail do cliente e pode escolher **Não liberar** ou **Sim, liberar acesso**. A decisão é enviada à rota existente `/api/admin/reserva-liberdade/solicitacoes/:id/decisao` com `rejected` ou `approved`.
- A interface usa texto seguro para os dados do cliente e atualiza a lista/contador depois da decisão.

## Arquivos principais

- `app-shell.js` e `app-shell.css`: controles de navegação, suporte, FAQ, logo e responsividade do shell do cliente.
- `admin-shell.js` e `admin-shell.css`: cabeçalho administrativo e notificações da Reserva da Liberdade.
- `dashboard.html`, `planejamento.html`, `resumo-casa.html`, `atividades.html`, `importacao.html`, `servicos.html`, `perfil.html`, `desafio.html` e `agendamento.html`: referências da versão atualizada do shell.
- `admin.html`, `agendamentos-admin.html`, `desafio-admin.html` e `produtos-admin.html`: referências da barra administrativa.
- `marca-rf.png`: recurso visual do monograma.

## Validações realizadas

- `node --check` em todos os arquivos JavaScript do projeto.
- Análise sintática de 21 arquivos CSS, sem erros identificados.
- Inspeção de 13 páginas HTML, sem IDs duplicados ou recursos locais ausentes identificados.
- Teste de DOM no navegador headless: presença dos controles nas nove telas do cliente e nas quatro administrativas; abertura da FAQ e exibição de resposta; listagem de solicitação e fluxo de decisão administrativa; conferência da posição dos botões de suporte em uma largura móvel.
- Os testes de interface utilizaram respostas de API simuladas. Não foi feito teste de integração com o banco de dados real nem publicação no GitHub/Render.

# Correção do painel de notificações — Rota Financeira

Atualização pontual sobre a versão com o botão **Agendar consultoria** na navegação lateral.

- A lista de notificações administrativas inserida nas telas financeiras agora é montada no nível do `body`, fora do cabeçalho e do seu contexto de empilhamento.
- O painel recebe uma camada própria superior ao menu lateral.
- A abertura calcula a posição do painel e limita sua largura e altura à área visível (desktop, tablet e celular).
- O painel fecha ao clicar fora ou ao pressionar **Esc**, retornando o foco ao acionador nesse último caso.
- O painel reposiciona ao rolar ou redimensionar a janela; não foram alteradas rotas de agenda, cobranças ou permissões.

## Arquivo funcional alterado

`agendamentos-menu.js` (apenas apresentação/interação do pop-up de notificações).

## Verificações

Sintaxe JavaScript validada com `node --check`. Testes isolados de interface com Chromium/Playwright passaram em 1440px, 1024px, 768px, 390px e 320px: abertura, camada acima do menu, limites de tela, fechamento por **Esc** e clique fora. Esses testes usaram respostas simuladas (não acessaram dados de clientes). Após publicar, valide com uma conta administrativa na plataforma real.

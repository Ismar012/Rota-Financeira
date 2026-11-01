# Rota Financeira — botão Agendar consultoria no menu lateral

- Incluído **Agendar consultoria** logo abaixo de **Início**, em todas as páginas do cliente que compartilham o menu lateral.
- Botão destacado em dourado, com ícone de calendário. Ao abrir a área de agendamento, a navegação marca o item como atual.
- Em celulares, o botão aparece entre os primeiros atalhos da navegação inferior; em tablets, o ícone continua acessível.
- A página existente `/agendamento.html?service=consultoria` é preservada.
- **Nenhuma permissão foi alterada.** Clientes sem direito ao serviço continuam com o agendamento bloqueado e recebem o acesso à contratação, conforme o código já existente.
- Nenhuma alteração em regras financeiras, pagamentos, assinaturas, preços, banco de dados ou APIs.
- `app-shell.js` e `app-shell.css` receberam novo parâmetro de versão nas páginas que os carregam para atualizar os arquivos no navegador.

## Publicação

Substitua o projeto mantendo as variáveis e o banco de dados atuais. Depois valide o menu lateral em uma conta com consultoria ativa e outra sem consultoria adquirida.

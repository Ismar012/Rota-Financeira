ROTA FINANCEIRA — RELATÓRIO EXECUTIVO PDF

Esta versão mantém o layout e as funcionalidades financeiras existentes e corrige a exportação do relatório do cliente.

CORREÇÕES:
- O botão “Baixar relatório” inicia o download diretamente.
- O relatório é um PDF real, sem janela de impressão.
- O arquivo é nomeado automaticamente no formato:
  Relatorio_NomeDoCliente_YYYY-MM.pdf
- O download funciona mesmo quando o cliente não possui movimentações.
- O relatório começa na data de cadastro do cliente e vai até a data atual.
- O resumo mês a mês contém somente os meses dentro dessa janela.
- Meses sem movimentação permanecem no resumo com valores zerados.
- Todas as movimentações dentro da janela são apresentadas.
- O relatório possui formato executivo, com visão geral, indicadores, resultado positivo/negativo, resumo mensal, movimentações e dias de descanso.
- Somente administrador pode acessar a rota do relatório.

INSTALAÇÃO:
1. Mantenha seu arquivo rota_financeira.sqlite atual.
2. Substitua os arquivos do projeto pelos arquivos deste pacote.
3. Configure ADMIN_EMAIL conforme o arquivo CONFIG_ADMIN.txt.
4. Reinicie o servidor.
5. Entre com a conta administradora.
6. Abra um cliente e clique em “Baixar relatório”.

NÃO SUBSTITUA:
- rota_financeira.sqlite

O ZIP não contém banco de dados.

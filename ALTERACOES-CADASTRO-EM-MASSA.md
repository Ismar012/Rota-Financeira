# Alteração: cadastro de despesas em massa

## Onde acessar
No planejamento financeiro, clique em **Cadastrar despesa** e, dentro do formulário, escolha **Cadastrar em massa**.

## Como funciona
- A tabela permite preencher várias despesas em linhas e colunas, sem planilha.
- Cada linha tem nome, valor, tipo, categoria, data do cadastro e data de pagamento.
- Para despesas parceladas, aparece o número de parcelas; para quinzenais, aparece o segundo dia fixo.
- Linhas vazias são ignoradas. Linhas iniciadas, mas incompletas, não são gravadas e ficam na tela para terminar depois.
- Linhas completas são enviadas uma a uma usando a API existente da plataforma. Se uma linha falhar, os dados dela ficam preservados para revisão.
- O atalho de planilha foi removido da navegação principal. A página antiga foi mantida no projeto por compatibilidade, mas não aparece como opção principal.

## Teste e segurança
A interface e o fluxo de envio no navegador foram testados com uma API simulada: linhas completas são enviadas, linhas incompletas ficam pendentes e despesas parceladas carregam o número de parcelas.

O projeto continua usando o backend e o banco já configurados para a plataforma. Para testar a gravação ponta a ponta sem afetar dados reais, use uma base PostgreSQL de teste e variáveis de ambiente próprias; não reutilize credenciais de produção. O pacote de entrega não inclui `.env`, banco local ou `node_modules`.

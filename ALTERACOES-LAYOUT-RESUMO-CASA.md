# Ajustes de layout — Rota Financeira

## Esta revisão

- A tela “Resumo de casa” voltou à organização que já existia no projeto: título e descrição no conteúdo, três indicadores, acerto entre os moradores e duas colunas para ações e movimentações.
- Os formulários longos não ficam mais abertos permanentemente na página. “Lançar uma despesa”, “Lançar em massa” e “Registrar devolução” são botões compactos que abrem seus próprios diálogos.
- O cadastro em massa continua disponível, com tabela editável, validação de linhas e manutenção das linhas que precisam ser completadas.
- Os diálogos de despesa, devolução, pagamento e moradores foram preservados. A lógica e os endpoints existentes em `resumo-casa.js` não foram substituídos nesta revisão.
- A identidade visual foi aproximada da versão original da Rota Financeira: fundo preto, dourado da marca, cartões sólidos, bordas discretas e tipografia Arial/Helvetica.
- A navegação lateral permanece disponível com Início, Planejamento financeiro, Despesas, Receitas, Resumo de casa, Metas, Relatórios e Configurações. O nome da marca é mantido como texto, acompanhado de um símbolo simples de evolução financeira, sem o monograma fictício anterior.
- A largura máxima foi ajustada para 1180 px e os pontos de quebra empilham as colunas quando não há largura útil suficiente, considerando o espaço reservado à navegação lateral.

## Arquivos principais

- `app-shell.css` e `app-shell.js`: navegação lateral, cabeçalho e larguras responsivas.
- `casa-layout.css`: estilos finais para a tela de casa, carregados depois das folhas globais para evitar conflitos de tipografia.
- `resumo-casa.html`: estrutura principal de volta ao arranjo original e diálogos para as ações.
- `resumo-casa.js` e `casa-produtos.css`: lógica de cadastro e estilos auxiliares, incluindo cadastro em massa.

## Validação e limites

- Todos os arquivos JavaScript passaram por `node --check`.
- Verifiquei a unicidade dos IDs de `resumo-casa.html` e confirmei que os elementos referenciados por `resumo-casa.js` estão presentes.
- As regras CSS editadas têm chaves balanceadas e os caminhos locais principais foram verificados.
- Uma captura visual automatizada do Chromium não pôde ser concluída neste ambiente. A gravação real e o comportamento com dados precisam ser confirmados executando o projeto com o backend e um banco de teste configurados.
- Nenhuma alteração foi publicada no GitHub ou no Render.

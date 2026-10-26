AJUSTES DE RESPONSIVIDADE — ROTA FINANCEIRA

Objetivo
Fazer com que a área central acompanhe a largura disponível da janela, considerando a barra lateral, sem mudar a identidade visual nem a lógica de cadastro e cálculo.

O que foi ajustado
- Os contêineres principais do planejamento, início, atividades, serviços/perfil e resumo de casa usam a largura útil restante após o menu lateral, com margens fluidas e um limite máximo maior para monitores amplos.
- O conteúdo deixa de ficar limitado a 1.180 px quando há espaço horizontal sobrando.
- Em notebooks com área útil menor, o cabeçalho e o seletor de mês podem quebrar linha, o painel de acompanhamento empilha quando necessário e as grades de cartões mudam de quantidade de colunas.
- No Resumo de casa, as ações, os indicadores, as contas fixas e as movimentações se reorganizam para evitar colunas excessivamente estreitas.
- Campos, imagens e componentes internos respeitam a largura dos contêineres. A navegação lateral permanece e as tabelas extensas conservam sua própria rolagem horizontal quando necessária.
- A referência de versão do app-shell.css foi atualizada para evitar que o navegador continue usando a folha de estilos anterior em cache.

O que não foi alterado
- Não houve alteração deliberada dos endpoints, banco de dados, fórmulas ou validações de negócio.
- Nenhuma publicação foi feita no GitHub ou no Render.

Validação executada
- Conferência da integridade do pacote ZIP.
- Verificação de balanceamento de chaves na folha CSS.
- Verificação de sintaxe dos arquivos JavaScript com Node.js.
- Verificação de que as páginas HTML incluídas referenciam a nova versão da folha de estilos.

Observação
A captura visual automatizada não foi concluída neste ambiente. Recomenda-se abrir localmente em pelo menos 1366×768, 1024×768 e uma janela estreita para confirmar o resultado com os dados reais da aplicação.

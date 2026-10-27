# Atualização da área administrativa — Rota Financeira

## Visão geral da consultoria
- Mantida a visão da carteira com indicadores de clientes e busca.
- Menu global de três pontos com as ações administrativas em ordem alfabética: Acompanhar agendamentos, Configurações, Relatórios e Solicitações do produto.
- Menu individual de cada cliente com ações em ordem alfabética, incluindo exportação do relatório em PDF, gerenciamento de produtos e histórico de alterações.
- Configurações continuam no rodapé da navegação lateral; suporte foi removido da navegação administrativa.

## Análise individual do cliente
- Mantidas a posição financeira confirmada, recebimentos e pagamentos do mês, obrigações da meta, valor que falta produzir, meta diária e projeção dos três meses seguintes.
- Gráfico de movimentação diária e gráfico de despesas pagas por categoria ficam lado a lado, adaptando-se à largura disponível.
- Adicionado botão explícito **Exportar relatório do cliente**, conectado ao endpoint de PDF já existente (`/api/admin/clients/:id/report?month=...`).
- Mantido o histórico de alterações e as ações administrativas existentes.

## Navegação administrativa e notificações
- Barra lateral unificada nas páginas de administração, com Visão da consultoria, Clientes, Solicitações do produto, Acompanhar agendamentos e Relatórios; Configurações fica na parte inferior.
- Cabeçalho único com marca e um único sino de notificações ao lado dela. Os botões Voltar e Sair permanecem compactos à direita.
- O script legado de menu de agendamentos não inicializa nas páginas administrativas, evitando a criação de um segundo sino.
- A navegação acompanha as páginas visitadas na sessão e oferece retorno para a área administrativa/login quando não existe rota anterior interna.

## Relatórios
- Nova página para selecionar um cliente e mês, visualizar um resumo e exportar o relatório financeiro ou o histórico de alterações.
- A análise do cliente pode ser aberta diretamente a partir da página de relatórios.

## Agendamentos
- Calendário mensal com todos os dias, contagem dos agendamentos e nome/horário no detalhe de cada dia.
- Mantidos o cadastro de disponibilidade, consulta de agendamentos e ações de cancelamento/controle de visualização.

## Validação realizada
- Todos os arquivos JavaScript passaram por `node --check`.
- Os 20 documentos HTML foram analisados: sem IDs duplicados e sem referências locais ausentes de JavaScript, CSS ou imagens.
- Os CSS modificados passaram por uma checagem básica de delimitadores.
- O endpoint de exportação de relatório do cliente foi localizado no backend e preservado.

## Limitações do teste
- A captura visual automatizada do navegador não concluiu neste ambiente; por isso, a checagem não substitui um teste visual no navegador real.
- Antes da publicação, testar com uma conta administrativa real e o banco de dados de teste: exportação de PDF, abertura de um cliente, filtros por mês, notificações, atualização dos pedidos e agendamentos.
- Não foram incluídos arquivos `.env`, credenciais ou banco de dados local no pacote.

# Rota Financeira — categorias administráveis

## O que muda

- Nova área administrativa: `Gerenciar categorias`, acessível pelo menu lateral do administrador, pelas Configurações e pelo menu de mais opções da Visão da Consultoria.
- Somente administrador autenticado pode registrar uma nova categoria de ganho ou despesa.
- Listas compartilhadas com os clientes nos formulários individual e em massa do Planejamento, inclusive o Resumo da Casa e edição de categorias existentes.
- Categorias iniciais de ganhos: Salário, Benefício, Diária, Extra, Outros.
- Categorias iniciais de despesas: Casa, Veículo, Lazer, Alimentação, Outros, **Estudos**.
- Catálogo persistido em nova tabela PostgreSQL `finance_category_catalog`, criada e preenchida automaticamente ao iniciar o servidor.
- APIs: `GET /api/finance/categories` para cliente autenticado, `GET/POST /api/admin/finance-categories` apenas para administrador.
- Categorias inexistentes não podem ser inventadas por clientes via formulário, API ou importação Excel. O valor histórico é mantido caso o cliente edite um lançamento antigo sem trocar de categoria.

## Instalação

1. Faça cópia de segurança do projeto e do banco de dados antes da atualização.
2. Publique **todos os arquivos desta versão juntos**. Evite atualizar só `categorias-admin.html`: a validação depende de `server.js`, `server-catalogo-categorias.js` e dos scripts de interface.
3. Confirme a variável `DATABASE_URL` e as configurações administrativas existentes; nenhuma credencial nova é necessária.
4. Reinicie a aplicação para a criação automática da nova tabela de categorias.
5. Acesse a área administrativa > **Gerenciar categorias**, e cadastre uma categoria de teste.
6. Abra o Planejamento/Resumo da Casa em uma aba atualizada para confirmar as novas categorias. Se a página estava aberta antes da atualização, recarregue-a.

## Validação local

- Sintaxe de JavaScript validada via `node --check`.
- Testes isolados de catálogo e permissão: `node test/category-catalog.cjs` (sem dependências externas).
- O teste de integração completo com banco e interface requer instalação das dependências (`npm ci`) e execução em ambiente de homologação; não foi realizado nesta preparação.

## Importante

Nenhuma alteração foi publicada no GitHub ou Render; o ZIP é o pacote para publicação. A migração adiciona uma tabela, sem apagar nem reclassificar lançamentos existentes.

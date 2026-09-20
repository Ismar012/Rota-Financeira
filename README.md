# Rota Financeira — autenticação real

## Requisitos
- Node.js 22.5+ (recomendado Node 22 LTS ou superior)

## Rodar localmente
1. Abra o terminal nesta pasta.
2. Execute: `node server.js`
3. Abra: `http://localhost:3000`

O banco `rota_financeira.sqlite` será criado automaticamente.

## O que já está funcionando
- Cadastro de usuário.
- Validação de nome, e-mail e senha.
- Senha armazenada com hash `scrypt` + salt, nunca em texto puro.
- Login real.
- Sessão persistente por cookie HttpOnly.
- Sessões armazenadas no SQLite e com expiração.
- Logout.
- Proteção básica contra excesso de tentativas por IP.
- Área do cliente protegida por autenticação.

## Antes de publicar
- Defina `NODE_ENV=production`.
- Defina `SESSION_SECRET` com um valor aleatório longo.
- Publique atrás de HTTPS.
- Configure backup e controle de acesso ao arquivo SQLite.
- Para produção em escala, migrar o banco para PostgreSQL é recomendável.
- Adicionar recuperação de senha por e-mail, verificação de e-mail, termos/privacidade e controles de LGPD antes de uso comercial.

## Observação
O sistema agora é funcional no backend. O próximo módulo pode ser a área financeira do cliente: receitas, despesas, metas, dashboard e serviços contratados.

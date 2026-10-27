# Atualização visual — Rota Financeira

## O que foi alterado

- `index.html`: reformulação visual da página inicial, preservando os destinos principais de navegação.
- `login.html`: reformulação visual do acesso, mantendo o endpoint `POST /api/auth/login`, o formato do envio (`email` e `password`), a chave de sessão `rotaShowFinanceReminder` e o redirecionamento para `dashboard.html`.
- `mascote-experiencia.css`: estilos novos, isolados pelas classes `rf-home` e `rf-login`; as demais páginas continuam utilizando o visual existente.
- `mascote-interacoes.js`: movimento do corpo inteiro conforme o cursor, inclinação 3D suave, mudança de pose em áreas interativas e resposta ao foco/preenchimento dos campos do login.
- `mascotes/`: quatro imagens usadas nas transições de pose (apresentação, apontando, anotando e OK).

## O que não foi alterado

Não foram alterados `server.js`, banco de dados, APIs, painel, dashboard, planejamento, agenda, cadastro, perfis, produtos ou as demais funcionalidades da plataforma. `styles.css` também foi mantido intacto; a nova aparência é aplicada apenas a `index.html` e `login.html`.

## Como aplicar a atualização

Se for aplicar manualmente no servidor, copie/substitua apenas `index.html` e `login.html`, adicione `mascote-experiencia.css` e `mascote-interacoes.js` na raiz pública do projeto e adicione a pasta `mascotes/` com os quatro PNGs. Não substitua `server.js` nem arquivos do banco por causa desta atualização visual.

O movimento acompanha o cursor em computadores. Em dispositivos com preferência por movimento reduzido, as animações contínuas são reduzidas para maior conforto.


## Correção de legibilidade e carregamento do mascote (versão 2)

- Ampliada a tipografia em textos auxiliares, rótulos, campos e botões, somente na página inicial e no login.
- As imagens do mascote passaram para WebP com transparência e menor peso.
- O script agora contém imagens de contingência incorporadas: se a pasta `mascotes/` não estiver disponível no servidor, a personagem ainda aparece.
- A animação continua usando as quatro poses e o acompanhamento do cursor; as regras de CSS permanecem limitadas às classes da página inicial e do login.
- Para publicar, é recomendável enviar o ZIP completo. Se atualizar arquivo a arquivo, substitua `index.html`, `login.html`, `mascote-interacoes.js` e `mascote-experiencia.css`. A pasta `mascotes/` também deve ser enviada para usar os arquivos WebP otimizados; se ela faltar, o script já possui imagens de contingência incorporadas.

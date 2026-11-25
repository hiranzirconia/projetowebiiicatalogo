# Catálogo Musical — Frontend

Interface em **HTML, CSS e JavaScript puro (Vanilla JS)** para o backend do Catálogo Musical.

## Estrutura

```
frontend/
├── index.html   → estrutura da página (busca, favoritos, login)
├── styles.css   → visual moderno, responsivo e com tema escuro
├── app.js       → consumo da API, estados de loading/erro e interações
└── README.md
```

## Como executar

O backend já serve esta pasta com `app.use(express.static("frontend"))`. Não é preciso criar link simbólico nem copiar arquivos.

```bash
cd /home/hiran/Documentos/projeto
node server.js
```

Abra **http://localhost:3000**.

Frontend e API ficam na mesma origem, então o cookie de sessão do Google funciona e o redirecionamento pós-login (`/?login=success`) cai direto na aplicação.

> Não abra o `index.html` via `file://` nem em outra porta: o cookie de sessão não seria enviado e o login não funcionaria.

## O que o frontend consome

| Ação | Requisição |
| --- | --- |
| Login | redireciona para `http://localhost:3000/auth/google` |
| Status da sessão | `GET /api/status` |
| Logout | `GET /api/logout` |
| Buscar músicas | `GET /api/search?termo=...` |
| Listar favoritos | `GET /favoritos` (exige login) |
| Salvar favorito | `POST /favoritos` com `{ musicaId, titulo, artista, album, capa }` (exige login) |

Todas as chamadas `fetch` passam por um único wrapper (`api()`) que adiciona **`credentials: "include"`** e trata erros de rede/servidor com mensagens amigáveis na interface (toasts e estados de erro com botão de tentar novamente).

## Recursos da interface

- Busca com skeletons de carregamento, estado vazio e mensagem de erro com retry.
- Cards com capa em alta resolução, título, artista, álbum e botão de favoritar.
- Aba “Meus favoritos” com contador, atualização manual, estado vazio e estado “entre para ver seus favoritos”.
- Login com Google: mostra foto, nome, e-mail e botão de sair quando autenticado.
- Ao sair, a lista e o contador de favoritos são limpos no navegador.
- Layout responsivo (desktop, tablet e celular), navegação por teclado nas abas e suporte a `prefers-reduced-motion`.
- Feedback por toasts para sucesso, erro e informações.

## Favoritos por usuário

- O `userId` **não** é enviado pelo frontend. O backend usa o usuário da sessão (`req.user.id`).
- `GET /favoritos` e `POST /favoritos` respondem `401` quando não há login.
- A mesma música não é salva duas vezes pelo mesmo usuário (índice único `userId + musicaId`).
- Favoritos antigos gravados sem `userId` não aparecem para nenhum usuário. Se existirem, podem ser removidos do MongoDB.

## Mudanças feitas no backend

Para o fluxo completo funcionar, foram feitos ajustes pequenos e localizados:

- `server.js`: `app.use(express.static("frontend"))` para servir esta pasta.
- `server.js`: rotas de favoritos passam por `requireAuth` e chamam funções novas no **final do arquivo** (`criarFavorito`, `listarFavoritos`, `fazerLogout`).
- `server.js`: `/api/logout` agora destrói a sessão e limpa o cookie.
- `favoritos.js`: campos `album` e `capa` adicionados ao schema e índice único por `userId + musicaId`.

Login com Google, sessão, busca no iTunes, `/api/status` e `/api/profile` continuam com a mesma lógica.

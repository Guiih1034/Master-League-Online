# Deploy no Vercel

## Aviso importante (persistência)
Este projeto usa SQLite (`node:sqlite`) em arquivo local. No Vercel, o filesystem serverless é **efêmero**: dados podem ser perdidos em cold start/redeploy/instância nova. Para uso real, migre para Postgres (Vercel Postgres/Neon/Supabase).

## Configuração atual
- `vercel.json`: roteia `/api/*` para `api/[...path].js`, que carrega o Express (`server/index.js`).
- `outputDirectory`: `public` (frontend estático).
- DB padrão no Vercel: `/tmp/liga.db` (ou `DB_PATH`).
- Seed automático: se `players_base` estiver vazio, `server/db.js` importa `FC26_20250921.csv`.

## Variáveis de ambiente
- `DB_PATH` (opcional): caminho SQLite. Em Vercel, default `/tmp/liga.db`.
- `PLAYERS_FILE` (opcional): default `./FC26_20250921.csv`.
- `SEED_GAME` (opcional): default `fc26`.
- `NODE_ENV=production`
- `HTTPS=1` em produção.

## Deploy
1. Instale Vercel CLI: `npm i -g vercel`
2. Na pasta APP: `vercel` (preview) / `vercel --prod` (produção)
3. Configure env vars no dashboard se necessário.

## Limitações no Vercel
- SQLite efêmero em `/tmp`: não é banco durável.
- SSE (`/api/events`) e timers em memória não são confiáveis entre instâncias serverless.
- Leilões/timers dependem de requisição/processo ativo; para produção, usar cron/queue + DB persistente.

## Checklist de bugs
- Validar login/sessão/cookie em HTTPS.
- Validar seed automático no primeiro request (pode demorar).
- Validar imagens proxy (`/api/img/*`).
- Confirmar que `FC26_20250921.csv` está incluído no deploy.

## E-mail de verificação
- Cadastro exige confirmação de e-mail antes do login.
- Configure `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Sem SMTP, o link de verificação é logado no servidor e retornado como `devVerifyLink` (apenas para dev).

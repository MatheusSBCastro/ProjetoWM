# Projeto WM

MVP web responsivo para gestão de alunos, professores, treinos e consultoria premium.

## Executar

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Contas de demonstração (senha `123456`):

- `aluno@wm.com`
- `professor@wm.com`
- `master@wm.com` — acesso completo

Os dados são criados em `data/database.json`. Em produção, defina `JWT_SECRET`, use HTTPS e substitua o arquivo JSON por PostgreSQL.

## Deploy seguro na Vercel

Conecte um PostgreSQL ao projeto e configure estas variáveis em **Settings → Environment Variables**:

- `DATABASE_URL`: URL SSL do PostgreSQL.
- `JWT_SECRET`: segredo aleatório com pelo menos 32 bytes.
- `ADMIN_EMAIL`: e-mail do primeiro administrador.
- `ADMIN_PASSWORD`: senha inicial forte, com pelo menos 12 caracteres.

O primeiro acesso cria a estrutura e o ADM inicial. Depois de confirmar o login, remova `ADMIN_PASSWORD` das variáveis da Vercel. O deploy recusa iniciar o banco em memória na Vercel e não contém credenciais públicas de demonstração.

## Funcionalidades incluídas

- Login com perfis de aluno, professor e administrador
- Check-in duplo antes da liberação do treino
- Treinos com exercício, séries, repetições, descanso e GIF
- Avaliação opcional da aula
- Visão hierárquica professor → alunos
- Área Consulting WM com treino, dieta e exportação para PDF

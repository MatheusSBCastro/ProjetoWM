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

## Vercel

O projeto é detectado automaticamente como Express. Configure `JWT_SECRET` nas variáveis de ambiente da Vercel. No deploy de demonstração, os dados rodam em memória e podem ser reiniciados; conecte PostgreSQL antes de usar dados reais.

## Funcionalidades incluídas

- Login com perfis de aluno, professor e administrador
- Check-in duplo antes da liberação do treino
- Treinos com exercício, séries, repetições, descanso e GIF
- Avaliação opcional da aula
- Visão hierárquica professor → alunos
- Área Consulting WM com treino, dieta e exportação para PDF

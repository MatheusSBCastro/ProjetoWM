# Gym Moviment

MVP web responsivo para gestão de alunos, professores, treinos e consultoria premium.

## Executar

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Contas de demonstração (senha `123456`):

- `aluno@wm.com`
- `professor@wm.com`

O ADM acessa pelo portal ADM usando somente a palavra-chave `matheusemiguel`.
Nos cadastros de alunos e professores, o administrador define login e senha (mínimo de 6 caracteres). Contas anteriores sem login próprio continuam usando o e-mail como login.

Os dados locais ficam em `data/database.json`.

## Deploy na Vercel

Conecte um PostgreSQL e configure `DATABASE_URL` em **Settings → Environment Variables**. O primeiro acesso cria o ADM. Não é necessário configurar `ADMIN_EMAIL`, `ADMIN_PASSWORD` ou `JWT_SECRET`. As sessões expiram após duas horas e são persistidas no banco.

## Funcionalidades incluídas

- Login com perfis de aluno, professor e administrador
- Check-in duplo antes da liberação do treino
- Treinos com exercício, séries, repetições, descanso e GIF
- Avaliação opcional da aula
- Visão hierárquica professor → alunos
- Área Consulting WM com treino, dieta e exportação para PDF

## Google e aprovação de professores

O primeiro acesso com Google cria automaticamente o perfil com nome e e-mail da conta verificada. Alunos entram diretamente, sem professor vinculado e sem Consulting liberado. Professores recebem o aviso de solicitação enviada e aguardam aprovação do ADM antes de acessar o app. Entradas seguintes reutilizam o perfil existente. Uma conta não troca de perfil ao selecionar outro portal.

Cadastros feitos anteriormente pelo ADM também podem entrar com Google usando o mesmo e-mail. O vínculo automático a um cadastro existente aceita Gmail e Google Workspace; para e-mails de outros provedores já cadastrados, use login e senha. Perfis criados pelo Google não recebem uma senha padrão.

Cada novo login de professor, por Google ou senha, gera uma solicitação em **ADM → Aprovações**. O professor aguarda sem acesso às APIs protegidas. O ADM pode aprovar ou recusar; a tela do professor consulta a decisão automaticamente. A solicitação expira após 15 minutos. Uma aprovação libera somente aquela sessão por até duas horas; recarregar uma sessão aprovada mantém o acesso, mas sair e entrar novamente exige nova aprovação. Sessões antigas de professor precisam de um novo login. Alunos não precisam dessa aprovação.

Para ativar o botão Google:

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/) e configure o Google Auth Platform (nome do app, público e contatos).
2. Crie um cliente OAuth do tipo **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas**, informe `http://localhost:3000` e o endereço HTTPS definitivo do app, sem caminho. O fluxo usa o botão com callback JavaScript, sem rota de redirecionamento.
4. Configure `GOOGLE_CLIENT_ID` no servidor com o ID que termina em `.apps.googleusercontent.com`. Na Vercel, adicione a variável ao ambiente e faça novo deploy. Não é necessário segredo de cliente para este fluxo.
5. Se o projeto Google estiver em teste, adicione as contas de teste permitidas. O primeiro login no app cria o perfil automaticamente.

O ID público deste projeto está configurado em `google-client.json`, usado tanto localmente quanto na Vercel. O segredo do cliente não é utilizado nem armazenado. A variável `GOOGLE_CLIENT_ID`, quando definida, substitui esse valor; um valor vazio desativa o Google.

Localmente, execute `npm.cmd start`. Para substituir o ID no PowerShell, use `$env:GOOGLE_CLIENT_ID = 'SEU_ID.apps.googleusercontent.com'` antes de iniciar. Na Vercel, publique a versão atualizada para carregar essa configuração e a integração.

Referências: [botão Google](https://developers.google.com/identity/gsi/web/guides/display-button) e [validação no servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Execute `npm test` para verificar os fluxos de autorização com banco isolado e verificação Google simulada. A validação com uma conta Google real requer o ID de cliente configurado.

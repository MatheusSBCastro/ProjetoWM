# Gym Moviment

MVP web responsivo para gestão de alunos, professores, treinos e consultoria premium.

## Testes no navegador com Playwright

No PowerShell, dentro da pasta `ProjetoWM`:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Os testes abrem o site real com um servidor e banco em memória exclusivos para cada teste, reutilizando `tests/auth-fixture.js`. Não é necessário iniciar `npm start`; os testes não leem nem alteram `data/database.json` e não usam PostgreSQL. O login Google fica desativado durante esses testes.

São verificados a troca de perfil, senha inválida, login e saída do aluno, persistência da sessão, check-in e solicitação, cancelamento, aprovação e recusa de entrada do professor. A execução inclui Chromium em computador e emulação de celular.

```powershell
npm.cmd run test:e2e:browser  # Acompanhar no navegador de computador
npm.cmd run test:e2e:ui       # Interface interativa dos testes
npm.cmd run test:e2e:report   # Relatório da última execução
```

Os testes ficam em `tests/e2e/acesso.spec.js` e a configuração em `playwright.config.js`. `npm test` continua executando os testes existentes da API.

## Visual e animações

O visual usa grafite, dourado, cartões claros e uma ilustração vetorial local. As animações incluem abertura em sequência, movimento do objeto da entrada, resposta dos cartões ao mouse, transições entre telas e revelação de cartões durante a rolagem. `public/premium.css` concentra o acabamento visual; `public/motion.js` controla as transições.

A entrada permite pausar as animações e guarda essa escolha no navegador. A preferência do sistema por movimento reduzido também é respeitada. O objeto animado pausa quando fica fora da tela ou quando a aba está em segundo plano.

```powershell
npm.cmd run test:visual -- minha-rodada
npm.cmd run test:motion
```

A auditoria usa dados isolados e captura 45 telas de aluno, professor, ADM e Consulting em 1440, 390 e 360 pixels. Ela verifica erros de JavaScript, conteúdo fora da tela, botões sem nome e problemas que o axe consegue detectar automaticamente nas regras WCAG A/AA. As capturas e o relatório ficam em `.visual-audit/minha-rodada`; o vídeo das animações fica em `.visual-audit/motion/gym-moviment-motion.webm`.

`tests/e2e/visual.spec.js` também verifica a entrada entre 360 e 1440 pixels, pausa das animações, movimento reduzido, navegação por teclado e acessibilidade da entrada e painel do aluno. Essas verificações automáticas não substituem uma avaliação completa de acessibilidade.

## Executar

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Contas de demonstração (senha `123456`):

- `aluno@wm.com`
- `professor@wm.com`

O ADM acessa pelo portal ADM usando a chave privada definida em `ADMIN_KEYWORD`. Configure uma chave aleatória de 16 a 256 bytes em `.env` localmente ou nas variáveis de ambiente do servidor. O Node 24 carrega o arquivo `.env` local ao iniciar. Sem uma chave válida, o acesso ADM fica bloqueado. O arquivo `.env` não deve ser enviado ao Git. A troca da chave invalida as sessões ADM anteriores.
Nos cadastros de alunos e professores, o administrador define login e senha (mínimo de 6 caracteres). Contas anteriores sem login próprio continuam usando o e-mail como login.

Os dados locais ficam em `data/database.json`.

## Segurança

Consulte [SECURITY-REVIEW.md](SECURITY-REVIEW.md) para as correções, evidências, validações e a pendência de configuração do Strix. `tests/security.test.js` e `tests/e2e/seguranca.spec.js` verificam a chave ADM privada, isolamento dos alunos, permissão Consulting e liberação dos exercícios pela API após os check-ins.

## Deploy na Vercel

Conecte um PostgreSQL e configure `DATABASE_URL` e uma chave privada aleatória `ADMIN_KEYWORD` em **Settings → Environment Variables**. O primeiro acesso cria o ADM. Não é necessário configurar `ADMIN_EMAIL`, `ADMIN_PASSWORD` ou `JWT_SECRET`. As sessões expiram após duas horas e são persistidas no banco. As contas de demonstração são exclusivas do banco local; o banco inicial da Vercel não as inclui.

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

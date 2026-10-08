# Revisão de segurança — Gym Moviment

Data: 8 de outubro de 2026.

## Resultado e alcance

Foram aplicadas correções de autorização, credenciais e validação, além da atualização de duas dependências vulneráveis. Esta revisão usou leitura do código, reproduções HTTP em um banco isolado, `npm audit` e Playwright. **O pentest do Strix não foi executado.**

O clone do Strix está disponível, mas a máquina não possui seu executável, Docker funcional ou modelo configurado. Também não há uma conta Strix Cloud autenticada. A escolha entre ambiente local configurado e Cloud foi solicitada ao usuário e permanece pendente. Nenhum código ou dado foi enviado ao Strix Cloud.

Os testes automatizados usam bancos em memória, tokens e chaves exclusivos de teste. Não executam ataques contra terceiros nem usam o banco real. A verificação final do servidor local criou e encerrou uma sessão ADM temporária, sem exibir a chave ou os dados do painel.

## Problemas corrigidos

| Problema | Evidência e efeito anterior | Correção |
| --- | --- | --- |
| Chave ADM pública e fixa | A chave presente no código e README obtinha uma sessão administrativa (`200`). | `ADMIN_KEYWORD` privada no ambiente; acesso bloqueado sem configuração válida; comparação com tempo constante; sessões ADM vinculadas à chave atual. |
| Check-ins de outros professores | O dashboard de um professor retornava presenças de alunos vinculados a outro professor. | Filtro pelos alunos atualmente vinculados ao professor autenticado. |
| Bloqueio do treino somente na interface | Antes dos dois check-ins, a API retornava todos os exercícios ao professor, apesar do bloqueio visual. | A API retorna uma lista de exercícios vazia até a confirmação do aluno e do professor atual. |
| Consulting sem permissão | Um aluno com `consulting: false` recebia seu plano existente pela API. | O servidor verifica a permissão atual antes de retornar o plano. |
| IDs de outros alunos em fichas compartilhadas | As fichas retornavam todos os alunos associados ao mesmo modelo de treino. | A resposta expõe somente IDs dentro do acesso autorizado: os alunos do professor ou o próprio aluno. |
| Confirmação de um professor anterior | A troca de responsável preservava o check-in do professor anterior. | A troca reinicia a confirmação do professor daquele dia e exige o novo responsável. |
| Truncamento de senha pelo bcrypt | Uma senha com mais de 72 bytes era aceita se os primeiros 72 bytes correspondessem à senha cadastrada. | O login rejeita senhas acima de 72 bytes antes da comparação, seguindo o limite já usado no cadastro. |
| Validação de avaliações | Valores não numéricos eram salvos; notas fracionadas passavam pela validação. | Apenas notas inteiras entre 1 e 5 são aceitas. Este ponto é uma falha de validação de dados. |
| Dependências vulneráveis | `npm audit` identificou `proxy-addr@2.0.7` como crítico e `qs@6.15.3` como moderado. | Atualização no lockfile para `proxy-addr@2.0.8` e `qs@6.16.0`; auditoria posterior sem vulnerabilidades conhecidas. |

A classificação crítica de `proxy-addr` vem do advisory da dependência. Não foi confirmado um exploit desse pacote neste aplicativo: o servidor não configura `trust proxy`. O resultado zerado de `npm audit` se limita aos advisories conhecidos das dependências e não comprova ausência de falhas no aplicativo.

Uma ficha compartilhada contém os mesmos exercícios para todos os alunos associados. O professor recebe o conteúdo desse modelo quando pelo menos um aluno autorizado completa ambos os check-ins; a interface continua indicando a liberação individual de cada aluno. O aluno continua podendo consultar suas próprias fichas antes dos check-ins, conforme o comportamento do produto.

## Validação

- Antes das correções, os sete testes iniciais de regressão reproduziram os problemas e falharam com respostas indevidas.
- `npm.cmd test`: 23 testes da API passaram, incluindo 11 testes de segurança e validação.
- `npm.cmd run test:e2e`: 24 testes Playwright passaram em Chromium para computador e celular, incluindo recusa da chave antiga e bloqueio/liberação dos exercícios pelo servidor.
- `npm.cmd run test:visual -- security-fixes`: 45 telas, sem erros JavaScript, extravasamento horizontal, botões sem nome ou violações detectadas pelo axe nas regras WCAG A/AA selecionadas.
- `npm.cmd audit`: zero vulnerabilidades conhecidas após a atualização.
- Servidor corrigido em `http://localhost:3001`: página inicial `200`, chave ADM antiga `401`, login com chave privada e dashboard `200`; sessão de verificação encerrada.

Os testes Google usam um verificador simulado. Não houve validação com conta Google real, PostgreSQL ou infraestrutura publicada, nem pentest abrangente de concorrência, disponibilidade, XSS ou todos os endpoints.

## Configuração e execução local

A chave ADM local foi gerada aleatoriamente e está em `.env`, ignorado pelo Git. Ela não aparece neste relatório. Para acessar o portal ADM, use o valor de `ADMIN_KEYWORD` desse arquivo. A chave antiga deixou de funcionar na versão corrigida. Reiniciar com outra chave também invalida sessões ADM anteriores.

Para um novo ambiente, copie `.env.example` para `.env` e configure uma chave aleatória de 16 a 256 bytes. Na Vercel, configure `ADMIN_KEYWORD` e `DATABASE_URL` nas variáveis do projeto antes de publicar.

O processo anterior na porta 3000 permaneceu em execução: a revisão automática de aprovação bloqueou sua interrupção sem fornecer um motivo mais específico. Ele ainda carrega o backend anterior. A versão corrigida foi iniciada separadamente na porta 3001.

As alterações foram preparadas localmente. Não houve push ou deploy.

## Pendência do Strix

O fluxo em `../strix/skills/penetration-testing-with-strix/SKILL.md` exige “Docker running” e “LLM configured”, e orienta “Ask the user for these if unset.” A alternativa gerenciada exige autenticação no Strix Cloud e revisão do envio do código. A execução e o reteste pelo Strix aguardam a configuração escolhida pelo usuário. Nenhum relatório de pentest Strix foi produzido.

Referências: [pré-requisitos oficiais do Strix](https://docs.strix.ai/quickstart), [advisory de proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [advisory de qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

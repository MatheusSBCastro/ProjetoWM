# Biblioteca de exercícios WM

Catálogo normalizado com mais de 500 exercícios e variações, organizado por músculo principal.

## Arquivos

- `catalog.json`: catálogo completo usado pelo app.
- `summary.json`: totais e distribuição por grupo muscular.
- `by-muscle/`: catálogos menores separados por músculo.
- `source-exercises.json`: dados originais importados.
- `LICENSE.md`: licença da fonte.

Cada exercício contém nome, grupo de variação, dificuldade, equipamento, músculos, instruções, dois quadros de demonstração e uma prescrição inicial editável. Os links de imagem apontam para o repositório público original.

Fonte: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), disponibilizada sob Unlicense/domínio público.

Para reconstruir o catálogo:

```bash
node scripts/build-exercise-library.js
```

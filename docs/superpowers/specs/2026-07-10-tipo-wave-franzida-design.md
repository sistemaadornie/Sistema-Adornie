# Tipo Wave — Franzida 1,3 / 1,8 / Outros

**Data:** 2026-07-10
**Status:** Aprovado

---

## Contexto

O campo "Tipo wave" existe hoje em duas fichas: `FichaConfeccaoCortina.jsx` (campo obrigatório
de especificação da cortina) e `FichaConfeccaoForro.jsx` (campo de referência da cortina, usado
para calcular a metragem de forro necessária). Hoje só tem três opções: `P`, `M`, `G`
(tamanhos de wave/prega uniforme).

Esses valores não são só rótulo — em `frontend-web/src/utils/calculoCortina.js`,
`fatorWave(tipoWave)` mapeia `P`→0,1 / `M`→0,13 / qualquer outra coisa→0,16, e esse fator
alimenta a única função de cálculo realmente usada por uma tela hoje:
`calcularQuantForro` (consumida por `FichaConfeccaoForro.jsx` para exibir "Quant. forro").
As demais funções do arquivo (`calcularQuantTecidoCortina`, `calcularQuantEntretela`,
`calcularQuantBarrado`, `calcularSobraBarrado`) não são chamadas por nenhum componente vivo
hoje — só existem testadas manualmente em `calculoCortina.selftest.js` (não é um test runner
automatizado; este projeto não tem test framework de frontend configurado).

O negócio agora também produz cortinas no estilo "franzida" (prega tradicional, fator de
folga contínuo aplicado à largura toda), com dois padrões comuns de folga: 1,3× e 1,8×. Esse
estilo usa uma fórmula de metragem diferente da wave (que soma alianças por prega, calculada
via `clipesAberturaCentral`/`clipesSemAbertura`).

## Objetivo

- O select "Tipo wave" (nas duas fichas) ganha três novas opções, **mantendo** `P`/`M`/`G`:
  `Franzida 1,3`, `Franzida 1,8`, `Outros`.
- `Outros` abre um campo de texto obrigatório (`tipoWaveOutros`) pra descrever o tipo.
- `calcularQuantForro` passa a calcular a metragem de forro corretamente para Franzida
  (fórmula largura × fator, igual à já usada pelo campo `franzimento` no modo Separado) e
  sinaliza que `Outros` exige cálculo manual (sem quebrar o comportamento de P/M/G).
- A Ficha Técnica do Instalador mostra a descrição de `tipoWaveOutros` em vez de só "Outros".

## Fora de escopo

- `fatorWave()`/`fatorEntretelaBase()`/`fatorEntretelaAbertura()` e as funções
  `calcularQuantTecidoCortina`/`calcularQuantEntretela`/`calcularQuantBarrado` — não são
  chamadas por nenhuma tela viva hoje; não recebem nenhuma mudança.
- `FichaConferenciaConsultorasPersiana.jsx` — não tem campo "Tipo wave".
- Qualquer migration de schema — `dados_confeccao`/`dados_conferencia_consultoras` já são
  JSONB; `tipoWaveOutros` é só mais uma chave no mesmo JSON.
- Backfill/migração de fichas já salvas com `tipoWave` em branco ou com os valores antigos.

## 1. Modelo de dados

Nenhuma migration necessária. Novo campo dentro do JSON (`dados_confeccao`/
`dados_conferencia_consultoras`) de cortina e de forro: `tipoWaveOutros` (string, só
relevante quando `tipoWave === "Outros"`).

### Valores possíveis de `tipoWave` (literal, igual ao padrão já usado por `espacador`/
`abertura` no código — o valor do `<option>` é o próprio texto exibido)

`"P"`, `"M"`, `"G"`, `"Franzida 1,3"`, `"Franzida 1,8"`, `"Outros"`.

## 2. Frontend — `FichaConfeccaoCortina.jsx` e `FichaConfeccaoForro.jsx`

Em cada arquivo, o `<select>` de "Tipo wave" ganha as 3 novas `<option>`:

```jsx
<option value="P">P</option>
<option value="M">M</option>
<option value="G">G</option>
<option value="Franzida 1,3">Franzida 1,3</option>
<option value="Franzida 1,8">Franzida 1,8</option>
<option value="Outros">Outros</option>
```

Logo abaixo do select, um campo condicional (só quando `dados.tipoWave === "Outros"`):

```jsx
{dados.tipoWave === "Outros" && (
  <div className="os-field">
    <label>Descreva o tipo wave</label>
    <input
      type="text"
      placeholder="Ex: Prega americana dupla"
      value={dados.tipoWaveOutros}
      onChange={(e) => setCampo("tipoWaveOutros", e.target.value)}
      className="input-highlight"
    />
  </div>
)}
```

`VAZIO` em ambos os arquivos ganha `tipoWaveOutros: ""`. O `onChange` do select de
`tipoWave` passa a limpar `tipoWaveOutros` quando o valor muda pra algo diferente de
`"Outros"` (mesmo padrão já usado pelo campo `itemVinculadoId` quando `forroCosturado`
sai de `"JUNTO"`).

Validação de frontend (em ambos, no `salvar()`, espelhando o backend):

```js
if (dados.tipoWave === "Outros" && !dados.tipoWaveOutros?.trim()) {
  return setErro("Descreva o tipo wave selecionado em \"Outros\".");
}
```

## 3. Backend — `ordemServicoService.js`

`validarDadosConfeccaoCortina` e `validarDadosConfeccaoForro` ganham a mesma checagem
(mensagem idêntica ao frontend):

```js
if (tipoWave === 'Outros' && !tipoWaveOutros?.trim()) {
  throw Object.assign(new Error('Descreva o tipo wave selecionado em "Outros".'), { status: 400 });
}
```

(`validarDadosConfeccaoForro` já valida outros campos condicionais como `itemVinculadoId`
quando `JUNTO` — esta é só mais uma checagem no mesmo formato, já que `tipoWave` no Forro
não é obrigatório em si, mas se for preenchido como `"Outros"` a descrição precisa vir junto.)

## 4. Cálculo — `calculoCortina.js` → `calcularQuantForro`

Único ponto de cálculo afetado. Fora do branch `JUNTO`, nada muda (o branch `SEPARADO` já
usa `franzimento` digitado pelo usuário, independente de `tipoWave`).

```js
const FATORES_FRANZIDA = {
  'Franzida 1,3': 1.3,
  'Franzida 1,8': 1.8,
};

function calcularQuantForro({
  abertura, espacador, larguraTrilho, tipoWave, tecidoForro, larguraForro,
  alturaCortina, alturaBarraForro = 0, forroCosturado, franzimento = 0,
}) {
  if (!tecidoForro) return '';
  if (!larguraForro) return 'Informar largura do tecido do forro';

  let x50 = 0;
  if (forroCosturado === 'JUNTO') {
    if (tipoWave === 'Outros') {
      return 'Cálculo manual necessário (tipo wave = Outros)';
    }
    const fatorFranzida = FATORES_FRANZIDA[tipoWave];
    if (fatorFranzida) {
      x50 = larguraTrilho * fatorFranzida + (abertura === 'COM ABERTURA' ? 0.2 : 0.1);
    } else {
      const wave = fatorWave(tipoWave);
      const clipesCentral = clipesAberturaCentral({ abertura, espacador, larguraTrilho });
      const clipesSemAb = clipesSemAbertura({ abertura, espacador, larguraTrilho });
      x50 =
        abertura === 'COM ABERTURA'
          ? (clipesCentral || 0) * wave + 0.1 + ((clipesCentral || 0) * wave + 0.1)
          : (clipesSemAb || 0) * wave + 0.1;
    }
  } else if (forroCosturado === 'SEPARADO') {
    x50 = larguraTrilho * franzimento + (abertura === 'COM ABERTURA' ? 0.2 : 0.1);
  }

  const x51 = alturaCortina + 0.07 + alturaBarraForro;
  const x52 = larguraForro > 0 ? roundUp(x50 / larguraForro, 0) : 0;

  if (larguraForro >= x51) {
    return `${fmt(x50)} mts`;
  }
  const total = ceilingTo(x52 * x51, 0.5);
  return `${x52} alturas x ${fmt(x51)} = ${fmt(total)} mts`;
}
```

Nota: quando `tipoWave === 'Outros'` a função retorna a mensagem de cálculo manual **antes**
de calcular `x50`/`x51`/`x52` — comportamento equivalente aos demais early-returns já
existentes na função (`'Informar largura do tecido do forro'`, etc.), a UI já trata esse
tipo de retorno como texto simples no lugar do valor calculado.

`clipesAberturaCentral`/`clipesSemAbertura` passam a ser calculados só dentro do branch
`else` (P/M/G) — antes eram sempre calculados mesmo quando não usados; isso é um efeito
colateral inofensivo da reorganização, não uma mudança de comportamento observável.

## 5. Ficha Técnica do Instalador — `FichaTecnicaInstalador.jsx`

Em `painelConfeccao(dc, tipo)`, tanto no branch `tipo === "forro"` quanto no branch padrão
(cortina), troca:

```js
["Tipo wave", dc.tipoWave],
```

por:

```js
["Tipo wave", dc.tipoWave === "Outros" ? (dc.tipoWaveOutros || "Outros") : dc.tipoWave],
```

## 6. Testes

### Backend — `ordemServicoService.test.js`

Novos casos nos describe blocks existentes de `salvarDadosConfeccao`/
`salvarDadosConferenciaConsultoras` (cortina e forro):

| Cenário | Expectativa |
|---|---|
| Cortina com `tipoWave: "Outros"` sem `tipoWaveOutros` | Erro 400 com a mensagem de descrição obrigatória |
| Cortina com `tipoWave: "Outros"` e `tipoWaveOutros` preenchido | Salva normalmente |
| Forro com `tipoWave: "Outros"` sem `tipoWaveOutros` | Erro 400 (mesma mensagem) |
| Forro com `tipoWave` = `"Franzida 1,3"` (sem `tipoWaveOutros`) | Salva normalmente — `tipoWaveOutros` só é exigido quando `tipoWave === "Outros"` |

### Frontend — sem test framework (mesma limitação já documentada nas features anteriores)

Verificação via `npx eslint` + `npx vite build` nos dois arquivos alterados.

### Cálculo — verificação manual (sem test runner de frontend)

Como não há test runner, a verificação de `calcularQuantForro` para os novos branches será
feita rodando um script Node ad-hoc equivalente ao `calculoCortina.selftest.js` (import +
chamada direta + `console.log`), cobrindo:
- `forroCosturado: 'JUNTO'`, `tipoWave: 'Franzida 1,3'` — confirma `x50 = larguraTrilho * 1.3 + 0.1` (sem abertura)
- `forroCosturado: 'JUNTO'`, `tipoWave: 'Franzida 1,8'`, `abertura: 'COM ABERTURA'` — confirma `x50 = larguraTrilho * 1.8 + 0.2`
- `forroCosturado: 'JUNTO'`, `tipoWave: 'Outros'` — confirma retorno da mensagem de cálculo manual
- `forroCosturado: 'JUNTO'`, `tipoWave: 'G'` — confirma que o resultado é **idêntico** ao valor
  produzido antes desta mudança (não regressão do caminho P/M/G)

### Teste manual no navegador

1. Abrir Ficha de Confecção de Cortina → selecionar "Outros" em Tipo wave → campo de texto
   aparece; tentar salvar sem preencher → erro; preencher → salva.
2. Repetir na Ficha de Conferência Consultoras de Cortina.
3. Abrir Ficha de Confecção de Forro → selecionar "Franzida 1,3" na Referência da Cortina →
   conferir que "Quant. forro" recalcula com a nova fórmula.
4. Selecionar "Outros" no mesmo campo → conferir que "Quant. forro" mostra a mensagem de
   cálculo manual em vez de travar ou mostrar `NaN`.
5. Abrir a Ficha Técnica do Instalador de um item salvo com "Outros" → conferir que mostra a
   descrição digitada, não a palavra "Outros".

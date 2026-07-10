# Tipo Wave — Franzida 1,3 / 1,8 / Outros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Franzida 1,3", "Franzida 1,8", and "Outros" (with a free-text description) to
the "Tipo wave" select on the Cortina and Forro fichas, and make the Forro's fabric-quantity
calculation handle the new Franzida values with a width×factor formula instead of the
wave-pleat formula.

**Architecture:** Pure additive change to an existing `VARCHAR`/JSONB-backed field — no schema
migration. Three independent layers change: (1) backend validation in `ordemServicoService.js`
requires the new `tipoWaveOutros` field when `tipoWave === "Outros"`; (2) the one live
calculation consumer, `calcularQuantForro` in `calculoCortina.js`, gains a Franzida branch;
(3) the two ficha forms (`FichaConfeccaoCortina.jsx`, `FichaConfeccaoForro.jsx`) render the new
select options and the conditional text field, plus client-side validation mirroring the
backend.

**Tech Stack:** Node/Express + `pg` (backend, Jest with `db.query` mocked), React + Vite
(frontend, no test framework — verification is `npx eslint` + `npx vite build` + a plain
`node` run of the extended `calculoCortina.selftest.js`).

## Global Constraints

- No new database migration — `tipoWave`/`tipoWaveOutros` are just JSON keys inside the
  existing `dados_confeccao`/`dados_conferencia_consultoras` JSONB columns.
- The select's new options are literal value strings (matches this codebase's existing
  convention for `espacador`/`abertura`): `"Franzida 1,3"`, `"Franzida 1,8"`, `"Outros"` — the
  `<option value="...">` IS the displayed label, no separate key/label mapping.
- `P`/`M`/`G` options and their existing behavior (validation, calculation) are **unchanged** —
  this is a pure addition, zero regression risk for the existing three options.
- `tipoWaveOutros` is required (backend 400 + frontend inline error) if and only if
  `tipoWave === "Outros"` — exact error message in both places:
  `Descreva o tipo wave selecionado em "Outros".`
- `fatorWave()`, `fatorEntretelaBase()`, `fatorEntretelaAbertura()`, and the functions
  `calcularQuantTecidoCortina`/`calcularQuantEntretela`/`calcularQuantBarrado` in
  `calculoCortina.js` are **out of scope** — none of them are called by any live component
  today (only `calcularQuantForro` is, from `FichaConfeccaoForro.jsx`).
- `FichaConferenciaConsultorasPersiana.jsx` has no "Tipo wave" field — out of scope.

---

## Task 1: Backend validation — `tipoWaveOutros` required when `tipoWave === "Outros"`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js:118-139` (`validarDadosConfeccaoCortina`, `validarDadosConfeccaoForro`)
- Test: `backend/src/__tests__/ordemServicoService.test.js` (add tests inside the existing `describe('salvarDadosConfeccao', ...)` and `describe('salvarDadosConferenciaConsultoras', ...)` blocks)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: the updated validation is called (via the existing, unchanged call sites) by both `salvarDadosConfeccao` and `salvarDadosConferenciaConsultoras` for `tipo === 'cortina'` and `tipo === 'forro'` — Tasks 3/4 (frontend) must send a `tipoWaveOutros` key in the `dados` object whenever `tipoWave === "Outros"` for this validation to pass.

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe('salvarDadosConfeccao', ...)` block in
`backend/src/__tests__/ordemServicoService.test.js`, right after the test
`'salva dados de confecção de cortina quando válidos'` (which ends at line 141):

```js
  test('lança erro 400 quando tipo wave é Outros sem descrição (cortina)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '4,92', tipoWave: 'Outros', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConfeccao(1, 2, dados)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Descreva o tipo wave'),
    });
  });

  test('salva dados de confecção de cortina com tipo wave Outros e descrição preenchida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_confeccao: { tipoWave: 'Outros' }, status: 'em_andamento' }] });

    const dados = { larguraTrilho: '4,92', tipoWave: 'Outros', tipoWaveOutros: 'Prega americana dupla', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    const result = await svc.salvarDadosConfeccao(1, 2, dados);

    expect(result.status).toBe('em_andamento');
  });
```

Add these tests right after the test `'salva forro JUNTO com item vinculado válido e insere vínculo forro_cortina'` (which ends at line 185):

```js
  test('lança erro 400 quando tipo wave é Outros sem descrição (forro)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] });
    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO', tipoWave: 'Outros' };
    await expect(svc.salvarDadosConfeccao(2, 3, dados)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Descreva o tipo wave'),
    });
  });

  test('salva forro com tipo wave Franzida 1,3 sem exigir descrição', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [] }) // DELETE vinculo forro_cortina (limpeza, SEPARADO)
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tipoWave: 'Franzida 1,3' }, status: 'em_andamento' }] }); // UPDATE

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO', tipoWave: 'Franzida 1,3' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });
```

Add this test inside `describe('salvarDadosConferenciaConsultoras', ...)`, right after the
test `'salva dados de conferência consultoras de cortina quando válidos'` (which ends at
line 235), to confirm the shared validator applies on this save path too:

```js
  test('lança erro 400 quando tipo wave é Outros sem descrição (cortina, conferência consultoras)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '4,92', tipoWave: 'Outros', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConferenciaConsultoras(1, 2, dados)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Descreva o tipo wave'),
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ordemServicoService.test.js -t "tipo wave"`
Expected: FAIL — the "Outros sem descrição" tests fail because no such validation exists yet
(they'd currently save successfully instead of rejecting); the "Franzida 1,3 sem exigir
descrição" test currently already passes (harmless, becomes a regression guard once Step 3
lands).

- [ ] **Step 3: Add the validation**

In `backend/src/services/ordemServicoService.js`, replace `validarDadosConfeccaoCortina`
(lines 118-127):

```js
function validarDadosConfeccaoCortina(dados) {
  const { larguraTrilho, tipoWave, tipoWaveOutros, espacador, abertura, feitaPor } = dados || {};
  if (!larguraTrilho || parseFloat(String(larguraTrilho).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do trilho é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!tipoWave) throw Object.assign(new Error('Tipo wave é obrigatório.'), { status: 400 });
  if (tipoWave === 'Outros' && !tipoWaveOutros?.trim()) {
    throw Object.assign(new Error('Descreva o tipo wave selecionado em "Outros".'), { status: 400 });
  }
  if (!espacador) throw Object.assign(new Error('Espaçador é obrigatório.'), { status: 400 });
  if (!abertura) throw Object.assign(new Error('Abertura é obrigatória.'), { status: 400 });
  if (!feitaPor) throw Object.assign(new Error('Campo "Cortina feita por" é obrigatório.'), { status: 400 });
}
```

Replace `validarDadosConfeccaoForro` (lines 129-139):

```js
function validarDadosConfeccaoForro(dados) {
  const { tecidoForro, larguraForro, forroCosturado, itemVinculadoId, tipoWave, tipoWaveOutros } = dados || {};
  if (!tecidoForro?.trim()) throw Object.assign(new Error('Tecido do forro é obrigatório.'), { status: 400 });
  if (!larguraForro || parseFloat(String(larguraForro).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do forro é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!forroCosturado) throw Object.assign(new Error('Campo "Forro costurado" é obrigatório.'), { status: 400 });
  if (forroCosturado === 'JUNTO' && !itemVinculadoId) {
    throw Object.assign(new Error('Selecione o item em que este forro será costurado.'), { status: 400 });
  }
  if (tipoWave === 'Outros' && !tipoWaveOutros?.trim()) {
    throw Object.assign(new Error('Descreva o tipo wave selecionado em "Outros".'), { status: 400 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ordemServicoService.test.js`
Expected: PASS (full file — this validation is shared by both save paths for both cortina
and forro, so the full-file run confirms no regression in the existing cortina/forro/persiana
tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): exige descricao quando tipo wave for Outros"
```

---

## Task 2: Cálculo — `calcularQuantForro` trata Franzida 1,3 / 1,8 / Outros

**Files:**
- Modify: `frontend-web/src/utils/calculoCortina.js:182-211` (`calcularQuantForro`)
- Modify: `frontend-web/src/utils/calculoCortina.selftest.js` (extend with new cases)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `calcularQuantForro({ ..., tipoWave, ... })` — same signature as today, callers
  (`FichaConfeccaoForro.jsx`, unchanged by this task) pass `tipoWave` exactly as before. New
  behavior triggers only when `tipoWave` is `"Franzida 1,3"`, `"Franzida 1,8"`, or `"Outros"`.

- [ ] **Step 1: Run the existing selftest to record the current baseline**

Run: `cd frontend-web && node src/utils/calculoCortina.selftest.js`
Expected: `OK: calculoCortina.js bate com o caso de teste da planilha.` (exit code 0) — this
confirms the baseline before any change, so Step 4 can prove zero regression.

- [ ] **Step 2: Extend the selftest with the new (currently failing) Forro cases**

Replace the entire contents of `frontend-web/src/utils/calculoCortina.selftest.js` with:

```js
import {
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
  calcularQuantForro,
} from './calculoCortina.js';

const entrada = {
  tipoOS: 'CORTINA',
  feitaPor: 'POR ALTURA',
  espacador: '7,00',
  tipoWave: 'G',
  abertura: 'SEM ABERTURA',
  larguraTrilho: 4.92,
  larguraTecido: 3.3,
  alturaCortina: 2.84,
  vendeuBarraAplicada: 'NÃO',
  alturaBarra: 0.5,
  quantTomas: 0,
  tamanhoTomas: 0,
};

const resultado = {
  clipesSemAbertura: clipesSemAbertura(entrada),
  quantTecidoCortina: calcularQuantTecidoCortina(entrada),
  quantEntretela: calcularQuantEntretela(entrada),
  quantBarrado: calcularQuantBarrado(entrada),
};
resultado.sobraBarrado = calcularSobraBarrado({ ...entrada, quantBarrado: resultado.quantBarrado });

const esperado = {
  clipesSemAbertura: 74,
  quantTecidoCortina: '4 alturas x 3,45 = 14,00 mts',
  quantEntretela: '12,06 mts',
  quantBarrado: '',
  sobraBarrado: 'VENDER BARRADO',
};

let ok = true;
for (const chave of Object.keys(esperado)) {
  if (resultado[chave] !== esperado[chave]) {
    ok = false;
    console.error(`FALHOU [${chave}]: esperado ${JSON.stringify(esperado[chave])}, obtido ${JSON.stringify(resultado[chave])}`);
  }
}

const casosForro = {
  forro_franzida13_semAbertura: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Franzida 1,3', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '5 alturas x 2,91 = 15,00 mts',
  },
  forro_franzida18_comAbertura: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Franzida 1,8', abertura: 'COM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '7 alturas x 2,91 = 20,50 mts',
  },
  forro_outros_calculoManual: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Outros', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: 'Cálculo manual necessário (tipo wave = Outros)',
  },
  forro_G_regressao: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'G', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '8 alturas x 2,91 = 23,50 mts',
  },
};

for (const [nome, caso] of Object.entries(casosForro)) {
  const obtido = calcularQuantForro(caso.entrada);
  if (obtido !== caso.esperado) {
    ok = false;
    console.error(`FALHOU [${nome}]: esperado ${JSON.stringify(caso.esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

if (ok) {
  console.log('OK: calculoCortina.js bate com o caso de teste da planilha.');
  process.exit(0);
} else {
  process.exit(1);
}
```

- [ ] **Step 3: Run the selftest to verify the new Forro cases fail**

Run: `cd frontend-web && node src/utils/calculoCortina.selftest.js`
Expected: exit code 1, with `FALHOU [forro_franzida13_semAbertura]`, `FALHOU
[forro_franzida18_comAbertura]`, and `FALHOU [forro_outros_calculoManual]` printed (the
`forro_G_regressao` case already passes today, since it exercises the pre-existing P/M/G
formula unchanged — this is expected and becomes the regression guard once Step 4 lands).

- [ ] **Step 4: Implement the Franzida/Outros branch in `calcularQuantForro`**

In `frontend-web/src/utils/calculoCortina.js`, replace `calcularQuantForro` (lines 182-211)
and the `export` block (lines 213-221):

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

export {
  clipesAberturaCentral,
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
  calcularQuantForro,
};
```

- [ ] **Step 5: Run the selftest to verify everything passes**

Run: `cd frontend-web && node src/utils/calculoCortina.selftest.js`
Expected: `OK: calculoCortina.js bate com o caso de teste da planilha.` (exit code 0) — all
7 comparisons (3 original + 4 new Forro cases) pass, including `forro_G_regressao` matching
the pre-change value exactly.

- [ ] **Step 6: Verify lint/build still pass**

Run: `cd frontend-web && npx eslint src/utils/calculoCortina.js src/utils/calculoCortina.selftest.js`
Expected: no output

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/utils/calculoCortina.js frontend-web/src/utils/calculoCortina.selftest.js
git commit -m "feat(calculo): calcula quant forro para tipo wave franzida 1,3/1,8"
```

---

## Task 3: Frontend — `FichaConfeccaoCortina.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx`

**Interfaces:**
- Consumes: nothing new from other tasks (this ficha doesn't call `calcularQuantForro`).
- Produces: `dados.tipoWaveOutros` sent as part of the existing `PUT /os/:id/confeccao` /
  `PUT /os/:id/conferencia-consultoras` request bodies (same JSON blob already being sent —
  one more key), consumed by Task 1's backend validation.

- [ ] **Step 1: Add `tipoWaveOutros` to `VAZIO`**

Change the `VAZIO` object (lines 6-11) from:

```js
const VAZIO = {
  feitaPor: "", espacador: "", tipoWave: "", abertura: "", componente: "",
  larguraTrilho: "", larguraTecido: "", nomeTecido: "", vendeuBarraAplicada: "",
  alturaCortina: "", alturaBarra: "", quantTomas: "", tamanhoTomas: "",
  cortinaLadoALado: "", detalheBarra: "", observacoes: "",
};
```

to:

```js
const VAZIO = {
  feitaPor: "", espacador: "", tipoWave: "", tipoWaveOutros: "", abertura: "", componente: "",
  larguraTrilho: "", larguraTecido: "", nomeTecido: "", vendeuBarraAplicada: "",
  alturaCortina: "", alturaBarra: "", quantTomas: "", tamanhoTomas: "",
  cortinaLadoALado: "", detalheBarra: "", observacoes: "",
};
```

- [ ] **Step 2: Add frontend validation**

In the `salvar()` function, change the line (currently line 80)
`if (!dados.tipoWave) return setErro("Tipo wave é obrigatório.");` to add a check right
after it:

```js
    if (!dados.tipoWave) return setErro("Tipo wave é obrigatório.");
    if (dados.tipoWave === "Outros" && !dados.tipoWaveOutros?.trim()) {
      return setErro('Descreva o tipo wave selecionado em "Outros".');
    }
```

- [ ] **Step 3: Add the new select options and clear-on-change, add the conditional field**

Change the "Tipo wave" select (currently lines 182-188) from:

```jsx
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
```

to:

```jsx
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select
                    value={dados.tipoWave}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setDados((prev) => ({ ...prev, tipoWave: valor, tipoWaveOutros: valor === "Outros" ? prev.tipoWaveOutros : "" }));
                    }}
                    className="input-highlight"
                  >
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                    <option value="Franzida 1,3">Franzida 1,3</option>
                    <option value="Franzida 1,8">Franzida 1,8</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
```

Then, right after the `os-grid-3` block that contains this select closes (currently line
190, `</div>`, the one that closes the `os-grid-3` started at line 163) and before the
`os-grid-2` block that contains "Abertura"/"Componente" (currently starting at line 192),
add:

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

- [ ] **Step 4: Verify with lint and build**

Run: `cd frontend-web && npx eslint src/pages/pedidos/FichaConfeccaoCortina.jsx`
Expected: no output

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx
git commit -m "feat(cortina): adiciona opcoes franzida 1,3/1,8/outros ao tipo wave"
```

---

## Task 4: Frontend — `FichaConfeccaoForro.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx`

**Interfaces:**
- Consumes: `calcularQuantForro` (Task 2 — already updated; this task just continues to pass
  `dados.tipoWave` to it exactly as today, no call-site change needed since `useMemo` already
  recomputes on every `dados` change).
- Produces: `dados.tipoWaveOutros` sent as part of the existing `PUT /os/:id/confeccao` /
  `PUT /os/:id/conferencia-consultoras` request bodies, consumed by Task 1's backend
  validation.

- [ ] **Step 1: Add `tipoWaveOutros` to `VAZIO`**

Change the `VAZIO` object (lines 7-11) from:

```js
const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "", itemVinculadoId: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", abertura: "", alturaCortina: "",
};
```

to:

```js
const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "", itemVinculadoId: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", tipoWaveOutros: "", abertura: "", alturaCortina: "",
};
```

- [ ] **Step 2: Add frontend validation**

In the `salvar()` function, right after the existing block:

```js
    if (dados.forroCosturado === "JUNTO" && !dados.itemVinculadoId) {
      return setErro("Selecione o item em que este forro será costurado.");
    }
```

add:

```js
    if (dados.tipoWave === "Outros" && !dados.tipoWaveOutros?.trim()) {
      return setErro('Descreva o tipo wave selecionado em "Outros".');
    }
```

- [ ] **Step 3: Add the new select options and clear-on-change, add the conditional field**

Change the "Tipo wave" select (currently lines 224-232, inside the "Referência da Cortina"
section) from:

```jsx
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
```

to:

```jsx
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select
                    value={dados.tipoWave}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setDados((prev) => ({ ...prev, tipoWave: valor, tipoWaveOutros: valor === "Outros" ? prev.tipoWaveOutros : "" }));
                    }}
                  >
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                    <option value="Franzida 1,3">Franzida 1,3</option>
                    <option value="Franzida 1,8">Franzida 1,8</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
```

Then, right after the `os-grid-3` block that contains this select closes (the `</div>` that
closes the `os-grid-3` started right after "Referência da Cortina (para o cálculo)") and
before the `os-grid-2` block containing "Largura do trilho"/"Altura da cortina", add:

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

- [ ] **Step 4: Verify with lint and build**

Run: `cd frontend-web && npx eslint src/pages/pedidos/FichaConfeccaoForro.jsx`
Expected: no output

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx
git commit -m "feat(forro): adiciona opcoes franzida 1,3/1,8/outros ao tipo wave"
```

---

## Task 5: Ficha Técnica do Instalador — exibe descrição de "Outros"

**Files:**
- Modify: `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx:107-139` (`painelConfeccao`)

**Interfaces:**
- Consumes: `dc.tipoWave` / `dc.tipoWaveOutros` — the same JSON keys Tasks 3/4 now write into
  `dados_confeccao`/`dados_conferencia_consultoras`.
- Produces: nothing consumed by later tasks — this is a display-only leaf.

- [ ] **Step 1: Update both `["Tipo wave", dc.tipoWave]` occurrences**

In `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx`, inside `painelConfeccao`,
change line 116 (inside the `if (tipo === "forro")` branch) from:

```js
      ["Tipo wave", dc.tipoWave],
```

to:

```js
      ["Tipo wave", dc.tipoWave === "Outros" ? (dc.tipoWaveOutros || "Outros") : dc.tipoWave],
```

Change line 134 (inside the default/cortina branch) from:

```js
    ["Tipo wave", dc.tipoWave],
```

to:

```js
    ["Tipo wave", dc.tipoWave === "Outros" ? (dc.tipoWaveOutros || "Outros") : dc.tipoWave],
```

- [ ] **Step 2: Verify with lint and build**

Run: `cd frontend-instalador && npx eslint src/pages/FichaTecnicaInstalador.jsx`
Expected: no output (if this project has no configured eslint, this step is a no-op — check
`frontend-instalador/package.json` for a `lint` script first; if absent, skip straight to
build)

Run: `cd frontend-instalador && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 3: Commit**

```bash
git add frontend-instalador/src/pages/FichaTecnicaInstalador.jsx
git commit -m "feat(instalador): exibe descricao do tipo wave Outros na ficha tecnica"
```

---

## Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest`
Expected: all suites PASS, including `ordemServicoService.test.js`

- [ ] **Step 2: Run the calculation selftest**

Run: `cd frontend-web && node src/utils/calculoCortina.selftest.js`
Expected: `OK: calculoCortina.js bate com o caso de teste da planilha.` (exit code 0)

- [ ] **Step 3: Confirm both frontend builds are clean**

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors

Run: `cd frontend-instalador && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 4: Manual browser test (cannot be automated in this environment — no screenshot tool)**

Document for the user, do not skip reporting this as pending:

1. Abrir Ficha de Confecção de Cortina → selecionar "Outros" em Tipo wave → campo de texto
   aparece; tentar salvar sem preencher → erro; preencher → salva.
2. Repetir na Ficha de Conferência Consultoras de Cortina.
3. Abrir Ficha de Confecção de Forro → selecionar "Franzida 1,3" na Referência da Cortina →
   conferir que "Quant. forro" recalcula com a nova fórmula.
4. Selecionar "Outros" no mesmo campo → conferir que "Quant. forro" mostra a mensagem de
   cálculo manual em vez de travar ou mostrar `NaN`.
5. Abrir a Ficha Técnica do Instalador de um item salvo com "Outros" → conferir que mostra a
   descrição digitada, não a palavra "Outros".

- [ ] **Step 5: Report status to the user**

State explicitly that automated tests + both builds pass, and that Step 4 (manual browser
test) still needs to be done by a human before considering this fully verified — consistent
with how every other frontend feature in this project has shipped.

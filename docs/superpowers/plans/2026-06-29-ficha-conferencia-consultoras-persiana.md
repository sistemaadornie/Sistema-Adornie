# Ficha de Conferência Consultoras — Persiana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a Ficha de Conferência Consultoras para itens de Persiana — tela dedicada com Descritivo Comercial (Modelo/Tubo/Bandô, Tecido, Controle, Motor, Acessórios, Acionamento) — substituindo o modal "Selecionar Tipo de Persiana" na Etapa 1 do pedido.

**Architecture:** Uma migração define `tipo_confeccao = 'persiana'` e `necessita_conferencia = true` na categoria Persianas. O backend ganha validação para `tipo = 'persiana'` em `salvarDadosConferenciaConsultoras` e sincroniza `pedido_itens.modelo/especificacoes` ao salvar. O frontend cria `FichaConferenciaConsultorasPersiana.jsx`, adiciona um branch no wrapper `FichaConferenciaConsultoras.jsx`, e remove o `SelecionarTipoPersianaModal` e seu botão de `EtapaDadosPedido.jsx`. Persianas passam a aparecer automaticamente na seção "CONFERÊNCIA CONSULTORAS" existente, sem nenhuma mudança nas queries do dashboard.

**Tech Stack:** Node/Express + PostgreSQL (backend), React + react-router (frontend-web), Jest + supertest (backend tests — frontend-web não tem runner de testes automatizados).

## Global Constraints

- Nunca modificar `dados_confeccao` nem as funções `validarDadosConfeccaoCortina`/`validarDadosConfeccaoForro` — elas permanecem intactas.
- A sync com `pedido_itens` acontece SOMENTE quando `tipo === 'persiana'` — não afeta cortina/forro.
- `frontend-web` não tem test runner configurado — nenhum teste automatizado de frontend.
- Ao mudar o `SELECT` inicial de `salvarDadosConferenciaConsultoras`, garantir que os mocks dos testes existentes ainda funcionam (eles retornam `{ tipo: '...' }` sem `pedido_item_id`, o que é OK porque o branch de sync só roda para persiana).
- O arquivo `SelecionarTipoPersianaModal.jsx` é deletado — sem referências restantes após a task 4.
- Usar as mesmas classes CSS (`os-page`, `os-page-header`, `os-info-bar`, `os-form-section`, `os-section-title`, `mandatory-title`, `os-grid-2`, `os-grid-3`, `os-field`, `os-input`, `os-btn`, `os-alert`) já definidas em `OrdemServicoModal.css`.

---

### Task 1: Migration — `tipo_confeccao` e `necessita_conferencia` para Persianas

**Files:**
- Create: `backend/src/database/migrations/categorias_persiana_conferencia.sql`

**Interfaces:**
- Produces: `categorias.tipo_confeccao = 'persiana'` e `categorias.necessita_conferencia = true` para linhas onde `LOWER(nome) IN ('persianas', 'persiana')`, consumido por `ordemServicoService.criar` (que já valida `tipo_confeccao != null`) e pelas queries `necessita_conferencia = true` nos endpoints existentes de conferência consultoras.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- backend/src/database/migrations/categorias_persiana_conferencia.sql
-- Persiana passa a ter ficha de conferência consultoras própria (tipo_confeccao = 'persiana')
-- e a exigir conferência de medidas (necessita_conferencia = true).
UPDATE categorias
   SET tipo_confeccao        = 'persiana',
       necessita_conferencia = true
 WHERE LOWER(nome) IN ('persianas', 'persiana');
```

- [ ] **Step 2: Rodar a migration no banco local**

```bash
node backend/src/database/run-migration.js categorias_persiana_conferencia.sql
```

Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Aplicar a migration no Supabase**

Use a ferramenta `mcp__plugin_supabase_supabase__apply_migration` com:
- `project_id`: `zexexngoujgtnlvydrjh`
- `name`: `categorias_persiana_conferencia`
- `query`: o SQL exato do Step 1

Expected: ferramenta retorna sucesso. Confirmar com `mcp__plugin_supabase_supabase__list_migrations` que a migration aparece.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/categorias_persiana_conferencia.sql
git commit -m "feat(db): tipo_confeccao e necessita_conferencia para categoria Persiana"
```

---

### Task 2: Backend — validar persiana + sync `pedido_itens`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js`
- Modify: `backend/src/__tests__/ordemServicoService.test.js`

**Interfaces:**
- Produces: `salvarDadosConferenciaConsultoras` agora aceita `tipo = 'persiana'`, valida `modelo`, `tubo`, `acionamento` (e `qtdMotor` quando motorizado), salva em `dados_conferencia_consultoras` e sincroniza `pedido_itens.modelo/especificacoes`. Consumido pelo endpoint `PUT /os/:id/conferencia-consultoras` (inalterado).
- Consumes: nada novo — usa `db.query` existente.

- [ ] **Step 1: Escrever os testes que falham**

Em `backend/src/__tests__/ordemServicoService.test.js`, adicionar 4 casos dentro do `describe('salvarDadosConferenciaConsultoras', ...)` existente, **após** o último teste (`'lança erro 404 quando OS não existe'`) e **antes** do `});` de fechamento do describe:

```js
  test('salva ficha de persiana (manual) e sincroniza pedido_itens', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, dados_conferencia_consultoras: { modelo: 'Rolo / Rollo', tubo: '38mm' }, status: 'em_andamento' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE pedido_itens

    const dados = { modelo: 'Rolo / Rollo', tubo: '38mm', bando: null, acionamento: 'manual', tecido: 'Drumis', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], qtdMotor: '', ordem: '' };
    const result = await svc.salvarDadosConferenciaConsultoras(3, 1, dados);

    expect(result.status).toBe('em_andamento');
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('UPDATE pedido_itens'),
      ['Rolo / Rollo', JSON.stringify({ tubo: '38mm', bando: null }), 7]
    );
  });

  test('salva ficha de persiana (motorizado com qtdMotor)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 8 }] })
      .mockResolvedValueOnce({ rows: [{ id: 4, dados_conferencia_consultoras: { modelo: 'Meliade', tubo: '30mm', acionamento: 'motorizado', qtdMotor: '2' }, status: 'em_andamento' }] })
      .mockResolvedValueOnce({ rows: [] });

    const dados = { modelo: 'Meliade', tubo: '30mm', bando: '', acionamento: 'motorizado', qtdMotor: '2', tecido: '', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], ordem: '' };
    const result = await svc.salvarDadosConferenciaConsultoras(4, 1, dados);

    expect(result.status).toBe('em_andamento');
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  test('lança 400 quando modelo ou tubo faltando para persiana', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 9 }] });

    await expect(
      svc.salvarDadosConferenciaConsultoras(5, 1, { modelo: '', tubo: '', acionamento: 'manual' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('tubo') });
  });

  test('lança 400 quando motorizada sem qtdMotor para persiana', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 10 }] });

    await expect(
      svc.salvarDadosConferenciaConsultoras(6, 1, { modelo: 'Meliade', tubo: '30mm', acionamento: 'motorizado', qtdMotor: '' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('motor') });
  });
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd backend && npx jest ordemServicoService.test.js
```

Expected: FAIL — `salvarDadosConferenciaConsultoras` ainda não trata `tipo = 'persiana'`, então os testes de 400 passam (cai na ausência de validação mas não lança erro) e os testes de sucesso falham pois `db.query` não é chamado 3 vezes.

- [ ] **Step 3: Implementar em `ordemServicoService.js`**

**3a. Adicionar a função de validação** logo após `validarDadosConfeccaoForro` (linha 128):

```js
function validarDadosConferenciaConsultorasPersiana(dados) {
  if (!dados.modelo || !dados.tubo)
    throw Object.assign(new Error('Modelo e tubo da persiana são obrigatórios.'), { status: 400 });
  if (!dados.acionamento)
    throw Object.assign(new Error('Acionamento (manual/motorizado) é obrigatório.'), { status: 400 });
  if (dados.acionamento === 'motorizado' && !dados.qtdMotor)
    throw Object.assign(new Error('Quantidade de motor é obrigatória para persiana motorizada.'), { status: 400 });
}
```

**3b. Atualizar `salvarDadosConferenciaConsultoras`** (atualmente nas linhas 154-176):

Mudar o SELECT inicial para incluir `pedido_item_id`, adicionar o branch de persiana e a sync após o UPDATE:

```js
async function salvarDadosConferenciaConsultoras(id, userId, dados) {
  const { rows: osRows } = await db.query(
    `SELECT tipo, pedido_item_id FROM ordem_servico WHERE id = $1`,
    [id]
  );
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  if (osRows[0].tipo === 'cortina') {
    validarDadosConfeccaoCortina(dados);
  } else if (osRows[0].tipo === 'forro') {
    validarDadosConfeccaoForro(dados);
  } else if (osRows[0].tipo === 'persiana') {
    validarDadosConferenciaConsultorasPersiana(dados);
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_conferencia_consultoras = $1,
         conferencia_consultoras_preenchido_em = NOW(),
         conferencia_consultoras_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dados), userId, id]
  );

  if (osRows[0].tipo === 'persiana') {
    await db.query(
      `UPDATE pedido_itens
          SET modelo        = $1,
              especificacoes = $2
        WHERE id = $3`,
      [dados.modelo, JSON.stringify({ tubo: dados.tubo, bando: dados.bando || null }), osRows[0].pedido_item_id]
    );
  }

  return rows[0];
}
```

- [ ] **Step 4: Rodar os testes da função**

```bash
cd backend && npx jest ordemServicoService.test.js
```

Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Rodar a suite completa do backend para checar regressões**

```bash
cd backend && npm test
```

Expected: PASS — nenhuma outra suite referencia `salvarDadosConferenciaConsultoras` com lógica de persiana.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): validar e salvar Ficha de Conferência Consultoras para persiana"
```

---

### Task 3: Frontend — `FichaConferenciaConsultorasPersiana.jsx` + atualizar wrapper

**Files:**
- Create: `frontend-web/src/pages/pedidos/FichaConferenciaConsultorasPersiana.jsx`
- Modify: `frontend-web/src/pages/pedidos/FichaConferenciaConsultoras.jsx`

**Interfaces:**
- Consumes: `osData` do `GET /os/:id` (campos: `id`, `cliente_nome`, `pedido_numero`, `pedido_id`, `consultor_nome`, `item_ambiente`, `item_descricao`, `dados_conferencia_consultoras`). Salva via `PUT /os/:id/conferencia-consultoras` (Task 2).
- Produces: tela `/pedidos/os/:osId/conferencia-consultoras` quando `osData.tipo === 'persiana'`, chamada por `EtapaDadosPedido.jsx` via `abrirOsDoItem` → navigate (já existente).

- [ ] **Step 1: Criar `FichaConferenciaConsultorasPersiana.jsx`**

```jsx
// frontend-web/src/pages/pedidos/FichaConferenciaConsultorasPersiana.jsx
import { useState } from "react";
import { FaUser, FaTag, FaUserTie, FaHome, FaGift } from "react-icons/fa";
import { api } from "../../services/api";
import { KEYWORD_MODELS } from "./importKeywordConfig";
import "./OrdemServicoModal.css";

const PERSIANA_CONFIG = KEYWORD_MODELS.find((k) => k.tipo === "persiana");

const ACESSORIOS_OPCOES = [
  "Transpasse",
  "Lado a Lado",
  "Suporte Inter.",
  "Trilho Heike",
  "Bando Box",
  "Guias Laterais",
];

const VAZIO = {
  modelo: "", tubo: "", bando: "",
  tecido: "", largMax: "",
  modeloControle: "", modeloMotor: "",
  acessorios: [],
  acionamento: "",
  qtdMotor: "", ordem: "",
};

export default function FichaConferenciaConsultorasPersiana({ osData, onSalvar, onVoltar }) {
  const [dados, setDados] = useState(() => ({
    ...VAZIO,
    ...(osData.dados_conferencia_consultoras || {}),
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const modeloCfg = PERSIANA_CONFIG?.modelos.find((m) => m.nome === dados.modelo);
  const opcoesBandoCaixa = modeloCfg
    ? [...(modeloCfg.caixas || []), ...(modeloCfg.bandos || [])]
    : [];

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  function setModelo(novoModelo) {
    setDados((prev) => ({ ...prev, modelo: novoModelo, tubo: "", bando: "" }));
  }

  function toggleAcessorio(nome) {
    setDados((prev) => {
      const atual = prev.acessorios || [];
      return {
        ...prev,
        acessorios: atual.includes(nome)
          ? atual.filter((a) => a !== nome)
          : [...atual, nome],
      };
    });
  }

  const podeSalvar =
    !!dados.modelo &&
    !!dados.tubo &&
    !!dados.acionamento &&
    (dados.acionamento !== "motorizado" || !!dados.qtdMotor);

  async function salvar() {
    setErro("");
    setSucesso("");
    if (!dados.modelo || !dados.tubo) return setErro("Modelo e tubo da persiana são obrigatórios.");
    if (!dados.acionamento) return setErro("Acionamento (manual/motorizado) é obrigatório.");
    if (dados.acionamento === "motorizado" && !dados.qtdMotor)
      return setErro("Quantidade de motor é obrigatória para persiana motorizada.");

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/conferencia-consultoras`, dados);
      setSucesso("Ficha de Conferência Consultoras salva com sucesso!");
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha.");
    } finally {
      setSalvando(false);
    }
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;

  const selectStyle = {
    padding: "6px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md, 6px)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: 13,
    width: "100%",
  };

  return (
    <div className="ek-page os-page">
      <div className="os-page-header os-page-header-flat">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <h1 className="os-page-title">Ficha de Conferência Consultoras — Persiana</h1>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>
            Cancelar
          </button>
          <button
            className="os-btn os-btn-primary"
            onClick={salvar}
            disabled={salvando || !podeSalvar}
          >
            {salvando ? "Salvando..." : "✓ Salvar Ficha de Conferência Consultoras"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>
      )}
      {sucesso && (
        <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>
      )}

      <div className="os-page-body">
        <div className="os-info-bar">
          <div className="os-info-row">
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaUser /> Cliente</span>
              <span className="os-info-value">{osData.cliente_nome || "—"}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaTag /> Pedido</span>
              <span className="os-info-value tag-pedido">{pedidoNumero}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaUserTie /> Vendedor</span>
              <span className="os-info-value">{osData.consultor_nome || "—"}</span>
            </div>
          </div>
          <div className="os-info-row">
            <div className="os-info-item">
              <span className="os-info-label"><FaHome /> Ambiente</span>
              <span className="os-info-value highlight-text">{osData.item_ambiente || "—"}</span>
            </div>
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaGift /> Produto</span>
              <span className="os-info-value">{osData.item_descricao || "—"}</span>
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title mandatory-title">Modelo / Tubo / Bandô (Obrigatório)</div>
          <div className="os-grid-3">
            <div className="os-field">
              <label>Modelo</label>
              <select
                value={dados.modelo}
                onChange={(e) => setModelo(e.target.value)}
                style={selectStyle}
                className="input-highlight"
              >
                <option value="">— selecionar —</option>
                {PERSIANA_CONFIG?.modelos.map((m) => (
                  <option key={m.nome} value={m.nome}>{m.nome}</option>
                ))}
              </select>
            </div>

            <div className="os-field">
              <label>Tubo</label>
              <select
                value={dados.tubo}
                onChange={(e) => setCampo("tubo", e.target.value)}
                disabled={!modeloCfg}
                style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
                className="input-highlight"
              >
                <option value="">— selecionar —</option>
                {(modeloCfg?.tubos || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="os-field">
              <label>
                Bandô / Caixa{" "}
                <span style={{ fontWeight: 400 }}>(opcional)</span>
              </label>
              <select
                value={dados.bando}
                onChange={(e) => setCampo("bando", e.target.value)}
                disabled={!modeloCfg}
                style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
              >
                <option value="">— Nenhum —</option>
                {opcoesBandoCaixa.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title">Tecido e Controle</div>
          <div className="os-grid-2">
            <div className="os-field">
              <label>Tecido</label>
              <input
                type="text"
                value={dados.tecido}
                onChange={(e) => setCampo("tecido", e.target.value)}
                className="os-input"
                placeholder="Ex: Drumis White"
              />
            </div>
            <div className="os-field">
              <label>Larg Max</label>
              <input
                type="text"
                value={dados.largMax}
                onChange={(e) => setCampo("largMax", e.target.value)}
                className="os-input"
                placeholder="Ex: 2,50m"
              />
            </div>
          </div>
          <div className="os-grid-2">
            <div className="os-field">
              <label>Modelo Controle</label>
              <input
                type="text"
                value={dados.modeloControle}
                onChange={(e) => setCampo("modeloControle", e.target.value)}
                className="os-input"
              />
            </div>
            <div className="os-field">
              <label>Modelo Motor</label>
              <input
                type="text"
                value={dados.modeloMotor}
                onChange={(e) => setCampo("modeloMotor", e.target.value)}
                className="os-input"
              />
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title">Acessórios</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {ACESSORIOS_OPCOES.map((nome) => (
              <label
                key={nome}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={(dados.acessorios || []).includes(nome)}
                  onChange={() => toggleAcessorio(nome)}
                />
                {nome}
              </label>
            ))}
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title mandatory-title">Acionamento (Obrigatório)</div>
          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
            {["manual", "motorizado"].map((op) => (
              <label
                key={op}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="acionamento"
                  value={op}
                  checked={dados.acionamento === op}
                  onChange={() => setCampo("acionamento", op)}
                  className="input-highlight"
                />
                {op.charAt(0).toUpperCase() + op.slice(1)}
              </label>
            ))}
          </div>

          {dados.acionamento === "motorizado" && (
            <div className="os-grid-2">
              <div className="os-field">
                <label>
                  Qtd Motor{" "}
                  <span style={{ color: "var(--color-danger, red)" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={dados.qtdMotor}
                  onChange={(e) => setCampo("qtdMotor", e.target.value)}
                  className="os-input input-highlight"
                  placeholder="Ex: 1"
                />
              </div>
              <div className="os-field">
                <label>Ordem</label>
                <input
                  type="text"
                  value={dados.ordem}
                  onChange={(e) => setCampo("ordem", e.target.value)}
                  className="os-input"
                  placeholder="Ex: 173309"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `FichaConferenciaConsultoras.jsx`**

Adicionar o import do novo componente e um branch para `tipo === 'persiana'`:

Adicione ao topo do arquivo (após o import de `FichaConfeccaoForro`):
```js
import FichaConferenciaConsultorasPersiana from "./FichaConferenciaConsultorasPersiana";
```

Substituir as linhas 61-64 (o bloco `if (osData.tipo === "forro") ... return <FichaConfeccaoCortina ...>`) por:

```jsx
  if (osData.tipo === "persiana") {
    return (
      <FichaConferenciaConsultorasPersiana
        osData={osData}
        onSalvar={voltar}
        onVoltar={voltar}
      />
    );
  }

  if (osData.tipo === "forro") {
    return <FichaConfeccaoForro osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} />;
  }
  return <FichaConfeccaoCortina osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} />;
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConferenciaConsultorasPersiana.jsx frontend-web/src/pages/pedidos/FichaConferenciaConsultoras.jsx
git commit -m "feat(pedidos): FichaConferenciaConsultorasPersiana e branch no wrapper"
```

---

### Task 4: Frontend — remover `SelecionarTipoPersianaModal` de `EtapaDadosPedido.jsx` e deletar o arquivo

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
- Delete: `frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx`

**Interfaces:**
- Remove: `selecionandoTipo` state, `setSelecionandoTipo`, import de `SelecionarTipoPersianaModal`, botão `🎛️ Selecionar Tipo`, render do modal no JSX.
- Itens de Persiana (agora com `necessita_conferencia = true` após a Task 1) passam a aparecer automaticamente na seção "CONFERÊNCIA CONSULTORAS" já existente — nenhum novo código de listagem necessário.

- [ ] **Step 1: Remover o import e o estado em `EtapaDadosPedido.jsx`**

Na linha 6, remover:
```js
import SelecionarTipoPersianaModal from "./SelecionarTipoPersianaModal";
```

Na linha 24, remover:
```js
  const [selecionandoTipo, setSelecionandoTipo] = useState(false);
```

- [ ] **Step 2: Remover o botão `🎛️ Selecionar Tipo`**

Remover as linhas 65-69 inteiras (o bloco condicional com o botão):
```jsx
            {(p.itens_persiana_pendentes ?? 0) > 0 && (
              <button className="pf-btn-secondary" onClick={() => setSelecionandoTipo(true)}>
                🎛️ Selecionar Tipo ({p.itens_persiana_pendentes})
              </button>
            )}
```

- [ ] **Step 3: Remover o render do modal**

Remover as linhas 207-213 inteiras (o bloco `{selecionandoTipo && ...}`):
```jsx
      {selecionandoTipo && (
        <SelecionarTipoPersianaModal
          pedidoId={pedidoId}
          onClose={() => setSelecionandoTipo(false)}
          onRecarregar={onRecarregar}
        />
      )}
```

- [ ] **Step 4: Deletar `SelecionarTipoPersianaModal.jsx`**

```bash
git rm frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): remove SelecionarTipoPersianaModal — substituído pela Ficha de Conferência Consultoras de Persiana"
```

---

### Task 5: Verificação manual no navegador

Nenhuma ferramenta automatizada cobre o fluxo de UI. Esta task valida a feature de ponta a ponta.

- [ ] **Step 1: Subir backend e frontend-web**

Em dois terminais separados:
```bash
cd backend && npm run dev
```
```bash
cd frontend-web && npm run dev
```

- [ ] **Step 2: Verificar que o botão "Selecionar Tipo" sumiu**

1. Abrir um pedido que tenha item de categoria Persiana na Etapa 1.
2. Confirmar que o botão `🎛️ Selecionar Tipo` **não aparece mais** no header do modal.

- [ ] **Step 3: Verificar a seção "CONFERÊNCIA CONSULTORAS" para persianas**

1. No mesmo pedido, confirmar que o item de Persiana **aparece na seção "CONFERÊNCIA CONSULTORAS"** com o botão "Preencher Conferência Consultoras".
2. Se a seção não aparecer, verificar no banco se `necessita_conferencia = true` foi aplicado corretamente: `SELECT nome, tipo_confeccao, necessita_conferencia FROM categorias WHERE LOWER(nome) = 'persianas'`.

- [ ] **Step 4: Preencher a ficha**

1. Clicar em "Preencher Conferência Consultoras" para o item de Persiana.
2. Confirmar que a nova tela abre com título "Ficha de Conferência Consultoras — Persiana".
3. Selecionar Modelo → Tubo → (opcional) Bandô.
4. Preencher Tecido, Larg Max, Modelo Controle (opcionais).
5. Marcar alguns acessórios (Transpasse, Guias Laterais).
6. Selecionar Acionamento: Manual. Clicar em "Salvar".
7. Confirmar que navega de volta à Etapa 1 e o critério "Todos os itens com Conferência Consultoras preenchida" mostra ✅.

- [ ] **Step 5: Verificar sync com `pedido_itens`**

No banco local:
```sql
SELECT pi.modelo, pi.especificacoes
FROM pedido_itens pi
JOIN ordem_servico os ON os.pedido_item_id = pi.id
WHERE os.dados_conferencia_consultoras IS NOT NULL
  AND pi.modelo IS NOT NULL
LIMIT 5;
```

Expected: `modelo` e `especificacoes.tubo` preenchidos com os valores escolhidos na ficha.

- [ ] **Step 6: Verificar que a Etapa 2 desbloqueia a Conferência Técnica**

1. Ir para a Etapa 2 (Conferência de Medidas) do mesmo pedido.
2. Confirmar que o item de Persiana oferece o botão "Conferência Técnica" (em vez de "Aguardando Conferência Consultoras (Etapa 1)").

- [ ] **Step 7: Verificar bloqueio sem ficha**

Com outro item de Persiana que ainda não tem a ficha preenchida, tentar acessar a Conferência Técnica diretamente.

Expected: banner de bloqueio "Aguardando a Ficha de Conferência Consultoras."

- [ ] **Step 8: Testar persiana motorizada**

Repetir o Step 4, mas desta vez selecionar "Motorizada", preencher Qtd Motor = 1 e Ordem = "123456". Salvar.

Confirmar que a ficha salva sem erro e o dado `acionamento: 'motorizado', qtdMotor: '1', ordem: '123456'` está em `dados_conferencia_consultoras` no banco.

- [ ] **Step 9: Reportar resultado ao usuário**

Registrar pass/fail para cada um dos 8 checks acima.

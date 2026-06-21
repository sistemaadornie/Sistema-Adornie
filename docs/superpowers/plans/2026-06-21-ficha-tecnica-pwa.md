# Ficha de Conferência Técnica no PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a Ficha de Conferência Técnica para o PWA do instalador (`frontend-instalador`), e corrigir um bug pré-existente onde `ordem_servico` é criada com o `tipo` errado para qualquer item de agendamento de Conferência.

**Architecture:** Reaproveita 100% dos endpoints de backend já existentes (`GET/PUT /os/:id`, `GET /agendamentos/:id/conferencia-itens`) — zero rota nova. O único backend tocado é o conserto de `criarOSSeNaoExistir`. No frontend-instalador: um util de estado por item, uma tela nova de ficha técnica (mobile, só toque), e duas integrações pequenas (lista de itens do agendamento + roteamento).

**Tech Stack:** Node.js/Express/Postgres (backend, Jest), React 19 + Vite + react-router-dom (frontend-instalador, sem test runner).

## Global Constraints

- A Ficha de Confecção continua só no painel web (consultora). O PWA só ganha a Ficha de Conferência Técnica (técnico).
- Sem esboço técnico nem assinatura do cliente nesta tela — só assinatura do técnico (obrigatória), canvas por toque.
- `frontend-instalador` não tem test runner — verificação de UI é manual.
- `criarOSSeNaoExistir` roda dentro de transações (`client.query`, não `db.query`) em dois call sites (`backend/src/services/agendamentoService.js:446` e `:593`) — a correção precisa manter o parâmetro `client` para não quebrar a atomicidade.

---

## Task 1: Corrigir `criarOSSeNaoExistir` (tipo certo, não cria OS para categorias sem ficha)

**Files:**
- Modify: `backend/src/services/agendamentoService.js:182-204` (função `criarOSSeNaoExistir`) e `:1407-1416` (`module.exports`)
- Test: `backend/src/__tests__/agendamentoServiceCriarOS.test.js` (novo arquivo)

**Interfaces:**
- Produces: `criarOSSeNaoExistir(itens, client)` agora exportada (só para teste direto — continua sendo chamada internamente do mesmo jeito pelas linhas 446/593). Para item com `pedido_item_id` cuja categoria não tem `tipo_confeccao`, não cria OS nenhuma. Para item cuja categoria tem `tipo_confeccao`, cria com `tipo` igual ao da categoria (não mais o default `'cortina'` da coluna).

- [ ] **Step 1: Escrever os testes (vão falhar — função ainda não exportada/corrigida)**

```js
const svc = require('../services/agendamentoService');

function criarClienteFake() {
  return { query: jest.fn() };
}

describe('criarOSSeNaoExistir', () => {
  test('cria OS com o tipo da categoria quando a categoria tem tipo_confeccao', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'cortina' }] }) // categoria
      .mockResolvedValueOnce({ rows: [] }) // já existe? não
      .mockResolvedValueOnce({ rows: [] }); // insert

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 5 }], client);

    expect(client.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 'cortina']
    );
  });

  test('não cria OS quando a categoria não tem tipo_confeccao', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({ rows: [{ tipo_confeccao: null }] });

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 6 }], client);

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não duplica quando a OS já existe', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 7 }], client);

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('ignora item sem pedido_item_id', async () => {
    const client = criarClienteFake();
    await svc.criarOSSeNaoExistir([{ nome: 'item digitado à mão' }], client);
    expect(client.query).not.toHaveBeenCalled();
  });

  test('ignora lista vazia', async () => {
    const client = criarClienteFake();
    await svc.criarOSSeNaoExistir([], client);
    expect(client.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest agendamentoServiceCriarOS`
Expected: FAIL — `svc.criarOSSeNaoExistir is not a function` (ainda não está em `module.exports`).

- [ ] **Step 3: Corrigir a função e exportá-la**

Substituir o bloco atual (linhas 182-204):

```js
/* ── criar Ordem de Serviço (OS) se não existir para itens de conferência ── */
async function criarOSSeNaoExistir(itens, client = db) {
  if (!itens || !itens.length) return;
  for (const it of itens) {
    let pedido_item_id = null;
    if (it && typeof it === "object") {
      pedido_item_id = it.pedido_item_id || it.id || null;
    }
    if (!pedido_item_id) continue;

    const check = await client.query(
      `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
      [pedido_item_id]
    );
    if (check.rows.length === 0) {
      await client.query(
        `INSERT INTO ordem_servico (pedido_item_id, status, aberta_em, created_at, updated_at)
         VALUES ($1, 'aberta', NOW(), NOW(), NOW())`,
        [pedido_item_id]
      );
    }
  }
}
```

por:

```js
/* ── criar Ordem de Serviço (OS) se não existir para itens de conferência ── */
async function criarOSSeNaoExistir(itens, client = db) {
  if (!itens || !itens.length) return;
  for (const it of itens) {
    let pedido_item_id = null;
    if (it && typeof it === "object") {
      pedido_item_id = it.pedido_item_id || it.id || null;
    }
    if (!pedido_item_id) continue;

    const { rows: catRows } = await client.query(
      `SELECT cat.tipo_confeccao
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.id = $1`,
      [pedido_item_id]
    );
    const tipoConfeccao = catRows[0]?.tipo_confeccao;
    if (!tipoConfeccao) continue;

    const check = await client.query(
      `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
      [pedido_item_id]
    );
    if (check.rows.length === 0) {
      await client.query(
        `INSERT INTO ordem_servico (pedido_item_id, status, tipo, aberta_em, created_at, updated_at)
         VALUES ($1, 'aberta', $2, NOW(), NOW(), NOW())`,
        [pedido_item_id, tipoConfeccao]
      );
    }
  }
}
```

E adicionar `criarOSSeNaoExistir` ao `module.exports` (linhas 1407-1416):

```js
module.exports = {
  getEquipe, listar, buscar, criar, atualizar, reagendar,
  alterarStatus, adicionarAnexos, adicionarFotoItem, excluir,
  getLogs, criarSugestao, listarSugestoes, responderSugestao,
  geocodificarTodos,
  decidirAprovacao, listarPendentesAprovacao, notificarAdminsAprovacao,
  listarConferenciaItens,
  upsertConferenciaItem,
  confirmarCliente,
  criarOSSeNaoExistir,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest agendamentoServiceCriarOS`
Expected: PASS (5 testes).

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: todas as suítes passam (nenhuma outra função do arquivo foi tocada).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoServiceCriarOS.test.js
git commit -m "fix(agendamentos): criarOSSeNaoExistir usa o tipo da categoria e ignora categorias sem ficha de confecção"
```

---

## Task 2: util `estadoFichaTecnica` (frontend-instalador)

**Files:**
- Create: `frontend-instalador/src/utils/fichaTecnica.js`

**Interfaces:**
- Produces: `estadoFichaTecnica(item) -> null | { acao: false, texto } | { acao: true, label }`, onde `item` tem o shape devolvido por `GET /agendamentos/:id/conferencia-itens` (`tipo_confeccao`, `confeccao_preenchida`, `ficha_preenchida`). Consumido pela Task 3.

- [ ] **Step 1: Criar o util**

```js
export function estadoFichaTecnica(item) {
  if (!item.tipo_confeccao) return null;
  if (!item.confeccao_preenchida) return { acao: false, texto: "Aguardando ficha de confecção" };
  if (item.ficha_preenchida) return { acao: true, label: "Visualizar Ficha" };
  return { acao: true, label: "Conferência Técnica" };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-instalador/src/utils/fichaTecnica.js
git commit -m "feat(pwa): util de estado da ficha técnica por item"
```

---

## Task 3: `AgendamentoDetalhe.jsx` — estado/ação de ficha por item

**Files:**
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx`
- Modify: `frontend-instalador/src/styles/app.css`

**Interfaces:**
- Consumes: `estadoFichaTecnica` (Task 2); `GET /agendamentos/:id/conferencia-itens` (endpoint já existente, devolve `{ itens: [...] }` com `pedido_item_id`, `ordem_servico_id`, `tipo_confeccao`, `confeccao_preenchida`, `ficha_preenchida` por item).
- Produces: navegação para `/agenda/:agendamentoId/os/:osId` (rota da Task 5).

- [ ] **Step 1: Adicionar `useNavigate` ao import do react-router-dom**

Trocar a linha 2:

```jsx
import { useParams } from "react-router-dom";
```

por:

```jsx
import { useParams, useNavigate } from "react-router-dom";
```

- [ ] **Step 2: Importar o util novo**

Adicionar, junto aos outros imports de utils (depois da linha do `import { api } from "../services/api";`):

```jsx
import { estadoFichaTecnica } from "../utils/fichaTecnica";
```

- [ ] **Step 3: Atualizar `ItemComFoto` para aceitar `estado`/`onAbrirFicha`**

Substituir a função `ItemComFoto` inteira (linhas 89-134) por:

```jsx
function ItemComFoto({ agendamentoId, item, podeFotografar, onFotoEnviada, estado, onAbrirFicha }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function onChange(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!arquivos.length) return;
    setEnviando(true);
    setErro("");
    try {
      const fd = new FormData();
      arquivos.forEach((f) => fd.append("arquivos", f));
      const data = await api.post(`/agendamentos/${agendamentoId}/itens/${item.id}/fotos`, fd, true);
      onFotoEnviada(item.id, data.fotos);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li className="item-row">
      <div className="item-row-info">
        <span className="item-row-nome">{item.nome}</span>
        {estado && (estado.acao ? (
          <button type="button" className="item-row-ficha-btn" onClick={() => onAbrirFicha(item)}>
            {estado.label}
          </button>
        ) : (
          <span className="item-row-ficha-aguardando">{estado.texto}</span>
        ))}
      </div>
      {item.fotos?.length > 0 && (
        <div className="item-row-fotos">
          {item.fotos.map((f) => (
            <img key={f.id} src={f.url} alt="" className="item-row-foto-mini" />
          ))}
        </div>
      )}
      {podeFotografar && (
        <label
          className="item-row-cam-btn"
          title="Adicionar foto"
          style={{ opacity: enviando ? 0.5 : 1, pointerEvents: enviando ? "none" : "auto" }}
        >
          <FiCamera size={14} />
          <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} style={{ display: "none" }} />
        </label>
      )}
      {erro && <span className="item-row-erro">{erro}</span>}
    </li>
  );
}
```

(Mudança real: o `<span className="item-row-nome">` saiu de filho direto do `<li>` para dentro de um novo `<div className="item-row-info">`, que também guarda o estado/ação da ficha. Resto da função idêntico.)

- [ ] **Step 4: Adicionar `useNavigate()` e o estado `fichaPorItem` no componente principal**

Logo após a linha `const [id, ...] = useParams();`-equivalente no início de `AgendamentoDetalhe` (linha `const { id } = useParams();`), adicionar:

```jsx
  const navigate = useNavigate();
```

E logo após a declaração `const [sheetMsg, setSheetMsg] = useState("");` (linha 161), adicionar:

```jsx
  const [fichaPorItem, setFichaPorItem] = useState({});
```

- [ ] **Step 5: Buscar `conferencia-itens` quando o agendamento for do tipo Conferência**

Logo após o `useEffect(() => { carregar(); }, [carregar]);` (linha 172), adicionar:

```jsx
  useEffect(() => {
    if (!ag || ag.tipo !== "Conferência") return;
    api.get(`/agendamentos/${ag.id}/conferencia-itens`)
      .then((r) => {
        const mapa = {};
        (r.itens || []).forEach((it) => { mapa[it.pedido_item_id] = it; });
        setFichaPorItem(mapa);
      })
      .catch(() => {});
  }, [ag?.id, ag?.tipo]);
```

- [ ] **Step 6: Passar `estado`/`onAbrirFicha` no card principal de itens**

Substituir o bloco do `<ul>` dentro da seção "Itens" (linhas 343-353):

```jsx
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {ag.itens_raw.map((item) => (
                <ItemComFoto
                  key={item.id}
                  agendamentoId={ag.id}
                  item={item}
                  podeFotografar={ag.status === "andamento"}
                  onFotoEnviada={atualizarFotosItem}
                />
              ))}
            </ul>
```

por:

```jsx
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {ag.itens_raw.map((item) => {
                const ficha = item.pedido_item_id != null ? fichaPorItem[item.pedido_item_id] : null;
                const estado = ficha ? estadoFichaTecnica(ficha) : null;
                return (
                  <ItemComFoto
                    key={item.id}
                    agendamentoId={ag.id}
                    item={item}
                    podeFotografar={ag.status === "andamento"}
                    onFotoEnviada={atualizarFotosItem}
                    estado={estado}
                    onAbrirFicha={() => {
                      if (ficha?.ordem_servico_id) navigate(`/agenda/${ag.id}/os/${ficha.ordem_servico_id}`);
                    }}
                  />
                );
              })}
            </ul>
```

(A segunda lista de itens, dentro do `BottomSheet` de status — usada só para Instalação/Retorno-Finalização — não recebe `estado`/`onAbrirFicha`: como esses tipos de agendamento nunca têm `tipo_confeccao`, o `ItemComFoto` ali simplesmente não renderiza nada de ficha, sem precisar de nenhuma mudança nesse segundo bloco.)

- [ ] **Step 7: Adicionar as classes CSS novas**

Em `frontend-instalador/src/styles/app.css`, logo depois do bloco `.item-row-erro` (linhas 845-848) e antes do comentário `/* ── Extra badges ── */`, adicionar:

```css
.item-row-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-row-ficha-aguardando {
  font-size: 11px;
  color: var(--color-text-muted);
}

.item-row-ficha-btn {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}
```

- [ ] **Step 8: Rodar o build**

Run: `cd frontend-instalador && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 9: Commit**

```bash
git add frontend-instalador/src/pages/AgendamentoDetalhe.jsx frontend-instalador/src/styles/app.css
git commit -m "feat(pwa): mostra estado/ação da ficha técnica por item no Detalhe do Agendamento"
```

---

## Task 4: Tela `FichaTecnicaInstalador.jsx`

**Files:**
- Create: `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx`

**Interfaces:**
- Consumes: `api` (`../services/api`), `useAuth` (`../context/AuthContext`), `TopBar` (`../components/TopBar`); `GET /os/:id` e `PUT /os/:id` (rotas já existentes do backend — mesmo contrato usado pelo painel web).
- Produces: componente de página `FichaTecnicaInstalador()` (sem props — lê `:agendamentoId`/`:osId` da própria rota), consumido pela Task 5.

- [ ] **Step 1: Criar o arquivo**

```jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";

function CanvasDraw({ value, onSave }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function stopDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onSave("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        style={{
          width: "100%", height: 160, touchAction: "none",
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "#fff",
        }}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={limpar}>
        Limpar assinatura
      </button>
    </div>
  );
}

const DADOS_TECNICOS_VAZIO = {
  largura: "", altura_esq: "", altura_meio: "", altura_dir: "",
  fixacao: "parede", lado_motor: "n/a", voltagem: "sem_motor",
  cortineiro: "não", tamanho_cortineiro: "", afastamento_suportes: "",
  responsavel_conferencia: "", data_conferencia: new Date().toISOString().slice(0, 10),
  acompanhado_por: "", assinatura_tecnico: "",
};

function painelConfeccao(dc, tipo) {
  if (!dc) return [];
  if (tipo === "forro") {
    return [
      ["Tecido do forro", dc.tecidoForro],
      ["Tipo de tecido", dc.tecidoTipo],
      ["Forro costurado", dc.forroCosturado],
      ["Largura do forro", dc.larguraForro],
      ["Largura do trilho", dc.larguraTrilho],
      ["Tipo wave", dc.tipoWave],
      ["Espaçador", dc.espacador],
    ];
  }
  return [
    ["Cortina feita por", dc.feitaPor],
    ["Espaçador", dc.espacador],
    ["Tipo wave", dc.tipoWave],
    ["Abertura", dc.abertura],
    ["Componente", dc.componente],
    ["Largura do trilho", dc.larguraTrilho],
    ["Largura do tecido", dc.larguraTecido],
    ["Nome do tecido", dc.nomeTecido],
    ["Altura da cortina", dc.alturaCortina],
    ["Vendeu barra aplicada", dc.vendeuBarraAplicada],
  ];
}

export default function FichaTecnicaInstalador() {
  const { agendamentoId, osId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);
  const [dados, setDados] = useState(DADOS_TECNICOS_VAZIO);

  useEffect(() => { carregar(); }, [osId]);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
      if (res.dados_tecnicos) {
        setDados((prev) => ({ ...prev, ...res.dados_tecnicos }));
      } else {
        setDados((prev) => ({ ...prev, responsavel_conferencia: user?.nome_completo || "" }));
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  function voltar() {
    navigate(`/agenda/${agendamentoId}`);
  }

  async function salvar() {
    setErro("");
    const { largura, altura_esq, altura_meio, altura_dir, responsavel_conferencia, data_conferencia, assinatura_tecnico } = dados;
    const parseNum = (v) => parseFloat(String(v).replace(",", "."));

    if (!largura || isNaN(parseNum(largura)) || parseNum(largura) <= 0) {
      setErro("A largura real é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_esq || isNaN(parseNum(altura_esq)) || parseNum(altura_esq) <= 0) {
      setErro("A altura esquerda é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_meio || isNaN(parseNum(altura_meio)) || parseNum(altura_meio) <= 0) {
      setErro("A altura do meio é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_dir || isNaN(parseNum(altura_dir)) || parseNum(altura_dir) <= 0) {
      setErro("A altura direita é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!responsavel_conferencia?.trim()) {
      setErro("O responsável pela conferência é obrigatório.");
      return;
    }
    if (!data_conferencia) {
      setErro("A data da conferência é obrigatória.");
      return;
    }
    if (!assinatura_tecnico?.trim()) {
      setErro("A assinatura do técnico é obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, dados);
      voltar();
    } catch (err) {
      setErro(err.message || "Erro ao salvar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page"><div className="spinner-wrap">Carregando...</div></div>
      </>
    );
  }

  if (!osData) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page">
          <div className="banner banner-danger">{erro || "Ordem de serviço não encontrada."}</div>
        </div>
      </>
    );
  }

  if (!osData.dados_confeccao) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page">
          <div className="banner banner-warning">
            Aguardando a Ficha de Confecção. A consultora ainda não preencheu a ficha de confecção deste item.
          </div>
        </div>
      </>
    );
  }

  const campos = painelConfeccao(osData.dados_confeccao, osData.tipo);

  return (
    <>
      <TopBar title="Conferência Técnica" back />
      <div className="page">
        {erro && <div className="banner banner-danger">{erro}</div>}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ficha de Confecção (referência)</h3>
          {campos.map(([label, valor]) => (
            <div className="detail-row" key={label}>
              <div>
                <span className="detail-label">{label}</span>
                {valor || "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Medidas Técnicas Reais</h3>
          <div className="form-group">
            <label>Largura Real (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 4,19" value={dados.largura} onChange={(e) => setCampo("largura", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Esq. (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_esq} onChange={(e) => setCampo("altura_esq", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Meio (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_meio} onChange={(e) => setCampo("altura_meio", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Dir. (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_dir} onChange={(e) => setCampo("altura_dir", e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Confirmação</h3>
          <div className="form-group">
            <label>Fixação</label>
            <select className="input-base" value={dados.fixacao} onChange={(e) => setCampo("fixacao", e.target.value)}>
              <option value="parede">Parede</option>
              <option value="teto">Teto</option>
              <option value="vão">Vão</option>
            </select>
          </div>
          <div className="form-group">
            <label>Lado Motor</label>
            <select className="input-base" value={dados.lado_motor} onChange={(e) => setCampo("lado_motor", e.target.value)}>
              <option value="n/a">Sem motor</option>
              <option value="esquerdo">Esquerdo</option>
              <option value="direito">Direito</option>
            </select>
          </div>
          <div className="form-group">
            <label>Voltagem</label>
            <select className="input-base" value={dados.voltagem} onChange={(e) => setCampo("voltagem", e.target.value)}>
              <option value="sem_motor">Sem Motor</option>
              <option value="110v">110V</option>
              <option value="220v">220V</option>
            </select>
          </div>
          <div className="form-group">
            <label>Cortineiro</label>
            <select className="input-base" value={dados.cortineiro} onChange={(e) => setCampo("cortineiro", e.target.value)}>
              <option value="não">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tamanho Cortineiro</label>
            <input className="input-base" type="text" placeholder="Ex: 30cm x 15cm" value={dados.tamanho_cortineiro} disabled={dados.cortineiro === "não"} onChange={(e) => setCampo("tamanho_cortineiro", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Afastamento Suportes (cm)</label>
            <input className="input-base" type="text" placeholder="Ex: 8 cm" value={dados.afastamento_suportes} onChange={(e) => setCampo("afastamento_suportes", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Acompanhado por</label>
            <input className="input-base" type="text" placeholder="Nome do cliente/arquiteto" value={dados.acompanhado_por} onChange={(e) => setCampo("acompanhado_por", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Responsável Conf.</label>
            <input className="input-base" type="text" value={dados.responsavel_conferencia} onChange={(e) => setCampo("responsavel_conferencia", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Data Conferência</label>
            <input className="input-base" type="date" value={dados.data_conferencia} onChange={(e) => setCampo("data_conferencia", e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Assinatura do Técnico</h3>
          <CanvasDraw value={dados.assinatura_tecnico} onSave={(val) => setCampo("assinatura_tecnico", val)} />
        </div>

        <button className="btn btn-primary btn-block" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "✓ Salvar Conferência Técnica"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-instalador/src/pages/FichaTecnicaInstalador.jsx
git commit -m "feat(pwa): tela Ficha de Conferência Técnica, com gate e assinatura por toque"
```

---

## Task 5: Rota em `App.jsx`

**Files:**
- Modify: `frontend-instalador/src/App.jsx`

**Interfaces:**
- Consumes: `FichaTecnicaInstalador` (Task 4).
- Produces: rota `/agenda/:agendamentoId/os/:osId`, navegada pela Task 3.

- [ ] **Step 1: Importar o componente**

Adicionar, depois de `import AgendamentoDetalhe from "./pages/AgendamentoDetalhe";`:

```jsx
import FichaTecnicaInstalador from "./pages/FichaTecnicaInstalador";
```

- [ ] **Step 2: Adicionar a rota**

Adicionar, depois de `<Route path="/agenda/:id" element={<AgendamentoDetalhe />} />`:

```jsx
            <Route path="/agenda/:agendamentoId/os/:osId" element={<FichaTecnicaInstalador />} />
```

- [ ] **Step 3: Rodar o build**

Run: `cd frontend-instalador && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend-instalador/src/App.jsx
git commit -m "feat(pwa): rota /agenda/:agendamentoId/os/:osId"
```

---

## Task 6: Verificação manual no celular/navegador

**Files:** nenhum.

- [ ] **Step 1: Subir backend e o PWA**

Run: `cd backend && npm run dev` e, em outro terminal, `cd frontend-instalador && npm run dev`.

- [ ] **Step 2: Abrir um agendamento de tipo Conferência com itens de Cortina/Forro cuja ficha de confecção já esteja preenchida** (preencher pelo painel web antes, se precisar)

- [ ] **Step 3: No Detalhe do Agendamento, confirmar que o item mostra o botão "Conferência Técnica"**

Expected: itens sem `tipo_confeccao` (Persianas etc.) não mostram nada; itens com confecção pendente mostram "Aguardando ficha de confecção" sem botão; itens com confecção pronta mostram o botão.

- [ ] **Step 4: Tocar no botão, confirmar que abre a Ficha de Conferência Técnica com o painel de referência preenchido**

- [ ] **Step 5: Preencher as medidas, confirmar que o nome do técnico logado já vem preenchido em "Responsável Conf."**

- [ ] **Step 6: Assinar por toque, salvar, confirmar que volta para o Detalhe do Agendamento e que o item passa a mostrar "Visualizar Ficha"**

- [ ] **Step 7: Criar um novo agendamento de Conferência com um item de categoria sem ficha de confecção (ex: Persiana) e um item de Forro, confirmar que só o item de Forro ganha uma `ordem_servico` (consultar a tabela ou usar a Task 1 como referência) — valida o conserto do bug**

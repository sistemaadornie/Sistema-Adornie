# Design: Detecção automática de modelo/acionamento na importação + seleção de tipo de persiana no fluxo

**Data:** 2026-06-13
**Status:** Aprovado

---

## Contexto

Este é o **subprojeto 2** de 5 (ver memória `categorizacao-automatica-importacao`). O subprojeto 1 (PDF obrigatório na importação) já foi implementado.

Hoje, `/importar-texto` ([pedidosRoutes.js:755-809](backend/src/routes/pedidosRoutes.js#L755-L809)) já detecta a **categoria** de cada item via `detectarNomeCategoriaPedido` ([pedidosRoutes.js:394-411](backend/src/routes/pedidosRoutes.js#L394-L411)), usando `CATEGORIA_KEYWORDS_PEDIDO` ([pedidosRoutes.js:382-392](backend/src/routes/pedidosRoutes.js#L382-L392)). As colunas `pedido_itens.modelo` (VARCHAR) e `pedido_itens.especificacoes` (JSONB) já existem e já são persistidas por `_salvarItens` no INSERT/UPDATE de itens — basta que o item chegue ao backend com esses campos preenchidos.

**Dados reais analisados** (consulta no Postgres local) mostram um padrão consistente:

- Cortinas/Forros: a descrição já contém o **modelo** e o **acionamento** explicitamente, ex: `"CORTINA WAVE COM BARRA DE 30CM NO LINHO MISTO 30% - ACIONAMENTO MOTORIZADO"`, `"...| MODELO WAVE | ... "`.
- Persianas: a descrição contém o **acionamento** (`"PERSIANA HUNTER DOUGLAS TELA SOLAR 3% | ACIONAMENTO MANUAL | COR: BEGE"`), mas **nunca** o tubo/bandô/modelo específico — essas informações simplesmente não existem no texto do pedido.

Por isso, modelo + tubo + bandô de persiana **não podem ser auto-detectados** e precisam de seleção manual. Existe um catálogo praticamente idêntico ao especificado pelo usuário em `frontend-web/src/pages/pedidos/importKeywordConfig.js` (`KEYWORD_MODELS`, incluindo Meliade, Illumine, Lumiere/Diamond/Silouette, Rolo/Rollo com caixas, Rolo Stilo/Shadow/Twinline/D.Vision com tubos 30/38/45/53mm — e 65/70/88/110mm para Rolo — e bandôs 32/38/53mm) e um painel já construído em `ModeloSelectorPanel.jsx` (exporta `PersianaSelectorPanel` via dispatcher `tipo="persiana"`). Ambos os arquivos foram criados no commit `5ff8151`, integrados à tela de importação em `a93c445` e **removidos** dela em `75a962c` ("simplificar ImportarPedidoModal — só dados brutos + categoria auto"). Ficaram órfãos, mas continuam no repositório e funcionam.

**Decisão de design (v2, aprovada pelo usuário):** a seleção de modelo/tubo/bandô de persiana **não acontece na tela de importação**. A importação só mostra sucesso/erro. Depois de importado, o usuário abre o pedido pelo fluxo (Etapa 1 "📋 Pedidos" — `EtapaDadosPedido.jsx`), onde aparece um botão condicional para selecionar o tipo, caso o sistema detecte que algum item de Persiana ainda não tem modelo definido.

## Objetivo

1. Durante `/importar-texto`, detectar automaticamente a partir da descrição:
   - **Modelo** de Cortina (`Cortina Wave` / `Cortina Prega Macho` / `Cortina Prega Americana` / `Cortina Franzida`) e de Forro (`Forro Franzido Blackout` / `Forro Franzido Microfibra`), salvos em `pedido_itens.modelo`.
   - **Acionamento** (`manual` / `motorizado`) para itens de Cortinas, Forros e Persianas, salvo em `pedido_itens.especificacoes.acionamento`.
   - Persianas **não** recebem `modelo` automático (fica `null`).
2. `buscarFluxoPedido` (`dashboardService.js`) passa a calcular `itens_persiana_pendentes`: quantidade de itens da categoria "Persianas" com `modelo IS NULL`.
3. Em `EtapaDadosPedido.jsx`, exibir um botão condicional **"🎛️ Selecionar Tipo"** (visível apenas quando `itens_persiana_pendentes > 0`), que abre um novo modal.
4. Novo modal `SelecionarTipoPersianaModal.jsx` lista as persianas pendentes; cada uma tem um botão **"+ Selecionar"** que abre o `PersianaSelectorPanel` (já existente em `ModeloSelectorPanel.jsx`, usando o catálogo de `importKeywordConfig.js`) para escolher modelo/tubo/bandô.
5. Novo endpoint `PATCH /pedidos/:id/itens/:itemId/modelo` salva `{ modelo, especificacoes }` no item e registra a ação em `pedido_auditoria` (a exibição desse histórico no modal de fluxo é o subprojeto 5 — aqui só garantimos que o registro já existe na tabela).

---

## 1. Backend — Detecção de modelo e acionamento (`/importar-texto`)

Em [pedidosRoutes.js](backend/src/routes/pedidosRoutes.js), logo após `detectarNomeCategoriaPedido` (depois da linha 411), adicionar:

```js
// ─── Detecção de modelo/acionamento por keyword na descrição do item ────────
const MODELO_KEYWORDS_CORTINA = [
  { keywords: ["wave"],             modelo: "Cortina Wave"            },
  { keywords: ["prega macho"],      modelo: "Cortina Prega Macho"     },
  { keywords: ["prega americana"],  modelo: "Cortina Prega Americana" },
  { keywords: ["franzid"],          modelo: "Cortina Franzida"        },
];

const MODELO_KEYWORDS_FORRO = [
  { keywords: ["blackout"],   modelo: "Forro Franzido Blackout"   },
  { keywords: ["microfibra"], modelo: "Forro Franzido Microfibra" },
];

function detectarAcionamento(lower) {
  if (lower.includes("motoriza")) return "motorizado";
  if (lower.includes("manual"))   return "manual";
  return null;
}

function detectarModeloEEspecificacoes(descricao, nomeCategoria) {
  if (!descricao) return { modelo: null, especificacoes: null };
  const lower = descricao.toLowerCase();

  const acionamento = detectarAcionamento(lower);
  const especificacoes = acionamento ? { acionamento } : null;

  let candidatos = null;
  if (nomeCategoria === "Cortinas") candidatos = MODELO_KEYWORDS_CORTINA;
  else if (nomeCategoria === "Forros") candidatos = MODELO_KEYWORDS_FORRO;

  let modelo = null;
  if (candidatos) {
    for (const { keywords, modelo: nomeModelo } of candidatos) {
      if (keywords.some((k) => lower.includes(k))) { modelo = nomeModelo; break; }
    }
  }

  return { modelo, especificacoes };
}
```

Em [pedidosRoutes.js:796-800](backend/src/routes/pedidosRoutes.js#L796-L800), incluir o resultado no item:

```js
const itensComCategoria = itens.map((it) => {
  const nomeCategoria = detectarNomeCategoriaPedido(it.descricao);
  const categoria_id = nomeCategoria ? (catMap[nomeCategoria.toLowerCase()] ?? null) : null;
  const { modelo, especificacoes } = detectarModeloEEspecificacoes(it.descricao, nomeCategoria);
  return { ...it, categoria_id, modelo, especificacoes };
});
```

Esses campos seguem o caminho já existente: `ImportarPedidoModal.jsx` ([linha 103-109](frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx#L103-L109)) espalha `...rest` (que inclui `modelo`/`especificacoes`) em cada item de `itens`, e ao confirmar a importação esses itens são enviados para `_salvarItens`, que **já** persiste `modelo`/`especificacoes` no INSERT/UPDATE. Nenhuma mudança extra é necessária no frontend de importação para isso funcionar.

---

## 2. Backend — novo endpoint `PATCH /pedidos/:id/itens/:itemId/modelo`

Em [pedidosRoutes.js](backend/src/routes/pedidosRoutes.js), logo depois do endpoint `PATCH /:id/itens/:itemId/sem-vinculo` (linha 664-692), seguindo o mesmo padrão de verificação de posse:

```js
router.patch("/:id/itens/:itemId/modelo", authMiddleware, async (req, res) => {
  const pedidoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const empresaId = req.user.empresa_id;
  const { modelo, especificacoes } = req.body;

  if (!modelo || typeof modelo !== "string") {
    return res.status(400).json({ message: "Campo 'modelo' obrigatório." });
  }

  const client = await db.connect();
  try {
    const { rows: check } = await client.query(
      `SELECT pi.id, pi.descricao FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE pedido_itens SET modelo = $1, especificacoes = $2 WHERE id = $3
       RETURNING id, modelo, especificacoes`,
      [modelo, (typeof especificacoes === "object" && especificacoes !== null) ? especificacoes : null, itemId]
    );

    const partes = [`Modelo: "${modelo}"`];
    if (especificacoes?.tubo) partes.push(`Tubo: ${especificacoes.tubo}`);
    if (especificacoes?.bando) partes.push(`Bandô: ${especificacoes.bando}`);

    await auditSvc.registrarAuditoria(client, {
      pedidoId, empresaId, usuarioId: req.user.id,
      etapa: "dados_pedido",
      acao: "categorizacao",
      descricao: `${check[0].descricao} — ${partes.join(", ")}`,
    });
    await client.query("COMMIT");

    return res.json({ item: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar modelo do item." });
  } finally {
    client.release();
  }
});
```

`auditSvc` já está importado em `pedidosRoutes.js` ([linha 7](backend/src/routes/pedidosRoutes.js#L7): `const auditSvc = require("../services/auditoriaService");`) — nenhum import novo necessário.

---

## 3. Backend — `itens_persiana_pendentes` em `buscarFluxoPedido`

Em [dashboardService.js](backend/src/services/dashboardService.js), a função `buscarFluxoPedido` (linha 383) já roda um `Promise.all` de 8 queries nas linhas 452-530 (`totalItensRows`, `itensCobertosRows`, `itensSemCatRows`, ... `produtoOkRows`). Adicionar uma 9ª query a esse mesmo `Promise.all`:

```js
db.query(
  `SELECT COUNT(*)::int AS pendentes
   FROM pedido_itens pi
   JOIN categorias cat ON cat.id = pi.categoria_id
   WHERE pi.pedido_id = $1
     AND cat.nome = 'Persianas'
     AND pi.modelo IS NULL`,
  [pedidoId]
),
```

E destructure correspondente:

```js
const [
  { rows: totalItensRows },
  { rows: itensCobertosRows },
  { rows: itensSemCatRows },
  { rows: itensSemVinculoRows },
  { rows: confRows },
  { rows: prodRows },
  { rows: agendadoRows },
  { rows: produtoOkRows },
  { rows: itensPersianaPendentesRows },
] = await Promise.all([ ... ]);
```

Depois da linha 540, adicionar:

```js
const itensPersianaPendentes = itensPersianaPendentesRows[0]?.pendentes ?? 0;
```

Esse `Promise.all` é executado **antes** do `if (!genitoresRaw.length)` (linha 542), ou seja, o valor já está disponível para os dois branches de retorno. Incluir `itens_persiana_pendentes: itensPersianaPendentes` no objeto `progresso` da etapa 1 em **ambos os pontos**:

- Branch sem genitores, [dashboardService.js:565](backend/src/services/dashboardService.js#L565)
- Branch normal, [dashboardService.js:691-698](backend/src/services/dashboardService.js#L691-L698)

```js
progresso: {
  tem_anexo: anexos.length > 0,
  verificacao_ok: !!pedido.verificacao_ok,
  itens_sem_categoria: itensSemCategoria,
  itens_sem_vinculo: itensSemVinculo,
  total_itens: totalItens,
  itens_cobertos: itensCobertos,
  itens_persiana_pendentes: itensPersianaPendentes,
},
```

`itens_persiana_pendentes` é **apenas informativo** — não entra em `calcularEtapaAtual` nem afeta `etapa1_ok`. Selecionar o tipo de persiana é uma ação recomendada, não um critério de conclusão da etapa 1.

---

## 4. Frontend — botão condicional em `EtapaDadosPedido.jsx`

Em [EtapaDadosPedido.jsx](frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx):

- Novo import: `import SelecionarTipoPersianaModal from "./SelecionarTipoPersianaModal";`
- Novo estado, ao lado de `vinculando` (linha 29): `const [selecionandoTipo, setSelecionandoTipo] = useState(false);`
- Novo botão no header (linha 65), ao lado de "🔗 Vincular Itens":

```jsx
{(p.itens_persiana_pendentes ?? 0) > 0 && (
  <button className="pf-btn-secondary" onClick={() => setSelecionandoTipo(true)}>
    🎛️ Selecionar Tipo ({p.itens_persiana_pendentes})
  </button>
)}
```

- Novo bloco de renderização condicional, junto aos demais modais (após o bloco `{vinculando && (...)}`, linha 140-146):

```jsx
{selecionandoTipo && (
  <SelecionarTipoPersianaModal
    pedidoId={pedidoId}
    onClose={() => setSelecionandoTipo(false)}
    onRecarregar={onRecarregar}
  />
)}
```

---

## 5. Frontend — novo modal `SelecionarTipoPersianaModal.jsx`

Novo arquivo `frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx`, seguindo o padrão de carregamento de [VincularItensModal.jsx:19-40](frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx#L19-L40) (busca `GET /pedidos/:id` + `GET /categorias`) e reutilizando `ModeloSelectorPanel` (default export de `frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx`, que já dispacha para `PersianaSelectorPanel` quando `tipo === "persiana"`) e `KEYWORD_MODELS` de `frontend-web/src/pages/pedidos/importKeywordConfig.js` (entrada com `tipo: "persiana"`, que contém o catálogo Meliade/Illumine/Lumiere-Diamond-Silouette/Rolo-Rollo/Rolo Stilo-Shadow-Twinline-D.Vision com tubos e bandôs).

```jsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";
import ModeloSelectorPanel from "../../ModeloSelectorPanel";
import { KEYWORD_MODELS } from "../../importKeywordConfig";

const PERSIANA_CONFIG = KEYWORD_MODELS.find((k) => k.tipo === "persiana");

export default function SelecionarTipoPersianaModal({ pedidoId, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionandoItemId, setSelecionandoItemId] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      api.get(`/pedidos/${pedidoId}`),
      api.get("/categorias"),
    ])
      .then(([pedidoRes, catRes]) => {
        if (!ativo) return;
        setItens(pedidoRes.pedido?.itens || []);
        setCategorias(catRes.categorias || []);
      })
      .catch((e) => { if (ativo) setErro(e?.message || "Erro ao carregar itens."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  const categoriaPorId = useMemo(() => {
    const map = {};
    categorias.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categorias]);

  const persianas = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.nome === "Persianas"),
    [itens, categoriaPorId]
  );
  const pendentes = persianas.filter((it) => !it.modelo);
  const resolvidas = persianas.filter((it) => it.modelo);

  async function salvarTipo(itemId, valor) {
    try {
      await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/modelo`, valor);
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, modelo: valor.modelo, especificacoes: valor.especificacoes } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao salvar tipo de persiana.");
    } finally {
      setSelecionandoItemId(null);
    }
  }

  function handleFechar() {
    onRecarregar?.();
    onClose();
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">🎛️ Selecionar Tipo de Persiana</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && persianas.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item de Persianas neste pedido.
            </div>
          )}

          {pendentes.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">{item.descricao}</span>
              <span className="pf-badge pf-badge-pend">Sem tipo definido</span>
              <button className="pf-btn-secondary" onClick={() => setSelecionandoItemId(item.id)}>
                + Selecionar
              </button>
              {selecionandoItemId === item.id && (
                <ModeloSelectorPanel
                  tipo="persiana"
                  config={PERSIANA_CONFIG}
                  valor={{ modelo: item.modelo, especificacoes: item.especificacoes }}
                  onChange={(valor) => salvarTipo(item.id, valor)}
                  onClose={() => setSelecionandoItemId(null)}
                />
              )}
            </div>
          ))}

          {resolvidas.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">
                {item.descricao}{" "}
                <small style={{ opacity: .6 }}>
                  ({item.modelo}{item.especificacoes?.tubo ? `, tubo ${item.especificacoes.tubo}` : ""}{item.especificacoes?.bando ? `, ${item.especificacoes.bando}` : ""})
                </small>
              </span>
              <span className="pf-badge pf-badge-ok">Configurada</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <span style={{ fontSize: 13, color: "var(--pf-card-sub)" }}>
            {resolvidas.length} de {persianas.length} persianas configuradas
          </span>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
```

Notas:
- `PersianaSelectorPanel` (dentro de `ModeloSelectorPanel.jsx`) já chama `onClose()` internamente após `aplicar()`, então `onChange` + fechamento automático já funcionam sem ajuste.
- O `salvarTipo` é otimista no estado local (`setItens`); como `pendentes`/`resolvidas` são derivados via `useMemo` de `itens`, o item migra automaticamente de uma lista para a outra após salvar.
- `pedidoRes.pedido.itens` já vem com `modelo`/`especificacoes`: `buscar`/`montarPedido` ([pedidoService.js:131](backend/src/services/pedidoService.js#L131)) usa `SELECT pi.*`, que cobre essas colunas — nenhuma mudança de query necessária.

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `backend/src/routes/pedidosRoutes.js` | Novas constantes `MODELO_KEYWORDS_CORTINA`/`MODELO_KEYWORDS_FORRO`, funções `detectarAcionamento`/`detectarModeloEEspecificacoes`; `/importar-texto` passa `modelo`/`especificacoes` para cada item; novo endpoint `PATCH /:id/itens/:itemId/modelo` |
| `backend/src/services/dashboardService.js` | `buscarFluxoPedido` calcula `itens_persiana_pendentes` (9ª query do `Promise.all`) e inclui no `progresso` da etapa 1 (2 pontos) |
| `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx` | Novo estado `selecionandoTipo`, botão condicional "🎛️ Selecionar Tipo", render do novo modal |
| `frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx` | Novo — lista persianas pendentes, abre `ModeloSelectorPanel` (tipo persiana), salva via `PATCH .../modelo` |
| `frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx` | Reaproveitado sem alterações (já órfão, volta a ser usado) |
| `frontend-web/src/pages/pedidos/importKeywordConfig.js` | Reaproveitado sem alterações (catálogo de persianas) |

---

## Fora do escopo

- Vínculo automático trilho↔cortina/forro por medida (subprojeto 3).
- Categorias vinculáveis / "Controle" (subprojeto 4).
- Exibição do histórico de ações automáticas no modal de fluxo (subprojeto 5) — o registro em `pedido_auditoria` já é criado por este subprojeto (seção 2), mas sua exibição fica para depois.
- Detecção automática de tubo/bandô/modelo de persiana a partir do texto — confirmado que essa informação não existe no PDF.
- Edição manual de `modelo`/`especificacoes` de Cortinas/Forros/Trilhos via UI — o campo `modelo` simples já existe no editor de itens (`Pedidos.jsx`), sem mudanças aqui.
- Alterações na tela de revisão da importação (`ImportarPedidoModal.jsx`) além do passthrough automático de `modelo`/`especificacoes` já existente.

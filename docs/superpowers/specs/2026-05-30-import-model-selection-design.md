# Design: Seleção de Modelos e Vinculação de Itens na Importação de Pedidos

**Data:** 2026-05-30  
**Status:** Aprovado

## Contexto

O sistema atual importa pedidos via PDF ou texto colado. Na etapa de revisão, itens como "CORTINA LINHO" ou "PERSIANA ROLO" aparecem com a descrição crua extraída do PDF — sem informação de modelo (Wave, Prega Macho, Rolo/Rollo etc.) ou especificações técnicas (tubo, bandô). Isso obriga o time a completar manualmente esses dados após a importação.

Além disso, pedidos frequentemente contêm trilhos motorizados que pertencem a uma cortina ou forro específico do mesmo pedido, mas essa relação não é registrada em lugar nenhum.

## Objetivo

1. Na etapa de revisão da importação, detectar palavras-chave na coluna produto e permitir que o usuário selecione o modelo e especificações de cada item detectado.
2. Permitir que trilhos sejam vinculados a uma cortina ou forro do mesmo pedido.

---

## Modelo de Dados

Nova migração: `backend/src/database/migrations/pedido_itens_v3.sql`

```sql
ALTER TABLE pedido_itens
  ADD COLUMN modelo             VARCHAR(120),
  ADD COLUMN especificacoes     JSONB,
  ADD COLUMN item_vinculado_id  INTEGER REFERENCES pedido_itens(id);
```

| Campo | Tipo | Uso |
|---|---|---|
| `modelo` | VARCHAR(120) | Modelo selecionado: "Wave", "Rolo / Rollo", "Forro Blackout", etc. |
| `especificacoes` | JSONB | Specs de persiana: `{"tubo":"45mm","bando":"Bandô 38mm"}` |
| `item_vinculado_id` | INTEGER FK | Trilho → ID do item de cortina/forro vinculado |

---

## Configuração de Palavras-Chave e Modelos

Novo arquivo: `frontend-web/src/pages/pedidos/importKeywordConfig.js`

Define o mapeamento keyword → tipo → modelos/specs disponíveis:

```js
export const KEYWORD_MODELS = [
  {
    keywords: ["cortina"],
    tipo: "cortina",
    modelos: ["Cortina Wave", "Cortina Prega Macho", "Cortina Prega Americana", "Cortina Franzida"]
  },
  {
    keywords: ["forro"],
    tipo: "forro",
    modelos: ["Forro Microfibra", "Forro Blackout"]
  },
  {
    keywords: ["persiana"],
    tipo: "persiana",
    modelos: [
      {
        nome: "Meliade",
        tubos: ["30mm","38mm","45mm","53mm"],
        bandos: ["Bandô 32mm","Bandô 38mm","Bandô 53mm"]
      },
      {
        nome: "Illumine",
        tubos: ["30mm","38mm","45mm","53mm"],
        bandos: ["Bandô 32mm","Bandô 38mm","Bandô 53mm"]
      },
      {
        nome: "Lumiere / Diamond / Silouette",
        tubos: ["30mm","38mm","45mm","53mm"],
        bandos: ["Bandô 32mm","Bandô 38mm","Bandô 53mm"]
      },
      {
        nome: "Rolo / Rollo",
        tubos: ["30mm","38mm","45mm","53mm","65mm","70mm","88mm","110mm"],
        caixas: ["Caixa box 90mm","Caixa box 70mm","Caixa box grande"],
        bandos: ["Bandô 32mm","Bandô 38mm","Bandô 53mm"]
      },
      {
        nome: "Rolo Stilo / Shadow / Twinline / D. Vision",
        tubos: ["30mm","38mm","45mm","53mm"],
        bandos: ["Bandô 32mm","Bandô 38mm","Bandô 53mm"]
      }
    ]
  },
  {
    keywords: ["trilho"],
    tipo: "trilho",
    modelos: [] // sem seleção de modelo — apenas ativa vinculação
  }
]

export function detectarTipo(descricao = "") {
  const lower = descricao.toLowerCase()
  return KEYWORD_MODELS.find(cfg => cfg.keywords.some(k => lower.includes(k))) ?? null
}
```

---

## Interface — Tabela de Revisão

Arquivo alterado: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`

### Novas colunas na tabela

**Coluna "Modelo"** (após coluna Produto):
- `cortina` / `forro`: botão "Selecionar modelo" que abre painel lateral com botões de seleção simples.
- `persiana`: botão "Selecionar modelo" que abre painel lateral com 3 dropdowns em cascata:
  1. Modelo (obrigatório)
  2. Tubo (obrigatório, carregado ao selecionar modelo)
  3. Bandô / Caixa (opcional, carregado ao selecionar modelo; inclui opção "Nenhum")
- Após seleção: badge `"Wave ✓"` substitui o botão, com ícone de edição para reabrir.
- Tipo `null`: célula vazia.

**Coluna "Vinculado a"**:
- A coluna só é renderizada na tabela se houver pelo menos um item do tipo `trilho` no pedido.
- Nas linhas de tipo `trilho`: exibe dropdown listando todos os itens do mesmo pedido detectados como `cortina` ou `forro`. Formato: `#N · Ambiente · Modelo` (ex: `#1 · Sala · Wave`). Opção padrão: "— Não vincular —".
- Nas demais linhas: célula vazia.
- Ao remover uma linha de cortina/forro da tabela, o vínculo correspondente nos trilhos é limpo automaticamente.

### Estado local

```js
// selecoes[itemIdx] = { modelo, especificacoes, item_vinculado_idx }
const [selecoes, setSelecoes] = useState({})
```

No submit, `item_vinculado_idx` é resolvido para o `id` real retornado pelo backend após salvar os itens em sequência.

---

## Backend

### Migração
`backend/src/database/migrations/pedido_itens_v3.sql` — ALTER TABLE com as 3 colunas.

### `pedidoService.js` — `_salvarItens()`
Atualizar o INSERT para incluir `modelo`, `especificacoes`, `item_vinculado_id`.

### `pedidosRoutes.js` — `POST /pedidos/importar`
Aceitar os novos campos no payload de itens (sem lógica adicional).

---

## Tratamento de Erros

- Seleção de modelo é **opcional** — campos ficam `null` se não selecionado, importação não é bloqueada.
- Vínculo de trilho é **opcional** — padrão "Não vincular".
- Remover linha vinculada da tabela de revisão limpa o `item_vinculado_idx` dos trilhos que a referenciam.

---

## Verificação

1. Importar PDF/texto com itens contendo "cortina", "forro", "persiana" e "trilho" na coluna produto.
2. Na revisão: confirmar que botão "Selecionar modelo" aparece apenas nas linhas corretas.
3. Confirmar que coluna "Vinculado a" aparece somente em linhas de trilho.
4. Selecionar modelos e vincular trilho a uma cortina.
5. Confirmar importação e verificar no banco: `modelo`, `especificacoes`, `item_vinculado_id` preenchidos corretamente em `pedido_itens`.
6. Abrir o pedido salvo e verificar que os dados aparecem na visualização do pedido.

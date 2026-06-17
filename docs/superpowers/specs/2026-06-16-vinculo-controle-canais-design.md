# Vínculo Automático — Controle por Canais

**Data:** 2026-06-16  
**Status:** Aprovado

---

## Contexto

O sistema já vincula Trilho → Cortina/Forro automaticamente (por ambiente + largura exata).  
Este spec estende o motor de vínculo automático para:

1. Vincular **Controles** a itens motorizados (Cortina + Forro) dentro do mesmo ambiente, distribuindo canais
2. Forro Motorizado segue a mesma cadeia da Cortina Motorizada: precisa de Trilho Motorizado + Controle
3. Exibir aviso informativo na Etapa 1 quando um ambiente tem mais itens motorizados do que canais disponíveis
4. Corrigir bug: `categorias.Cortinas (empresa 2).vinculavel = true` incorreto

---

## Regras de Negócio

### Vínculo Trilho → Cortina/Forro (sem mudança)
- Exige: mesmo `ambiente`, mesma `largura` (exata), exatamente 1 Trilho e 1 Cortina/Forro com aquela largura no ambiente
- Detectado via: `vinculavel=true` (Trilho) ↔ `recebe_vinculo_automatico=true` (Cortina/Forro)

### Vínculo Controle → Itens Motorizados (novo)
- Um Controle com N canais pode ser vinculado a até N itens motorizados no mesmo ambiente
- **Item motorizado** = `recebe_vinculo_automatico=true` E `especificacoes->>'acionamento' = 'motorizado'`
- **N canais** = extraído da descrição do Controle via regex `/(\d+)\s*canais?/i`
- Se N não encontrado na descrição → Controle é ignorado (não há como determinar canais)
- Se `motorizados <= N` → vincula todos os motorizados ao Controle (`tipo_vinculo='controle_canal'`)
- Se `motorizados > N` → **não vincula** e registra ambiente como "insuficiente" (aviso na Etapa 1)
- Um item motorizado pode ter dois vínculos: um com o Trilho (`tipo_vinculo='acessorio'`) e um com o Controle (`tipo_vinculo='controle_canal'`)

### Aviso na Etapa 1
- Calculado em tempo real ao verificar a Etapa 1 (não persiste em banco)
- Apenas informativo — não bloqueia conclusão da etapa
- Formato: "⚠️ [Ambiente]: N itens motorizados, apenas M canais disponíveis. Verifique o controle ou adicione outro."

---

## Modelo de Dados

### Migration: `categorias_distribui_canais.sql`

```sql
-- Nova flag: quando true, usa lógica de canal (não de largura) para vínculo
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS distribui_canais BOOLEAN NOT NULL DEFAULT false;

-- Controles usam lógica de canal
UPDATE categorias SET distribui_canais = true WHERE LOWER(nome) = 'controles';

-- Bugfix: Cortinas não deve ser vinculavel (era true incorretamente na empresa 2)
UPDATE categorias SET vinculavel = false WHERE LOWER(nome) = 'cortinas';
```

### `pedido_item_vinculos` (sem mudança de schema)

| campo | valor |
|---|---|
| `tipo_vinculo = 'acessorio'` | Trilho → Cortina/Forro (existente) |
| `tipo_vinculo = 'controle_canal'` | Controle → item motorizado (novo) |

---

## Arquitetura

### `backend/src/services/vinculoAutomaticoService.js`

**Query em `processarPedido`** — adiciona 3 campos:
```sql
c.distribui_canais,
pi.especificacoes->>'acionamento' AS acionamento,
c.nome AS categoria_nome
```

**Nova função `encontrarVinculosControle(itens)`**:
```
1. Agrupa itens por ambiente (ignora ambiente nulo/vazio)
2. Para cada ambiente:
   a. controles = itens onde distribui_canais=true
   b. motorizados = itens onde recebe_vinculo_automatico=true E acionamento='motorizado'
   c. Para cada controle:
      - extrai N via /(\d+)\s*canais?/i na descricao
      - se N não encontrado → skip
      - se motorizados.length <= N → retorna pares (controle → cada motorizado)
      - se motorizados.length > N  → retorna ambiente como insuficiente
3. Retorna { pares: [{acessorioId, principalId}], insuficientes: [{ambiente, motorizados, canais}] }
```

**`processarPedido` passa a:**
1. Rodar `encontrarPares` → cria vínculos `'acessorio'` (sem mudança)
2. Rodar `encontrarVinculosControle` → cria vínculos `'controle_canal'`
3. Retornar `{ ambientesInsuficientes }` para quem chama

**`_processarVinculoAutomatico` em `pedidoService.js`** — o resultado (ambientesInsuficientes) é descartado aqui (só é relevante na Etapa 1).

### `backend/src/services/pedidoService.js` — `_verificarEtapa1`

Atualmente retorna `{ ok, itens_persiana_pendentes }`.

Passa a retornar também:
```js
ambientes_canais_insuficientes: [
  { ambiente: "Sala", motorizados: 10, canais: 5 }
]
```

Calculado com a mesma lógica de `encontrarVinculosControle` (extraída como função pura importada do serviço), mas sem criar vínculos — só para leitura.

### `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

Onde hoje aparece o aviso de persianas pendentes, adiciona bloco para cada ambiente insuficiente:

```jsx
{verificacao.ambientes_canais_insuficientes?.map(a => (
  <div className="aviso-canais">
    ⚠️ <strong>{a.ambiente}</strong>: {a.motorizados} itens motorizados,
    apenas {a.canais} {a.canais === 1 ? 'canal' : 'canais'} no controle.
    Verifique o controle ou adicione outro.
  </div>
))}
```

Aviso é **informativo** — não bloqueia conclusão da Etapa 1.

---

## Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `backend/src/database/migrations/categorias_distribui_canais.sql` | Novo |
| `backend/src/services/vinculoAutomaticoService.js` | Modificado (nova função + query) |
| `backend/src/services/pedidoService.js` | Modificado (`_verificarEtapa1`) |
| `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx` | Modificado (aviso) |
| `backend/src/__tests__/vinculoAutomaticoService.test.js` | Modificado (novos casos) |

---

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Controle sem "N canais" na descrição | Ignorado — sem vínculo, sem aviso |
| Ambiente sem Controle, mas com motorizados | Sem aviso (aviso só aparece quando há Controle com canais insuficientes) |
| Controle com canais >= motorizados | Vincula todos, sem aviso |
| Motorizado já vinculado a outro Controle | `ON CONFLICT DO NOTHING` evita duplicata |
| Ambiente vazio ou nulo no item | Item ignorado (mesmo comportamento atual) |

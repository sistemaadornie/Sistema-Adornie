# Vínculo Forro → Item (mesmo ambiente)

**Data:** 2026-07-08
**Status:** Aprovado

---

## Contexto

A Ficha de Confecção/Conferência Consultoras do Forro (`FichaConfeccaoForro.jsx`, compartilhada
pelos modos `confeccao` e `conferencia_consultoras`) tem o campo **"Forro costurado"** com as
opções `JUNTO` / `SEPARADO`. Quando `JUNTO`, o forro é costurado diretamente em outro item do
pedido (tipicamente uma cortina do mesmo ambiente) — hoje isso não é registrado em lugar nenhum,
só existe informalmente.

O sistema já tem uma tabela de vínculos entre itens de pedido, `pedido_item_vinculos`
(`item_id`, `item_vinculado_id`, `tipo_vinculo`), usada hoje por `vinculoAutomaticoService.js`
para vínculos automáticos trilho→cortina/forro (`tipo_vinculo = 'acessorio'`) e
controle→motorizado (`tipo_vinculo = 'controle_canal'`). A coluna `tipo_vinculo` é livre
(`VARCHAR(40)`, sem CHECK/enum), então um novo valor não exige migration na tabela.

## Objetivo

- Quando "Forro costurado" = `JUNTO`, exibir um select **"Vincular a qual item deste
  ambiente?"** listando os demais itens do mesmo pedido + mesmo ambiente do forro (qualquer
  tipo/categoria).
- Selecionar um item passa a ser obrigatório para salvar a ficha nesse caso (nas duas telas:
  Conferência Consultoras e Confecção).
- O vínculo escolhido é persistido em `pedido_item_vinculos` com
  `tipo_vinculo = 'forro_cortina'` (`item_id` = item do forro, `item_vinculado_id` = item
  escolhido), reaproveitando a infraestrutura de vínculos já existente e consultável em outras
  telas/relatórios no futuro. O id escolhido também fica gravado dentro do próprio JSON da
  ficha (`itemVinculadoId` em `dados_confeccao`/`dados_conferencia_consultoras`), no mesmo padrão
  já usado pela ficha de Persiana (que sincroniza `modelo`/`especificacoes` em `pedido_itens`
  além de gravar no JSON da ficha).
- Trocar de `JUNTO` para `SEPARADO` (ou trocar o item vinculado) remove/atualiza o vínculo
  antigo em `pedido_item_vinculos`.

## Fora de escopo

- Filtrar o select só por itens do tipo Cortina — decidido mostrar todos os itens do ambiente.
- Vínculo bidirecional visível na ficha da cortina (ex.: "este item recebe forro de X") —
  não faz parte deste projeto.
- Qualquer mudança em `dashboardService.js` ou nos critérios de etapa do fluxo — este vínculo é
  só informativo/operacional, não bloqueia nenhuma etapa.
- Migration de schema — não há coluna nova nem tabela nova.

## 1. Modelo de dados

Nenhuma migration necessária:
- `pedido_item_vinculos` já existe e aceita qualquer string em `tipo_vinculo`. Novo valor:
  `'forro_cortina'`.
- `dados_confeccao`/`dados_conferencia_consultoras` (JSONB em `ordem_servico`) já existem.
  Novo campo dentro do JSON: `itemVinculadoId` (id de `pedido_itens`, string/number).

### Shape atualizado de `dados_confeccao`/`dados_conferencia_consultoras` (tipo forro)

```json
{
  "tecidoForro": "...",
  "tecidoTipo": "...",
  "franzimento": "...",
  "forroCosturado": "JUNTO",
  "itemVinculadoId": "482",
  "larguraForro": "3,00",
  "alturaBarraForro": "0",
  "espacador": "5,00",
  "larguraTrilho": "4,92",
  "tipoWave": "M",
  "abertura": "COM ABERTURA",
  "alturaCortina": "2,84"
}
```

`itemVinculadoId` só é obrigatório quando `forroCosturado === "JUNTO"`.

## 2. Backend

### 2.1 Novo endpoint — listar itens do mesmo ambiente

`GET /os/:id/itens-ambiente` (`ordemServicoRoutes.js`, com `authMiddleware`, mesmo padrão dos
outros endpoints de `/os`).

`ordemServicoService.listarItensMesmoAmbiente(osId, empresaId)`:

```js
async function listarItensMesmoAmbiente(osId, empresaId) {
  const { rows } = await db.query(
    `SELECT pi2.id, pi2.descricao, pi2.cor, cat.nome AS categoria_nome
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     JOIN pedido_itens pi2 ON pi2.pedido_id = pi.pedido_id
       AND pi2.ambiente = pi.ambiente
       AND pi2.id <> pi.id
     LEFT JOIN categorias cat ON cat.id = pi2.categoria_id
     WHERE os.id = $1 AND p.empresa_id = $2
     ORDER BY pi2.id`,
    [osId, empresaId]
  );
  return rows;
}
```

Se `pi.ambiente` for `NULL`, a comparação `pi2.ambiente = pi.ambiente` nunca casa e a lista
volta vazia (não tenta adivinhar "itens sem ambiente" — evita vínculo incorreto). Isso é
aceitável: forro sem ambiente definido não pode ser vinculado.

### 2.2 Validação — `validarDadosConfeccaoForro`

```js
function validarDadosConfeccaoForro(dados) {
  const { tecidoForro, larguraForro, forroCosturado, itemVinculadoId } = dados || {};
  if (!tecidoForro?.trim()) throw Object.assign(new Error('Tecido do forro é obrigatório.'), { status: 400 });
  if (!larguraForro || parseFloat(String(larguraForro).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do forro é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!forroCosturado) throw Object.assign(new Error('Campo "Forro costurado" é obrigatório.'), { status: 400 });
  if (forroCosturado === 'JUNTO' && !itemVinculadoId) {
    throw Object.assign(new Error('Selecione o item em que este forro será costurado.'), { status: 400 });
  }
}
```

### 2.3 Sincronização do vínculo — nova função `sincronizarVinculoForroCortina`

Chamada por `salvarDadosConfeccao` e `salvarDadosConferenciaConsultoras`, sempre que
`os.tipo === 'forro'`, **depois** da validação e **antes** (ou depois, ordem não importa já que
são updates independentes) do `UPDATE ordem_servico`:

```js
async function sincronizarVinculoForroCortina(pedidoItemId, dados) {
  if (dados.forroCosturado === 'JUNTO' && dados.itemVinculadoId) {
    const itemVinculadoId = Number(dados.itemVinculadoId);
    const { rows } = await db.query(
      `SELECT 1 FROM pedido_itens pi_forro
       JOIN pedido_itens pi_alvo ON pi_alvo.pedido_id = pi_forro.pedido_id
       WHERE pi_forro.id = $1 AND pi_alvo.id = $2`,
      [pedidoItemId, itemVinculadoId]
    );
    if (!rows.length) {
      throw Object.assign(new Error('Item vinculado inválido para este pedido.'), { status: 400 });
    }
    await db.query(
      `DELETE FROM pedido_item_vinculos
       WHERE item_id = $1 AND tipo_vinculo = 'forro_cortina' AND item_vinculado_id <> $2`,
      [pedidoItemId, itemVinculadoId]
    );
    await db.query(
      `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
       VALUES ($1, $2, 'forro_cortina') ON CONFLICT DO NOTHING`,
      [pedidoItemId, itemVinculadoId]
    );
  } else {
    await db.query(
      `DELETE FROM pedido_item_vinculos WHERE item_id = $1 AND tipo_vinculo = 'forro_cortina'`,
      [pedidoItemId]
    );
  }
}
```

`pedidoItemId` já está disponível nas duas funções chamadoras:
- `salvarDadosConferenciaConsultoras` já seleciona `os.pedido_item_id` (`osRows[0].pedido_item_id`).
- `salvarDadosConfeccao` precisa passar a selecionar `os.pedido_item_id` também (hoje só
  seleciona `os.tipo`).

Chamada, em ambas, só quando `osRows[0].tipo === 'forro'`:

```js
if (osRows[0].tipo === 'forro') {
  await sincronizarVinculoForroCortina(osRows[0].pedido_item_id, dados);
}
```

Erros lançados por `sincronizarVinculoForroCortina` (ex.: item inválido) propagam como 400,
igual às demais validações — o `UPDATE` de `ordem_servico` só roda se essa etapa passar.

### Sem alterações em

- Schema/migrations.
- `dashboardService.js` — este vínculo não afeta nenhum critério de etapa.
- Rota de listagem `GET /os/pedidos/:pedidoId/os` — não precisa expor o vínculo.

## 3. Frontend — `FichaConfeccaoForro.jsx`

- Novo estado `itensAmbiente` (array), carregado em `useEffect` no mount via
  `api.get(\`/os/${osData.id}/itens-ambiente\`)`.
- `VAZIO` ganha `itemVinculadoId: ""`.
- Novo campo, renderizado **condicionalmente** (só quando `dados.forroCosturado === "JUNTO"`),
  dentro da seção "Especificação do Forro (Obrigatório)", logo após o grid
  Forro costurado/Franzimento:

```jsx
{dados.forroCosturado === "JUNTO" && (
  <div className="os-field">
    <label>Vincular a qual item deste ambiente?</label>
    <select
      value={dados.itemVinculadoId}
      onChange={(e) => setCampo("itemVinculadoId", e.target.value)}
      className="input-highlight"
    >
      <option value="">— Selecione —</option>
      {itensAmbiente.map((it) => (
        <option key={it.id} value={it.id}>
          {[it.categoria_nome, it.descricao, it.cor].filter(Boolean).join(" — ")}
        </option>
      ))}
    </select>
  </div>
)}
```

- Ao trocar `forroCosturado` para `SEPARADO`, limpar `itemVinculadoId` (evita mandar um valor
  velho escondido; o backend também já limpa o vínculo antigo independentemente).
- Validação de front espelhando a do backend, antes do `salvar()`:

```js
if (dados.forroCosturado === "JUNTO" && !dados.itemVinculadoId) {
  return setErro("Selecione o item em que este forro será costurado.");
}
```

- Sem mudança de layout adicional além do campo novo — segue a mesma seção/estilo já usado
  (ver redesign recente que alinhou esta tela ao modelo de Cortina/Persiana).

## 4. Testes

### Backend — `ordemServicoService.test.js`

Novos casos:

| Cenário | Expectativa |
|---|---|
| Forro `JUNTO` com `itemVinculadoId` válido do mesmo pedido | Salva `dados_confeccao`/`dados_conferencia_consultoras`; insere linha em `pedido_item_vinculos` (`tipo_vinculo='forro_cortina'`) |
| Forro `JUNTO` sem `itemVinculadoId` | Erro 400 "Selecione o item em que este forro será costurado." |
| Forro `JUNTO` com `itemVinculadoId` de outro pedido | Erro 400 "Item vinculado inválido para este pedido." |
| Forro `SEPARADO` (com ou sem `itemVinculadoId` vindo do payload) | Salva normalmente; garante que não sobra/nem insere linha `forro_cortina` em `pedido_item_vinculos` |
| Trocar de item vinculado (era A, agora B) | Linha antiga (A) removida, nova linha (B) inserida — sem duplicar |

### Backend — `ordemServicoRoutes` (ou service, conforme padrão do arquivo de teste existente)

| Cenário | Expectativa |
|---|---|
| `GET /os/:id/itens-ambiente` | Retorna só itens do mesmo pedido+ambiente, excluindo o próprio item do forro |
| Ambiente do forro é `NULL` | Retorna lista vazia |

### Teste manual no navegador

1. Pedido com 1 forro + 1 cortina no mesmo ambiente → abrir Ficha de Conferência Consultoras do
   Forro, marcar "Forro costurado" = Junto → select aparece com a cortina do ambiente listada.
2. Tentar salvar sem escolher o item → erro de validação exibido.
3. Escolher a cortina, salvar → sucesso; conferir no banco que
   `pedido_item_vinculos` tem linha `(forro_item_id, cortina_item_id, 'forro_cortina')`.
4. Reabrir a ficha → select vem pré-selecionado com a cortina escolhida (via `itemVinculadoId`
   salvo no JSON).
5. Trocar para "Separado" e salvar → linha em `pedido_item_vinculos` é removida.
6. Repetir o fluxo na Ficha de Confecção (modo `confeccao`) do mesmo item — mesmo comportamento.

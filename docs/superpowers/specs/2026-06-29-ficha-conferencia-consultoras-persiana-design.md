# Ficha de Conferência Consultoras — Persiana

**Data:** 2026-06-29
**Status:** Aprovado

---

## Contexto

A feature anterior (2026-06-24) implementou a **Ficha de Conferência Consultoras** para cortinas e
forros: a consultora preenche os dados de especificação na Etapa 1, antes de qualquer visita
técnica, e esse preenchimento gates a Conferência Técnica (Etapa 2). O fluxo usa
`ordem_servico.dados_conferencia_consultoras` (JSONB) e o critério
`categorias.necessita_conferencia = true` para identificar os itens que exigem a ficha.

Persianas ficaram fora de escopo naquele projeto. Hoje elas têm um fluxo paralelo e mais simples:
um botão **"🎛️ Selecionar Tipo"** em `EtapaDadosPedido.jsx` abre o `SelecionarTipoPersianaModal`,
que salva Modelo/Tubo/Bandô em `pedido_itens.modelo` + `pedido_itens.especificacoes`.

Este projeto substitui esse modal pela Ficha de Conferência Consultoras de Persiana — uma tela
dedicada com todos os campos do **Descritivo Comercial** da ficha física (imagem de referência
fornecida pelo usuário). O Desenho Técnico e a Conf. de Medida Técnica ficam para a
Conferência Técnica (projeto futuro separado, fora de escopo aqui).

## Objetivo

- Persianas passam a seguir o mesmo fluxo de cortinas e forros: consultora preenche a Ficha de
  Conferência Consultoras na Etapa 1; critério `conferencia_consultoras_preenchida` bloqueia a
  Conferência Técnica na Etapa 2.
- O modal `SelecionarTipoPersianaModal` e o botão "Selecionar Tipo" são removidos.
- O select de Modelo/Tubo/Bandô (já existente em `ModeloSelectorPanel.jsx`) é embutido inline
  na nova ficha, sem modal.

## Fora de escopo

- Desenho Técnico (medidas E/D e altura) — vai para a Conferência Técnica.
- Conf. de Medida Técnica (Fixação, Enrolamento, Afastamento, etc.) — idem.
- Alterações nos campos da Conferência Técnica (`OrdemServicoPage.jsx` / `FichaTecnicaInstalador.jsx`)
  para cobrir os campos específicos de persiana — projeto futuro separado.
- Novos modelos de persiana no catálogo (`importKeywordConfig.js`) — escopo do catálogo, não desta ficha.

## 1. Modelo de dados

### Migração

Arquivo: `backend/src/database/migrations/categorias_persiana_conferencia.sql`

```sql
UPDATE categorias
   SET tipo_confeccao    = 'persiana',
       necessita_conferencia = true
 WHERE LOWER(nome) IN ('persianas', 'persiana');
```

Nenhuma coluna nova: `dados_conferencia_consultoras` (JSONB) já existe em `ordem_servico`
(migration `ordem_servico_conferencia_consultoras.sql` da feature anterior).

### Shape de `dados_conferencia_consultoras` para persiana

```json
{
  "modelo":         "Rolo / Rollo",
  "tubo":           "38mm",
  "bando":          "Bandô 38mm",
  "tecido":         "Drumis White",
  "largMax":        "2,50m",
  "modeloControle": "...",
  "modeloMotor":    "...",
  "acessorios":     ["Transpasse", "Guias Laterais"],
  "acionamento":    "manual",
  "qtdMotor":       null,
  "ordem":          null
}
```

Campos obrigatórios para salvar: `modelo`, `tubo`, `acionamento`.
Se `acionamento === 'motorizado'`: `qtdMotor` também obrigatório.
Demais campos (`bando`, `tecido`, `largMax`, `modeloControle`, `modeloMotor`, `acessorios`,
`ordem`) são opcionais.

## 2. Backend

### `ordemServicoService.js`

**Nova função de validação:**

```js
function validarDadosConferenciaConsultorasPersiana(dados) {
  if (!dados.modelo || !dados.tubo)
    throw Object.assign(
      new Error('Modelo e tubo da persiana são obrigatórios.'),
      { status: 400 }
    );
  if (!dados.acionamento)
    throw Object.assign(
      new Error('Acionamento (manual/motorizado) é obrigatório.'),
      { status: 400 }
    );
  if (dados.acionamento === 'motorizado' && !dados.qtdMotor)
    throw Object.assign(
      new Error('Quantidade de motor é obrigatória para persiana motorizada.'),
      { status: 400 }
    );
}
```

**`salvarDadosConferenciaConsultoras`** — adicionar branch persiana na validação e, após o UPDATE
de `dados_conferencia_consultoras`, sincronizar `pedido_itens`:

```js
// na validação por tipo, após o bloco de forro:
} else if (osRows[0].tipo === 'persiana') {
  validarDadosConferenciaConsultorasPersiana(dados);
}

// após o UPDATE de ordem_servico, se persiana:
if (osRows[0].tipo === 'persiana') {
  await db.query(
    `UPDATE pedido_itens
        SET modelo       = $1,
            especificacoes = $2
      WHERE id = (SELECT pedido_item_id FROM ordem_servico WHERE id = $3)`,
    [dados.modelo, JSON.stringify({ tubo: dados.tubo, bando: dados.bando || null }), id]
  );
}
```

A sync com `pedido_itens` garante que o critério `itens_persiana_pendentes` (baseado em
`modelo IS NULL`) seja satisfeito automaticamente após o preenchimento da ficha, sem alterar
queries do dashboard.

### Sem alterações em

- `ordemServicoRoutes.js` — endpoint `PUT /os/:id/conferencia-consultoras` já existe
- `pedidosRoutes.js` — `itens-pendentes-conferencia-consultoras` já filtra por `necessita_conferencia = true`
- `agendamentoService.js` — `listarConferenciaItens` já expõe `conferencia_consultoras_preenchida`
- `dashboardService.js` — nenhuma query muda; `itens_persiana_pendentes` continua mas vai a 0 após preenchimento da ficha

## 3. Frontend

### 3.1 Nova `FichaConferenciaConsultorasPersiana.jsx`

**Rota:** `/pedidos/os/:osId/conferencia-consultoras` (existente — o wrapper já redireciona por tipo)

**Layout (de cima para baixo):**

1. **Cabeçalho read-only** — cliente, nº pedido, vendedor, ambiente, item, medidas vendidas
   (mesmo padrão visual dos painéis "Dados do Pedido" das outras fichas)

2. **Modelo / Tubo / Bandô** — selects inline usando `KEYWORD_MODELS` de `importKeywordConfig.js`:
   - Select "Modelo" (Meliade, Illumine, Lumiere/Diamond/Silouette, Rolo/Rollo,
     Rolo Stilo/Shadow/Twinline/D. Vision)
   - Select "Tubo" (opções dependem do modelo selecionado)
   - Select "Bandô / Caixa" (opcional, opções dependem do modelo)
   - Pré-carrega de `osData.dados_conferencia_consultoras.modelo/tubo/bando` se já preenchido

3. **Tecido** (text, linha 1) + **Larg Max** (text, linha 1) — na mesma linha

4. **Modelo Controle** (text) + **Modelo Motor** (text) — na mesma linha

5. **Acessórios** — 6 checkboxes independentes (múltipla seleção livre):
   Transpasse · Lado a Lado · Suporte Inter. · Trilho Heike · Bando Box · Guias Laterais

6. **Acionamento** — radio Manual / Motorizada
   - Se Motorizada: campo "Qtd Motor" (number, obrigatório) + campo "Ordem" (text, opcional)

7. **Botão "Salvar"** — desabilitado até `modelo`, `tubo` e `acionamento` preenchidos;
   chama `PUT /os/:osId/conferencia-consultoras`; ao salvar com sucesso navega de volta à Etapa 1

**Não usa** `FichaConfeccaoCortina`/`FichaConfeccaoForro` como base — é uma tela própria
com campos completamente diferentes.

### 3.2 `FichaConferenciaConsultoras.jsx` (wrapper existente)

Adicionar branch para persiana antes do return de cortina:

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
```

Adicionar import lazy correspondente.

### 3.3 `EtapaDadosPedido.jsx`

Remover:
- Estado `definindoConferencia` e `setDefinindoConferencia`
- Import e render de `SelecionarTipoPersianaModal`
- Botão `"🎛️ Selecionar Tipo"` e sua lógica condicional
- Exibição do critério de progresso `itens_persiana_pendentes` (se houver texto na UI)

Resultado: itens de Persiana com `necessita_conferencia = true` aparecem automaticamente na
seção **"CONFERÊNCIA CONSULTORAS"** existente, sem nenhum código novo.

### 3.4 `SelecionarTipoPersianaModal.jsx`

Arquivo deletado — não terá mais referências após 3.3.

## 4. Testes

### Backend — `ordemServicoService.test.js`

4 novos casos dentro do `describe('salvarDadosConferenciaConsultoras', ...)` existente:

| Cenário | Expectativa |
|---|---|
| Persiana válida, acionamento manual | Salva `dados_conferencia_consultoras`; `UPDATE pedido_itens` chamado com `modelo` e `especificacoes` corretos |
| Persiana motorizada com `qtdMotor` | Idem |
| Falta `modelo` ou `tubo` | Lança erro 400 com mensagem de modelo/tubo |
| Motorizada sem `qtdMotor` | Lança erro 400 com mensagem de qtdMotor |

Sem novos testes de rota (endpoint já coberto) nem de dashboard (nenhuma query mudou).

### Teste manual no navegador

1. Pedido com item de categoria Persiana → Etapa 1 **não** exibe mais o botão "Selecionar Tipo";
   item aparece na seção "CONFERÊNCIA CONSULTORAS" com botão "Preencher Conferência Consultoras"
2. Clicar no botão → abre tela da ficha com campos de persiana
3. Selecionar Modelo + Tubo, preencher Acionamento, salvar → volta à Etapa 1 com critério ✅
4. Confirmar no banco: `ordem_servico.dados_conferencia_consultoras` preenchido;
   `pedido_itens.modelo` + `especificacoes` atualizados
5. Etapa 2: item de Persiana agora oferece "Conferência Técnica" (desbloqueado)
6. Tentar acessar `PUT /os/:id` (Conf. Técnica) sem ficha → retorna 400 esperado

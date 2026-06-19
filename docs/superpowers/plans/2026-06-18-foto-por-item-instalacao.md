# Foto por Item em Instalação/Retorno-Finalização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o rótulo da lista de itens de um agendamento contextual ao tipo, e exigir uma foto por item (vinculado a pedido) antes de concluir/não-concluir agendamentos de Instalação e Retorno/Finalização.

**Architecture:** Nova tabela `agendamento_item_fotos` (1-N com `agendamento_itens`); um novo endpoint de upload por item; uma checagem nova dentro do `alterarStatus` já existente; `montarAgendamento` passa a expor `pedido_item_id` e `fotos` por item em `itens_raw`. Dois frontends (admin React `frontend-web` e PWA `frontend-instalador`) consomem essa mesma API.

**Tech Stack:** Node/Express + PostgreSQL (`pg`) + Cloudinary no backend; React + Vite nos dois frontends (sem framework de testes configurado em nenhum dos dois — `eslint`/`vite build` são a única verificação automatizada do lado frontend).

## Global Constraints

- Rótulos por tipo (cópia exata): Instalação → "Itens para instalar"; Conferência → "Itens para conferir"; Manutenção → "Itens para manutenção"; Retorno/Finalização → "Itens para verificar"; qualquer outro tipo → "Itens para levar" ("Itens" no PWA).
- A exigência de foto por item vale **só** para `tipo IN ('Instalação', 'Retorno/Finalização')` e **só** nas transições `status IN ('concluido', 'nao_concluido')`. Não afeta `andamento`, não afeta Conferência/Manutenção.
- A exigência cobre **somente** itens com `pedido_item_id IS NOT NULL`. Itens digitados à mão (sem vínculo a pedido) nunca bloqueiam.
- Para Instalação/Retorno-Finalização, a foto por item **substitui** a foto geral obrigatória nas transições `concluido`/`nao_concluido` — o front não deve mais exigir/enviar foto geral nesse caso.
- Sem endpoint de remoção de foto de item (mesmo padrão que `agendamento_anexos` já segue hoje — nenhuma foto é removível via API).
- Toda migration SQL precisa ser aplicada manualmente nos dois bancos (Postgres local e Supabase) — são bancos sem sync entre si.

---

## File Structure

**Backend:**
- Create: `backend/src/database/migrations/agendamento_item_fotos.sql` — nova tabela.
- Modify: `backend/src/services/agendamentoService.js` — `montarAgendamento` (itens + fotos), nova função `adicionarFotoItem`, validação nova em `alterarStatus`, `module.exports`.
- Modify: `backend/src/routes/agendamentosRoutes.js` — nova rota `POST /:id/itens/:itemId/fotos`.
- Create: `backend/src/__tests__/agendamentoItemFotos.test.js` — testes de `adicionarFotoItem` e da extensão de `montarAgendamento`/`buscar`.
- Create: `backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js` — testes da nova checagem em `alterarStatus`.
- Create: `backend/src/__tests__/agendamentosRoutes.itemFotos.test.js` — teste da rota nova.

**frontend-web (admin):**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx` — helper `rotuloItens`, label dinâmico (2 pontos), componente `ItensComFotos` reutilizado em 2 views.
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.css` — classes `.ag-item-fotos` / `.ag-item-foto-mini`.

**frontend-instalador (PWA):**
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx` — helper `rotuloItens`, label dinâmico, componente `ItemComFoto` (captura + upload imediato por item), branch do bottom sheet para Instalação/Retorno-Finalização.
- Modify: `frontend-instalador/src/styles/app.css` — classes `.item-row`, `.item-row-nome`, `.item-row-fotos`, `.item-row-foto-mini`, `.item-row-cam-btn`.

---

### Task 1: Migration — tabela `agendamento_item_fotos`

**Files:**
- Create: `backend/src/database/migrations/agendamento_item_fotos.sql`

**Interfaces:**
- Produces: tabela `agendamento_item_fotos(id, agendamento_item_id, url, enviado_por, enviado_em)`, usada por todas as tasks seguintes do backend.

- [ ] **Step 1: Escrever a migration**

```sql
-- agendamento_item_fotos.sql
-- Fotos por item de agendamento (evidência de instalação), 1-N com agendamento_itens.

CREATE TABLE IF NOT EXISTS agendamento_item_fotos (
  id                   SERIAL PRIMARY KEY,
  agendamento_item_id  INTEGER NOT NULL REFERENCES agendamento_itens(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  enviado_por          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_item_fotos_item ON agendamento_item_fotos(agendamento_item_id);
```

- [ ] **Step 2: Aplicar no Postgres local**

Run: `cd backend && node src/database/run-migration.js agendamento_item_fotos.sql`
Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Confirmar que a tabela existe**

Run: `cd backend && node -e "require('./src/database/db').query(\"SELECT 1 FROM agendamento_item_fotos LIMIT 1\").then(()=>{console.log('OK'); process.exit(0);}).catch(e=>{console.error(e.message); process.exit(1);})"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/agendamento_item_fotos.sql
git commit -m "feat(agendamentos): migration para fotos por item de agendamento"
```

---

### Task 2: Service — `montarAgendamento` expõe fotos por item + `adicionarFotoItem`

**Files:**
- Modify: `backend/src/services/agendamentoService.js:77-149` (função `montarAgendamento`)
- Modify: `backend/src/services/agendamentoService.js:956-982` (logo após `adicionarAnexos`, adicionar `adicionarFotoItem`)
- Modify: `backend/src/services/agendamentoService.js:1344-1353` (`module.exports`)
- Test: `backend/src/__tests__/agendamentoItemFotos.test.js`

**Interfaces:**
- Consumes: `db.query` (mock), `uploadToCloudinary(buffer, folder)` (função interna já existente no arquivo, linha 10).
- Produces: `svc.adicionarFotoItem(agendamentoId, itemId, empresaId, userId, files) → Promise<[{ id, url }]>` (lança erro com `.status` 404 se item não existir/não pertencer à empresa, 400 se `files` vazio). `svc.buscar(id, empresaId)` agora retorna `itens_raw: [{ id, nome, pedido_item_id, fotos: [{ id, url }] }]`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/src/__tests__/agendamentoItemFotos.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../config/cloudinary', () => ({ uploader: { upload_stream: jest.fn() } }));
jest.mock('streamifier', () => ({ createReadStream: jest.fn(() => ({ pipe: jest.fn() })) }));

const db = require('../database/db');
const cloudinary = require('../config/cloudinary');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

function mockUploadOk(url) {
  cloudinary.uploader.upload_stream.mockImplementation((_opts, cb) => {
    cb(null, { secure_url: url });
    return {};
  });
}

describe('adicionarFotoItem', () => {
  test('404 quando o item não pertence ao agendamento/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      svc.adicionarFotoItem(3, 999, 10, 1, [{ buffer: Buffer.from('x'), originalname: 'a.jpg' }])
    ).rejects.toMatchObject({ status: 404 });
  });

  test('400 quando não há arquivos', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    await expect(
      svc.adicionarFotoItem(3, 5, 10, 1, [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('sobe a foto e insere em agendamento_item_fotos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // existe
      .mockResolvedValueOnce({ rows: [{ id: 1, url: 'https://cdn/foto1.jpg' }] }); // insert
    mockUploadOk('https://cdn/foto1.jpg');

    const fotos = await svc.adicionarFotoItem(3, 5, 10, 1, [{ buffer: Buffer.from('x'), originalname: 'a.jpg' }]);

    expect(fotos).toEqual([{ id: 1, url: 'https://cdn/foto1.jpg' }]);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'operon/empresas/10/agendamentos/3/itens/5' }),
      expect.any(Function)
    );
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO agendamento_item_fotos');
  });
});

describe('buscar — itens_raw com pedido_item_id e fotos', () => {
  test('agrupa as fotos por item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', tipo: 'Instalação' }] }) // ag
      .mockResolvedValueOnce({ rows: [] }) // equipe
      .mockResolvedValueOnce({ rows: [
        { id: 10, nome: 'Cortina sala', pedido_item_id: 50 },
        { id: 11, nome: 'Persiana quarto', pedido_item_id: null },
      ] }) // itens
      .mockResolvedValueOnce({ rows: [
        { id: 1, agendamento_item_id: 10, url: 'https://cdn/foto1.jpg' },
      ] }) // fotos por item
      .mockResolvedValueOnce({ rows: [] }); // anexos

    const ag = await svc.buscar(1, 10);

    expect(ag.itens).toEqual(['Cortina sala', 'Persiana quarto']);
    expect(ag.itens_raw).toEqual([
      { id: 10, nome: 'Cortina sala', pedido_item_id: 50, fotos: [{ id: 1, url: 'https://cdn/foto1.jpg' }] },
      { id: 11, nome: 'Persiana quarto', pedido_item_id: null, fotos: [] },
    ]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest agendamentoItemFotos --no-coverage`
Expected: FAIL — `svc.adicionarFotoItem is not a function`, e o teste de `buscar` falha porque `itens_raw` ainda não tem `fotos`.

- [ ] **Step 3: Implementar — extender `montarAgendamento`**

Em `backend/src/services/agendamentoService.js`, substituir a função inteira (linhas 77-149):

```js
async function montarAgendamento(id, empresaId) {
  const [ag, equipe, itens, itemFotos, anexos] = await Promise.all([
    db.query(
      `
      SELECT
        a.*,
        u.nome_completo   AS criado_por_nome,
        ui.nome_completo  AS iniciado_por_nome,
        ui.foto_url       AS iniciado_por_foto,
        uc.nome_completo  AS concluido_por_nome,
        uc.foto_url       AS concluido_por_foto,
        TO_CHAR(a.data, 'YYYY-MM-DD') AS data,
        TO_CHAR(a.hora, 'HH24:MI')   AS hora,
        po.id            AS pessoa_obrigatoria_id,
        po.nome_completo AS pessoa_obrigatoria_nome,
        po.foto_url      AS pessoa_obrigatoria_foto,
        CASE WHEN ped.id IS NOT NULL
          THEN COALESCE(
            CASE WHEN ped.numero_origem ~ '^#[0-9]+$'
                 THEN '#' || regexp_replace(ped.numero_origem, '^#0*', '')
                 ELSE ped.numero_origem
            END,
            'SIS-' || LPAD(COALESCE(ped.numero_sequencial, ped.id)::TEXT, 8, '0')
          )
          ELSE NULL
        END AS pedido_numero
      FROM agendamentos a
      LEFT JOIN usuarios u   ON u.id   = a.criado_por
      LEFT JOIN usuarios ui  ON ui.id  = a.iniciado_por
      LEFT JOIN usuarios uc  ON uc.id  = a.concluido_por
      LEFT JOIN usuarios po  ON po.id  = a.pessoa_obrigatoria_id
      LEFT JOIN pedidos   ped ON ped.id = a.pedido_id AND ped.deleted_at IS NULL
      WHERE a.id = $1 AND a.empresa_id = $2
      LIMIT 1
      `,
      [id, empresaId]
    ),
    db.query(
      `
      SELECT ae.usuario_id AS id,
             COALESCE(u.nome_completo, ae.nome_snapshot, 'Usuário removido') AS nome,
             u.foto_url, s.nome AS setor,
             (u.id IS NULL OR u.status = 'bloqueado') AS inativo
      FROM agendamento_equipe ae
      LEFT JOIN usuarios u ON u.id = ae.usuario_id
      LEFT JOIN setores s ON s.id = u.setor_id
      WHERE ae.agendamento_id = $1
      `,
      [id]
    ),
    db.query(`SELECT id, nome, pedido_item_id FROM agendamento_itens WHERE agendamento_id=$1 ORDER BY id`, [id]),
    db.query(
      `
      SELECT f.id, f.agendamento_item_id, f.url
      FROM agendamento_item_fotos f
      JOIN agendamento_itens ai ON ai.id = f.agendamento_item_id
      WHERE ai.agendamento_id = $1
      ORDER BY f.enviado_em ASC
      `,
      [id]
    ),
    db.query(
      `
      SELECT aa.id, aa.nome, aa.url, aa.tipo, aa.enviado_em,
             aa.enviado_por, u.nome_completo AS enviado_por_nome
      FROM agendamento_anexos aa
      LEFT JOIN usuarios u ON u.id = aa.enviado_por
      WHERE aa.agendamento_id = $1
      ORDER BY aa.enviado_em ASC
      `,
      [id]
    ),
  ]);

  if (ag.rows.length === 0) return null;

  const fotosPorItem = {};
  for (const f of itemFotos.rows) {
    (fotosPorItem[f.agendamento_item_id] ||= []).push({ id: f.id, url: f.url });
  }

  return {
    ...ag.rows[0],
    equipe: equipe.rows,
    itens: itens.rows.map((i) => i.nome),
    itens_raw: itens.rows.map((i) => ({ ...i, fotos: fotosPorItem[i.id] || [] })),
    anexos: anexos.rows,
  };
}
```

- [ ] **Step 4: Implementar — `adicionarFotoItem`**

Em `backend/src/services/agendamentoService.js`, imediatamente depois do fim da função `adicionarAnexos` (depois da linha que hoje termina em `return uploadados;\n}`, antes de `async function excluir`):

```js
async function adicionarFotoItem(agendamentoId, itemId, empresaId, userId, files) {
  const existe = await db.query(
    `SELECT ai.id
     FROM agendamento_itens ai
     JOIN agendamentos a ON a.id = ai.agendamento_id
     WHERE ai.id = $1 AND ai.agendamento_id = $2 AND a.empresa_id = $3
     LIMIT 1`,
    [itemId, agendamentoId, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Item de agendamento não encontrado."); e.status = 404; throw e; }
  if (!files?.length)           { const e = new Error("Nenhum arquivo recebido.");             e.status = 400; throw e; }

  const fotos = [];
  for (const file of files) {
    const uploaded = await uploadToCloudinary(
      file.buffer,
      `operon/empresas/${empresaId}/agendamentos/${agendamentoId}/itens/${itemId}`
    );
    const inserted = await db.query(
      `INSERT INTO agendamento_item_fotos (agendamento_item_id, url, enviado_por) VALUES ($1,$2,$3) RETURNING id, url`,
      [itemId, uploaded.secure_url, userId]
    );
    fotos.push(inserted.rows[0]);
  }
  return fotos;
}
```

- [ ] **Step 5: Exportar a nova função**

Em `backend/src/services/agendamentoService.js:1344-1353`, trocar:

```js
module.exports = {
  getEquipe, listar, buscar, criar, atualizar, reagendar,
  alterarStatus, adicionarAnexos, excluir,
  getLogs, criarSugestao, listarSugestoes, responderSugestao,
  geocodificarTodos,
  decidirAprovacao, listarPendentesAprovacao, notificarAdminsAprovacao,
  listarConferenciaItens,
  upsertConferenciaItem,
  confirmarCliente,
};
```

por:

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
};
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest agendamentoItemFotos --no-coverage`
Expected: PASS (5 testes)

- [ ] **Step 7: Rodar a suíte completa do backend para garantir que nada quebrou**

Run: `cd backend && npx jest --no-coverage`
Expected: PASS em todos os arquivos (em especial `agendamentoStatusPreAgendado.test.js` e `agendamentoAprovacao.test.js`, que usam `agendamentoService` mas não chegam a chamar `montarAgendamento`)

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoItemFotos.test.js
git commit -m "feat(agendamentos): expõe fotos por item e endpoint de upload por item"
```

---

### Task 3: Service — exigir foto por item para concluir Instalação/Retorno-Finalização

**Files:**
- Modify: `backend/src/services/agendamentoService.js:688-703` (dentro de `alterarStatus`, logo depois da checagem de Conferência existente)
- Test: `backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js`

**Interfaces:**
- Consumes: nada novo — só `db.query`.
- Produces: `alterarStatus` agora rejeita com erro `.status = 400` ao tentar `concluido`/`nao_concluido` em agendamento de Instalação/Retorno-Finalização com item (vinculado a pedido) sem foto.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_INSTALACAO = {
  id: 1, titulo: 'Instalação X', cliente: 'Cliente Y', tipo: 'Instalação',
  criado_por: 7, status_anterior: 'andamento',
};

describe('alterarStatus — exige foto por item em Instalação/Retorno-Finalização', () => {
  test('concluido bloqueado com 400 quando falta foto em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })           // busca inicial
      .mockResolvedValueOnce({ rows: [{ nome: 'Cortina sala' }] }); // itens sem foto
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Cortina sala') });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('nao_concluido também é bloqueado quando falta foto em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Persiana quarto' }] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('concluido permitido quando todos os itens têm foto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })
      .mockResolvedValueOnce({ rows: [] }); // nenhum item pendente
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Retorno/Finalização segue a mesma regra', async () => {
    const AG_RETORNO = { ...AG_INSTALACAO, tipo: 'Retorno/Finalização' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_RETORNO] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Trilho sala' }] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('Conferência não é afetada pela nova regra (mantém comportamento atual)', async () => {
    const AG_CONFERENCIA = { ...AG_INSTALACAO, tipo: 'Conferência' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })             // busca inicial
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '0' }] }); // checagem de conferência já existente
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Manutenção não exige foto por item', async () => {
    const AG_MANUTENCAO = { ...AG_INSTALACAO, tipo: 'Manutenção' };
    db.query.mockResolvedValueOnce({ rows: [AG_MANUTENCAO] }); // única query antes do connect
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('andamento não é afetado (sem checagem de foto por item)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_INSTALACAO] }); // única query antes do connect
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest agendamentoFotoPorItemValidacao --no-coverage`
Expected: FAIL nos testes que esperam `status: 400` (a regra ainda não existe, então a função segue até `db.connect()`, que não foi mockado para rejeitar nesses casos — o teste vai travar esperando uma promise pendente do mock padrão ou lançar erro de mock não configurado).

- [ ] **Step 3: Implementar a checagem**

Em `backend/src/services/agendamentoService.js`, imediatamente depois do bloco que termina em (linha 703):

```js
    if (Number(pendentes) > 0) {
      const e = new Error(`Ainda há ${pendentes} de ${total} item(ns) pendente(s) de conferência. Confira todos os itens antes de concluir o agendamento.`);
      e.status = 400;
      throw e;
    }
  }
```

adicionar o novo bloco (antes do comentário `/* uploads Cloudinary ANTES da transação ... */`):

```js

  if ((status === "concluido" || status === "nao_concluido")
      && ["Instalação", "Retorno/Finalização"].includes(existe.rows[0]?.tipo)) {
    const pendentesFoto = await db.query(
      `SELECT ai.nome
       FROM agendamento_itens ai
       WHERE ai.agendamento_id = $1 AND ai.pedido_item_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM agendamento_item_fotos f WHERE f.agendamento_item_id = ai.id)`,
      [id]
    );
    if (pendentesFoto.rows.length > 0) {
      const nomes = pendentesFoto.rows.map((r) => r.nome).join(", ");
      const e = new Error(`Falta foto de ${pendentesFoto.rows.length} item(ns): ${nomes}. Adicione uma foto de cada item antes de concluir o agendamento.`);
      e.status = 400;
      throw e;
    }
  }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest agendamentoFotoPorItemValidacao --no-coverage`
Expected: PASS (7 testes)

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd backend && npx jest --no-coverage`
Expected: PASS em todos os arquivos, incluindo `agendamentoStatusPreAgendado.test.js` (cobre `Instalação` em `pre_agendado`, que continua bloqueado antes de chegar nessa checagem nova).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js
git commit -m "feat(agendamentos): exige foto por item para concluir Instalacao/Retorno-Finalizacao"
```

---

### Task 4: Rota — `POST /agendamentos/:id/itens/:itemId/fotos`

**Files:**
- Modify: `backend/src/routes/agendamentosRoutes.js` (inserir depois da rota `POST /:id/anexos`, linhas 232-241)
- Test: `backend/src/__tests__/agendamentosRoutes.itemFotos.test.js`

**Interfaces:**
- Consumes: `svc.adicionarFotoItem` (Task 2), `upload` e `validarMagicBytes` de `../middlewares/uploadMemory` (já importados no topo do arquivo).
- Produces: rota HTTP `POST /api/agendamentos/:id/itens/:itemId/fotos` → `201 { ok: true, fotos: [{ id, url }] }`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `backend/src/__tests__/agendamentosRoutes.itemFotos.test.js`:

```js
jest.mock('../services/agendamentoService');
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/agendamentosRoutes');
const svc     = require('../services/agendamentoService');

const app = express();
app.use(express.json());
app.use('/api/agendamentos', router);

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]);

afterEach(() => jest.clearAllMocks());

describe('POST /api/agendamentos/:id/itens/:itemId/fotos', () => {
  test('201 com fotos enviadas', async () => {
    svc.adicionarFotoItem.mockResolvedValueOnce([{ id: 1, url: 'https://cdn/foto1.jpg' }]);
    const res = await request(app)
      .post('/api/agendamentos/3/itens/5/fotos')
      .attach('arquivos', PNG_BYTES, 'foto.png');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, fotos: [{ id: 1, url: 'https://cdn/foto1.jpg' }] });
    expect(svc.adicionarFotoItem).toHaveBeenCalledWith('3', '5', 10, 1, expect.any(Array));
  });

  test('404 quando o item não existe', async () => {
    const err = new Error('Item de agendamento não encontrado.');
    err.status = 404;
    svc.adicionarFotoItem.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/agendamentos/3/itens/999/fotos')
      .attach('arquivos', PNG_BYTES, 'foto.png');
    expect(res.status).toBe(404);
  });

  test('400 quando o arquivo tem conteúdo inválido (magic bytes)', async () => {
    const res = await request(app)
      .post('/api/agendamentos/3/itens/5/fotos')
      .attach('arquivos', Buffer.from('nao e uma imagem'), 'foto.png');
    expect(res.status).toBe(400);
    expect(svc.adicionarFotoItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest agendamentosRoutes.itemFotos --no-coverage`
Expected: FAIL com 404 (rota ainda não existe)

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/agendamentosRoutes.js`, depois do bloco que termina em (linha 241):

```js
router.post("/:id/anexos", authMiddleware, upload.array("arquivos", 20), validarMagicBytes, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const anexos = await svc.adicionarAnexos(req.params.id, empresa_id, userId, req.files);
    return res.status(201).json({ ok: true, anexos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar anexos." });
  }
});
```

adicionar:

```js

router.post("/:id/itens/:itemId/fotos", authMiddleware, upload.array("arquivos", 5), validarMagicBytes, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const fotos = await svc.adicionarFotoItem(req.params.id, req.params.itemId, empresa_id, userId, req.files);
    return res.status(201).json({ ok: true, fotos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar foto do item." });
  }
});
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest agendamentosRoutes.itemFotos --no-coverage`
Expected: PASS (3 testes)

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd backend && npx jest --no-coverage`
Expected: PASS em todos os arquivos.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/agendamentosRoutes.js backend/src/__tests__/agendamentosRoutes.itemFotos.test.js
git commit -m "feat(agendamentos): rota de upload de foto por item"
```

---

### Task 5: frontend-web — rótulo dinâmico da lista de itens

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx:72` (depois da constante `TIPOS`)
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx:1937` (label no formulário de criação/edição)
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx:2414` (label na visão de detalhe)

**Interfaces:**
- Produces: `rotuloItens(tipo) → string`, usada também na Task 6 e reaproveitada (duplicada) no PWA na Task 7.

- [ ] **Step 1: Adicionar o helper**

Depois de (linha 72):

```js
const TIPOS = ["Instalação", "Manutenção", "Retorno/Finalização", "Conferência"];
```

adicionar:

```js

const ROTULO_ITENS = {
  "Instalação":          "Itens para instalar",
  "Conferência":         "Itens para conferir",
  "Manutenção":          "Itens para manutenção",
  "Retorno/Finalização": "Itens para verificar",
};
function rotuloItens(tipo) {
  return ROTULO_ITENS[tipo] || "Itens para levar";
}
```

- [ ] **Step 2: Aplicar no formulário de criação/edição**

Na linha 1937, trocar:

```jsx
            <label>Itens para levar</label>
```

(dentro do bloco `{/* Itens para levar */}` que usa `form.itens`/`itens`) por:

```jsx
            <label>{rotuloItens(form.tipo)}</label>
```

- [ ] **Step 3: Aplicar na visão de detalhe**

Na linha 2414, trocar:

```jsx
              <label>Itens para levar</label>
```

por:

```jsx
              <label>{rotuloItens(ag.tipo)}</label>
```

- [ ] **Step 4: Build de verificação**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros (`✓ built in ...`)

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): rotulo dinamico da lista de itens por tipo"
```

---

### Task 6: frontend-web — miniaturas das fotos por item

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx` (novo componente `ItensComFotos`, e os dois pontos que hoje renderizam a lista de itens)
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.css` (novas classes)

**Interfaces:**
- Consumes: `rotuloItens` (Task 5), `ag.itens_raw` (Task 2 — `[{ id, nome, pedido_item_id, fotos: [{ id, url }] }]`).
- Produces: componente `ItensComFotos({ itensRaw, rotulo })`, usado na view completa e na view simplificada de concluído/não-concluído.

- [ ] **Step 1: Adicionar as classes CSS**

Em `frontend-web/src/pages/agendamentos/Agendamentos.css`, depois do bloco (linhas 1217-1219):

```css
.ag-item-tag button:hover {
  color: var(--ag-cancelado);
}
```

adicionar:

```css

.ag-item-fotos {
  display: flex;
  gap: 4px;
  margin-left: 6px;
}

.ag-item-foto-mini {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  border: 1px solid var(--color-border-strong);
}
```

- [ ] **Step 2: Criar o componente `ItensComFotos`**

Em `frontend-web/src/pages/agendamentos/Agendamentos.jsx`, imediatamente antes de `function AnexosSecoes(...)` (linha 2634), adicionar:

```jsx
function ItensComFotos({ itensRaw, rotulo }) {
  return (
    <div className="ag-form-field">
      <label>{rotulo}</label>
      <div className="ag-itens-list">
        {itensRaw.map((it) => (
          <div key={it.id} className="ag-item-tag" style={{ cursor: "default" }}>
            📦 {it.nome}
            {it.fotos?.length > 0 && (
              <div className="ag-item-fotos">
                {it.fotos.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt="" className="ag-item-foto-mini" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Usar o componente na view completa**

Depois da Task 5, esse trecho está assim (note o `{rotuloItens(ag.tipo)}` já aplicado):

```jsx
          {/* Itens */}
          {ag.itens?.length > 0 && (
            <div className="ag-form-field">
              <label>{rotuloItens(ag.tipo)}</label>
              <div className="ag-itens-list">
                {ag.itens.map((it, i) => (
                  <div key={i} className="ag-item-tag" style={{ cursor: "default" }}>📦 {it}</div>
                ))}
              </div>
            </div>
          )}
```

Trocar esse bloco inteiro (da linha `{/* Itens */}` até o `)}` final) por:

```jsx
          {/* Itens */}
          {ag.itens_raw?.length > 0 && (
            <ItensComFotos itensRaw={ag.itens_raw} rotulo={rotuloItens(ag.tipo)} />
          )}
```

- [ ] **Step 4: Adicionar a mesma lista na view simplificada (concluído/não-concluído)**

Essa view (a partir de `if (isConcluido) { return ( ... ) }`) hoje não mostra itens. Imediatamente antes do comentário:

```jsx
            {/* Anexos — seções Antes / Depois */}
```

(dentro do `isConcluido`, antes do bloco que checa `!detalhe ? ... : anexos.length === 0 ? ... : <AnexosSecoes .../>`) adicionar:

```jsx
            {/* Itens */}
            {ag.itens_raw?.length > 0 && (
              <ItensComFotos itensRaw={ag.itens_raw} rotulo={rotuloItens(ag.tipo)} />
            )}

```

- [ ] **Step 5: Build de verificação**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros

- [ ] **Step 6: Verificação manual no navegador**

1. `cd backend && node server.js` (porta 3001) e `cd frontend-web && npm run dev` (porta 5173), em dois terminais.
2. Abrir `http://localhost:5173`, entrar, ir em Agendamentos.
3. Abrir um agendamento de tipo Instalação que tenha itens vinculados a pedido — confirmar que o label mostra "Itens para instalar" e (sem fotos ainda) nenhuma miniatura aparece, sem erro no console.
4. Repetir para um agendamento concluído/não-concluído — confirmar que a lista de itens agora aparece nessa view também.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx frontend-web/src/pages/agendamentos/Agendamentos.css
git commit -m "feat(agendamentos): mostra fotos por item no detalhe do agendamento (admin)"
```

---

### Task 7: frontend-instalador — rótulo dinâmico da lista de itens

**Files:**
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx:21` (depois de `ANEXO_LABELS`)
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx:262` (label "Itens")

**Interfaces:**
- Produces: `rotuloItens(tipo) → string` (cópia local, mesmo mapeamento da Task 5 — os dois apps não compartilham código).

- [ ] **Step 1: Adicionar o helper**

Depois de (linha 21):

```js
const ANEXO_LABELS = {
  foto_antes:   "Antes",
  foto_depois:  "Depois",
  video_antes:  "Vídeo (antes)",
  video_depois: "Vídeo (depois)",
  video:        "Vídeo",
  documento:    "Documento",
};
```

adicionar:

```js

const ROTULO_ITENS = {
  "Instalação":          "Itens para instalar",
  "Conferência":         "Itens para conferir",
  "Manutenção":          "Itens para manutenção",
  "Retorno/Finalização": "Itens para verificar",
};
function rotuloItens(tipo) {
  return ROTULO_ITENS[tipo] || "Itens";
}
```

- [ ] **Step 2: Aplicar no card de detalhe**

Na linha 262, trocar:

```jsx
              <span className="detail-label">Itens</span>
```

por:

```jsx
              <span className="detail-label">{rotuloItens(ag.tipo)}</span>
```

- [ ] **Step 3: Build de verificação**

Run: `cd frontend-instalador && npm run build`
Expected: build conclui sem erros

- [ ] **Step 4: Commit**

```bash
git add frontend-instalador/src/pages/AgendamentoDetalhe.jsx
git commit -m "feat(pwa): rotulo dinamico da lista de itens por tipo"
```

---

### Task 8: frontend-instalador — captura de foto por item durante o atendimento

**Files:**
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx` (novo componente `ItemComFoto`, novo handler `atualizarFotosItem`, bloco de itens reescrito)
- Modify: `frontend-instalador/src/styles/app.css` (novas classes)

**Interfaces:**
- Consumes: `api.post(path, formData, true)` (já existente em `services/api.js`), `ag.itens_raw` (Task 2).
- Produces: componente `ItemComFoto({ agendamentoId, item, podeFotografar, onFotoEnviada })`, handler `atualizarFotosItem(itemId, novasFotos)` no componente `AgendamentoDetalhe` — também usado pela Task 9.

- [ ] **Step 1: Adicionar as classes CSS**

Em `frontend-instalador/src/styles/app.css`, logo depois do bloco:

```css
.bs-aviso p {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.55;
}
```

(e antes do comentário `/* ── Extra badges ────...── */` que vem a seguir), adicionar:

```css

/* ── Item com foto ───────────────────────────────────────── */

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border);
}

.item-row:last-child {
  border-bottom: none;
}

.item-row-nome {
  flex: 1;
  font-size: 14px;
}

.item-row-fotos {
  display: flex;
  gap: 4px;
}

.item-row-foto-mini {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  border: 1px solid var(--color-border);
}

.item-row-cam-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px dashed var(--color-border-strong);
  color: var(--color-primary);
  cursor: pointer;
}

.item-row-erro {
  font-size: 11px;
  color: var(--color-danger);
}
```

- [ ] **Step 2: Criar o componente `ItemComFoto`**

Em `frontend-instalador/src/pages/AgendamentoDetalhe.jsx`, depois do componente `FilePicker` (depois da linha 76, antes de `/* ── BottomSheet ── */`), adicionar:

```jsx
/* ── ItemComFoto ── */
function ItemComFoto({ agendamentoId, item, podeFotografar, onFotoEnviada }) {
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
      <span className="item-row-nome">{item.nome}</span>
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

- [ ] **Step 3: Adicionar o handler `atualizarFotosItem`**

Dentro do componente `AgendamentoDetalhe`, depois de `useEffect(() => { carregar(); }, [carregar]);` e antes de `function abrirSheet(status) {`, adicionar:

```jsx
  function atualizarFotosItem(itemId, novasFotos) {
    setAg((prev) => ({
      ...prev,
      itens_raw: (prev.itens_raw || []).map((it) =>
        it.id === itemId ? { ...it, fotos: [...(it.fotos || []), ...novasFotos] } : it
      ),
    }));
  }
```

- [ ] **Step 4: Reescrever o bloco de itens (linhas 257-268)**

Trocar:

```jsx
        {/* Itens */}
        {ag.itens?.length > 0 && (
          <div className="card">
            <div className="detail-row" style={{ marginBottom: 6 }}>
              <FiPackage className="detail-icon" />
              <span className="detail-label">{rotuloItens(ag.tipo)}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              {ag.itens.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
```

por:

```jsx
        {/* Itens */}
        {ag.itens_raw?.length > 0 && (
          <div className="card">
            <div className="detail-row" style={{ marginBottom: 6 }}>
              <FiPackage className="detail-icon" />
              <span className="detail-label">{rotuloItens(ag.tipo)}</span>
            </div>
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
          </div>
        )}
```

- [ ] **Step 5: Build de verificação**

Run: `cd frontend-instalador && npm run build`
Expected: build conclui sem erros

- [ ] **Step 6: Verificação manual no navegador**

1. Com backend e `frontend-instalador` (`npm run dev`) de pé, abrir o PWA, entrar como instalador.
2. Abrir um agendamento de Instalação com itens vinculados a pedido e status "Em andamento" — cada item deve ter um botão de câmera.
3. Tocar no botão, escolher uma imagem qualquer — deve aparecer a miniatura ao lado do item, sem precisar recarregar a página.
4. Conferir no Postgres local: `SELECT * FROM agendamento_item_fotos;` deve ter a linha nova.

- [ ] **Step 7: Commit**

```bash
git add frontend-instalador/src/pages/AgendamentoDetalhe.jsx frontend-instalador/src/styles/app.css
git commit -m "feat(pwa): captura foto por item durante o atendimento"
```

---

### Task 9: frontend-instalador — bottom sheet exige foto por item ao concluir

**Files:**
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx` (lógica de `confirmarAcao`, conteúdo do bottom sheet)

**Interfaces:**
- Consumes: `ItemComFoto`, `atualizarFotosItem` (Task 8).
- Produces: nenhuma interface nova exposta a outras tasks — é o último ponto de integração do fluxo.

- [ ] **Step 1: Calcular as flags de exigência por item**

Dentro do componente `AgendamentoDetalhe`, imediatamente antes do `return (` da página (antes de `<TopBar title={ag.cliente} back />`, depois do cálculo de `statusCor` na linha 172), adicionar:

```jsx
  const exigeFotoPorItem = sheetStatus !== "andamento"
    && (ag.tipo === "Instalação" || ag.tipo === "Retorno/Finalização");
  const itensSemFoto = (ag.itens_raw || []).filter(
    (it) => it.pedido_item_id != null && !(it.fotos?.length)
  );
```

- [ ] **Step 2: Ajustar `confirmarAcao`**

Trocar a função inteira (linhas 128-148):

```js
  async function confirmarAcao() {
    if (!sheetFiles.length) {
      setSheetMsg("Adicione pelo menos uma foto para continuar.");
      return;
    }
    setSheetEnviando(true);
    setSheetMsg("");
    try {
      const fd = new FormData();
      fd.append("status", sheetStatus);
      if (sheetMotivo.trim()) fd.append("motivo", sheetMotivo.trim());
      sheetFiles.forEach((f) => fd.append("arquivos", f));
      await api.put(`/agendamentos/${id}/status`, fd, true);
      setSheetStatus(null);
      carregar();
    } catch (err) {
      setSheetMsg(err.message);
    } finally {
      setSheetEnviando(false);
    }
  }
```

por:

```js
  async function confirmarAcao() {
    if (exigeFotoPorItem) {
      if (itensSemFoto.length > 0) {
        setSheetMsg("Adicione uma foto em cada item antes de continuar.");
        return;
      }
    } else if (!sheetFiles.length) {
      setSheetMsg("Adicione pelo menos uma foto para continuar.");
      return;
    }
    setSheetEnviando(true);
    setSheetMsg("");
    try {
      const fd = new FormData();
      fd.append("status", sheetStatus);
      if (sheetMotivo.trim()) fd.append("motivo", sheetMotivo.trim());
      if (!exigeFotoPorItem) sheetFiles.forEach((f) => fd.append("arquivos", f));
      await api.put(`/agendamentos/${id}/status`, fd, true);
      setSheetStatus(null);
      carregar();
    } catch (err) {
      setSheetMsg(err.message);
    } finally {
      setSheetEnviando(false);
    }
  }
```

- [ ] **Step 3: Branch do conteúdo do sheet**

Trocar o trecho (linhas 347-379):

```jsx
            {AVISO_FOTO[sheetStatus] && (
              <div className="bs-aviso">
                <strong>{AVISO_FOTO[sheetStatus].titulo}</strong>
                <p>{AVISO_FOTO[sheetStatus].texto}</p>
              </div>
            )}

            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8,
            }}>
              Fotos <span style={{ color: "var(--color-danger)" }}>*</span>
            </div>
            <FilePicker files={sheetFiles} setFiles={setSheetFiles} />

            {sheetStatus === "nao_concluido" && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>Motivo (opcional)</label>
                <textarea
                  className="input-base"
                  value={sheetMotivo}
                  onChange={(e) => setSheetMotivo(e.target.value)}
                  placeholder="Descreva o motivo pelo qual não foi possível concluir..."
                  rows={3}
                />
              </div>
            )}

            {sheetFiles.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0", textAlign: "center" }}>
                Adicione pelo menos uma foto para continuar.
              </p>
            )}
            {sheetMsg && (
              <div className="banner banner-danger" style={{ marginTop: 8 }}>{sheetMsg}</div>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={sheetEnviando || sheetFiles.length === 0}
              onClick={confirmarAcao}
            >
              {sheetEnviando ? "Enviando..." : `Confirmar — ${statusLabel(sheetStatus)}`}
            </button>
```

por:

```jsx
            {exigeFotoPorItem ? (
              <>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8,
                }}>
                  Foto de cada item <span style={{ color: "var(--color-danger)" }}>*</span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {(ag.itens_raw || [])
                    .filter((it) => it.pedido_item_id != null)
                    .map((item) => (
                      <ItemComFoto
                        key={item.id}
                        agendamentoId={ag.id}
                        item={item}
                        podeFotografar
                        onFotoEnviada={atualizarFotosItem}
                      />
                    ))}
                </ul>
                {itensSemFoto.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0", textAlign: "center" }}>
                    Falta foto em {itensSemFoto.length} item(ns): {itensSemFoto.map((it) => it.nome).join(", ")}.
                  </p>
                )}
              </>
            ) : (
              <>
                {AVISO_FOTO[sheetStatus] && (
                  <div className="bs-aviso">
                    <strong>{AVISO_FOTO[sheetStatus].titulo}</strong>
                    <p>{AVISO_FOTO[sheetStatus].texto}</p>
                  </div>
                )}

                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8,
                }}>
                  Fotos <span style={{ color: "var(--color-danger)" }}>*</span>
                </div>
                <FilePicker files={sheetFiles} setFiles={setSheetFiles} />

                {sheetFiles.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0", textAlign: "center" }}>
                    Adicione pelo menos uma foto para continuar.
                  </p>
                )}
              </>
            )}

            {sheetStatus === "nao_concluido" && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>Motivo (opcional)</label>
                <textarea
                  className="input-base"
                  value={sheetMotivo}
                  onChange={(e) => setSheetMotivo(e.target.value)}
                  placeholder="Descreva o motivo pelo qual não foi possível concluir..."
                  rows={3}
                />
              </div>
            )}

            {sheetMsg && (
              <div className="banner banner-danger" style={{ marginTop: 8 }}>{sheetMsg}</div>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={sheetEnviando || (exigeFotoPorItem ? itensSemFoto.length > 0 : sheetFiles.length === 0)}
              onClick={confirmarAcao}
            >
              {sheetEnviando ? "Enviando..." : `Confirmar — ${statusLabel(sheetStatus)}`}
            </button>
```

- [ ] **Step 4: Build de verificação**

Run: `cd frontend-instalador && npm run build`
Expected: build conclui sem erros

- [ ] **Step 5: Verificação manual no navegador — roteiro completo**

1. Backend + `frontend-instalador` de pé. Abrir um agendamento de Instalação com 2 itens vinculados a pedido, status "Em andamento".
2. Tocar "Concluir" sem ter fotografado nenhum item — o sheet deve mostrar a checklist dos 2 itens (sem `FilePicker` genérico), botão "Confirmar" desabilitado, e ao tentar mesmo assim deve aparecer "Falta foto em 2 item(ns): ...".
3. Tocar "+ foto" em cada item dentro do próprio sheet, uma a uma — a cada uma, a contagem de itens pendentes deve cair.
4. Com as 2 fotos enviadas, o botão "Confirmar" deve habilitar; confirmar e checar que o status virou "Concluído".
5. Repetir o teste para um agendamento de Conferência ou Manutenção em "andamento" — ao concluir, o sheet deve continuar mostrando o `FilePicker` genérico de sempre (sem checklist de itens).
6. Repetir o teste tentando "Iniciar atendimento" (status `andamento`) em um agendamento de Instalação — o sheet deve continuar pedindo a foto geral de "antes" (comportamento inalterado).

- [ ] **Step 6: Commit**

```bash
git add frontend-instalador/src/pages/AgendamentoDetalhe.jsx
git commit -m "feat(pwa): bottom sheet exige foto por item ao concluir Instalacao/Retorno-Finalizacao"
```

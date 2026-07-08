# Importação de Arquitetos (Padrão Hoop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a importação de arquitetos (hoje CSV, layout de CRM antigo) por uma importação em Excel no "padrão Hoop", introduzindo uma entidade real de escritório (`escritorios`), campos novos (nascimento, endereço, optin, chave PIX), um passo de mapeamento "Responsável → consultor interno", e apagando a base atual de 431 arquitetos para começar limpo com os dados do Hoop.

**Architecture:** Nova tabela `escritorios` (uma linha por CNPJ de escritório) referenciada por uma nova coluna `arquitetos.escritorio_id`. O parser do Excel roda no frontend (biblioteca `xlsx`, já usada no projeto), separando linhas PJ (viram `escritorios`) de linhas PF (viram `arquitetos`, linkados ao escritório certo por CNPJ). O backend recebe um array de "registros" já normalizados e faz o upsert (dedup por CNPJ/CPF, igual ao padrão já usado hoje). Um passo novo na tela de importação deixa o usuário mapear os nomes curtos da coluna "Responsável" (ex: "Dag") para usuários reais do sistema antes de importar.

**Tech Stack:** Node/Express + PostgreSQL (backend), React + Vite (frontend-web), biblioteca `xlsx` (SheetJS, já em `frontend-web/node_modules`), Jest (testes backend).

## Global Constraints

- Todas as migrations usam `IF NOT EXISTS` / `IF NOT EXISTS` — devem ser seguras para rodar de novo sem erro (convenção do repositório).
- Migrations não rodam sozinhas: sempre `node src/database/run-migration.js <arquivo.sql>` a partir de `backend/`, manualmente, uma vez no banco local e uma vez colando o SQL no SQL Editor do Supabase (produção). Não existe runner automático nem tabela de controle de migrations já aplicadas.
- Nunca usar `git add -A`/`git add .` — sempre listar arquivos.
- Todo texto de UI em português, seguindo o tom já usado nas telas de Arquitetos/Importar.
- Reaproveitar classes CSS `imp-*` já existentes em `frontend-web/src/pages/arquitetos/Arquitetos.css` sempre que possível, só adicionando o que for genuinamente novo.
- Backend não usa transação nas rotinas de import hoje (cada INSERT/UPDATE é sua própria statement implícita) — manter esse padrão, não introduzir `BEGIN/COMMIT` novo nesta função.

---

## Contrato de dados: o que o frontend manda pro backend

Depois de ler o Excel, agrupar PF/PJ e resolver "Responsável → consultor_id" na tela, o frontend envia para `POST /arquitetos/importar` (e antes disso, para `POST /arquitetos/verificar-duplicatas`) um array `registros` onde cada item tem este formato:

```js
{
  tipo_pessoa: "PF" | "PJ",          // normalizado (a planilha às vezes usa "CPF"/"CNPJ" como valor — ver normalizarTipoPessoa)
  nome: "Bianca Lombardi",
  email: "contato@biancalombardi.com.br",
  cpf_cnpj: "043.532.219-22",
  data_nascimento: "2025-07-24",     // YYYY-MM-DD, ou "" se vazio/inválido
  telefone: "(41) 99108-0421",
  rua: "Rua Carneiro Lobo",
  numero: "507",
  complemento: "Sala 1301",
  bairro: "Batel",
  cidade: "Curitiba",
  estado: "PR",
  cep: "80240-240",
  cau: "A59046-0",                   // só relevante em linhas PF
  comprou_optin: "",
  chave_pix: "043.532.219-22",
  // só usado quando tipo_pessoa === "PF" — dados do escritório ao qual essa pessoa pertence:
  escritorio_cpf_cnpj: "061.019.379-17",
  escritorio_nome: "Giuliano Marchioratto Studio",
  escritorio_telefone: "41 99113-1122",
  escritorio_email: "oi@giulianomarchiorato.com",
  // preenchido pela tela de mapeamento, pode ser null:
  consultor_id: 7,
}
```

Linhas `tipo_pessoa: "PJ"` viram um upsert em `escritorios` usando os próprios `nome`/`cpf_cnpj`/`telefone`/`email`/endereço/`comprou_optin`/`chave_pix` — **não** criam linha em `arquitetos`. Linhas `tipo_pessoa: "PF"` viram upsert em `arquitetos`, resolvendo (ou criando) o escritório a partir dos campos `escritorio_*`.

---

## Task 1: Migration — tabela `escritorios` e novas colunas em `arquitetos`

**Files:**
- Create: `backend/src/database/migrations/escritorios.sql`
- Create: `backend/src/database/migrations/arquitetos_hoop.sql`

**Interfaces:**
- Produces: tabela `escritorios(id, empresa_id, nome, cnpj, telefone, email, rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix, created_at, updated_at, deleted_at)`; colunas novas em `arquitetos`: `escritorio_id, data_nascimento, rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix`.

- [ ] **Step 1: Criar `escritorios.sql`**

```sql
CREATE TABLE IF NOT EXISTS escritorios (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  nome          VARCHAR(200) NOT NULL,
  cnpj          VARCHAR(25),
  telefone      VARCHAR(30),
  email         VARCHAR(150),
  rua           VARCHAR(200),
  numero        VARCHAR(20),
  complemento   VARCHAR(100),
  bairro        VARCHAR(100),
  cidade        VARCHAR(100),
  estado        VARCHAR(2),
  cep           VARCHAR(12),
  comprou_optin VARCHAR(50),
  chave_pix     VARCHAR(150),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escritorios_empresa ON escritorios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_escritorios_deleted ON escritorios (deleted_at) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Criar `arquitetos_hoop.sql`** (depende da tabela `escritorios` já existir, por causa da FK — rodar depois do Step 1)

```sql
ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS escritorio_id   INTEGER REFERENCES escritorios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS rua             VARCHAR(200),
  ADD COLUMN IF NOT EXISTS numero          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cidade          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cep             VARCHAR(12),
  ADD COLUMN IF NOT EXISTS comprou_optin   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS chave_pix       VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_arquitetos_escritorio ON arquitetos (escritorio_id);
```

- [ ] **Step 3: Rodar as duas migrations no banco local**

Run (a partir de `backend/`):
```bash
node src/database/run-migration.js escritorios.sql
node src/database/run-migration.js arquitetos_hoop.sql
```
Expected: `Migration executada com sucesso.` para as duas, sem erro.

- [ ] **Step 4: Confirmar as colunas no banco local**

Run:
```bash
node -e "require('./src/database/db').query(\"SELECT column_name FROM information_schema.columns WHERE table_name='escritorios'\").then(r=>{console.log(r.rows.map(x=>x.column_name)); process.exit(0)})"
```
Expected: lista incluindo `id, empresa_id, nome, cnpj, telefone, email, rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix, created_at, updated_at, deleted_at`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/escritorios.sql backend/src/database/migrations/arquitetos_hoop.sql
git commit -m "feat(arquitetos): adiciona tabela escritorios e novos campos do padrao Hoop"
```

**⚠️ Manual (fora deste repo/sessão):** depois do merge, colar o conteúdo dos dois arquivos (nessa ordem) no SQL Editor do Supabase para aplicar em produção — o processo aqui não tem acesso a isso.

---

## Task 2: Limpeza da base atual de arquitetos

**Files:** nenhum arquivo novo — comandos executados diretamente contra o banco.

**Interfaces:**
- Consumes: tabelas `pedidos`, `orcamentos`, `arquitetos` já existentes.
- Produces: `arquitetos` vazio (0 linhas), `pedidos.arquiteto_id`/`orcamentos.arquiteto_id` zerados onde apontavam pra um arquiteto antigo.

- [ ] **Step 1: Conferir o tamanho do impacto antes de apagar**

Run (a partir de `backend/`):
```bash
node -e "
const db = require('./src/database/db');
(async () => {
  const a = await db.query('SELECT COUNT(*) FROM arquitetos WHERE deleted_at IS NULL');
  const p = await db.query('SELECT COUNT(*) FROM pedidos WHERE arquiteto_id IS NOT NULL');
  const o = await db.query('SELECT COUNT(*) FROM orcamentos WHERE arquiteto_id IS NOT NULL');
  console.log('arquitetos:', a.rows[0].count, '| pedidos vinculados:', p.rows[0].count, '| orcamentos vinculados:', o.rows[0].count);
  process.exit(0);
})();
"
```
Expected (na base local, na data deste plano): `arquitetos: 431 | pedidos vinculados: 6 | orcamentos vinculados: 1`. Se os números forem muito diferentes disso quando você rodar, pare e confirme com o usuário antes de continuar — o plano assume esse tamanho de impacto.

- [ ] **Step 2: Desvincular e apagar (banco local)**

Run:
```bash
node -e "
const db = require('./src/database/db');
(async () => {
  await db.query('UPDATE pedidos SET arquiteto_id = NULL WHERE arquiteto_id IS NOT NULL');
  await db.query('UPDATE orcamentos SET arquiteto_id = NULL WHERE arquiteto_id IS NOT NULL');
  const del = await db.query('DELETE FROM arquitetos');
  console.log('arquitetos apagados:', del.rowCount);
  process.exit(0);
})();
"
```
Expected: `arquitetos apagados: 431` (ou o número confirmado no Step 1), sem erro de FK.

- [ ] **Step 3: Confirmar que ficou vazio**

Run:
```bash
node -e "require('./src/database/db').query('SELECT COUNT(*) FROM arquitetos').then(r=>{console.log(r.rows[0].count); process.exit(0)})"
```
Expected: `0`.

**⚠️ Manual (Supabase/produção):** rodar o mesmo UPDATE/UPDATE/DELETE acima colado no SQL Editor do Supabase, depois de confirmar lá também quantos `pedidos`/`orcamentos` estão vinculados (pode ser um número diferente do local — bancos são independentes). Não faça isso sem antes rodar o SELECT de conferência do Step 1 equivalente em produção.

Não há commit neste task — é só operação de dados, sem mudança de código.

---

## Task 3: Backend — `arquitetoService.js` com suporte a escritórios e novo `importar()`

**Files:**
- Modify: `backend/src/services/arquitetoService.js`
- Test: `backend/src/__tests__/arquitetoService.test.js` (novo arquivo — não existe teste pra esse service hoje)

**Interfaces:**
- Consumes: pool `db` de `../database/db` (mockado nos testes via `jest.mock('../database/db', () => ({ query: jest.fn() }))`).
- Produces: `module.exports = { listar, buscar, criar, atualizar, excluir, verificarDuplicatas, importar }` (mesma assinatura pública de hoje — `importar(empresaId, registros)` e `verificarDuplicatas(empresaId, registros)` continuam recebendo um array de registros, só que agora no formato Hoop descrito no topo deste plano).

- [ ] **Step 1: Escrever o teste que descreve o comportamento novo (falhando)**

Criar `backend/src/__tests__/arquitetoService.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/arquitetoService');

afterEach(() => jest.clearAllMocks());

describe('importar — registros PJ viram escritorios, nao arquitetos', () => {
  test('linha PJ cria um escritorio e nao cria arquiteto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // _carregarExistentes: arquitetos
      .mockResolvedValueOnce({ rows: [] }) // _carregarEscritoriosExistentes
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }); // INSERT escritorios

    const registros = [{
      tipo_pessoa: 'PJ',
      nome: 'Estudio Exemplo',
      cpf_cnpj: '11.222.333/0001-44',
      telefone: '(41) 99999-0000',
      email: 'contato@estudioexemplo.com',
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.escritorios_criados).toBe(1);
    expect(resultado.importados).toBe(0);
    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO escritorios'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toContain('Estudio Exemplo');
  });

  test('linha PF resolve escritorio existente pelo CNPJ e cria o arquiteto com escritorio_id', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // _carregarExistentes: arquitetos
      .mockResolvedValueOnce({ rows: [{ id: 5, nome: 'Estudio Exemplo', cnpj: '11222333000144', telefone: null, email: null, rua: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null, comprou_optin: null, chave_pix: null }] }) // _carregarEscritoriosExistentes
      .mockResolvedValueOnce({ rows: [] }) // UPDATE escritorios (existente, sem dado novo -> na verdade nao deve nem rodar se nada mudou; ver Step 3)
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // INSERT arquitetos

    const registros = [{
      tipo_pessoa: 'PF',
      nome: 'Fulana da Silva',
      cpf_cnpj: '111.222.333-44',
      escritorio_cpf_cnpj: '11.222.333/0001-44',
      escritorio_nome: 'Estudio Exemplo',
      consultor_id: 7,
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.importados).toBe(1);
    const insertArq = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO arquitetos'));
    expect(insertArq).toBeTruthy();
    expect(insertArq[1]).toContain(5); // escritorio_id resolvido
    expect(insertArq[1]).toContain(7); // consultor_id
  });

  test('linha PF sem escritorio correspondente cria um escritorio novo automaticamente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // arquitetos existentes
      .mockResolvedValueOnce({ rows: [] }) // escritorios existentes (nenhum)
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT escritorios (criado a partir dos campos escritorio_*)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }); // INSERT arquitetos

    const registros = [{
      tipo_pessoa: 'PF',
      nome: 'Beltrano',
      cpf_cnpj: '555.666.777-88',
      escritorio_cpf_cnpj: '99.888.777/0001-66',
      escritorio_nome: 'Escritorio Novo',
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.escritorios_criados).toBe(1);
    expect(resultado.importados).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham (funções ainda não existem no formato novo)**

Run: `cd backend && npx jest arquitetoService --silent`
Expected: FAIL — `resultado.escritorios_criados` é `undefined`, ou erro de shape.

- [ ] **Step 3: Reescrever `arquitetoService.js`**

```js
const db = require("../database/db");

/* ── Formatadores ─────────────────────────────────────────── */

const PREP_PT = new Set(["de","da","do","das","dos","e","em","a","o","as","os","no","na","nos","nas","ao","à"]);

function titleCase(str) {
  if (!str) return str;
  return str.trim().toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i === 0 || !PREP_PT.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(" ");
}

function digitos(str) {
  return str ? String(str).replace(/\D/g, "") : "";
}

function formatarCpfCnpj(str) {
  if (!str) return str;
  const d = digitos(str);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(str).trim();
}

function formatarTelefone(str) {
  if (!str) return str;
  const d = digitos(str);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return String(str).trim();
}

function fmtArquiteto(r) {
  return {
    ...r,
    nome:            titleCase(r.nome),
    escritorio:      r.escritorio      ? titleCase(r.escritorio) : r.escritorio,
    email:           r.email           ? r.email.trim().toLowerCase() : r.email,
    cpf_cnpj:        r.cpf_cnpj        ? formatarCpfCnpj(r.cpf_cnpj) : r.cpf_cnpj,
    telefone:        r.telefone        ? formatarTelefone(r.telefone) : r.telefone,
    outro_telefone:  r.outro_telefone  ? formatarTelefone(r.outro_telefone) : r.outro_telefone,
    cau:             r.cau             ? String(r.cau).trim().toUpperCase() : r.cau,
    rua:             r.rua             ? String(r.rua).trim() : r.rua,
    numero:          r.numero          ? String(r.numero).trim() : r.numero,
    complemento:     r.complemento     ? String(r.complemento).trim() : r.complemento,
    bairro:          r.bairro          ? String(r.bairro).trim() : r.bairro,
    cidade:          r.cidade          ? titleCase(r.cidade) : r.cidade,
    estado:          r.estado          ? String(r.estado).trim().toUpperCase().slice(0, 2) : r.estado,
    cep:             r.cep             ? String(r.cep).trim() : r.cep,
    comprou_optin:   r.comprou_optin   ? String(r.comprou_optin).trim() : r.comprou_optin,
    chave_pix:       r.chave_pix       ? String(r.chave_pix).trim() : r.chave_pix,
    data_nascimento: r.data_nascimento || null,
  };
}

function fmtEscritorio(r) {
  return {
    nome:            titleCase(r.nome),
    cnpj:            r.cnpj            ? formatarCpfCnpj(r.cnpj) : r.cnpj,
    telefone:        r.telefone        ? formatarTelefone(r.telefone) : r.telefone,
    email:           r.email           ? r.email.trim().toLowerCase() : r.email,
    rua:             r.rua             ? String(r.rua).trim() : r.rua,
    numero:          r.numero          ? String(r.numero).trim() : r.numero,
    complemento:     r.complemento     ? String(r.complemento).trim() : r.complemento,
    bairro:          r.bairro          ? String(r.bairro).trim() : r.bairro,
    cidade:          r.cidade          ? titleCase(r.cidade) : r.cidade,
    estado:          r.estado          ? String(r.estado).trim().toUpperCase().slice(0, 2) : r.estado,
    cep:             r.cep             ? String(r.cep).trim() : r.cep,
    comprou_optin:   r.comprou_optin   ? String(r.comprou_optin).trim() : r.comprou_optin,
    chave_pix:       r.chave_pix       ? String(r.chave_pix).trim() : r.chave_pix,
  };
}

/* ── Queries base ─────────────────────────────────────────── */

const SELECT_COLS = `
  a.*,
  u.nome_completo AS consultor_nome,
  COALESCE(e.nome, a.escritorio) AS escritorio
`;

const FROM_JOIN = `
  FROM arquitetos a
  LEFT JOIN usuarios u ON u.id = a.consultor_id
  LEFT JOIN escritorios e ON e.id = a.escritorio_id
`;

/* ── CRUD arquitetos ──────────────────────────────────────── */

async function listar(empresaId, q) {
  const params = [empresaId];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where = ` AND (a.nome ILIKE $2 OR a.escritorio ILIKE $2 OR e.nome ILIKE $2 OR a.email ILIKE $2 OR a.telefone ILIKE $2 OR a.cpf_cnpj ILIKE $2 OR u.nome_completo ILIKE $2)`;
  }
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.empresa_id = $1 AND a.deleted_at IS NULL${where}
     ORDER BY a.nome ASC`,
    params
  );
  return res.rows;
}

async function buscar(id, empresaId) {
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.id = $1 AND a.empresa_id = $2 AND a.deleted_at IS NULL`,
    [id, empresaId]
  );
  return res.rows[0] || null;
}

async function criar(empresaId, dados) {
  const d = fmtArquiteto(dados);
  if (!d.nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const res = await db.query(
    `INSERT INTO arquitetos
       (empresa_id, nome, telefone, outro_telefone, email, escritorio, escritorio_id, cau,
        tipo_pessoa, cpf_cnpj, observacoes, consultor_id, data_nascimento,
        rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING id`,
    [empresaId, d.nome.trim(), d.telefone||null, d.outro_telefone||null, d.email||null,
     d.escritorio||null, d.escritorio_id||null, d.cau||null, d.tipo_pessoa||null, d.cpf_cnpj||null,
     d.observacoes||null, d.consultor_id||null, d.data_nascimento||null,
     d.rua||null, d.numero||null, d.complemento||null, d.bairro||null, d.cidade||null,
     d.estado||null, d.cep||null, d.comprou_optin||null, d.chave_pix||null]
  );
  return buscar(res.rows[0].id, empresaId);
}

async function atualizar(id, empresaId, dados) {
  const d = fmtArquiteto(dados);
  if (!d.nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const res = await db.query(
    `UPDATE arquitetos
     SET nome=$1, telefone=$2, outro_telefone=$3, email=$4, escritorio=$5, cau=$6,
         tipo_pessoa=$7, cpf_cnpj=$8, observacoes=$9, consultor_id=$10, updated_at=NOW()
     WHERE id=$11 AND empresa_id=$12 AND deleted_at IS NULL RETURNING id`,
    [d.nome.trim(), d.telefone||null, d.outro_telefone||null, d.email||null, d.escritorio||null,
     d.cau||null, d.tipo_pessoa||null, d.cpf_cnpj||null, d.observacoes||null, d.consultor_id||null,
     id, empresaId]
  );
  if (!res.rows.length) throw Object.assign(new Error("Arquiteto não encontrado."), { status: 404 });
  return buscar(id, empresaId);
}

async function excluir(id, empresaId) {
  const res = await db.query(
    `UPDATE arquitetos SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id`,
    [id, empresaId]
  );
  if (!res.rows.length) throw Object.assign(new Error("Arquiteto não encontrado."), { status: 404 });
}

/* ── Dedup: arquitetos ────────────────────────────────────── */

async function _carregarExistentes(empresaId) {
  const res = await db.query(
    `SELECT id, nome, telefone, outro_telefone, email, escritorio, escritorio_id, cau, tipo_pessoa,
            cpf_cnpj, observacoes, data_nascimento, rua, numero, complemento, bairro, cidade, estado,
            cep, comprou_optin, chave_pix
     FROM arquitetos
     WHERE empresa_id=$1 AND deleted_at IS NULL`,
    [empresaId]
  );
  const porNome = new Map();
  const porCpf  = new Map();
  for (const row of res.rows) {
    porNome.set(row.nome.trim().toLowerCase(), row);
    const d = digitos(row.cpf_cnpj);
    if (d) porCpf.set(d, row);
  }
  return { porNome, porCpf };
}

function _encontrarExistente(r, porNome, porCpf) {
  const d = digitos(r.cpf_cnpj);
  if (d && porCpf.has(d)) return porCpf.get(d);
  const chave = r.nome?.trim().toLowerCase();
  if (chave && porNome.has(chave)) return porNome.get(chave);
  return null;
}

/* ── Dedup: escritórios ───────────────────────────────────── */

async function _carregarEscritoriosExistentes(empresaId) {
  const res = await db.query(
    `SELECT id, nome, cnpj, telefone, email, rua, numero, complemento, bairro, cidade, estado, cep,
            comprou_optin, chave_pix
     FROM escritorios
     WHERE empresa_id=$1 AND deleted_at IS NULL`,
    [empresaId]
  );
  const porCnpj = new Map();
  for (const row of res.rows) {
    const d = digitos(row.cnpj);
    if (d) porCnpj.set(d, row);
  }
  return porCnpj;
}

/**
 * Encontra (por CNPJ) ou cria um escritório a partir dos dados fornecidos.
 * `porCnpj` é o Map retornado por _carregarEscritoriosExistentes — é mutado
 * (novos escritórios entram nele) para que registros seguintes no mesmo
 * lote de importação reaproveitem o escritório recém-criado em vez de
 * duplicar.
 */
async function _resolverEscritorio(empresaId, dadosBrutos, porCnpj, contadores) {
  if (!dadosBrutos.nome?.trim()) return null;
  const d = fmtEscritorio(dadosBrutos);
  const chaveCnpj = digitos(d.cnpj);
  const existente = chaveCnpj ? porCnpj.get(chaveCnpj) : null;

  if (existente) {
    const temNovoDado = (
      (d.telefone      && d.telefone      !== existente.telefone)      ||
      (d.email         && d.email         !== existente.email)         ||
      (d.rua           && d.rua           !== existente.rua)           ||
      (d.cidade        && d.cidade        !== existente.cidade)        ||
      (d.comprou_optin && d.comprou_optin !== existente.comprou_optin) ||
      (d.chave_pix      && d.chave_pix    !== existente.chave_pix)
    );
    if (temNovoDado) {
      await db.query(
        `UPDATE escritorios SET
           nome          = COALESCE(NULLIF($1, ''), nome),
           telefone      = COALESCE(NULLIF($2, ''), telefone),
           email         = COALESCE(NULLIF($3, ''), email),
           rua           = COALESCE(NULLIF($4, ''), rua),
           numero        = COALESCE(NULLIF($5, ''), numero),
           complemento   = COALESCE(NULLIF($6, ''), complemento),
           bairro        = COALESCE(NULLIF($7, ''), bairro),
           cidade        = COALESCE(NULLIF($8, ''), cidade),
           estado        = COALESCE(NULLIF($9, ''), estado),
           cep           = COALESCE(NULLIF($10, ''), cep),
           comprou_optin = COALESCE(NULLIF($11, ''), comprou_optin),
           chave_pix     = COALESCE(NULLIF($12, ''), chave_pix),
           updated_at    = NOW()
         WHERE id=$13 AND empresa_id=$14 AND deleted_at IS NULL`,
        [d.nome||null, d.telefone||null, d.email||null, d.rua||null, d.numero||null, d.complemento||null,
         d.bairro||null, d.cidade||null, d.estado||null, d.cep||null, d.comprou_optin||null, d.chave_pix||null,
         existente.id, empresaId]
      );
      if (contadores) contadores.escritorios_atualizados++;
    }
    return existente.id;
  }

  const res = await db.query(
    `INSERT INTO escritorios (empresa_id, nome, cnpj, telefone, email, rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [empresaId, d.nome.trim(), d.cnpj||null, d.telefone||null, d.email||null, d.rua||null, d.numero||null,
     d.complemento||null, d.bairro||null, d.cidade||null, d.estado||null, d.cep||null, d.comprou_optin||null, d.chave_pix||null]
  );
  const novoId = res.rows[0].id;
  if (chaveCnpj) porCnpj.set(chaveCnpj, { id: novoId, ...d });
  if (contadores) contadores.escritorios_criados++;
  return novoId;
}

function normalizarTipoPessoa(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s.includes("PJ") || s.includes("CNPJ")) return "PJ";
  if (s.includes("PF") || s.includes("CPF")) return "PF";
  return "";
}

/* ── Verificação prévia (sem gravar) ──────────────────────── */

async function verificarDuplicatas(empresaId, registros) {
  const { porNome, porCpf } = await _carregarExistentes(empresaId);
  const duplicatas = [];
  let novos = 0;

  for (const raw of registros) {
    if (normalizarTipoPessoa(raw.tipo_pessoa) === "PJ") continue; // escritórios não entram na contagem de "arquitetos"
    if (!raw.nome?.trim()) continue;
    if (_encontrarExistente(raw, porNome, porCpf)) duplicatas.push(raw.nome);
    else novos++;
  }

  return { duplicatas, novos, total: novos + duplicatas.length };
}

/* ── Importação em lote ───────────────────────────────────── */

async function importar(empresaId, registros) {
  const { porNome, porCpf } = await _carregarExistentes(empresaId);
  const porCnpjEscritorio = await _carregarEscritoriosExistentes(empresaId);
  const contadores = { importados: 0, atualizados: 0, ignorados: 0, escritorios_criados: 0, escritorios_atualizados: 0 };
  const erros = [];

  for (const raw of registros) {
    if (!raw.nome?.trim()) continue;
    const tipo = normalizarTipoPessoa(raw.tipo_pessoa);

    try {
      if (tipo === "PJ") {
        await _resolverEscritorio(empresaId, {
          nome: raw.nome, cnpj: raw.cpf_cnpj, telefone: raw.telefone, email: raw.email,
          rua: raw.rua, numero: raw.numero, complemento: raw.complemento, bairro: raw.bairro,
          cidade: raw.cidade, estado: raw.estado, cep: raw.cep,
          comprou_optin: raw.comprou_optin, chave_pix: raw.chave_pix,
        }, porCnpjEscritorio, contadores);
        continue;
      }

      // tipo === "PF" (ou vazio/desconhecido — tratado como pessoa física)
      let escritorioId = null;
      if (raw.escritorio_nome?.trim()) {
        escritorioId = await _resolverEscritorio(empresaId, {
          nome: raw.escritorio_nome, cnpj: raw.escritorio_cpf_cnpj,
          telefone: raw.escritorio_telefone, email: raw.escritorio_email,
        }, porCnpjEscritorio, contadores);
      }

      const r = fmtArquiteto({ ...raw, escritorio: raw.escritorio_nome, escritorio_id: escritorioId });
      const existente = _encontrarExistente(r, porNome, porCpf);

      if (existente) {
        const temNovoDado = (
          (r.telefone         && r.telefone         !== existente.telefone)         ||
          (r.outro_telefone   && r.outro_telefone   !== existente.outro_telefone)   ||
          (r.email             && r.email             !== existente.email)             ||
          (r.escritorio         && r.escritorio         !== existente.escritorio)         ||
          (r.cau                && r.cau                !== existente.cau)                ||
          (r.tipo_pessoa         && r.tipo_pessoa         !== existente.tipo_pessoa)         ||
          (r.cpf_cnpj             && r.cpf_cnpj             !== existente.cpf_cnpj)             ||
          (r.data_nascimento       && r.data_nascimento       !== existente.data_nascimento)       ||
          (r.rua                    && r.rua                    !== existente.rua)                    ||
          (r.cidade                  && r.cidade                  !== existente.cidade)                  ||
          (r.comprou_optin             && r.comprou_optin             !== existente.comprou_optin)             ||
          (r.chave_pix                   && r.chave_pix                   !== existente.chave_pix)                   ||
          (escritorioId                    && escritorioId                    !== existente.escritorio_id)
        );

        if (temNovoDado) {
          await db.query(
            `UPDATE arquitetos SET
               telefone         = COALESCE(NULLIF($1, ''), telefone),
               outro_telefone   = COALESCE(NULLIF($2, ''), outro_telefone),
               email            = COALESCE(NULLIF($3, ''), email),
               escritorio       = COALESCE(NULLIF($4, ''), escritorio),
               escritorio_id    = COALESCE($5, escritorio_id),
               cau              = COALESCE(NULLIF($6, ''), cau),
               tipo_pessoa      = COALESCE(NULLIF($7, ''), tipo_pessoa),
               cpf_cnpj         = COALESCE(NULLIF($8, ''), cpf_cnpj),
               data_nascimento  = COALESCE($9, data_nascimento),
               rua              = COALESCE(NULLIF($10, ''), rua),
               numero           = COALESCE(NULLIF($11, ''), numero),
               complemento      = COALESCE(NULLIF($12, ''), complemento),
               bairro           = COALESCE(NULLIF($13, ''), bairro),
               cidade           = COALESCE(NULLIF($14, ''), cidade),
               estado           = COALESCE(NULLIF($15, ''), estado),
               cep              = COALESCE(NULLIF($16, ''), cep),
               comprou_optin    = COALESCE(NULLIF($17, ''), comprou_optin),
               chave_pix        = COALESCE(NULLIF($18, ''), chave_pix),
               updated_at       = NOW()
             WHERE id=$19 AND empresa_id=$20 AND deleted_at IS NULL`,
            [r.telefone||null, r.outro_telefone||null, r.email||null, r.escritorio||null, escritorioId||null,
             r.cau||null, r.tipo_pessoa||null, r.cpf_cnpj||null, r.data_nascimento||null,
             r.rua||null, r.numero||null, r.complemento||null, r.bairro||null, r.cidade||null,
             r.estado||null, r.cep||null, r.comprou_optin||null, r.chave_pix||null,
             existente.id, empresaId]
          );
          contadores.atualizados++;
        } else {
          contadores.ignorados++;
        }
      } else {
        await db.query(
          `INSERT INTO arquitetos
             (empresa_id, nome, telefone, outro_telefone, email, escritorio, escritorio_id, cau,
              tipo_pessoa, cpf_cnpj, consultor_id, data_nascimento,
              rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [empresaId, r.nome.trim(), r.telefone||null, r.outro_telefone||null, r.email||null,
           r.escritorio||null, escritorioId||null, r.cau||null, r.tipo_pessoa||null, r.cpf_cnpj||null,
           raw.consultor_id||null, r.data_nascimento||null,
           r.rua||null, r.numero||null, r.complemento||null, r.bairro||null, r.cidade||null,
           r.estado||null, r.cep||null, r.comprou_optin||null, r.chave_pix||null]
        );
        contadores.importados++;
      }
    } catch (e) {
      erros.push({ nome: raw.nome, erro: e.message });
    }
  }

  return { ...contadores, erros };
}

module.exports = { listar, buscar, criar, atualizar, excluir, verificarDuplicatas, importar };
```

- [ ] **Step 4: Rodar os testes de novo — devem passar**

Run: `cd backend && npx jest arquitetoService --silent`
Expected: `Tests: 3 passed, 3 total` (ou mais, se quiser adicionar casos extras de `verificarDuplicatas` ignorando linhas PJ).

- [ ] **Step 5: Rodar a suíte inteira do backend pra garantir que nada mais quebrou**

Run: `cd backend && npx jest --silent`
Expected: todos os testes passando (o número total vai ser o que já existia hoje + os novos deste task).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/arquitetoService.js backend/src/__tests__/arquitetoService.test.js
git commit -m "feat(arquitetos): importar() e verificarDuplicatas() passam a criar/atualizar escritorios"
```

---

## Task 4: Backend — rota `/arquitetos/importar` retorna os novos contadores

**Files:**
- Modify: `backend/src/routes/arquitetosRoutes.js` — **nenhuma mudança de código é necessária aqui**: a rota já faz `const resultado = await svc.importar(...); return res.json(resultado);`, e `resultado` agora inclui `escritorios_criados`/`escritorios_atualizados` automaticamente por já vir do service. Esse task é só de verificação.

**Interfaces:**
- Consumes: `svc.importar(empresaId, registros)` (Task 3).
- Produces: resposta HTTP de `POST /arquitetos/importar` agora inclui `{ importados, atualizados, ignorados, escritorios_criados, escritorios_atualizados, erros }`.

- [ ] **Step 1: Escrever um teste de integração da rota confirmando o novo shape da resposta**

Criar `backend/src/__tests__/arquitetosRoutes.importar.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/arquitetosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/arquitetos', router);

afterEach(() => jest.clearAllMocks());

test('POST /arquitetos/importar retorna contadores de escritorios junto com os de arquitetos', async () => {
  db.query
    .mockResolvedValueOnce({ rows: [] }) // arquitetos existentes
    .mockResolvedValueOnce({ rows: [] }) // escritorios existentes
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT escritorios (linha PJ)

  const res = await request(app)
    .post('/api/arquitetos/importar')
    .send({ registros: [{ tipo_pessoa: 'PJ', nome: 'Escritorio X', cpf_cnpj: '11.222.333/0001-44' }] });

  expect(res.status).toBe(200);
  expect(res.body.escritorios_criados).toBe(1);
  expect(res.body.importados).toBe(0);
});
```

- [ ] **Step 2: Rodar e confirmar que passa (o service do Task 3 já entrega isso)**

Run: `cd backend && npx jest arquitetosRoutes.importar --silent`
Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/arquitetosRoutes.importar.test.js
git commit -m "test(arquitetos): cobre resposta da rota de importar com contadores de escritorio"
```

---

## Task 5: Backend — importação de pedidos também casa com nome de escritório

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js:970-979`
- Modify: `backend/src/services/pedidoService.js:611-624`
- Test: `backend/src/__tests__/pedidosRoutes.importarTexto.test.js` (adicionar caso — arquivo já existe)
- Test: `backend/src/__tests__/pedidoService.test.js` (adicionar caso — arquivo já existe)

**Interfaces:**
- Consumes: tabela `escritorios` (Task 1).
- Produces: mesmo contrato de antes (`arquiteto_id` resolvido) — só passa a também casar pelo nome do escritório, não só pelo nome da pessoa.

Hoje, quando o texto colado do pedido tem `Arquiteto: Fulana da Silva`, o sistema só busca `arquitetos.nome ILIKE '%Fulana da Silva%'`. Com escritórios existindo agora, o texto pode trazer o nome do ESCRITÓRIO em vez do nome da pessoa (ex: `Arquiteto: Estudio Exemplo`) — isso deve casar com um arquiteto que pertença àquele escritório.

- [ ] **Step 1: Escrever o teste (falhando) pro caso de casar por nome de escritório**

Em `backend/src/__tests__/pedidosRoutes.importarTexto.test.js`, adicionar:

```js
test('casa arquiteto_id pelo nome do escritorio quando nao bate pelo nome da pessoa', async () => {
  // ... (usar o mesmo setup de app/db mock já existente no arquivo)
  db.query.mockImplementation((sql, params) => {
    if (sql.includes('FROM usuarios')) return Promise.resolve({ rows: [] });
    if (sql.includes('FROM arquitetos') && sql.includes('a.nome ILIKE')) return Promise.resolve({ rows: [] });
    if (sql.includes('FROM arquitetos') && sql.includes('e.nome ILIKE')) return Promise.resolve({ rows: [{ id: 42 }] });
    if (sql.includes('FROM categorias')) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });

  const res = await request(app)
    .post('/api/pedidos/importar-texto')
    .send({ texto: 'Arquiteto:\nEstudio Exemplo\nCPF: 000.000.000-00' });

  expect(res.body.extraido.arquiteto_id).toBe(42);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest pedidosRoutes.importarTexto --silent`
Expected: FAIL — `arquiteto_id` vem `null` porque a busca por escritório ainda não existe.

- [ ] **Step 3: Atualizar `pedidosRoutes.js:970-979`**

```js
    let arquiteto_id = null;
    if (campos.arquiteto_nome) {
      try {
        const porNome = await db.query(
          `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL ORDER BY nome LIMIT 1`,
          [req.user.empresa_id, `%${campos.arquiteto_nome}%`]
        );
        if (porNome.rows.length > 0) {
          arquiteto_id = porNome.rows[0].id;
        } else {
          const porEscritorio = await db.query(
            `SELECT a.id FROM arquitetos a
             JOIN escritorios e ON e.id = a.escritorio_id
             WHERE a.empresa_id=$1 AND a.deleted_at IS NULL AND e.nome ILIKE $2
             ORDER BY a.nome LIMIT 1`,
            [req.user.empresa_id, `%${campos.arquiteto_nome}%`]
          );
          if (porEscritorio.rows.length > 0) arquiteto_id = porEscritorio.rows[0].id;
        }
      } catch (_) {}
    }
```

- [ ] **Step 4: Rodar de novo — deve passar**

Run: `cd backend && npx jest pedidosRoutes.importarTexto --silent`
Expected: `Tests: N passed` (todos, incluindo o novo).

- [ ] **Step 5: Mesma lógica em `pedidoService.js:611-624`** (usada quando o pedido é efetivamente salvo, não só na prévia)

```js
  // Resolve arquiteto: usa o id já conhecido, busca por nome/escritorio ou cria se não existir
  let arquitetoId = dados.arquiteto_id ? Number(dados.arquiteto_id) : null;
  if (!arquitetoId && dados.arquiteto_nome?.trim()) {
    const porNome = await db.query(
      `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, `%${dados.arquiteto_nome.trim()}%`]
    );
    if (porNome.rows.length > 0) {
      arquitetoId = porNome.rows[0].id;
    } else {
      const porEscritorio = await db.query(
        `SELECT a.id FROM arquitetos a
         JOIN escritorios e ON e.id = a.escritorio_id
         WHERE a.empresa_id=$1 AND a.deleted_at IS NULL AND e.nome ILIKE $2
         LIMIT 1`,
        [empresaId, `%${dados.arquiteto_nome.trim()}%`]
      );
      if (porEscritorio.rows.length > 0) {
        arquitetoId = porEscritorio.rows[0].id;
      } else {
        const novoArq = await arqSvc.criar(empresaId, { nome: dados.arquiteto_nome.trim() });
        arquitetoId = novoArq.id;
      }
    }
  }
```

- [ ] **Step 6: Adicionar o teste equivalente em `pedidoService.test.js`** (mesmo padrão de mock já usado nos outros testes desse arquivo pra `importar()` — reaproveitar o setup existente, só variando a sequência de `db.query.mockResolvedValueOnce` pra simular "não achou por nome, achou por escritório").

- [ ] **Step 7: Rodar a suíte inteira do backend**

Run: `cd backend && npx jest --silent`
Expected: todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/services/pedidoService.js backend/src/__tests__/pedidosRoutes.importarTexto.test.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(pedidos): importacao de texto tambem casa arquiteto pelo nome do escritorio"
```

---

## Task 6: Frontend — `ImportarArquitetosModal.jsx` lê Excel no padrão Hoop

**Files:**
- Modify: `frontend-web/src/pages/arquitetos/ImportarArquitetosModal.jsx` (reescrita quase completa)
- Modify: `frontend-web/src/pages/arquitetos/Arquitetos.css` (adicionar estilos do novo passo de mapeamento)
- Modify: `frontend-web/src/pages/arquitetos/Arquitetos.jsx:333-335` (rótulo do botão)

**Interfaces:**
- Consumes: `api.get("/auth/admin/usuarios")` (mesmo endpoint já usado em `Arquitetos.jsx:241`, filtra por `status === "aprovado"`), `api.post("/arquitetos/verificar-duplicatas", { registros })`, `api.post("/arquitetos/importar", { registros })` — ambos já existentes, `registros` agora no formato Hoop descrito no topo do plano.
- Produces: nenhuma interface nova consumida por outro arquivo — é uma tela isolada.

- [ ] **Step 1: Cabeçalhos exatos da planilha Hoop e função de parsing**

No topo de `ImportarArquitetosModal.jsx`, substituir o parser de CSV por um parser de Excel. Cabeçalhos confirmados nas 3 planilhas de referência (`Nome, Email, TIPO (PF/PJ), CPF/CNPJ, Data de nascimento, Telefone, Endereço, Número, Complemento, Bairro, Cidade, Estado (Sigla), Cep, Categoria, RT, Responsável, CPF / CNPJ ESCRITORIO, NOME DO ESCRITORIO, TELEFONE ESCRITORIO, EMAIL ESCRITORIO, CAU/CREA, Comprou | OPTIN, CHAVE PIX`):

```jsx
import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { FaUpload, FaFileAlt, FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import { api } from "../../services/api";

function normalizarTipoPessoa(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s.includes("PJ") || s.includes("CNPJ")) return "PJ";
  if (s.includes("PF") || s.includes("CPF")) return "PF";
  return "";
}

function formatarDataNascimento(v) {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v)) {
    const ano = v.getUTCFullYear();
    const mes = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(v.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  return "";
}

function mapearLinhasHoop(linhas) {
  if (!linhas.length) return [];
  const headers = linhas[0].map((h) => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const get = (row, col) => {
    const v = row[idx[col]];
    return v === undefined || v === null ? "" : v;
  };
  const getStr = (row, col) => String(get(row, col)).trim();

  return linhas
    .slice(1)
    .filter((row) => getStr(row, "Nome"))
    .map((row) => ({
      tipo_pessoa:          normalizarTipoPessoa(getStr(row, "TIPO (PF/PJ)")),
      nome:                 getStr(row, "Nome"),
      email:                getStr(row, "Email").replace(/\s/g, ""),
      cpf_cnpj:             getStr(row, "CPF/CNPJ"),
      data_nascimento:      formatarDataNascimento(get(row, "Data de nascimento")),
      telefone:             getStr(row, "Telefone"),
      rua:                  getStr(row, "Endereço"),
      numero:               getStr(row, "Número"),
      complemento:          getStr(row, "Complemento"),
      bairro:               getStr(row, "Bairro"),
      cidade:               getStr(row, "Cidade"),
      estado:               getStr(row, "Estado (Sigla)"),
      cep:                  getStr(row, "Cep"),
      cau:                  getStr(row, "CAU/CREA"),
      comprou_optin:        getStr(row, "Comprou | OPTIN"),
      chave_pix:            getStr(row, "CHAVE PIX"),
      responsavel_nome:     getStr(row, "Responsável"),
      escritorio_cpf_cnpj:  getStr(row, "CPF / CNPJ ESCRITORIO"),
      escritorio_nome:      getStr(row, "NOME DO ESCRITORIO"),
      escritorio_telefone:  getStr(row, "TELEFONE ESCRITORIO"),
      escritorio_email:     getStr(row, "EMAIL ESCRITORIO"),
    }))
    .filter((r) => r.nome);
}
```

- [ ] **Step 2: Trocar a leitura do arquivo (FileReader texto → xlsx binário) e adicionar o passo "mapear-responsaveis" na máquina de estados**

Substituir o corpo do componente (mantendo o nome `ImportarArquitetosModal` e as props `onClose`/`onImportado`):

```jsx
export default function ImportarArquitetosModal({ onClose, onImportado }) {
  const [etapa, setEtapa] = useState("selecionar"); // selecionar | mapear-responsaveis | verificando | preview | importando | resultado
  const [linhasBrutas, setLinhasBrutas] = useState([]); // saída de mapearLinhasHoop, sem consultor_id ainda
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [consultores, setConsultores] = useState([]);
  const [mapaResponsaveis, setMapaResponsaveis] = useState({}); // { "Dag": "7" }
  const [verificacao, setVerificacao] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erroLeitura, setErroLeitura] = useState(null);
  const inputRef = useRef();

  const responsaveisUnicos = useMemo(() => {
    const set = new Set(linhasBrutas.map((r) => r.responsavel_nome).filter(Boolean));
    return [...set];
  }, [linhasBrutas]);

  const registros = useMemo(
    () => linhasBrutas.map((r) => ({
      ...r,
      consultor_id: r.responsavel_nome ? (mapaResponsaveis[r.responsavel_nome] || null) : null,
    })),
    [linhasBrutas, mapaResponsaveis]
  );

  const registrosPF = useMemo(() => registros.filter((r) => r.tipo_pessoa !== "PJ"), [registros]);
  const registrosPJ = useMemo(() => registros.filter((r) => r.tipo_pessoa === "PJ"), [registros]);

  function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setErroLeitura(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const regs = mapearLinhasHoop(linhas);
        if (!regs.length) {
          setErroLeitura("Nenhum registro válido encontrado no arquivo.");
          return;
        }
        setLinhasBrutas(regs);

        if (!consultores.length) {
          try {
            const r = await api.get("/auth/admin/usuarios");
            setConsultores((r.usuarios || []).filter((u) => u.status === "aprovado"));
          } catch { /* segue sem consultores — mapeamento fica vazio */ }
        }

        setEtapa("mapear-responsaveis");
      } catch {
        setErroLeitura("Falha ao interpretar o arquivo. Confira se é um .xlsx válido no padrão Hoop.");
      }
    };
    reader.onerror = () => setErroLeitura("Erro ao ler o arquivo.");
    reader.readAsArrayBuffer(file);
  }

  async function confirmarMapeamento() {
    setEtapa("verificando");
    try {
      const check = await api.post("/arquitetos/verificar-duplicatas", { registros });
      setVerificacao(check);
    } catch {
      setVerificacao({ duplicatas: [], novos: registrosPF.length, total: registrosPF.length });
    }
    setEtapa("preview");
  }

  async function handleImportar() {
    setEtapa("importando");
    try {
      const res = await api.post("/arquitetos/importar", { registros });
      setResultado(res);
      setEtapa("resultado");
      onImportado();
    } catch (err) {
      setResultado({ importados: 0, atualizados: 0, ignorados: 0, escritorios_criados: 0, escritorios_atualizados: 0, erros: [{ nome: "—", erro: err.message }] });
      setEtapa("resultado");
    }
  }

  const temDuplicatas = verificacao && verificacao.duplicatas?.length > 0;
```

- [ ] **Step 3: JSX do passo novo "mapear-responsaveis"** — inserir logo depois do bloco `{etapa === "selecionar" && (...)}` existente (mantendo os outros blocos de etapa como já estão, só trocando `registros.length`/`registros.slice(0,5)` por `registrosPF.length`/`registrosPF.slice(0,5)` na etapa de preview, já que só PF conta como "arquiteto" pro usuário):

```jsx
{etapa === "mapear-responsaveis" && (
  <>
    <p className="imp-preview-label">
      Vincule cada "Responsável" da planilha a um usuário do sistema (fica como consultor responsável). Pode deixar sem vínculo.
    </p>
    {responsaveisUnicos.length === 0 && (
      <p className="imp-preview-label">Nenhuma coluna "Responsável" preenchida nesse arquivo — pode seguir sem vincular ninguém.</p>
    )}
    {responsaveisUnicos.map((nome) => (
      <div className="ag-form-field" key={nome} style={{ marginBottom: 12 }}>
        <label>{nome}</label>
        <select
          value={mapaResponsaveis[nome] || ""}
          onChange={(e) => setMapaResponsaveis((m) => ({ ...m, [nome]: e.target.value }))}
        >
          <option value="">— Sem consultor —</option>
          {consultores.map((c) => (
            <option key={c.id} value={c.id}>{c.nome_completo}</option>
          ))}
        </select>
      </div>
    ))}
  </>
)}
```

E no rodapé (`modal-actions`), adicionar o botão dessa etapa junto aos já existentes:

```jsx
{etapa === "mapear-responsaveis" && (
  <>
    <button className="btn-secondary" onClick={() => { setEtapa("selecionar"); setLinhasBrutas([]); }}>
      Trocar arquivo
    </button>
    <button className="btn-primary" onClick={confirmarMapeamento}>
      Continuar
    </button>
  </>
)}
```

- [ ] **Step 4: Ajustar a etapa "preview" para mostrar também os escritórios e usar `registrosPF`**

Na etapa `preview`, trocar toda referência a `registros` por `registrosPF` (contagem, tabela dos 5 primeiros, "e mais N registros"), e adicionar uma linha de resumo extra logo abaixo do resumo de novos/duplicados existente:

```jsx
{registrosPJ.length > 0 && (
  <div className="imp-resumo-item imp-resumo-novo">
    <FaInfoCircle />
    <span><strong>{registrosPJ.length}</strong> escritório{registrosPJ.length !== 1 ? "s" : ""} serão criados/atualizados junto</span>
  </div>
)}
```

O botão de importar no rodapé (etapa `preview`) já usa `registros.length`/`verificacao?.novos` — trocar `registros.length` por `registrosPF.length` na label (`Importar ${registrosPF.length} arquitetos`), mantendo o resto igual.

- [ ] **Step 5: Ajustar a etapa "resultado" para mostrar contadores de escritório também**

Adicionar, junto aos blocos já existentes de `resultado.importados`/`atualizados`/`ignorados`:

```jsx
{resultado.escritorios_criados > 0 && (
  <div className="imp-resultado-ok">
    <FaCheckCircle className="imp-resultado-icon" />
    <div>
      <strong>{resultado.escritorios_criados}</strong> escritório{resultado.escritorios_criados !== 1 ? "s" : ""} novo{resultado.escritorios_criados !== 1 ? "s" : ""} criado{resultado.escritorios_criados !== 1 ? "s" : ""}
    </div>
  </div>
)}
{resultado.escritorios_atualizados > 0 && (
  <div className="imp-resultado-info">
    <FaInfoCircle className="imp-resultado-icon imp-resultado-icon-info" />
    <div>
      <strong>{resultado.escritorios_atualizados}</strong> escritório{resultado.escritorios_atualizados !== 1 ? "s" : ""} atualizado{resultado.escritorios_atualizados !== 1 ? "s" : ""}
    </div>
  </div>
)}
```

- [ ] **Step 6: Trocar o input de arquivo pra aceitar `.xlsx` em vez de `.csv,.txt`, e ajustar o texto de dica**

Na etapa `selecionar`:
```jsx
<p className="imp-drop-title">Clique para selecionar a planilha (padrão Hoop)</p>
<p className="imp-drop-hint">Formato esperado: Excel (.xlsx) exportado do Hoop</p>
<input
  ref={inputRef}
  type="file"
  accept=".xlsx"
  style={{ display: "none" }}
  onChange={handleArquivo}
/>
```

- [ ] **Step 7: Atualizar `Arquitetos.jsx:333-335`** — rótulo do botão que abre o modal:

```jsx
<button className="btn-secondary" onClick={() => setModalImportar(true)}>
  <FaFileImport /> Importar Excel (Hoop)
</button>
```

- [ ] **Step 8: Rodar o build do frontend-web pra garantir que compila**

Run: `cd frontend-web && npm run build`
Expected: build sem erro, sem warning de import não resolvido (`xlsx` já é dependência existente — conferir em `frontend-web/package.json` se está listada; se só estiver em `node_modules` por ser dependência transitiva de outra lib, rodar `npm install xlsx` primeiro dentro de `frontend-web/` e conferir que aparece em `package.json` → `dependencies`).

- [ ] **Step 9: Testar manualmente no navegador**

Suba o frontend-web (`npm run dev`), abra a tela de Arquitetos, clique "Importar Excel (Hoop)", selecione um dos 3 arquivos de `E:\Projetos\arquivos adornie para testes\padrão hoop impor arq\`, confirme que:
- A etapa de mapear "Responsável" aparece com o nome certo (ex: "Dag").
- A prévia mostra a contagem de arquitetos (PF) e a linha de "N escritórios serão criados".
- Importar conclui e mostra os contadores de arquitetos + escritórios.
- Reabrir o mesmo arquivo e importar de novo mostra os registros como duplicados/atualizados, não duplicando.

- [ ] **Step 10: Commit**

```bash
git add frontend-web/src/pages/arquitetos/ImportarArquitetosModal.jsx frontend-web/src/pages/arquitetos/Arquitetos.jsx frontend-web/package.json frontend-web/package-lock.json
git commit -m "feat(arquitetos): importacao passa a ler Excel no padrao Hoop, com vinculo de escritorio e consultor"
```

---

## Task 7: Verificação final

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Suíte completa do backend**

Run: `cd backend && npx jest --silent`
Expected: todos os testes passando (nenhuma regressão nos módulos de pedidos/arquitetos/agendamentos).

- [ ] **Step 2: Build + lint do frontend-web**

Run: `cd frontend-web && npx eslint src/pages/arquitetos/ImportarArquitetosModal.jsx src/pages/arquitetos/Arquitetos.jsx && npm run build`
Expected: sem erros de lint (warnings pré-existentes de outros arquivos não contam), build ok.

- [ ] **Step 3: Conferir que a base de arquitetos está mesmo vazia antes de importar os 3 arquivos reais**

Run: `cd backend && node -e "require('./src/database/db').query('SELECT COUNT(*) FROM arquitetos').then(r=>{console.log(r.rows[0].count); process.exit(0)})"`
Expected: `0` (assumindo Task 2 já rodou).

- [ ] **Step 4: Importar os 3 arquivos reais pela tela, um de cada vez** (Dag → Mariane → Thays), confirmando os contadores de cada importação batem com o que foi inspecionado nas planilhas (aproximadamente 63, 95 e 108 registros com nome preenchido, respectivamente — números podem variar um pouco pela separação PF/PJ).

- [ ] **Step 5: Reportar ao usuário**

Resumir: quantos arquitetos e escritórios ficaram no banco local ao final, lembrar que as migrations (Task 1) e a limpeza de dados (Task 2) ainda precisam ser replicadas manualmente no Supabase antes de considerar o trabalho concluído em produção.

---

## Self-Review

**Cobertura da spec (decisões da conversa):**
- Tabela `escritorios` separada → Task 1, 3. ✅
- Campos novos (nascimento, endereço, optin, PIX) → Task 1 (colunas), Task 3 (fmt/import), Task 6 (parsing). ✅
- "Responsável" → mapeamento manual de consultor na tela → Task 6, Step 3. ✅
- Substituir CSV por Excel Hoop, sem manter o formato antigo → Task 6 troca completamente o parser e a extensão aceita. ✅
- Dados antigos: desvincular pedidos/orçamentos e apagar tudo → Task 2. ✅
- Match de escritório por CNPJ → Task 3 (`_resolverEscritorio`). ✅
- Um arquivo por vez → Task 6 não implementa seleção múltipla. ✅
- Optin/PIX só armazenar por enquanto, mas campo pronto pra uso futuro → colunas existem e são exibidas/gravadas, nenhuma regra de negócio nova associada. ✅
- Importação de pedidos linka arquiteto correspondente → já existia; Task 5 estende pra também casar por nome de escritório, cobrindo o caso novo que surgiu com a tabela de escritórios. ✅

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código de cada step está completo (migrations inteiras, service inteiro, rota comentada como "sem mudança necessária" com justificativa, componente frontend com todos os blocos alterados mostrados).

**Consistência de tipos/nomes:** `escritorio_id` usado com esse nome exato em migration (Task 1), service (Task 3), e query nova de `pedidosRoutes.js`/`pedidoService.js` (Task 5). `registros` como nome do array em todos os pontos de contrato frontend↔backend (Task 3, 4, 6). `_resolverEscritorio(empresaId, dadosBrutos, porCnpj, contadores)` definido no Task 3 é a única função nova compartilhada entre `importar()` e o branch PJ/PF — assinatura usada de forma consistente nas duas chamadas dentro do próprio `importar()`.

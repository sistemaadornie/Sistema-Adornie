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
  return str ? str.replace(/\D/g, "") : "";
}

function formatarCpfCnpj(str) {
  if (!str) return str;
  const d = digitos(str);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return str.trim(); // comprimento atípico — devolve sem máscara mas trimado
}

function formatarTelefone(str) {
  if (!str) return str;
  const d = digitos(str);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return str.trim();
}

function fmt(r) {
  return {
    ...r,
    nome:           titleCase(r.nome),
    escritorio:     r.escritorio ? titleCase(r.escritorio) : r.escritorio,
    email:          r.email      ? r.email.trim().toLowerCase()   : r.email,
    cpf_cnpj:       r.cpf_cnpj   ? formatarCpfCnpj(r.cpf_cnpj)   : r.cpf_cnpj,
    telefone:       r.telefone   ? formatarTelefone(r.telefone)   : r.telefone,
    outro_telefone: r.outro_telefone ? formatarTelefone(r.outro_telefone) : r.outro_telefone,
    cau:            r.cau        ? r.cau.trim().toUpperCase()     : r.cau,
  };
}

/* ── Queries base ─────────────────────────────────────────── */

const SELECT_COLS = `
  a.*,
  u.nome_completo AS consultor_nome
`;

const FROM_JOIN = `
  FROM arquitetos a
  LEFT JOIN usuarios u ON u.id = a.consultor_id
`;

/* ── CRUD ─────────────────────────────────────────────────── */

async function listar(empresaId, q) {
  const params = [empresaId];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where = ` AND (a.nome ILIKE $2 OR a.escritorio ILIKE $2 OR a.email ILIKE $2 OR a.telefone ILIKE $2 OR a.cpf_cnpj ILIKE $2 OR u.nome_completo ILIKE $2)`;
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
  const d = fmt(dados);
  if (!d.nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const res = await db.query(
    `INSERT INTO arquitetos (empresa_id, nome, telefone, outro_telefone, email, escritorio, cau, tipo_pessoa, cpf_cnpj, observacoes, consultor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [empresaId, d.nome.trim(), d.telefone||null, d.outro_telefone||null, d.email||null,
     d.escritorio||null, d.cau||null, d.tipo_pessoa||null, d.cpf_cnpj||null, d.observacoes||null, d.consultor_id||null]
  );
  return buscar(res.rows[0].id, empresaId);
}

async function atualizar(id, empresaId, dados) {
  const d = fmt(dados);
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

/* ── Helpers para detecção de duplicatas ──────────────────── */

async function _carregarExistentes(empresaId) {
  const res = await db.query(
    `SELECT id, nome, telefone, outro_telefone, email, escritorio, cau, tipo_pessoa, cpf_cnpj, observacoes
     FROM arquitetos
     WHERE empresa_id=$1 AND deleted_at IS NULL`,
    [empresaId]
  );
  const porNome = new Map();
  const porCpf  = new Map();
  for (const row of res.rows) {
    porNome.set(row.nome.trim().toLowerCase(), row);
    // chave por dígitos para tolerar formatos diferentes (com/sem máscara)
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

/* ── Verificação prévia (sem gravar) ──────────────────────── */

async function verificarDuplicatas(empresaId, registros) {
  const { porNome, porCpf } = await _carregarExistentes(empresaId);
  const duplicatas = [];
  let novos = 0;

  for (const r of registros) {
    if (!r.nome?.trim()) continue;
    if (_encontrarExistente(r, porNome, porCpf)) duplicatas.push(r.nome);
    else novos++;
  }

  return { duplicatas, novos, total: novos + duplicatas.length };
}

/* ── Importação em lote ───────────────────────────────────── */

async function importar(empresaId, registros) {
  const { porNome, porCpf } = await _carregarExistentes(empresaId);
  let importados = 0, atualizados = 0, ignorados = 0;
  const erros = [];

  for (const raw of registros) {
    if (!raw.nome?.trim()) continue;
    const r = fmt(raw);
    const existente = _encontrarExistente(r, porNome, porCpf);

    try {
      if (existente) {
        const temNovoDado = (
          (r.telefone       && r.telefone       !== existente.telefone)       ||
          (r.outro_telefone && r.outro_telefone !== existente.outro_telefone) ||
          (r.email          && r.email          !== existente.email)          ||
          (r.escritorio     && r.escritorio     !== existente.escritorio)     ||
          (r.cau            && r.cau            !== existente.cau)            ||
          (r.tipo_pessoa    && r.tipo_pessoa    !== existente.tipo_pessoa)    ||
          (r.cpf_cnpj       && r.cpf_cnpj       !== existente.cpf_cnpj)       ||
          (r.observacoes    && r.observacoes    !== existente.observacoes)
        );

        if (temNovoDado) {
          await db.query(
            `UPDATE arquitetos SET
               telefone       = COALESCE(NULLIF($1, ''), telefone),
               outro_telefone = COALESCE(NULLIF($2, ''), outro_telefone),
               email          = COALESCE(NULLIF($3, ''), email),
               escritorio     = COALESCE(NULLIF($4, ''), escritorio),
               cau            = COALESCE(NULLIF($5, ''), cau),
               tipo_pessoa    = COALESCE(NULLIF($6, ''), tipo_pessoa),
               cpf_cnpj       = COALESCE(NULLIF($7, ''), cpf_cnpj),
               observacoes    = COALESCE(NULLIF($8, ''), observacoes),
               updated_at     = NOW()
             WHERE id=$9 AND empresa_id=$10 AND deleted_at IS NULL`,
            [r.telefone||null, r.outro_telefone||null, r.email||null, r.escritorio||null,
             r.cau||null, r.tipo_pessoa||null, r.cpf_cnpj||null, r.observacoes||null,
             existente.id, empresaId]
          );
          atualizados++;
        } else {
          ignorados++;
        }
      } else {
        await db.query(
          `INSERT INTO arquitetos (empresa_id, nome, telefone, outro_telefone, email, escritorio, cau, tipo_pessoa, cpf_cnpj, observacoes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [empresaId, r.nome.trim(), r.telefone||null, r.outro_telefone||null, r.email||null,
           r.escritorio||null, r.cau||null, r.tipo_pessoa||null, r.cpf_cnpj||null, r.observacoes||null]
        );
        importados++;
      }
    } catch (e) {
      erros.push({ nome: raw.nome, erro: e.message });
    }
  }

  return { importados, atualizados, ignorados, erros };
}

module.exports = { listar, buscar, criar, atualizar, excluir, verificarDuplicatas, importar };

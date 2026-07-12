const db = require("../database/db");
const { isComercialPuro } = require("./permissionService");

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

function fmtEndereco(r) {
  return {
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

function fmtArquiteto(r) {
  return {
    ...r,
    ...fmtEndereco(r),
    nome:            titleCase(r.nome),
    escritorio:      r.escritorio      ? titleCase(r.escritorio) : r.escritorio,
    email:           r.email           ? r.email.trim().toLowerCase() : r.email,
    cpf_cnpj:        r.cpf_cnpj        ? formatarCpfCnpj(r.cpf_cnpj) : r.cpf_cnpj,
    telefone:        r.telefone        ? formatarTelefone(r.telefone) : r.telefone,
    outro_telefone:  r.outro_telefone  ? formatarTelefone(r.outro_telefone) : r.outro_telefone,
    cau:             r.cau             ? String(r.cau).trim().toUpperCase() : r.cau,
    data_nascimento: r.data_nascimento || null,
  };
}

function fmtEscritorio(r) {
  return {
    ...fmtEndereco(r),
    nome:            titleCase(r.nome),
    cnpj:            r.cnpj            ? formatarCpfCnpj(r.cnpj) : r.cnpj,
    telefone:        r.telefone        ? formatarTelefone(r.telefone) : r.telefone,
    email:           r.email           ? r.email.trim().toLowerCase() : r.email,
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

/* ── CRUD ─────────────────────────────────────────────────── */

async function listar(empresaId, q, permissoes, userId) {
  const params = [empresaId];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (a.nome ILIKE $${params.length} OR a.escritorio ILIKE $${params.length} OR e.nome ILIKE $${params.length} OR a.email ILIKE $${params.length} OR a.telefone ILIKE $${params.length} OR a.cpf_cnpj ILIKE $${params.length} OR u.nome_completo ILIKE $${params.length})`;
  }
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    where += ` AND a.consultor_id = $${params.length}`;
  }
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.empresa_id = $1 AND a.deleted_at IS NULL${where}
     ORDER BY a.nome ASC`,
    params
  );
  return res.rows;
}

async function buscar(id, empresaId, permissoes, userId) {
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.id = $1 AND a.empresa_id = $2 AND a.deleted_at IS NULL`,
    [id, empresaId]
  );
  const arq = res.rows[0] || null;
  if (arq && isComercialPuro(permissoes) && String(arq.consultor_id) !== String(userId)) {
    return null;
  }
  return arq;
}

async function criar(empresaId, dados) {
  const d = fmtArquiteto(dados);
  if (!d.nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const res = await db.query(
    `INSERT INTO arquitetos
       (empresa_id, nome, telefone, outro_telefone, email, escritorio, escritorio_id, cau,
        tipo_pessoa, cpf_cnpj, observacoes, consultor_id, data_nascimento,
        rua, numero, complemento, bairro, cidade, estado, cep, comprou_optin, chave_pix,
        perfil_checklist)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id`,
    [empresaId, d.nome.trim(), d.telefone||null, d.outro_telefone||null, d.email||null,
     d.escritorio||null, d.escritorio_id||null, d.cau||null, d.tipo_pessoa||null, d.cpf_cnpj||null,
     d.observacoes||null, d.consultor_id||null, d.data_nascimento||null,
     d.rua||null, d.numero||null, d.complemento||null, d.bairro||null, d.cidade||null,
     d.estado||null, d.cep||null, d.comprou_optin||null, d.chave_pix||null,
     d.perfil_checklist ? JSON.stringify(d.perfil_checklist) : null]
  );
  return buscar(res.rows[0].id, empresaId);
}

async function atualizar(id, empresaId, dados) {
  const d = fmtArquiteto(dados);
  if (!d.nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const res = await db.query(
    `UPDATE arquitetos
     SET nome=$1, telefone=$2, outro_telefone=$3, email=$4, escritorio=$5, cau=$6,
         tipo_pessoa=$7, cpf_cnpj=$8, observacoes=$9, consultor_id=$10, perfil_checklist=$11, updated_at=NOW()
     WHERE id=$12 AND empresa_id=$13 AND deleted_at IS NULL RETURNING id`,
    [d.nome.trim(), d.telefone||null, d.outro_telefone||null, d.email||null, d.escritorio||null,
     d.cau||null, d.tipo_pessoa||null, d.cpf_cnpj||null, d.observacoes||null, d.consultor_id||null,
     d.perfil_checklist ? JSON.stringify(d.perfil_checklist) : null,
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
            cpf_cnpj, observacoes, consultor_id, data_nascimento, rua, numero, complemento, bairro, cidade, estado,
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
  const porNome = new Map();
  for (const row of res.rows) {
    const d = digitos(row.cnpj);
    if (d) porCnpj.set(d, row);
    porNome.set(row.nome.trim().toLowerCase(), row);
  }
  return { porCnpj, porNome };
}

/**
 * Encontra (por CNPJ, com fallback por nome quando não há CNPJ) ou cria um
 * escritório a partir dos dados fornecidos. `porCnpj`/`porNome` são os Maps
 * retornados por _carregarEscritoriosExistentes — são mutados (novos
 * escritórios entram neles) para que registros seguintes no mesmo lote de
 * importação reaproveitem o escritório recém-criado em vez de duplicar.
 */
async function _resolverEscritorio(empresaId, dadosBrutos, { porCnpj, porNome }, contadores) {
  if (!dadosBrutos.nome?.trim()) return null;
  const d = fmtEscritorio(dadosBrutos);
  const chaveCnpj = digitos(d.cnpj);
  const nomeNormalizado = d.nome.trim().toLowerCase();
  const existente = (chaveCnpj ? porCnpj.get(chaveCnpj) : null) || porNome.get(nomeNormalizado) || null;

  if (existente) {
    const temNovoDado = (
      (d.nome          && d.nome          !== existente.nome)          ||
      (d.telefone      && d.telefone      !== existente.telefone)      ||
      (d.email         && d.email         !== existente.email)         ||
      (d.rua           && d.rua           !== existente.rua)           ||
      (d.numero        && d.numero        !== existente.numero)        ||
      (d.complemento   && d.complemento   !== existente.complemento)   ||
      (d.bairro        && d.bairro        !== existente.bairro)        ||
      (d.cidade        && d.cidade        !== existente.cidade)        ||
      (d.estado        && d.estado        !== existente.estado)        ||
      (d.cep           && d.cep           !== existente.cep)           ||
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
  porNome.set(nomeNormalizado, { id: novoId, ...d });
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
  const escritoriosExistentes = await _carregarEscritoriosExistentes(empresaId);
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
        }, escritoriosExistentes, contadores);
        continue;
      }

      // tipo === "PF" (ou vazio/desconhecido — tratado como pessoa física)
      let escritorioId = null;
      if (raw.escritorio_nome?.trim()) {
        escritorioId = await _resolverEscritorio(empresaId, {
          nome: raw.escritorio_nome, cnpj: raw.escritorio_cpf_cnpj,
          telefone: raw.escritorio_telefone, email: raw.escritorio_email,
        }, escritoriosExistentes, contadores);
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
          (r.numero                  && r.numero                  !== existente.numero)                  ||
          (r.complemento               && r.complemento               !== existente.complemento)               ||
          (r.bairro                     && r.bairro                     !== existente.bairro)                     ||
          (r.cidade                      && r.cidade                      !== existente.cidade)                      ||
          (r.estado                       && r.estado                       !== existente.estado)                       ||
          (r.cep                           && r.cep                           !== existente.cep)                           ||
          (r.comprou_optin                  && r.comprou_optin                  !== existente.comprou_optin)                  ||
          (r.chave_pix                       && r.chave_pix                       !== existente.chave_pix)                       ||
          (escritorioId                        && escritorioId                        !== existente.escritorio_id)                ||
          (raw.consultor_id                    && raw.consultor_id                    !== existente.consultor_id)
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
               consultor_id     = COALESCE($19, consultor_id),
               updated_at       = NOW()
             WHERE id=$20 AND empresa_id=$21 AND deleted_at IS NULL`,
            [r.telefone||null, r.outro_telefone||null, r.email||null, r.escritorio||null, escritorioId||null,
             r.cau||null, r.tipo_pessoa||null, r.cpf_cnpj||null, r.data_nascimento||null,
             r.rua||null, r.numero||null, r.complemento||null, r.bairro||null, r.cidade||null,
             r.estado||null, r.cep||null, r.comprou_optin||null, r.chave_pix||null, raw.consultor_id||null,
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

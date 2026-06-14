const express = require("express");
const multer  = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/pedidoService");
const db  = require("../database/db");
const dashboardSvc = require("../services/dashboardService");
const auditSvc = require("../services/auditoriaService");

const router = express.Router();
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf") return cb(null, true);
    const e = new Error("Apenas arquivos PDF são aceitos.");
    e.status = 400;
    cb(e, false);
  },
});

function handleUploadPdfErro(err, _req, res, _next) {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "O arquivo excede o limite de 5 MB." });
  if (err?.message) return res.status(400).json({ message: err.message });
  _next(err);
}

// ─── helpers ────────────────────────────────────────────────────────────────

function limparMoeda(str) {
  if (!str) return null;
  return parseFloat(str.replace(/\./g, "").replace(",", ".")) || null;
}

function parsearData(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function splitMedidas(medidas) {
  if (!medidas) return { largura: null, altura: null };
  const parts = String(medidas).split(/[xX×]/);
  const norm = s => (s || "").trim() || null;
  return { largura: norm(parts[0]), altura: norm(parts[1]) };
}


// ─── Parser de endereço "Logradouro, Num - Complemento - Bairro, Cidade - UF" ─

function parsearEndereco(endStr) {
  if (!endStr) return {};
  let str = endStr.trim();

  // UF: últimos 2 chars maiúsculos após " - "
  const mUF = str.match(/,?\s*[-–]\s*([A-Z]{2})\s*$/);
  const estado = mUF ? mUF[1] : null;
  if (estado) str = str.slice(0, str.length - mUF[0].length).trim();

  // Cidade: última parte após ", "
  const lastComma = str.lastIndexOf(', ');
  let cidade = null;
  if (lastComma !== -1) {
    cidade = str.slice(lastComma + 2).trim() || null;
    str = str.slice(0, lastComma).trim();
  }

  // Restante: "Logradouro, Num - Complemento - Bairro"
  const partes = str.split(/\s*[-–]\s*/);

  // Último segmento = bairro
  const bairro = partes.length > 1 ? partes.pop().trim() || null : null;

  // Penúltimo com letra e sem vírgula = complemento
  let complemento = null;
  if (partes.length > 1) {
    const cand = partes[partes.length - 1].trim();
    if (/[a-zA-ZÀ-ú]/.test(cand) && !cand.includes(',') && cand.length < 40) {
      complemento = partes.pop().trim() || null;
    }
  }

  const logradouro = partes.join(' - ').trim();
  // "Rua Exemplo, 123" → rua + numero
  const mNum = logradouro.match(/^(.+),\s*(\d[\w/-]*)\s*$/);
  const rua    = mNum ? mNum[1].trim() || null : logradouro || null;
  const numero = mNum ? mNum[2].trim() || null : null;

  return { rua, numero, complemento, bairro, cidade, estado };
}

// ─── Parser de campos simples via regex (número, cliente, totais, pagamentos) ─

function parsearCamposSimples(texto) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  const mNum = texto.match(/#(\d+)/);
  const numero_origem = mNum ? `#${parseInt(mNum[1], 10)}` : null;

  const datas = [...texto.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1]);
  const data_pedido = parsearData(datas[0] || null);

  const mDoc = texto.match(/(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
  const docStr = mDoc ? mDoc[1] : null;
  const cpf    = docStr && !docStr.includes("/") ? docStr : null;
  const cnpj   = docStr &&  docStr.includes("/") ? docStr : null;

  const mEmail = texto.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const email_cliente = mEmail ? mEmail[0] : null;

  let nome_cliente = null;
  const clienteIdx = linhas.findIndex((l) => /^Cliente[:\s]*$/i.test(l));
  if (clienteIdx !== -1 && clienteIdx + 1 < linhas.length) {
    const proxLinha = linhas[clienteIdx + 1];
    if (!/^(CPF|CNPJ|Fone|Tel|Email|Endere)/i.test(proxLinha)) {
      nome_cliente = proxLinha.replace(/\s*CPF\s*\/?\s*CNPJ\s*$/i, "").trim() || null;
    }
  }
  if (!nome_cliente) {
    const mCli = texto.match(/Cliente[:\s]+([A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜÀ][^\n\r]{2,80})/i);
    if (mCli) nome_cliente = mCli[1].replace(/\s*CPF\s*\/?\s*CNPJ\s*$/i, "").trim();
  }

  const mTel = texto.match(/(?:Fone|Tel|Telefone|Celular)[:\s]*([\(\d\s)\-+]{8,20})/i);
  const telefone_cliente = mTel ? mTel[1].trim().replace(/\s+/g, " ") : null;

  // Endereço de Entrega — captura multi-linha buscando pelo label primeiro
  let cep = null, endereco_completo = null;
  const endEntregaIdx = linhas.findIndex(l => /^Endere[çc]o\s+de\s+Entrega$/i.test(l));
  if (endEntregaIdx !== -1) {
    const endLines = [];
    for (let ei = endEntregaIdx + 1; ei < linhas.length && ei <= endEntregaIdx + 4; ei++) {
      const lv = linhas[ei];
      if (!lv || /^(Consultor|Cliente|Arquiteto|Forma\s+de\s+Pag|Pedido|SubTotal|Total|Observa)/i.test(lv)) break;
      endLines.push(lv);
    }
    const endText = endLines.join(' ');
    const mC = endText.match(/(\d{5}-\d{3})\s*[-–]\s*(.+)/);
    if (mC) { cep = mC[1]; endereco_completo = mC[2].trim(); }
  }
  // Fallback: primeira ocorrência de CEP no texto
  if (!cep) {
    const mCep = texto.match(/(\d{5}-\d{3})\s*[-–]\s*(.+)/);
    if (mCep) { cep = mCep[1]; endereco_completo = mCep[2].trim(); }
  }
  const endParsed = parsearEndereco(endereco_completo);

  const mSubtotal = texto.match(/SubTotal:\s*R\$\s*([\d.,]+)/i);
  const mDesconto = texto.match(/Desconto:\s*R\$\s*([\d.,]+)/i);
  const mTotal    = texto.match(/(?<!Sub)Total\s*:\s*R\$\s*([\d.,]+)/i);
  const subtotal  = limparMoeda(mSubtotal?.[1]);
  const desconto  = limparMoeda(mDesconto?.[1]);
  const total     = limparMoeda(mTotal?.[1]);

  const mObs = texto.match(/Previsão de entrega:([\s\S]*?)(?:Forma de pagamento:|$)/i);
  const observacoes_entrega = mObs ? mObs[1].trim() : null;

  const mFormaPag = texto.match(/Forma de pagamento:\s*\n?([^\n]+)/i);
  const observacoes = mFormaPag ? `Forma de pagamento: ${mFormaPag[1].trim()}` : null;

  // Pagamentos
  const pagamentos = [];
  const RE_PAG_LINHA = /^(\d+\/\d+)(\d{2}\/\d{2}\/\d{4})R\$\s*([\d.,]+)$/;
  for (let i = 0; i < linhas.length; i++) {
    const mPag = linhas[i].match(RE_PAG_LINHA);
    if (!mPag) continue;
    let forma = "";
    for (let j = i - 1; j >= 0 && j >= i - 20; j--) {
      const prev = linhas[j];
      if (/^\d+\/\d+/.test(prev) || /^R\$/.test(prev)) continue;
      if (/^Forma de Pagamento$/i.test(prev)) break;
      forma = prev.trim();
      break;
    }
    if (forma && forma.length < 60) {
      pagamentos.push({
        forma,
        parcela:    mPag[1],
        vencimento: parsearData(mPag[2]),
        valor:      limparMoeda(mPag[3]),
      });
    }
  }

  // Arquiteto
  let arquiteto_nome = null;
  const arquitetoIdx = linhas.findIndex((l) => /^Arquiteto[:\s]*$/i.test(l));
  if (arquitetoIdx !== -1 && arquitetoIdx + 1 < linhas.length) {
    const proxLinha = linhas[arquitetoIdx + 1];
    // PDF concatena "INTERNO DESIGNConsultor(a)" em uma linha só — remove o que vem depois
    const nomeArq = proxLinha.replace(/\s*Consultor.*/i, "").trim();
    if (nomeArq && !/^(CPF|CNPJ|Fone|Tel|Email|Endere|Consultor)/i.test(nomeArq)) {
      arquiteto_nome = nomeArq;
    }
  }
  if (!arquiteto_nome) {
    const mArq = texto.match(/Arquiteto[:\s]+([A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜÀ][^\n\r]{1,60})/i);
    if (mArq) arquiteto_nome = mArq[1].replace(/\s*Consultor.*/i, "").trim() || null;
  }

  // Consultor / Vendedor — label pode ser "Consultor(a)", "Consultor:", "Vendedor" etc.
  let consultor_nome = null;
  const consIdx = linhas.findIndex((l) => /^(Consultor|Vendedor)/i.test(l));
  if (consIdx !== -1) {
    // Procura nas próximas 3 linhas o nome (ignora linhas que começam com telefone ou campo)
    for (let ci = consIdx + 1; ci <= consIdx + 3 && ci < linhas.length; ci++) {
      const prox = linhas[ci];
      if (/^(CPF|CNPJ|Fone|Tel|Email|Endere|Cliente|Forma)/i.test(prox)) break;
      if (/^[\(\d]/.test(prox)) continue; // telefone — pula
      // Remove telefone que possa vir colado ao nome: "THAYS(41) 98902-9125"
      const nome = prox.replace(/\s*\(?\d[\d\s()\-]{6,}\s*$/, "").trim();
      if (nome) { consultor_nome = nome; break; }
    }
  }
  if (!consultor_nome) {
    const mCons = texto.match(/(?:Consultor|Vendedor)[^:\n\r]*[\n\r]+([A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜÀ][^\n\r(]{1,60})/i);
    if (mCons) consultor_nome = mCons[1].trim();
  }

  return {
    numero_origem, data_pedido, nome_cliente, telefone_cliente,
    cpf, cnpj, email_cliente, cep, endereco_completo,
    rua:         endParsed.rua         || null,
    numero:      endParsed.numero      || null,
    complemento: endParsed.complemento || null,
    bairro:      endParsed.bairro      || null,
    cidade:      endParsed.cidade      || null,
    estado:      endParsed.estado      || null,
    subtotal, desconto, total, observacoes_entrega, observacoes, pagamentos,
    consultor_nome, arquiteto_nome,
  };
}

// ─── Parser de tabela com tabs (texto copiado do PDF no navegador) ──────────

function parsearItensTabDelimitada(texto) {
  const linhas = texto.split('\n');

  const headerIdx = linhas.findIndex(l => /^#\t/i.test(l.trim()));
  if (headerIdx === -1) return [];

  const cols = linhas[headerIdx].trim().split('\t').map(c => c.trim().toLowerCase());
  const idx = {
    num:        cols.findIndex(c => c === '#'),
    ambiente:   cols.findIndex(c => /ambiente/i.test(c)),
    referencia: cols.findIndex(c => /referencia/i.test(c)),
    cor:        cols.findIndex(c => /^cor$/i.test(c)),
    descricao:  cols.findIndex(c => /produto|descri/i.test(c)),
    medidas:    cols.findIndex(c => /medidas/i.test(c)),
    qtde:       cols.findIndex(c => /qtde/i.test(c)),
    unidade:    cols.findIndex(c => /^un/i.test(c)),
    preco:      cols.findIndex(c => /pre[cç]/i.test(c)),
    total:      cols.findIndex(c => /^total$/i.test(c)),
  };

  const g  = (parts, key) => (idx[key] >= 0 ? parts[idx[key]]?.trim() : '') || '';
  const RE_MOEDA   = /^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/;
  const RE_UNIDADE = /^(M2|M²|ML|UN|PÇ|PC)$/i;
  const isStop     = l => /^(Forma de Pagamento|Observa[cç]|SubTotal)/i.test(l);

  // Busca valores monetários nas linhas seguintes (preços em células multiline do PDF)
  function buscarPrecosAhead(startLine) {
    const found = [];
    for (let j = startLine; j < Math.min(startLine + 6, linhas.length); j++) {
      const lj = linhas[j].trim().replace(/\t/g, '');
      if (!lj || isStop(lj)) break;
      if ((linhas[j].match(/\t/g) || []).length >= 4) break; // nova linha de item
      if (RE_MOEDA.test(lj)) found.push(lj); else break;
    }
    return found;
  }

  const itens = [];
  let i = headerIdx + 1;

  while (i < linhas.length) {
    const l = linhas[i].trim();
    if (!l || isStop(l)) break;

    const parts      = l.split('\t');
    const numStr     = parts[idx.num]?.trim() || '';
    const isNormal   = /^\d+$/.test(numStr);

    // Sub-item: primeira célula é nome de produto (não número, não vazia),
    // com qtde e unidade no lado direito (ex: "CONTROLE REMOTO...\t\t1\tUN\t337,87\t337,87")
    if (!isNormal && parts.length >= 4) {
      const p0 = parts[0]?.trim();
      if (p0 && !/^\d+$/.test(p0)) {
        for (let sr = parts.length - 4; sr >= 1; sr--) {
          const qtV = parts[sr]?.trim();
          const unV = parts[sr + 1]?.trim();
          const prV = parts[sr + 2]?.trim();
          const toV = parts[sr + 3]?.trim();
          if (/^\d+[.,]?\d*$/.test(qtV) && RE_UNIDADE.test(unV)) {
            const medidasRaw = parts.slice(1, sr).map(p => p.trim()).filter(Boolean).join(' ');
            itens.push({
              ambiente: '', referencia: '', cor: '',
              descricao:      p0,
              medidas:        /\d/.test(medidasRaw) ? medidasRaw : '',
              quantidade:     parseFloat(qtV.replace(',', '.')) || 1,
              unidade:        unV.toUpperCase().replace('M²', 'M2'),
              preco_unitario: RE_MOEDA.test(prV) ? limparMoeda(prV) : null,
              valor:          RE_MOEDA.test(toV) ? limparMoeda(toV) : null,
            });
            break;
          }
        }
        i++; continue;
      }
    }

    if (!isNormal) { i++; continue; }

    let preco = limparMoeda(g(parts, 'preco'));
    let valor  = limparMoeda(g(parts, 'total'));

    // Preço/total em linhas separadas (célula multiline do PDF copiado)
    if (preco === null || valor === null) {
      const ahead = buscarPrecosAhead(i + 1);
      // Padrão: [preco_orig, preco_desc, total_orig, total_desc] → usa indices 0 e 2
      if (ahead.length >= 4) {
        preco = preco ?? limparMoeda(ahead[0]);
        valor = valor ?? limparMoeda(ahead[2]);
      } else if (ahead.length >= 2) {
        preco = preco ?? limparMoeda(ahead[0]);
        valor = valor ?? limparMoeda(ahead[1]);
      } else if (ahead.length === 1) {
        preco = preco ?? limparMoeda(ahead[0]);
      }
    }

    // Medidas: "x" isolado não é medida válida (célula vazia do PDF)
    const medidasRaw = g(parts, 'medidas');
    const medidas = /\d/.test(medidasRaw) ? medidasRaw : '';

    itens.push({
      ambiente:       g(parts, 'ambiente'),
      referencia:     g(parts, 'referencia'),
      cor:            g(parts, 'cor'),
      descricao:      g(parts, 'descricao'),
      medidas,
      quantidade:     parseFloat(g(parts, 'qtde').replace(',', '.')) || 1,
      unidade:        g(parts, 'unidade').toUpperCase().replace('M²', 'M2'),
      preco_unitario: preco,
      valor,
    });

    i++;
  }

  return itens;
}

// ─── Lookup de cliente por CPF, CNPJ ou nome (sem criar) ────────────────────

async function buscarClienteId(empresaId, campos) {
  if (campos.cpf) {
    const r = await db.query(
      `SELECT id FROM clientes WHERE empresa_id=$1 AND cpf=$2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, campos.cpf]
    );
    if (r.rows.length > 0) return r.rows[0].id;
  }
  if (campos.cnpj) {
    const r = await db.query(
      `SELECT id FROM clientes WHERE empresa_id=$1 AND cnpj=$2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, campos.cnpj]
    );
    if (r.rows.length > 0) return r.rows[0].id;
  }
  if (campos.nome_cliente) {
    const r = await db.query(
      `SELECT id FROM clientes WHERE empresa_id=$1 AND LOWER(TRIM(nome))=LOWER($2) AND deleted_at IS NULL LIMIT 1`,
      [empresaId, campos.nome_cliente.trim()]
    );
    if (r.rows.length > 0) return r.rows[0].id;
  }
  return null;
}

// ─── Detecção de categoria por keyword na descrição do item ──────────────────
const CATEGORIA_KEYWORDS_PEDIDO = [
  { keywords: ["cortina", "voil", "voile"],                                        nome: "Cortinas"         },
  { keywords: ["forro"],                                                            nome: "Forros"           },
  { keywords: ["persiana", "rolo", "roller", "roman", "double vision"],  nome: "Persianas"        },
  { keywords: ["trilho", "varão", "varao", "suporte"],                             nome: "Trilhos e Varões" },
  { keywords: ["tecido", "retalho"],                                                nome: "Tecidos"          },
  { keywords: ["tapete"],                                                           nome: "Tapetes"          },
  { keywords: ["almofada"],                                                         nome: "Almofadas"        },
  { keywords: ["motor", "motoriza", "motorizado"],                                  nome: "Motorização"      },
  { keywords: ["controle", "comando", "acionador"],                                 nome: "Controles"        },
];

function detectarNomeCategoriaPedido(descricao) {
  if (!descricao) return null;
  const lower = descricao.toLowerCase();
  // Usa a palavra-chave que aparece primeiro na descrição — assim
  // "TRILHO MOTORIZADO PARA CORTINAS" cai em Trilhos, não em Cortinas
  let melhorNome = null;
  let melhorPos = Infinity;
  for (const { keywords, nome } of CATEGORIA_KEYWORDS_PEDIDO) {
    for (const k of keywords) {
      const pos = lower.indexOf(k);
      if (pos !== -1 && pos < melhorPos) {
        melhorPos = pos;
        melhorNome = nome;
      }
    }
  }
  return melhorNome;
}

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

// ─── rotas ──────────────────────────────────────────────────────────────────

router.get("/", authMiddleware, async (req, res) => {
  try {
    const pedidos = await svc.listar(req.user.empresa_id, req.query);
    return res.json({ pedidos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar pedidos." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const pedido = await svc.buscar(req.params.id, req.user.empresa_id);
    if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });
    return res.json({ pedido });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar pedido." });
  }
});

router.get("/:id/itens-disponiveis-instalacao", authMiddleware, async (req, res) => {
  try {
    const pedidoId = req.params.id;
    const empresaId = req.user.empresa_id;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (pedCheck.rows.length === 0) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const query = `
      SELECT 
        pi.id,
        pi.ambiente,
        pi.descricao,
        pi.quantidade,
        pi.unidade,
        pi.valor,
        COALESCE(pi.categoria_id, prod.categoria_id) AS categoria_id,
        cat.nome AS categoria_nome,
        COALESCE(cp.logistica_interna_dias, 2) AS logistica_interna_dias,
        COALESCE(cp.confeccao_dias, 10) AS confeccao_dias,
        COALESCE(cp.expedicao_dias, 3) AS expedicao_dias,
        COALESCE(cp.outros_dias, 0) AS outros_dias
      FROM pedido_itens pi
      LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
      LEFT JOIN produtos prod ON prod.id = oi.produto_id
      LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
      LEFT JOIN categoria_prazos cp ON cp.categoria_id = COALESCE(pi.categoria_id, prod.categoria_id) AND cp.empresa_id = $2
      WHERE pi.pedido_id = $1
        AND pi.id NOT IN (
          SELECT ai.pedido_item_id 
          FROM agendamento_itens ai
          JOIN agendamentos a ON a.id = ai.agendamento_id
          WHERE ai.pedido_item_id IS NOT NULL 
            AND a.tipo = 'Instalação'
            AND a.status NOT IN ('cancelado','rejeitado')
        )
      ORDER BY pi.ordem ASC, pi.id ASC
    `;

    const { rows } = await db.query(query, [pedidoId, empresaId]);
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens disponíveis para pré-agendamento." });
  }
});

// GET /pedidos/:id/itens-disponiveis-conferencia-entrega
router.get("/:id/itens-disponiveis-conferencia-entrega", authMiddleware, async (req, res) => {
  try {
    const pedidoId = req.params.id;
    const empresaId = req.user.empresa_id;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (pedCheck.rows.length === 0) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const query = `
      SELECT
        pi.id,
        pi.ambiente,
        pi.descricao,
        pi.quantidade,
        pi.unidade,
        COALESCE(pi.categoria_id, prod.categoria_id) AS categoria_id,
        cat.nome AS categoria_nome
      FROM pedido_itens pi
      LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
      LEFT JOIN produtos prod ON prod.id = oi.produto_id
      LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
      WHERE pi.pedido_id = $1
        AND cat.necessita_conferencia = true
        AND pi.id NOT IN (
          SELECT ai.pedido_item_id
          FROM agendamento_itens ai
          JOIN agendamentos a ON a.id = ai.agendamento_id
          WHERE ai.pedido_item_id IS NOT NULL
            AND a.tipo = 'Conferência'
            AND a.status NOT IN ('cancelado','rejeitado')
        )
      ORDER BY pi.ordem ASC, pi.id ASC
    `;

    const { rows } = await db.query(query, [pedidoId, empresaId]);
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens pendentes de conferência." });
  }
});

// GET /pedidos/:id/itens-disponiveis-conferencia
router.get("/:id/itens-disponiveis-conferencia", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const genitorId = req.query.genitor_id ? Number(req.query.genitor_id) : null;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (!pedCheck.rows.length) return res.status(404).json({ message: "Pedido não encontrado." });

    if (!genitorId) return res.status(400).json({ message: "Parâmetro genitor_id obrigatório." });

    // Retorna os itens do genitor específico que ainda não têm conferência 'conferido'
    const { rows } = await db.query(
      `SELECT pi.id, pi.descricao, pi.ambiente, pi.quantidade, pi.unidade
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       WHERE ai.agendamento_id = $1
         AND ai.pedido_item_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM conferencia_itens ci
           WHERE ci.pedido_item_id = pi.id
             AND ci.empresa_id = $2
             AND ci.status = 'conferido'
         )
       ORDER BY pi.ordem ASC, pi.id ASC`,
      [genitorId, empresaId]
    );
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens para conferência." });
  }
});

// PATCH /pedidos/:id/producao-itens
router.patch("/:id/producao-itens", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { pedido_item_id, em_confeccao, confeccao_ok } = req.body;

    if (!pedido_item_id) return res.status(400).json({ message: "pedido_item_id obrigatório." });

    // Verificar que o item pertence ao pedido e à empresa
    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [pedido_item_id, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const updates = [];
    const params = [];
    let i = 1;
    if (em_confeccao !== undefined) { updates.push(`em_confeccao = $${i++}`); params.push(em_confeccao); }
    if (confeccao_ok !== undefined) { updates.push(`confeccao_ok = $${i++}`); params.push(confeccao_ok); }
    if (!updates.length) return res.status(400).json({ message: "Nenhum campo para atualizar." });

    params.push(pedido_item_id);
    const { rows } = await db.query(
      `UPDATE pedido_itens SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, em_confeccao, confeccao_ok`,
      params
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar produção." });
  }
});

// PATCH /pedidos/:id/conferencia-produto-itens
router.patch("/:id/conferencia-produto-itens", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { pedido_item_id, produto_ok } = req.body;

    if (!pedido_item_id) return res.status(400).json({ message: "pedido_item_id obrigatório." });
    if (typeof produto_ok !== "boolean") return res.status(400).json({ message: "produto_ok (boolean) obrigatório." });

    // Verificar que o item pertence ao pedido e à empresa
    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [pedido_item_id, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedido_itens SET produto_ok = $1 WHERE id = $2 RETURNING id, produto_ok`,
      [produto_ok, pedido_item_id]
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar conferência do produto." });
  }
});

// POST /pedidos/:id/vinculos
router.post("/:id/vinculos", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { item_id, item_vinculado_id } = req.body;

    if (!item_id || !item_vinculado_id) {
      return res.status(400).json({ message: "item_id e item_vinculado_id são obrigatórios." });
    }
    if (Number(item_id) === Number(item_vinculado_id)) {
      return res.status(400).json({ message: "Um item não pode ser vinculado a si mesmo." });
    }

    const { rows } = await db.query(
      `SELECT pi.id, COALESCE(cat.vinculavel, false) AS vinculavel, COALESCE(cat.recebe_vinculos, false) AS recebe_vinculos
       FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.id = ANY($1) AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [[item_id, item_vinculado_id], pedidoId, empresaId]
    );
    if (rows.length !== 2) return res.status(404).json({ message: "Item não encontrado." });

    const item = rows.find((r) => Number(r.id) === Number(item_id));
    const itemVinculado = rows.find((r) => Number(r.id) === Number(item_vinculado_id));

    if (!item.vinculavel) return res.status(400).json({ message: "A categoria deste item não é vinculável." });
    if (!itemVinculado.recebe_vinculos) return res.status(400).json({ message: "A categoria do item principal não recebe vínculos." });

    await db.query(`DELETE FROM pedido_item_vinculos WHERE item_id = $1`, [item_id]);
    await db.query(
      `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
       VALUES ($1, $2, 'acessorio') ON CONFLICT DO NOTHING`,
      [item_id, item_vinculado_id]
    );
    await db.query(`UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`, [item_id]);

    return res.json({
      vinculo: { item_id: Number(item_id), item_vinculado_id: Number(item_vinculado_id), tipo_vinculo: "acessorio" },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar vínculo." });
  }
});

// DELETE /pedidos/:id/vinculos/:itemId
router.delete("/:id/vinculos/:itemId", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const empresaId = req.user.empresa_id;

    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    await db.query(`DELETE FROM pedido_item_vinculos WHERE item_id = $1`, [itemId]);
    return res.json({ message: "Vínculo removido." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao remover vínculo." });
  }
});

// PATCH /pedidos/:id/itens/:itemId/sem-vinculo
router.patch("/:id/itens/:itemId/sem-vinculo", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const empresaId = req.user.empresa_id;
    const { sem_vinculo } = req.body;

    if (typeof sem_vinculo !== "boolean") {
      return res.status(400).json({ message: "sem_vinculo deve ser booleano." });
    }

    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedido_itens SET sem_vinculo = $1 WHERE id = $2 RETURNING id, sem_vinculo`,
      [sem_vinculo, itemId]
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar item." });
  }
});

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

// POST /pedidos/:id/pesquisa-satisfacao
router.post("/:id/pesquisa-satisfacao", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { texto } = req.body;

    if (!texto || !texto.trim()) return res.status(400).json({ message: "Campo 'texto' obrigatório." });

    const { rows: check } = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Pedido não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedidos
       SET status = 'concluido',
           pesquisa_satisfacao = $1
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, status`,
      [texto.trim(), pedidoId, empresaId]
    );
    return res.json({ pedido: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao encerrar pedido." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const pedido = await svc.criar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Pedido criado!", pedido });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar pedido." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const pedido = await svc.atualizar(req.params.id, req.user.empresa_id, req.body, req.user.id);
    return res.json({ message: "Pedido atualizado!", pedido });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar pedido." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Pedido removido." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao remover pedido." });
  }
});

// Extrai dados de texto copiado/colado do PDF (tab-separated)
router.post("/importar-texto", authMiddleware, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ message: "Texto vazio." });

    const campos = parsearCamposSimples(texto);
    const itens  = parsearItensTabDelimitada(texto);

    let consultor_id = null;
    if (campos.consultor_nome) {
      const r = await db.query(
        `SELECT id FROM usuarios WHERE empresa_id=$1 AND nome_completo ILIKE $2 ORDER BY nome_completo LIMIT 1`,
        [req.user.empresa_id, `%${campos.consultor_nome}%`]
      );
      if (r.rows.length > 0) consultor_id = r.rows[0].id;
    }

    let arquiteto_id = null;
    if (campos.arquiteto_nome) {
      try {
        const r = await db.query(
          `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL ORDER BY nome LIMIT 1`,
          [req.user.empresa_id, `%${campos.arquiteto_nome}%`]
        );
        if (r.rows.length > 0) arquiteto_id = r.rows[0].id;
      } catch (_) {}
    }

    let cliente_id = null;
    try { cliente_id = await buscarClienteId(req.user.empresa_id, campos); } catch (_) {}

    // Resolve categoria_id por item a partir das keywords da descrição
    const catMap = {};
    try {
      const catRes = await db.query(
        `SELECT id, LOWER(nome) AS nome_lower FROM categorias WHERE empresa_id=$1`,
        [req.user.empresa_id]
      );
      for (const c of catRes.rows) catMap[c.nome_lower] = c.id;
    } catch (_) {}

    const itensComCategoria = itens.map((it) => {
      const nomeCategoria = detectarNomeCategoriaPedido(it.descricao);
      const categoria_id = nomeCategoria ? (catMap[nomeCategoria.toLowerCase()] ?? null) : null;
      const { modelo, especificacoes } = detectarModeloEEspecificacoes(it.descricao, nomeCategoria);
      return { ...it, categoria_id, modelo, especificacoes };
    });

    return res.json({
      extraido: { ...campos, itens: itensComCategoria, consultor_id, arquiteto_id, cliente_id },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao processar texto.", erro: err.message });
  }
});

// Salva pedido importado após revisão do usuário
router.post("/importar", authMiddleware, async (req, res) => {
  try {
    const pedido = await svc.importar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Pedido importado!", pedido });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao importar pedido." });
  }
});

// Upload do PDF original do pedido (armazenamento, sem parsing)
router.post("/:id/anexo-pdf", authMiddleware, uploadPdf.single("arquivo"), handleUploadPdfErro, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    // Magic bytes: %PDF (0x25 0x50 0x44 0x46)
    const buf = req.file.buffer;
    if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
      return res.status(400).json({ message: "Arquivo inválido: não é um PDF real." });
    }

    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    // Valida pertencimento multi-tenant
    const pedidoRes = await db.query(
      `SELECT id FROM pedidos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );
    if (pedidoRes.rows.length === 0) {
      return res.status(403).json({ message: "Pedido não encontrado ou sem permissão." });
    }

    // Rate limit: máx 20 uploads por hora por empresa
    const rateRes = await db.query(
      `SELECT COUNT(*) FROM pedido_anexos WHERE empresa_id=$1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [req.user.empresa_id]
    );
    if (parseInt(rateRes.rows[0].count, 10) >= 20) {
      return res.status(429).json({ message: "Limite de uploads atingido. Tente novamente em 1 hora." });
    }

    // Upsert — substitui se já existir PDF para este pedido
    const result = await db.query(
      `INSERT INTO pedido_anexos (pedido_id, empresa_id, nome_arquivo, mime_type, tamanho_bytes, conteudo, criado_por)
       VALUES ($1, $2, $3, 'application/pdf', $4, $5, $6)
       ON CONFLICT (pedido_id) DO UPDATE SET
         nome_arquivo  = EXCLUDED.nome_arquivo,
         tamanho_bytes = EXCLUDED.tamanho_bytes,
         conteudo      = EXCLUDED.conteudo,
         criado_por    = EXCLUDED.criado_por,
         created_at    = NOW()
       RETURNING id, nome_arquivo, tamanho_bytes`,
      [pedidoId, req.user.empresa_id, req.file.originalname, req.file.size, req.file.buffer, req.user.id]
    );

    await db.query(
      `INSERT INTO pedido_auditoria
         (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
       VALUES ($1,$2,$3,'dados_pedido','pdf_vinculado','PDF original vinculado ao pedido')`,
      [pedidoId, req.user.empresa_id, req.user.id]
    );

    return res.status(200).json({ message: "PDF vinculado com sucesso.", ...result.rows[0] });
  } catch (err) {
    console.error("[anexo-pdf POST]", err);
    return res.status(500).json({ message: "Erro ao vincular PDF." });
  }
});

// Serve o PDF original para visualização
router.get("/:id/anexo-pdf", authMiddleware, async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    const result = await db.query(
      `SELECT pa.nome_arquivo, pa.mime_type, pa.conteudo
       FROM pedido_anexos pa
       JOIN pedidos p ON p.id = pa.pedido_id
       WHERE pa.pedido_id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
       LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Nenhum PDF vinculado a este pedido." });
    }

    const { nome_arquivo, mime_type, conteudo } = result.rows[0];
    const safeName = nome_arquivo.replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Type", mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(conteudo);
  } catch (err) {
    console.error("[anexo-pdf GET]", err);
    return res.status(500).json({ message: "Erro ao recuperar PDF." });
  }
});

// Remove o PDF vinculado ao pedido
router.delete("/:id/anexo-pdf", authMiddleware, async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    const pedidoRes = await db.query(
      `SELECT id FROM pedidos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );
    if (pedidoRes.rows.length === 0) {
      return res.status(403).json({ message: "Pedido não encontrado ou sem permissão." });
    }

    await db.query(`DELETE FROM pedido_anexos WHERE pedido_id=$1 AND empresa_id=$2`, [pedidoId, req.user.empresa_id]);
    return res.status(204).send();
  } catch (err) {
    console.error("[anexo-pdf DELETE]", err);
    return res.status(500).json({ message: "Erro ao remover PDF." });
  }
});

// GET /api/pedidos/:id/auditoria?etapa=dados_pedido
router.get("/:id/auditoria", authMiddleware, async (req, res) => {
  try {
    const { etapa } = req.query;
    const registros = await auditSvc.listarAuditoria(
      db,
      Number(req.params.id),
      req.user.empresa_id,
      etapa || null
    );
    return res.json({ auditoria: registros });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/pedidos/:id/fluxo
router.get("/:id/fluxo", authMiddleware, async (req, res) => {
  try {
    const result = await dashboardSvc.buscarFluxoPedido(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.user.permissoes
    );
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar fluxo" });
  }
});

// PATCH /api/pedidos/:id/etapa
router.patch("/:id/etapa", authMiddleware, async (req, res) => {
  try {
    const { campo, valor } = req.body;
    if (!campo || valor === undefined) {
      return res.status(400).json({ message: "campo e valor são obrigatórios" });
    }
    const result = await svc.atualizarEtapa(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.user.permissoes,
      campo,
      valor
    );
    return res.json({ message: "Etapa atualizada", ...result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar etapa" });
  }
});

module.exports = router;

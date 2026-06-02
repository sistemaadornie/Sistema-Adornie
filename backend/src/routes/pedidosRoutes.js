const express = require("express");
const multer  = require("multer");
const pdfParse = require("pdf-parse");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/pedidoService");
const db  = require("../database/db");

const { PdfReader } = require("pdfreader");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// ─── Extração posicional da tabela de itens via pdfreader ────────────────────

function lerFragmentos(buffer) {
  return new Promise((resolve, reject) => {
    const frags = [];
    let pagina = 1;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(frags); }
    }, 25000);

    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (settled) return;
      if (err) { settled = true; clearTimeout(timer); return reject(err); }
      if (!item) { settled = true; clearTimeout(timer); return resolve(frags); }
      if (item.page) { pagina = item.page; return; }
      if (item.text?.trim()) {
        frags.push({
          text: item.text.trim(),
          x: item.x,
          y: item.y + (pagina - 1) * 10000,
          w: item.w || 0,
        });
      }
    });
  });
}

async function extrairItensTabela(buffer, _dbg = {}) {
  const frags = await lerFragmentos(buffer);
  _dbg.totalFrags = frags.length;

  // Agrupa em linhas por Y com tolerância 0.2 unidades (pdfreader usa coords menores)
  frags.sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const f of frags) {
    const ult = linhas[linhas.length - 1];
    if (!ult || Math.abs(f.y - ult.y) > 0.2) {
      linhas.push({ y: f.y, frags: [f] });
    } else {
      ult.frags.push(f);
      ult.frags.sort((a, b) => a.x - b.x);
    }
  }

  // Junta fragmentos adjacentes com gap < 0.15 na mesma linha (palavras partidas por troca de fonte)
  for (const linha of linhas) {
    const joined = [];
    for (const f of linha.frags) {
      const last = joined[joined.length - 1];
      if (last && last.w > 0 && (f.x - (last.x + last.w)) < 0.15) {
        last.text += f.text;
        last.w = (f.x + f.w) - last.x;
      } else {
        joined.push({ ...f });
      }
    }
    linha.frags = joined;
  }

  // Localiza cabeçalho da tabela ("#" + "Ambiente" na mesma linha)
  const headerIdx = linhas.findIndex(l =>
    l.frags.some(f => f.text === "#") &&
    l.frags.some(f => /^Ambiente$/i.test(f.text))
  );
  _dbg.primeiraLinhas = linhas.slice(0, 15).map(l => ({ y: l.y, texts: l.frags.map(f => f.text) }));
  _dbg.headerIdx = headerIdx;
  if (headerIdx === -1) return null;

  // Mapeia nome de coluna → posição X do cabeçalho
  const colX = {};
  for (const f of linhas[headerIdx].frags) {
    const t = f.text;
    if (t === "#")                         colX.num        = f.x;
    else if (/^Ambiente$/i.test(t))        colX.ambiente   = f.x;
    else if (/^Referenci/i.test(t))        colX.referencia = f.x;
    else if (/^Cor$/i.test(t))             colX.cor        = f.x;
    else if (/^(Produto|Descri)/i.test(t)) colX.descricao  = f.x;
    else if (/^Medidas$/i.test(t))         colX.medidas    = f.x;
    else if (/^Qtde$/i.test(t))            colX.qtde       = f.x;
    else if (/^Un/i.test(t))               colX.unidade    = f.x;
    else if (/^Pre/i.test(t))              colX.preco      = f.x;
    else if (/^Total$/i.test(t))           colX.total      = f.x;
  }

  // Limites estritos: cada coluna ocupa de midpoint(prev,this) até midpoint(this,next)
  const colsSorted = Object.entries(colX).sort((a, b) => a[1] - b[1]);
  const colRanges = colsSorted.map(([name, x], i) => {
    const prevX = i > 0 ? colsSorted[i - 1][1] : x - 999;
    const nextX = i < colsSorted.length - 1 ? colsSorted[i + 1][1] : x + 999;
    return { name, xStart: (prevX + x) / 2, xEnd: (x + nextX) / 2 };
  });

  function colunaDe(x) {
    return colRanges.find(r => x >= r.xStart && x < r.xEnd)?.name ?? null;
  }

  const xMin = colRanges[0].xStart;
  const xMax = colRanges[colRanges.length - 1].xEnd;

  // Fim da tabela: primeira linha (dentro dos limites X) com texto de encerramento
  const fimIdx = (() => {
    for (let i = headerIdx + 1; i < linhas.length; i++) {
      const ft = linhas[i].frags.filter(f => f.x >= xMin && f.x <= xMax);
      if (ft.some(f => /^(Observa|SubTotal|Forma\s+de\s+Pag)/i.test(f.text))) return i;
    }
    return linhas.length;
  })();

  // Apenas fragmentos dentro da faixa X da tabela
  const tabelaLinhas = linhas.slice(headerIdx + 1, fimIdx)
    .map(l => ({ y: l.y, frags: l.frags.filter(f => f.x >= xMin && f.x <= xMax) }))
    .filter(l => l.frags.length > 0);

  const RE_MEDIDAS = /^\d+[,.]\d+[xX×]\d+[,.]\d+$/;
  const RE_UNIDADE = /^(M2|M²|ML|UN|PÇ|PC)$/i;
  const RE_MOEDA   = /^\d[\d.]*,\d{2}$/;

  // Âncoras primárias: linhas com medidas (ex: "3,00x4,88") — ficam na linha central do item
  let anchorYs = tabelaLinhas
    .filter(l => l.frags.some(f => RE_MEDIDAS.test(f.text)))
    .map(l => l.y);
  _dbg.anchorMode = "medidas";

  // Fallback: se não há medidas, usa linhas onde a col "num" tem um inteiro sequencial
  if (anchorYs.length === 0 && colX.num !== undefined) {
    const numCol = colRanges.find(r => r.name === "num");
    anchorYs = tabelaLinhas
      .filter(l => l.frags.some(f =>
        f.x >= numCol.xStart && f.x < numCol.xEnd && /^\d+$/.test(f.text)
      ))
      .map(l => l.y);
    _dbg.anchorMode = "num";
  }

  _dbg.anchorYs = anchorYs;
  if (anchorYs.length === 0) return [];

  const atribuir = (c, col, txt) => {
    if (col === "ambiente")        c.ambiente   += (c.ambiente   ? " " : "") + txt;
    else if (col === "referencia") c.referencia += (c.referencia ? " " : "") + txt;
    else if (col === "cor")        c.cor        += (c.cor        ? " " : "") + txt;
    else if (col === "descricao")  c.descricao  += (c.descricao  ? " " : "") + txt;
  };

  const anchorMode = _dbg.anchorMode;
  const itens = [];
  for (let ai = 0; ai < anchorYs.length; ai++) {
    const yAnchor = anchorYs[ai];
    const yPrev   = ai > 0 ? anchorYs[ai - 1] : -Infinity;
    const yNext   = ai < anchorYs.length - 1 ? anchorYs[ai + 1] : Infinity;

    let bloco;
    if (anchorMode === "num") {
      // Âncora é o início do item → inclui da linha do num até antes da próxima
      bloco = tabelaLinhas.filter(l => l.y >= yAnchor && l.y < yNext);
    } else {
      // Âncora é o meio do item (medidas) → usa midpoints
      const yMin = (yPrev + yAnchor) / 2;
      const yMax = (yAnchor + yNext) / 2;
      bloco = tabelaLinhas.filter(l => l.y > yMin && l.y <= yMax);
    }
    const c = { ambiente: "", referencia: "", cor: "", descricao: "" };
    let medidas = "", qtde = 1, unidade = "", preco = null, valor = null;

    for (const linha of bloco) {
      for (const f of linha.frags) {
        const col = colunaDe(f.x);

        if (col === "num" && /^\d+$/.test(f.text)) continue;
        if (RE_MEDIDAS.test(f.text))  { medidas = f.text; continue; }
        if (RE_UNIDADE.test(f.text))  { unidade = f.text.toUpperCase().replace("M²", "M2"); continue; }

        // Qtde ANTES de moeda — "14,64" é qtde, não preço
        if (col === "qtde" && /^\d+[,.]?\d*$/.test(f.text)) {
          qtde = parseFloat(f.text.replace(",", ".")) || 1;
          continue;
        }

        if (RE_MOEDA.test(f.text)) {
          // Coluna detectada → usa diretamente; sem coluna → ordem de aparição (preco antes, total depois)
          // Se cair em "preco" duas vezes: primeiro é preco, segundo é total (colunas muito próximas)
          if (col === "total") {
            valor = limparMoeda(f.text);
          } else if (col === "preco" && preco === null) {
            preco = limparMoeda(f.text);
          } else if (col === "preco" && preco !== null) {
            // Segundo valor caiu em "preco" — na verdade é o total (colunas sobrepostas)
            valor = limparMoeda(f.text);
          } else if (preco === null) {
            preco = limparMoeda(f.text);
          } else {
            valor = limparMoeda(f.text);
          }
          continue;
        }

        atribuir(c, col, f.text);
      }
    }

    itens.push({
      descricao: c.descricao || `Item ${ai + 1}`,
      ambiente: c.ambiente, referencia: c.referencia, cor: c.cor,
      medidas, ...splitMedidas(medidas), quantidade: qtde, unidade,
      preco_unitario: preco, valor,
    });
  }

  return itens;
}

// ─── Fallback: extração de itens via texto bruto (pdf-parse) ─────────────────

function parseDataLine(linha) {
  const mMoedas = linha.match(/(\d{1,3}(?:[.]\d{3})*,\d{2})(\d{1,3}(?:[.]\d{3})*,\d{2})$/);
  if (!mMoedas) return null;
  const preco_unitario = limparMoeda(mMoedas[1]);
  const valor = limparMoeda(mMoedas[2]);
  const av = linha.slice(0, linha.length - mMoedas[0].length);

  const mUni = av.match(/(M2|M²|ML|UN|PÇ|PC)$/i);
  if (!mUni) return null;
  const unidade = mUni[1].toUpperCase().replace('M²', 'M2');
  let bu = av.slice(0, av.length - mUni[0].length);

  // Calcula qtde via ratio (mais confiável que extrair do texto concatenado)
  let qtde = 1;
  if (preco_unitario > 0 && valor > 0) {
    const ratio = valor / preco_unitario;
    const rounded = Math.round(ratio);
    if (Math.abs(ratio - rounded) < 0.05) qtde = rounded || 1;
  }

  // Remove dígitos do qtde colados ao final da medida (ex: "2.12x2.793" → "2.12x2.79" com qtde=3)
  const qtdeStr = String(qtde);
  if (bu.endsWith(qtdeStr)) {
    const stripped = bu.slice(0, bu.length - qtdeStr.length);
    // Só aceita se o resultado terminar com medida de 2 casas decimais (padrão do setor)
    if (!stripped.trim() || /\d+[.,]\d+[xX×]\d+[.,]\d{2}$/.test(stripped.trim())) {
      bu = stripped;
    }
  }

  const mMed = bu.trim().match(/(\d+[.,]\d+[xX×]\d+[.,]\d+)$/);
  const medidas = mMed ? mMed[1] : '';
  const prefixo = mMed
    ? bu.trim().slice(0, bu.trim().length - mMed[0].length).trim()
    : bu.trim();

  return { prefixo, medidas, qtde, unidade, preco_unitario, valor };
}

function extrairItensTabelaRawText(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  const headerIdx = linhas.findIndex(l => /^#\s*Ambiente/i.test(l));
  if (headerIdx === -1) return null;

  const fimIdx = (() => {
    for (let i = headerIdx + 1; i < linhas.length; i++) {
      if (/^(Observa[cç][oõ]|SubTotal|Forma\s+de\s+Pag)/i.test(linhas[i])) return i;
    }
    return linhas.length;
  })();

  const tabelaLinhas = linhas.slice(headerIdx + 1, fimIdx);

  // Linha terminadora: unidade + dois valores monetários colados
  const RE_DATA = /(M2|M²|ML|UN|PÇ|PC)\d{1,3}(?:[.]\d{3})*,\d{2}\d{1,3}(?:[.]\d{3})*,\d{2}$/i;

  const blocos = [];
  let bloco = [];
  for (const l of tabelaLinhas) {
    bloco.push(l);
    if (RE_DATA.test(l)) { blocos.push(bloco); bloco = []; }
  }

  const RE_ALL_CAPS = /^[A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜ\s]+$/;
  const isShortCaps = s => RE_ALL_CAPS.test(s) && s.length <= 25;

  const itens = [];
  for (const b of blocos) {
    const parsed = parseDataLine(b[b.length - 1]);
    if (!parsed) continue;
    const { prefixo, medidas, qtde, unidade, preco_unitario, valor } = parsed;

    const textLines = b.slice(0, b.length - 1).concat(prefixo ? [prefixo] : []);
    let allText = textLines.join('\n');
    const mNum = allText.match(/^(\d+)([\s\S]*)/);
    if (mNum) allText = mNum[2].trim();

    let parts = allText.split('\n').map(t => t.trim()).filter(Boolean);

    // Linha única: tenta separar ambiente colado ao início da descrição (ex: "TODOSControle Remoto")
    if (parts.length === 1) {
      const mAmb = parts[0].match(/^([A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜ]+(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃẼÕÜ]+)?)([A-Z][a-záéíóúâêîôûãẽõü].*)/);
      if (mAmb && mAmb[1].length <= 20) parts = [mAmb[1], mAmb[2]];
    }

    let ambiente = '', referencia = '', descricao = '';
    if (parts.length === 0) {
      descricao = `Item ${itens.length + 1}`;
    } else if (parts.length === 1) {
      descricao = parts[0];
    } else if (isShortCaps(parts[0])) {
      ambiente = parts[0];
      // Segunda palavra em caps é sub-ambiente (ex: "BETINA" → "SUITE BETINA"), não código de produto
      if (parts.length > 2 && isShortCaps(parts[1])) {
        ambiente = `${parts[0]} ${parts[1]}`;
        descricao = parts.slice(2).join(' ');
      } else {
        descricao = parts.slice(1).join(' ');
      }
    } else {
      descricao = parts.join(' ');
    }

    // Remove artefatos de medidas/qtde colados à descrição (ex: "0xx05" de itens sem dimensão)
    if (!medidas) {
      descricao = descricao.replace(/\s*\d*[xX]+\d*\s*$/, '').trim();
    }

    itens.push({
      descricao: descricao || `Item ${itens.length + 1}`,
      ambiente, referencia, cor: '',
      medidas, ...splitMedidas(medidas), quantidade: qtde, unidade,
      preco_unitario, valor,
    });
  }

  return itens.length > 0 ? itens : null;
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
  const numero_origem = mNum ? `#${mNum[1].replace(/^0+/, "").padStart(8, "0")}` : null;

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
            AND a.status != 'cancelado'
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
    const pedido = await svc.atualizar(req.params.id, req.user.empresa_id, req.body);
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

// Extrai dados do PDF sem salvar — retorna JSON para o usuário revisar
router.post("/importar-pdf", authMiddleware, upload.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado." });
    const data   = await pdfParse(req.file.buffer);
    const campos = parsearCamposSimples(data.text);
    const _dbgTabela = {};
    let itens = [];
    let _erroTabela = null;
    try {
      itens = await extrairItensTabela(req.file.buffer, _dbgTabela) || [];
    } catch (e) {
      _erroTabela = e.message;
      console.error("[extrairItensTabela]", e);
    }

    // Fallback: extração via texto bruto quando posicional falha
    if (itens.length === 0) {
      try {
        const itensRaw = extrairItensTabelaRawText(data.text);
        if (itensRaw) { itens = itensRaw; _dbgTabela.rawTextFallback = true; }
      } catch (e) {
        _dbgTabela.erroRawText = e.message;
      }
    }

    // Resolve consultor_id pelo nome extraído
    let consultor_id = null;
    if (campos.consultor_nome) {
      const r = await db.query(
        `SELECT id FROM usuarios
         WHERE empresa_id = $1
           AND nome_completo ILIKE $2
         ORDER BY nome_completo
         LIMIT 1`,
        [req.user.empresa_id, `%${campos.consultor_nome}%`]
      );
      if (r.rows.length > 0) consultor_id = r.rows[0].id;
    }

    // Resolve arquiteto_id pelo nome extraído
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

    // Busca cliente existente pelo CPF, CNPJ ou nome
    let cliente_id = null;
    try { cliente_id = await buscarClienteId(req.user.empresa_id, campos); } catch (_) {}

    const extraido = { ...campos, itens: itens || [], consultor_id, arquiteto_id, cliente_id };

    // DEBUG — remover após confirmar extração correta
    return res.json({
      extraido,
      _debug: {
        texto_bruto: data.text,
        itens_extraidos: itens,
        consultor_nome: campos.consultor_nome,
        consultor_id,
        tabela: _dbgTabela,
        erro_tabela: _erroTabela,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao processar PDF.", _erro: err.message, _stack: err.stack });
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

    return res.json({ extraido: { ...campos, itens, consultor_id, arquiteto_id, cliente_id } });
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

module.exports = router;

const db = require("../database/db");

/**
 * Adiciona uma quantidade de dias úteis (segunda a sexta) a partir de uma data base
 * @param {Date|string} dataBase
 * @param {number} diasUteis 
 * @returns {Date}
 */
function adicionarDiasUteis(dataBase, diasUteis) {
  const data = new Date(dataBase);
  let diasRestantes = diasUteis;
  
  // Se dias úteis for 0 ou menor, retorna a própria data
  if (diasRestantes <= 0) return data;

  while (diasRestantes > 0) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay(); // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasRestantes--;
    }
  }
  return data;
}

/**
 * Calcula a diferença em dias úteis entre duas datas (dataFim - dataInicio)
 * @param {Date|string} dataInicio 
 * @param {Date|string} dataFim 
 * @returns {number}
 */
function calcularDiferencaDiasUteis(dataInicio, dataFim) {
  const dInicio = new Date(new Date(dataInicio).toISOString().slice(0, 10) + "T12:00:00");
  const dFim = new Date(new Date(dataFim).toISOString().slice(0, 10) + "T12:00:00");
  
  if (dFim <= dInicio) return 0;
  
  let temp = new Date(dInicio);
  let diasUteis = 0;
  
  while (temp < dFim) {
    temp.setDate(temp.getDate() + 1);
    const diaSemana = temp.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteis++;
    }
  }
  return diasUteis;
}

/**
 * Lista as categorias da empresa e seus prazos mínimos associados
 * @param {number} empresaId 
 */
async function listarPrazos(empresaId) {
  // Retorna todas as categorias da empresa, juntamente com seus prazos de categoria_prazos se existirem
  const res = await db.query(
    `SELECT 
       c.id AS categoria_id,
       c.nome AS categoria_nome,
       COALESCE(cp.logistica_interna_dias, 2) AS logistica_interna_dias,
       COALESCE(cp.confeccao_dias, 10) AS confeccao_dias,
       COALESCE(cp.expedicao_dias, 3) AS expedicao_dias,
       COALESCE(cp.outros_dias, 0) AS outros_dias
     FROM categorias c
     LEFT JOIN categoria_prazos cp ON cp.categoria_id = c.id AND cp.empresa_id = c.empresa_id
     WHERE c.empresa_id = $1
     ORDER BY c.nome ASC`,
    [empresaId]
  );
  return res.rows;
}

/**
 * Salva ou atualiza a parametrização de prazos para uma categoria específica da empresa
 * @param {number} empresaId 
 * @param {object} dados { categoria_id, logistica_interna_dias, confeccao_dias, expedicao_dias, outros_dias }
 */
async function salvarPrazo(empresaId, dados) {
  const { categoria_id, logistica_interna_dias, confeccao_dias, expedicao_dias, outros_dias } = dados;
  if (!categoria_id) {
    const err = new Error("ID da categoria é obrigatório.");
    err.status = 400;
    throw err;
  }

  // Verifica se a categoria pertence à empresa
  const catCheck = await db.query(
    `SELECT id FROM categorias WHERE id = $1 AND empresa_id = $2`,
    [categoria_id, empresaId]
  );
  if (catCheck.rows.length === 0) {
    const err = new Error("Categoria não encontrada para esta empresa.");
    err.status = 404;
    throw err;
  }

  const res = await db.query(
    `INSERT INTO categoria_prazos 
       (empresa_id, categoria_id, logistica_interna_dias, confeccao_dias, expedicao_dias, outros_dias, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (empresa_id, categoria_id) DO UPDATE
     SET logistica_interna_dias = EXCLUDED.logistica_interna_dias,
         confeccao_dias = EXCLUDED.confeccao_dias,
         expedicao_dias = EXCLUDED.expedicao_dias,
         outros_dias = EXCLUDED.outros_dias,
         updated_at = NOW()
     RETURNING *`,
    [
      empresaId,
      categoria_id,
      Number(logistica_interna_dias) || 0,
      Number(confeccao_dias) || 0,
      Number(expedicao_dias) || 0,
      Number(outros_dias) || 0
    ]
  );

  return res.rows[0];
}

/**
 * Valida a data proposta de instalação com base nas categorias dos itens do pedido
 * @param {number} empresaId 
 * @param {string} dataProposta YYYY-MM-DD
 * @param {Array<number>} itemIds Array de ids de pedido_itens
 */
async function validarPrazoInstalacao(empresaId, dataProposta, itemIds) {
  if (!dataProposta) {
    const err = new Error("Data de agendamento proposta é obrigatória.");
    err.status = 400;
    throw err;
  }
  if (!itemIds || !itemIds.length) {
    // Se não há itens vinculados ao agendamento de instalação, validação de prazos passa sem travar
    return { valido: true };
  }

  // 1. Busca os itens com suas respectivas categorias
  const itensRes = await db.query(
    `SELECT 
       pi.id AS item_id,
       pi.descricao AS item_descricao,
       COALESCE(pi.categoria_id, prod.categoria_id) AS categoria_id,
       cat.nome AS categoria_nome
     FROM pedido_itens pi
     LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
     LEFT JOIN produtos prod ON prod.id = oi.produto_id
     LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
     WHERE pi.id = ANY($1::integer[])`,
    [itemIds]
  );

  const itens = itensRes.rows;
  const categoriaIds = [...new Set(itens.map(i => i.categoria_id).filter(Boolean))];
  
  if (!categoriaIds.length) {
    // Se nenhum item possui categoria cadastrada, assume prazos padrão gerais (ex: 2 + 10 + 3 = 15 dias úteis)
    categoriaIds.push(null);
  }

  // 2. Busca prazos parametrizados para estas categorias
  const prazosRes = await db.query(
    `SELECT 
       categoria_id,
       logistica_interna_dias,
       confeccao_dias,
       expedicao_dias,
       outros_dias
     FROM categoria_prazos
     WHERE empresa_id = $1 AND (categoria_id = ANY($2::integer[]) OR categoria_id IS NULL)`,
    [empresaId, categoriaIds.filter(Boolean)]
  );

  const prazosMap = {};
  prazosRes.rows.forEach(p => {
    prazosMap[p.categoria_id] = p;
  });

  // Prazos padrão se não houver configuração específica na categoria
  const defaultPrazos = {
    logistica_interna_dias: 2,
    confeccao_dias: 10,
    expedicao_dias: 3,
    outros_dias: 0
  };

  const dataAtualStr = new Date().toISOString().slice(0, 10);
  const dataAtual = new Date(dataAtualStr + "T12:00:00");
  const dataAgendamento = new Date(dataProposta + "T12:00:00");

  let maiorDataMinima = dataAtual;
  let categoriaRestritiva = null;
  let detalhesPrazos = null;

  // 3. Analisa cada item para achar o prazo mais restritivo
  itens.forEach(it => {
    const prazos = prazosMap[it.categoria_id] || defaultPrazos;
    const diasUteisTotais = 
      prazos.logistica_interna_dias + 
      prazos.confeccao_dias + 
      prazos.expedicao_dias + 
      prazos.outros_dias;

    const dataMinimaItem = adicionarDiasUteis(dataAtual, diasUteisTotais);

    if (dataMinimaItem > maiorDataMinima) {
      maiorDataMinima = dataMinimaItem;
      categoriaRestritiva = it.categoria_nome || "Itens Sem Categoria";
      detalhesPrazos = {
        total_dias_uteis: diasUteisTotais,
        logistica: prazos.logistica_interna_dias,
        confeccao: prazos.confeccao_dias,
        expedicao: prazos.expedicao_dias,
        outros: prazos.outros_dias
      };
    }
  });

  // Caso nenhum item tenha categoria cadastrada, valida com os defaults
  if (maiorDataMinima === dataAtual && itens.length > 0) {
    const diasUteisTotais = 
      defaultPrazos.logistica_interna_dias + 
      defaultPrazos.confeccao_dias + 
      defaultPrazos.expedicao_dias + 
      defaultPrazos.outros_dias;
      
    maiorDataMinima = adicionarDiasUteis(dataAtual, diasUteisTotais);
    categoriaRestritiva = "Padrão do Sistema";
    detalhesPrazos = {
      total_dias_uteis: diasUteisTotais,
      logistica: defaultPrazos.logistica_interna_dias,
      confeccao: defaultPrazos.confeccao_dias,
      expedicao: defaultPrazos.expedicao_dias,
      outros: defaultPrazos.outros_dias
    };
  }

  // 4. Compara com a data proposta
  if (dataAgendamento < maiorDataMinima) {
    const dataMinimaFormatada = maiorDataMinima.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const diasUteisFaltantes = calcularDiferencaDiasUteis(dataAgendamento, maiorDataMinima);
    
    return {
      valido: false,
      mensagem: `A data proposta (${dataProposta.split("-").reverse().join("/")}) viola o tempo mínimo de entrega. A data útil mínima recomendada é ${dataMinimaFormatada} (${detalhesPrazos.total_dias_uteis} dias úteis).`,
      detalhes: {
        categoria: categoriaRestritiva,
        data_minima: maiorDataMinima.toISOString().slice(0, 10),
        dias_uteis_faltantes: diasUteisFaltantes,
        prazos: detalhesPrazos
      }
    };
  }

  return { valido: true };
}

module.exports = {
  adicionarDiasUteis,
  calcularDiferencaDiasUteis,
  listarPrazos,
  salvarPrazo,
  validarPrazoInstalacao
};

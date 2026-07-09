const db = require('../database/db');
const { fmtNumeroOrigem } = require('./pedidoService');

async function criar({ pedidoItemId, responsavelId, empresaId }) {
  const { rows: catRows } = await db.query(
    `SELECT cat.tipo_confeccao
     FROM pedido_itens pi
     JOIN pedidos p ON p.id = pi.pedido_id
     LEFT JOIN categorias cat ON cat.id = pi.categoria_id
     WHERE pi.id = $1 AND p.empresa_id = $2`,
    [pedidoItemId, empresaId]
  );
  if (!catRows.length) {
    throw Object.assign(new Error('Item do pedido não encontrado'), { status: 404 });
  }
  const tipoConfeccao = catRows[0].tipo_confeccao;
  if (!tipoConfeccao) {
    throw Object.assign(new Error('Esta categoria não possui ficha de confecção.'), { status: 400 });
  }

  const { rows } = await db.query(
    `INSERT INTO ordem_servico (pedido_item_id, responsavel_id, tipo)
     VALUES ($1, $2, $3)
     ON CONFLICT (pedido_item_id) DO NOTHING
     RETURNING *`,
    [pedidoItemId, responsavelId, tipoConfeccao]
  );
  if (rows[0]) return rows[0];

  const { rows: existentes } = await db.query(
    `SELECT * FROM ordem_servico WHERE pedido_item_id = $1`,
    [pedidoItemId]
  );
  return existentes[0];
}

async function listarPorPedido(pedidoId, empresaId) {
  const { rows } = await db.query(
    `SELECT os.id, os.status, os.aberta_em, os.encerrada_em,
            pi.descricao AS item_descricao,
            u.nome_completo AS responsavel_nome,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'foto')  AS total_fotos,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'video') AS total_videos
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     LEFT JOIN usuarios u  ON u.id  = os.responsavel_id
     LEFT JOIN pedido_midias pm ON pm.ordem_servico_id = os.id
     WHERE pi.pedido_id = $1 AND p.empresa_id = $2
     GROUP BY os.id, pi.descricao, u.nome_completo
     ORDER BY os.id`,
    [pedidoId, empresaId]
  );
  return rows;
}

async function atualizarStatus(id, status, empresaId) {
  const encerradaClause = status === 'encerrada' ? ', encerrada_em = NOW()' : '';
  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET status = $1, updated_at = NOW() ${encerradaClause}
     WHERE id = $2
       AND id IN (
         SELECT os.id FROM ordem_servico os
         JOIN pedido_itens pi ON pi.id = os.pedido_item_id
         JOIN pedidos p ON p.id = pi.pedido_id
         WHERE p.empresa_id = $3
       )
     RETURNING *`,
    [status, id, empresaId]
  );
  if (!rows[0]) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  return rows[0];
}

async function buscar(id, empresaId) {
  const { rows } = await db.query(
    `SELECT os.id, os.status, os.aberta_em, os.encerrada_em, os.tipo,
            os.dados_tecnicos, os.preenchido_em, os.preenchido_por,
            os.dados_confeccao, os.confeccao_preenchido_em, os.confeccao_preenchido_por,
            os.dados_conferencia_consultoras, os.conferencia_consultoras_preenchido_em, os.conferencia_consultoras_preenchido_por,
            os.pedido_item_id,
            pi.pedido_id,
            pi.ambiente AS item_ambiente,
            pi.descricao AS item_descricao,
            pi.quantidade AS item_quantidade,
            pi.unidade AS item_unidade,
            pi.referencia AS item_referencia,
            pi.cor AS item_cor,
            pi.medidas AS item_medidas,
            pi.largura AS item_largura,
            pi.altura AS item_altura,
            p.numero_origem AS pedido_numero_origem,
            p.numero_sequencial AS pedido_numero_sequencial,
            c.nome AS cliente_nome,
            c.telefone AS cliente_telefone,
            c.email AS cliente_email,
            u.nome_completo AS consultor_nome,
            a.nome AS arquiteto_nome
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios u ON u.id = p.consultor_id
     LEFT JOIN arquitetos a ON a.id = p.arquiteto_id
     WHERE os.id = $1 AND p.empresa_id = $2`,
    [id, empresaId]
  );
  if (rows.length === 0) return null;
  
  const os = rows[0];
  return {
    ...os,
    pedido_numero: fmtNumeroOrigem(os.pedido_numero_origem) || `SIS-${String(os.pedido_numero_sequencial || os.pedido_id).padStart(8, '0')}`
  };
}

function validarDadosConfeccaoCortina(dados) {
  const { larguraTrilho, tipoWave, espacador, abertura, feitaPor } = dados || {};
  if (!larguraTrilho || parseFloat(String(larguraTrilho).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do trilho é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!tipoWave) throw Object.assign(new Error('Tipo wave é obrigatório.'), { status: 400 });
  if (!espacador) throw Object.assign(new Error('Espaçador é obrigatório.'), { status: 400 });
  if (!abertura) throw Object.assign(new Error('Abertura é obrigatória.'), { status: 400 });
  if (!feitaPor) throw Object.assign(new Error('Campo "Cortina feita por" é obrigatório.'), { status: 400 });
}

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

function validarDadosConferenciaConsultorasPersiana(dados) {
  if (!dados.modelo || !dados.tubo)
    throw Object.assign(new Error('Modelo e tubo da persiana são obrigatórios.'), { status: 400 });
  if (!dados.acionamento)
    throw Object.assign(new Error('Acionamento (manual/motorizado) é obrigatório.'), { status: 400 });
  if (dados.acionamento === 'motorizado' && !dados.qtdMotor)
    throw Object.assign(new Error('Quantidade de motor é obrigatória para persiana motorizada.'), { status: 400 });
}

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

async function salvarDadosConfeccao(id, userId, dadosConfeccao, empresaId) {
  const { rows: osRows } = await db.query(
    `SELECT os.tipo, os.pedido_item_id
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE os.id = $1 AND p.empresa_id = $2`,
    [id, empresaId]
  );
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  if (osRows[0].tipo === 'cortina') {
    validarDadosConfeccaoCortina(dadosConfeccao);
  } else if (osRows[0].tipo === 'forro') {
    validarDadosConfeccaoForro(dadosConfeccao);
  }

  if (osRows[0].tipo === 'forro') {
    await sincronizarVinculoForroCortina(osRows[0].pedido_item_id, dadosConfeccao);
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_confeccao = $1,
         confeccao_preenchido_em = NOW(),
         confeccao_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dadosConfeccao), userId, id]
  );
  return rows[0];
}

async function salvarDadosConferenciaConsultoras(id, userId, dados, empresaId) {
  const { rows: osRows } = await db.query(
    `SELECT os.tipo, os.pedido_item_id
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE os.id = $1 AND p.empresa_id = $2`,
    [id, empresaId]
  );
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  const tipo = osRows[0].tipo;

  if (tipo === 'cortina') {
    validarDadosConfeccaoCortina(dados);
  } else if (tipo === 'forro') {
    validarDadosConfeccaoForro(dados);
  } else if (tipo === 'persiana') {
    validarDadosConferenciaConsultorasPersiana(dados);
  }

  if (tipo === 'forro') {
    await sincronizarVinculoForroCortina(osRows[0].pedido_item_id, dados);
  }

  if (tipo === 'persiana') {
    if (!osRows[0].pedido_item_id) {
      throw Object.assign(
        new Error('OS de persiana sem pedido_item_id — não foi possível sincronizar o item.'),
        { status: 500 }
      );
    }

    await db.query('BEGIN');
    try {
      const { rows } = await db.query(
        `UPDATE ordem_servico
         SET dados_conferencia_consultoras = $1,
             conferencia_consultoras_preenchido_em = NOW(),
             conferencia_consultoras_preenchido_por = $2,
             status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [JSON.stringify(dados), userId, id]
      );
      await db.query(
        `UPDATE pedido_itens
            SET modelo        = $1,
                especificacoes = $2
          WHERE id = $3`,
        [dados.modelo, JSON.stringify({ tubo: dados.tubo, bando: dados.bando || null }), osRows[0].pedido_item_id]
      );
      await db.query('COMMIT');
      return rows[0];
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_conferencia_consultoras = $1,
         conferencia_consultoras_preenchido_em = NOW(),
         conferencia_consultoras_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dados), userId, id]
  );

  return rows[0];
}

async function salvarDadosTecnicos(id, userId, dadosTecnicos, empresaId) {
  const { rows: osRows } = await db.query(
    `SELECT os.dados_conferencia_consultoras, os.pedido_item_id
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE os.id = $1 AND p.empresa_id = $2`,
    [id, empresaId]
  );
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  if (!osRows[0].dados_conferencia_consultoras) {
    throw Object.assign(new Error('Ficha de Conferência Consultoras precisa ser preenchida antes da Conferência Técnica.'), { status: 400 });
  }

  const { rows: agRows } = await db.query(
    `SELECT a.status
     FROM agendamento_itens ai
     JOIN agendamentos a ON a.id = ai.agendamento_id
     WHERE ai.pedido_item_id = $1 AND a.tipo = 'Conferência' AND a.status NOT IN ('cancelado','rejeitado')
     ORDER BY a.data DESC
     LIMIT 1`,
    [osRows[0].pedido_item_id]
  );
  if (!agRows.length || agRows[0].status !== 'andamento') {
    throw Object.assign(new Error('O atendimento de conferência precisa estar iniciado para preencher a Conferência Técnica.'), { status: 400 });
  }

  // Validações estritas dos dados reais (dados verdadeiros)
  const {
    largura, altura_esq, altura_meio, altura_dir,
    responsavel_conferencia, data_conferencia,
    assinatura_tecnico
  } = dadosTecnicos || {};

  if (!largura || parseFloat(String(largura).replace(',', '.')) <= 0) {
    throw Object.assign(new Error("Medida de largura técnica é obrigatória e deve ser maior que zero."), { status: 400 });
  }
  if (!altura_esq || parseFloat(String(altura_esq).replace(',', '.')) <= 0) {
    throw Object.assign(new Error("Altura esquerda técnica é obrigatória e deve ser maior que zero."), { status: 400 });
  }
  if (!altura_meio || parseFloat(String(altura_meio).replace(',', '.')) <= 0) {
    throw Object.assign(new Error("Altura do meio técnica é obrigatória e deve ser maior que zero."), { status: 400 });
  }
  if (!altura_dir || parseFloat(String(altura_dir).replace(',', '.')) <= 0) {
    throw Object.assign(new Error("Altura direita técnica é obrigatória e deve ser maior que zero."), { status: 400 });
  }
  if (!responsavel_conferencia?.trim()) {
    throw Object.assign(new Error("Nome do responsável pela conferência é obrigatório."), { status: 400 });
  }
  if (!data_conferencia) {
    throw Object.assign(new Error("Data de conferência é obrigatória."), { status: 400 });
  }
  if (!assinatura_tecnico?.trim()) {
    throw Object.assign(new Error("Assinatura do técnico é obrigatória."), { status: 400 });
  }

  // Se passou nas validações, salva no JSONB e marca como preenchido e atualiza o status para 'em_andamento'
  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_tecnicos = $1,
         preenchido_em = NOW(),
         preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dadosTecnicos), userId, id]
  );

  if (!rows[0]) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  return rows[0];
}

async function buscarLarguraTecidoConhecida(nomeTecido, empresaId) {
  const nome = String(nomeTecido || '').trim();
  if (!nome) return null;

  const { rows } = await db.query(
    `SELECT largura FROM (
       SELECT os.dados_confeccao->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_confeccao->>'nomeTecido')) = lower(trim($2))
       UNION ALL
       SELECT os.dados_conferencia_consultoras->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_conferencia_consultoras->>'nomeTecido')) = lower(trim($2))
     ) t
     WHERE NULLIF(trim(largura), '') IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, nome]
  );
  return rows[0]?.largura || null;
}

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

module.exports = { criar, listarPorPedido, atualizarStatus, buscar, salvarDadosConfeccao, salvarDadosConferenciaConsultoras, salvarDadosTecnicos, buscarLarguraTecidoConhecida, listarItensMesmoAmbiente };

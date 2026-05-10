-- Agendamentos: busca principal por empresa + período
CREATE INDEX IF NOT EXISTS idx_ag_empresa_data   ON agendamentos(empresa_id, data, hora);
CREATE INDEX IF NOT EXISTS idx_ag_empresa_status ON agendamentos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_ag_criado_por     ON agendamentos(criado_por);
-- agendamento_equipe: joins bidirecionais
CREATE INDEX IF NOT EXISTS idx_ae_agendamento ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ae_usuario     ON agendamento_equipe(usuario_id);

-- agendamento_itens
CREATE INDEX IF NOT EXISTS idx_ai_agendamento ON agendamento_itens(agendamento_id);

-- agendamento_anexos
CREATE INDEX IF NOT EXISTS idx_aa_agendamento ON agendamento_anexos(agendamento_id);

-- agendamento_logs: já tem idx_ag_logs_ag e idx_ag_logs_emp

-- notificacoes: filtro por agendamento (perfil instalador/vendedor)
CREATE INDEX IF NOT EXISTS idx_notif_agendamento ON notificacoes(agendamento_id) WHERE agendamento_id IS NOT NULL;

-- crews: busca por dia é o caso 100% dos casos
CREATE INDEX IF NOT EXISTS idx_crew_empresa_data ON crews(empresa_id, data);

-- crew_agendamentos: joins bidirecionais
CREATE INDEX IF NOT EXISTS idx_crew_ag_crew       ON crew_agendamentos(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_ag_agendamento ON crew_agendamentos(agendamento_id);

-- abastecimentos: relatório de veículos
CREATE INDEX IF NOT EXISTS idx_abast_empresa_data ON abastecimentos(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_abast_veiculo       ON abastecimentos(veiculo_id);

-- refresh_tokens (criado pelo sistema de auth)
CREATE INDEX IF NOT EXISTS idx_rt_usuario ON refresh_tokens(usuario_id);

-- usuarios: login e busca por empresa
CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa  ON usuarios(empresa_id, status);

-- clientes: listagem e busca por empresa
CREATE INDEX IF NOT EXISTS idx_clientes_empresa      ON clientes(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nome ON clientes(empresa_id, nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_end_cliente       ON cliente_enderecos(cliente_id) WHERE deleted_at IS NULL;

-- agendamento_logs: busca por agendamento (sem carregar tudo)
CREATE INDEX IF NOT EXISTS idx_ag_logs_ag_data ON agendamento_logs(agendamento_id, criado_em DESC);

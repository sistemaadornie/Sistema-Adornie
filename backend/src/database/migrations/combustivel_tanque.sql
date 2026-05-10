-- Capacidade do tanque por veículo (litros)
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_tanque NUMERIC(8,2);

-- Distância estimada por agendamento (km), gravada quando o mapa calcula a rota
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS km_rota NUMERIC(8,2);

-- Flag de geocodificação: TRUE = tentou e falhou, FALSE/NULL = ok ou pendente
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS geocod_falhou BOOLEAN DEFAULT FALSE;

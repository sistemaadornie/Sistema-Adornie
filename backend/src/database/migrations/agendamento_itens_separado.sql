-- agendamento_itens_separado.sql
ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT false;

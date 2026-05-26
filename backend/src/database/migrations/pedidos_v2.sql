-- Pedidos v2: campos financeiros, consultor e número sequencial
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS numero_sequencial  INTEGER,
  ADD COLUMN IF NOT EXISTS consultor_id       INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS cpf_cnpj           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email_cliente      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subtotal           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto           NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS data_pedido        DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS numero_origem      VARCHAR(30),
  ADD COLUMN IF NOT EXISTS observacoes_entrega TEXT;

CREATE SEQUENCE IF NOT EXISTS pedidos_numero_seq;

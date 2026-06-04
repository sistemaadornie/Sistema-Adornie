-- ATENÇÃO: criado_por é UUID no Supabase (usuarios.id = UUID) e INTEGER no banco local.
-- No banco local, execute com: criado_por INTEGER REFERENCES usuarios(id)
CREATE TABLE IF NOT EXISTS pedido_anexos (
  id             SERIAL PRIMARY KEY,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL,
  nome_arquivo   VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(50)  NOT NULL DEFAULT 'application/pdf',
  tamanho_bytes  INTEGER      NOT NULL,
  conteudo       BYTEA        NOT NULL,
  criado_por     UUID REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_pedido_anexos_empresa_created ON pedido_anexos (empresa_id, created_at DESC);

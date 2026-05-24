-- Ordem de Serviço: uma por item do pedido
-- Nunca deletada (sem deleted_at)
CREATE TABLE IF NOT EXISTS ordem_servico (
  id               SERIAL PRIMARY KEY,
  pedido_item_id   INTEGER NOT NULL REFERENCES pedido_itens(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'aberta',
  -- aberta | em_andamento | aguardando_aprovacao | encerrada
  responsavel_id   INTEGER REFERENCES usuarios(id),
  aberta_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_pedido_item ON ordem_servico(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_os_status      ON ordem_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_responsavel ON ordem_servico(responsavel_id);

-- Mídias permanentes: nunca deletadas
CREATE TABLE IF NOT EXISTS pedido_midias (
  id                SERIAL PRIMARY KEY,
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_file_id     VARCHAR(255) NOT NULL,
  drive_url         TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_original     VARCHAR(255),
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,
  descricao         TEXT,
  hash_md5          VARCHAR(32),
  enviado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_por       INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_midias_pedido ON pedido_midias(pedido_id);
CREATE INDEX IF NOT EXISTS idx_midias_item   ON pedido_midias(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_midias_os     ON pedido_midias(ordem_servico_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_midias_hash
  ON pedido_midias(pedido_id, hash_md5) WHERE hash_md5 IS NOT NULL;

-- Sessões de upload em andamento (transitória, mas nunca deletada)
CREATE TABLE IF NOT EXISTS upload_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_upload_uri  TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_arquivo      VARCHAR(255) NOT NULL,
  tamanho_bytes     BIGINT NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  hash_md5          VARCHAR(32),
  bytes_confirmados BIGINT NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','concluido','expirado','erro')),
  iniciado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em         TIMESTAMPTZ NOT NULL,
  concluido_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_pedido
  ON upload_sessions(pedido_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
  ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expira
  ON upload_sessions(expira_em) WHERE status NOT IN ('concluido','expirado');

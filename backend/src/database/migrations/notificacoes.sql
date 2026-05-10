CREATE TABLE IF NOT EXISTS notificacoes (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  usuario_id  INTEGER,
  tipo        VARCHAR(60)  NOT NULL DEFAULT 'sistema',
  titulo      TEXT         NOT NULL,
  mensagem    TEXT,
  link        TEXT,
  icone       VARCHAR(20)  NOT NULL DEFAULT 'info',
  lida        BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_empresa ON notificacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_lida    ON notificacoes(lida);

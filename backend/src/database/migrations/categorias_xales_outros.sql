-- Adiciona categorias "Xales" e "Outros" para todas as empresas que ainda não as têm.
-- "Xales" entra no fluxo de detecção automática durante importação.
-- "Outros" é o fallback para itens não reconhecidos na importação.
BEGIN;

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Xales', '#D4A017', 13
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'xales'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Outros', '#9E9E9E', 99
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'outros'
);

COMMIT;

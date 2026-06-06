-- categorias_padrao_v2.sql
-- Insere as 4 novas categorias para cada empresa que ainda não as tem.
BEGIN;

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Forros', '#7B68EE', 9
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'forros'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Motorização', '#FF6B35', 10
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'motorização'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Controles', '#20B2AA', 11
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'controles'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Almofadas', '#FF69B4', 12
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'almofadas'
);

COMMIT;

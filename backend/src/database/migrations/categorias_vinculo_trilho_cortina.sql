-- categorias_vinculo_trilho_cortina.sql
-- Habilita o vínculo automático trilho/varão -> cortina/forro (subprojeto 3)
BEGIN;

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'trilhos e varões';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

COMMIT;

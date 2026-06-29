-- backend/src/database/migrations/categorias_persiana_conferencia.sql
-- Persiana passa a ter ficha de conferência consultoras própria (tipo_confeccao = 'persiana')
-- e a exigir conferência de medidas (necessita_conferencia = true).
UPDATE categorias
   SET tipo_confeccao        = 'persiana',
       necessita_conferencia = true
 WHERE LOWER(nome) IN ('persianas', 'persiana');

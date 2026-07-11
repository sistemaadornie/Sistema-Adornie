# Auto-registro de cidades/bairros no mapa de clientes

## Problema

O card "Mapa de clientes" do Dashboard do Gestor (`frontend-web/src/pages/Dashboard.jsx`,
lido via `GET /dashboard-gestor/mapa`) posiciona cada pedido casando o texto de
`cidade`/`bairro` do pedido contra duas listas fixas em
`backend/src/config/dashboardGestorConfig.js`:

- `MAPA_BAIRROS`: 75 bairros oficiais de Curitiba, com centroide fixo.
- `MAPA_CIDADES`: 8 cidades, com coordenada fixa.

Quando o texto não bate com nenhuma entrada dessas listas (bairro/cidade novo,
ainda não cadastrado no código), o pedido cai no pino genérico "Outros", numa
posição fixa arbitrária, sem nome real. Isso significa que toda vez que a
empresa passa a atender uma cidade ou bairro novo, alguém precisa editar o
código-fonte pra adicionar a coordenada manualmente.

## Objetivo

Quando um pedido é salvo com uma cidade/bairro que ainda não é conhecido pelo
sistema, descobrir automaticamente a posição real (latitude/longitude) dessa
região e passar a exibi-la como um ponto próprio no mapa — sem precisar de
edição manual de código nem de tela de cadastro.

## Arquitetura

1. **Cache de coordenadas no banco** (tabela nova `regioes_geo`): guarda
   coordenadas descobertas por geocodificação externa, pra não repetir a
   chamada de API a cada pedido na mesma região.
2. **Gatilho em background ao salvar pedido**: ao criar/atualizar um pedido,
   se a cidade/bairro não está na lista fixa nem no cache, dispara a
   geocodificação sem bloquear o salvamento (mesmo padrão fire-and-forget já
   usado em `agendamentoService.js` para geocodificar agendamentos).
3. **Leitura do mapa em 3 níveis**: lista fixa → cache do banco → "Outros"
   (só cai em "Outros" se ainda não foi geocodificado, ou se a
   geocodificação falhou).
4. **Backfill único**: rota manual que varre os pedidos já existentes e
   preenche o cache pras regiões que hoje caem em "Outros".

A geocodificação reaproveita `backend/src/utils/geocoding.js`, que já resolve
endereços de agendamentos via Photon (Komoot) com fallback para Nominatim
(OSM). A função `nominatim` de lá, hoje interna ao módulo, passa a ser
exportada para reuso.

## Modelo de dados

Nova migration `backend/src/database/migrations/regioes_geo.sql` (aplicada
manualmente nos dois bancos — local e Supabase — como todas as migrations
deste projeto):

```sql
CREATE TABLE regioes_geo (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('bairro','cidade')),
  chave VARCHAR(120) NOT NULL,        -- nome normalizado (sem acento/caixa), usado pra casar
  nome VARCHAR(120) NOT NULL,         -- nome como apareceu no pedido, pra exibir
  cidade VARCHAR(120),                -- preenchido quando tipo='bairro'
  estado VARCHAR(2),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  geocod_falhou BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, tipo, chave)
);
```

- `geocod_falhou = true` marca uma tentativa que não achou coordenada, pra
  não reprocessar a mesma região a cada pedido novo (ela continua caindo em
  "Outros" até alguém investigar manualmente).
- Bairro só é registrado quando a cidade normaliza para "curitiba": é o
  único escopo que o modo "bairros" do mapa mostra hoje (pedidos de outras
  cidades já são filtrados fora antes de chegar no agrupamento por bairro —
  ver `buscarMapa`), então geocodificar bairro de outra cidade seria
  desperdício de chamada externa.
- Escopo por `empresa_id`: mantém o mesmo padrão multi-tenant do resto do
  schema. Custo aceito: duas empresas que atendem a mesma cidade vão
  geocodificar essa cidade cada uma na sua vez (evento raro, não é hot path).

## Gatilho de gravação

Novo módulo `backend/src/services/regiaoGeoService.js`:

```
async function registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado })
```

1. Sem `cidade`, não faz nada.
2. **Cidade**: normaliza (mesma função `normalizar` de
   `dashboardGestorConfig.js` — remove acento, minúsculo). Se já está em
   `MAPA_CIDADES` (via `buscarCoordenada`) ou já existe linha no cache
   (sucesso ou falha) para `(empresaId, 'cidade', chave)`, não faz nada.
   Senão, geocodifica com `photon("{cidade} {estado}")`, fallback
   `nominatim({ cidade, estado })` se o Photon não achar, e grava o
   resultado no cache (`geocod_falhou=true` se nada for encontrado).
3. **Bairro**: mesma lógica, só quando a cidade normalizada é "curitiba",
   usando `photon("{bairro} {cidade} {estado}")` / fallback
   `nominatim({ bairro, cidade, estado })`.

Chamado sem `await` (fire-and-forget, com `.catch()` que grava
`geocod_falhou=true` em caso de erro) logo após o `COMMIT` em
`pedidoService.criar` e `pedidoService.atualizar` — mesmo padrão de
`agendamentoService.js:510`.

**Corrida aceita**: um pedido pode aparecer em "Outros" por alguns segundos
até a geocodificação terminar; só passa a aparecer na posição certa quando a
tela do mapa for recarregada. Não há necessidade de o mapa atualizar em
tempo real durante essa janela.

## Leitura do mapa (`buscarMapa`)

Em `dashboardGestorService.buscarMapa`, depois de montar `grupos` (chave →
lista de pedidos) como hoje:

1. Para as chaves que não batem em `MAPA_BAIRROS`/`MAPA_CIDADES`, faz uma
   busca em lote no cache:
   ```sql
   SELECT chave, nome, lat, lng FROM regioes_geo
   WHERE empresa_id = $1 AND tipo = $2 AND chave = ANY($3) AND geocod_falhou = false
   ```
2. Se achou no cache, usa `{ id: chave, nome, lat, lng }` no lugar do pino
   "Outros".
3. Se não achou (ainda não geocodificado, ou falhou), cai em "Outros" como
   hoje.

**Cor do pino**: regiões vindas do cache não estão no array fixo
(`MAPA_BAIRROS`/`MAPA_CIDADES`), então `corIndex` cai no mesmo índice extra
que "Outros" já usa hoje (comportamento atual, não uma regressão — todas as
regiões fora da lista fixa dividem essa cor por enquanto).

## Backfill dos pedidos existentes

Nova rota `POST /dashboard-gestor/mapa/backfill-regioes` (mesma permissão
`PERM_DASHBOARD_GESTOR` das demais rotas do dashboard gestor):

1. Busca cidades/bairros distintos já usados em `pedidos` da empresa (sem
   filtro de período).
2. Para cada valor que não está na lista fixa nem no cache, roda o mesmo
   fluxo de `registrarRegiaoSeNecessaria`, respeitando o intervalo entre
   chamadas externas que `geocodificarLote` já usa (evita estourar rate
   limit do Nominatim/Photon).
3. Roda de forma síncrona (`await`) e devolve um resumo
   `{ total, ok, falhou }` — é uma ação manual e única disparada por um
   admin depois do deploy, sem necessidade de fire-and-forget nem de botão
   na interface.

## Testes

- `regiaoGeoService`: normalização, skip quando já em lista fixa / já em
  cache, geocodificação de cidade e de bairro (mock do `photon`/`nominatim`),
  gravação de `geocod_falhou`.
- `dashboardGestorService.buscarMapa`: região com cache preenchido aparece
  com nome/posição do cache em vez de "Outros"; região sem cache e sem match
  fixo continua caindo em "Outros".
- Backfill: agrupa corretamente valores distintos, ignora os já resolvidos.

## Fora de escopo

- Botão na interface para disparar o backfill.
- Cor própria por região dinâmica (paleta continua fixa, região nova
  compartilha a cor extra de "Outros").
- Atualização do mapa em tempo real enquanto a geocodificação do pedido
  ainda está em andamento.

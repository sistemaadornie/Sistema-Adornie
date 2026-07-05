# Auto-preenchimento da Largura do Tecido no Rolo

**Data:** 2026-07-05
**Status:** Aprovado

---

## Contexto

Na Ficha de Confecção / Ficha de Conferência Consultoras de Cortina (`FichaConfeccaoCortina.jsx`,
usada nos dois modos), a consultora/técnico preenche dois campos livres: **Nome do tecido** e
**Largura do tecido no rolo (m)**. Esses dois campos são salvos juntos em `dados_confeccao` ou
`dados_conferencia_consultoras` (JSONB, por OS), sob as chaves `nomeTecido` e `larguraTecido`.

Como o mesmo tecido é vendido repetidamente em pedidos diferentes, a largura do rolo já foi
digitada antes sempre que o tecido se repete. Hoje isso é redigitado manualmente toda vez.

## Objetivo

Quando o nome do tecido digitado for igual (ignorando maiúsculas/minúsculas e espaços) a um nome
já usado em alguma ficha anterior da mesma empresa, e o campo "Largura do tecido no rolo" ainda
estiver vazio, preencher esse campo automaticamente com a última largura registrada para aquele
tecido.

## Fora de escopo

- Sugestões/autocomplete de nomes parecidos (só match exato).
- Sobrescrever um valor de largura já digitado pelo usuário.
- Ficha de Forro (`FichaConfeccaoForro.jsx`) — não tem campo de tecido/largura equivalente.
- Alterar o formato de `dados_confeccao`/`dados_conferencia_consultoras`.

## 1. Backend

### `ordemServicoService.js`

Nova função:

```js
async function buscarLarguraTecidoConhecida(nomeTecido, empresaId) {
  const nome = String(nomeTecido || '').trim();
  if (!nome) return null;

  const { rows } = await db.query(
    `SELECT largura FROM (
       SELECT os.dados_confeccao->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_confeccao->>'nomeTecido')) = lower(trim($2))
       UNION ALL
       SELECT os.dados_conferencia_consultoras->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_conferencia_consultoras->>'nomeTecido')) = lower(trim($2))
     ) t
     WHERE NULLIF(trim(largura), '') IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, nome]
  );
  return rows[0]?.largura || null;
}
```

Exportar junto das demais funções do módulo.

### `ordemServicoRoutes.js`

Nova rota, registrada antes de `GET /:id` (por clareza — não colide de fato, já que tem dois
segmentos de path):

```js
router.get('/tecidos/largura', authMiddleware, async (req, res) => {
  try {
    const nome = req.query.nome;
    const largura = await svc.buscarLarguraTecidoConhecida(nome, req.user.empresa_id);
    res.json({ largura });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
```

Resposta: `{ "largura": "3,30" }` ou `{ "largura": null }` quando não encontrado. Sem erro 404 —
"não encontrado" é um resultado normal, não uma exceção.

## 2. Frontend

### `FichaConfeccaoCortina.jsx`

Novo `useEffect` observando `dados.nomeTecido`, com debounce de 500ms:

- Não dispara se: `readOnly`, `nomeTecido` vazio, ou `larguraTecido` já preenchido no momento em
  que a resposta chega (nunca sobrescreve texto digitado pelo usuário).
- Usa `AbortController` para cancelar a busca anterior a cada nova tecla (evita resposta antiga
  sobrescrever estado mais novo).
- Chama `api.get(\`/os/tecidos/largura?nome=${encodeURIComponent(nomeTecido)}\`, { signal })`.
- Se `largura` vier preenchido **e** `larguraTecido` continuar vazio no callback, chama
  `setCampo("larguraTecido", largura)`.
- Preenchimento é silencioso (sem toast/aviso) — consistente com o resto da tela, que já
  auto-preenche largura/altura vindas do item do pedido sem aviso.
- Erro de rede é ignorado silenciosamente (funcionalidade de conveniência, não crítica); não
  bloqueia a digitação nem exibe mensagem de erro.

## 3. Testes

### Backend — `ordemServicoService.test.js`

Novo `describe('buscarLarguraTecidoConhecida', ...)`:

| Cenário | Expectativa |
|---|---|
| Nome bate (case/espaço diferentes) com ficha anterior | Retorna a largura salva |
| Nome não bate com nada | Retorna `null` |
| Nome vazio/whitespace | Retorna `null` sem consultar o banco |
| Match existe mas `larguraTecido` estava vazio naquela ficha | Ignora esse registro, retorna `null` (ou o próximo mais antigo com largura, se houver) |

### Backend — `ordemServicoRoutes.test.js`

| Cenário | Expectativa |
|---|---|
| `GET /os/tecidos/largura?nome=ADO016` | 200 com `{ largura: ... }` |

### Teste manual no navegador

1. Salvar uma ficha de Cortina com tecido "ADO016" e largura "3,30".
2. Abrir outra ficha de Cortina (outro pedido/item), digitar "ado016" no campo Nome do tecido.
3. Após parar de digitar (~500ms), campo "Largura do tecido no rolo" preenche automaticamente com
   "3,30".
4. Repetir digitando algo manualmente no campo largura primeiro — confirmar que o auto-preenchimento
   **não** sobrescreve o valor digitado.

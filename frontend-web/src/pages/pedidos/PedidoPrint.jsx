import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./PedidoPrint.css";

function fmtMoeda(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso) {
  if (!iso) return "";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PedidoPrint({ pedido, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 300);
    const handleAfterPrint = () => onClose();
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [onClose]);

  const pagamentosPorForma = (pedido.pagamentos || []).reduce((acc, pg) => {
    if (!acc[pg.forma]) acc[pg.forma] = [];
    acc[pg.forma].push(pg);
    return acc;
  }, {});

  return createPortal(
    <>
      {/* Overlay visível na tela enquanto o print dialog não abre */}
      <div className="print-overlay" onClick={onClose}>
        <div className="print-overlay-msg">Abrindo impressão...</div>
      </div>

      {/* Conteúdo imprimível — renderizado direto no body via portal */}
      <div className="pp-root">

        {/* HEADER */}
        <div className="pp-header">
          <div className="pp-logo">
            <div className="pp-logo-text">ADORNIE</div>
            <div className="pp-logo-sub">HOME DECOR</div>
          </div>
          <div className="pp-titulo">Pedido de Venda</div>
          <div className="pp-numero-box">
            <div className="pp-numero">{pedido.numero}</div>
            <div className="pp-data">{fmtData(pedido.data_pedido || pedido.created_at)}</div>
          </div>
        </div>

        {/* CLIENTE */}
        <div className="pp-cliente-grid">
          <div className="pp-campo">
            <div className="pp-campo-label">Cliente</div>
            <div className="pp-campo-valor">{pedido.cliente_nome || "—"}</div>
          </div>
          <div className="pp-campo">
            <div className="pp-campo-label">CPF/CNPJ</div>
            <div className="pp-campo-valor">{pedido.cpf_cnpj || "—"}</div>
          </div>
          <div className="pp-campo">
            <div className="pp-campo-label">Telefone</div>
            <div className="pp-campo-valor">{pedido.cliente_telefone || "—"}</div>
          </div>
          <div className="pp-campo">
            <div className="pp-campo-label">Email</div>
            <div className="pp-campo-valor">{pedido.email_cliente || "—"}</div>
          </div>
        </div>

        {/* ENDEREÇO + CONSULTOR */}
        <div className="pp-endereco-grid">
          <div className="pp-campo">
            <div className="pp-campo-label">Endereço de Entrega</div>
            <div className="pp-campo-valor">{pedido.endereco || "—"}</div>
          </div>
          <div className="pp-campo">
            <div className="pp-campo-label">Consultor(a)</div>
            <div className="pp-campo-valor">{pedido.consultor_nome || "—"}</div>
          </div>
        </div>

        {/* ITENS */}
        <table className="pp-itens">
          <thead>
            <tr>
              <th>#</th>
              <th>Ambiente</th>
              <th>Referencia</th>
              <th>Cor</th>
              <th>Produto</th>
              <th>Medidas</th>
              <th>Qtde</th>
              <th>Un</th>
              <th>Preço</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(pedido.itens || []).map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.ambiente || ""}</td>
                <td>{it.referencia || ""}</td>
                <td>{it.cor || ""}</td>
                <td>{it.descricao}</td>
                <td>{it.medidas || ""}</td>
                <td>{it.quantidade}</td>
                <td>{it.unidade || ""}</td>
                <td>{it.preco_unitario != null ? fmtMoeda(it.preco_unitario) : ""}</td>
                <td className="pp-td-total">{it.valor != null ? fmtMoeda(it.valor) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PAGAMENTOS + TOTAIS */}
        <div className="pp-pagamentos-totais">
          <div className="pp-pagamentos">
            {Object.keys(pagamentosPorForma).length > 0 && (
              <>
                <div className="pp-section-title">Forma de Pagamento</div>
                {Object.entries(pagamentosPorForma).map(([forma, pgs]) => (
                  <div key={forma} className="pp-pag-grupo">
                    <div className="pp-pag-forma">{forma}</div>
                    {pgs.map((pg, i) => (
                      <div key={i} className="pp-pag-linha">
                        <span>{pg.parcela}</span>
                        <span>{fmtData(pg.vencimento)}</span>
                        <span>R$ {fmtMoeda(pg.valor)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="pp-totais">
            <div className="pp-totais-linha">
              <span>SubTotal:</span>
              <span>R$ {fmtMoeda(pedido.subtotal)}</span>
            </div>
            <div className="pp-totais-linha desconto">
              <span>Desconto:</span>
              <span>R$ {fmtMoeda(pedido.desconto || 0)}</span>
            </div>
            <div className="pp-totais-linha total-final">
              <span>Total :</span>
              <span>R$ {fmtMoeda(pedido.total)}</span>
            </div>
          </div>
        </div>

        {/* OBSERVAÇÕES */}
        {(pedido.observacoes_entrega || pedido.observacoes) && (
          <div className="pp-obs">
            <div className="pp-obs-label">Observações:</div>
            {pedido.observacoes_entrega && (
              <>
                <div className="pp-obs-sub">Previsão de entrega:</div>
                <div className="pp-obs-texto">{pedido.observacoes_entrega}</div>
              </>
            )}
            {pedido.observacoes && (
              <>
                <div className="pp-obs-sub">Forma de pagamento:</div>
                <div className="pp-obs-texto">{pedido.observacoes}</div>
              </>
            )}
          </div>
        )}

        {/* ASSINATURAS */}
        <div className="pp-assinaturas">
          <div className="pp-assinatura">
            <div className="pp-assinatura-linha" />
            <div>De acordo</div>
          </div>
          <div className="pp-assinatura">
            <div className="pp-assinatura-linha" />
            <div>{pedido.consultor_nome || "Consultor(a)"}</div>
          </div>
        </div>

        {/* RODAPÉ */}
        <div className="pp-rodape">
          Adornie Decorações — Av. Vicente Machado 1997 — Batel, Curitiba - PR, (41) 3014-6180
        </div>

      </div>
    </>,
    document.body
  );
}

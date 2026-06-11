import { useState, useRef, useEffect } from "react";
import { FaPrint, FaPlus, FaTrash, FaCog, FaTimes } from "react-icons/fa";
import JsBarcode from "jsbarcode";
import EtiquetasConfig, { useLogos } from "./EtiquetasConfig";
import "./Etiquetas.css";

/* ─────────────────────────────────────────
   Barcode SVG — Code 128 real via JsBarcode
───────────────────────────────────────── */
function BarcodeSVG({ value, height = 28, fontSize = 8 }) {
  const ref = useRef();

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        height,
        displayValue: true,
        fontSize,
        margin: 2,
        lineColor: "#111",
        background: "#ffffff",
      });
    } catch {
      // valor inválido para CODE128 — ignora silenciosamente
    }
  }, [value, height, fontSize]);

  if (!value) return null;
  return <svg ref={ref} style={{ display: "block", width: "100%" }} />;
}

/* ─────────────────────────────────────────
   Configuração por template
───────────────────────────────────────── */
const MODELOS = {
  produto: { label: "Etiqueta Produto",       w: 50,  h: 80,  cols: 3, pageW: 210, pageH: 297, mH: 10, mV: 10, gH: 5, gV: 5, landscape: false },
  placa:   { label: "Placa ID",               w: 50,  h: 80,  cols: 3, pageW: 210, pageH: 297, mH: 10, mV: 10, gH: 5, gV: 5, landscape: false },
  cortina: { label: "Cortina Armazenamento",  w: 50,  h: 80,  cols: 3, pageW: 210, pageH: 297, mH: 10, mV: 10, gH: 5, gV: 5, landscape: false },
  tecido:  { label: "Tecido Armazenamento",    w: 277, h: 190, cols: 1, pageW: 297, pageH: 210, mH: 10, mV: 10, gH: 0, gV: 0, landscape: true  },
};

const ITEM_DEFAULTS = {
  produto: { nome: "", preco: "", referencia: "", quantidade: 1 },
  placa:   { titulo: "", subtitulo: "", referencia: "" },
  cortina: { cliente: "", pedido: "", itens: "" },
  tecido:  { nome: "", comprimento: "", largura: "", referencia: "", refFornecedor: "", fornecedor: "", cor: "" },
};

/* ─────────────────────────────────────────
   Labels de PRÉVIA (unidades em px via scale)
───────────────────────────────────────── */
function PreviewLabelProduto({ item, cfg, logo, sc }) {
  const px = v => v * sc;
  const preco = Number(item.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="etq-label etq-l-produto" style={{ width: px(50), height: px(80) }}>
      <div className="etq-lp-top">
        {cfg.mostrarLogo && logo && (
          <img src={logo} alt="" style={{ height: px(8), marginRight: px(2), flexShrink: 0, objectFit: "contain" }} />
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {cfg.mostrarNome && (
            <div className="etq-lp-nome" style={{ fontSize: px(3.8), lineHeight: 1.2 }}>
              {item.nome || "Nome do produto"}
            </div>
          )}
          {cfg.mostrarReferencia && item.referencia && (
            <div style={{ fontSize: px(2.6), color: "#666", marginTop: px(0.4) }}>Ref: {item.referencia}</div>
          )}
        </div>
      </div>
      <div className="etq-lp-bottom">
        {cfg.mostrarBarcode && item.referencia ? (
          <div style={{ flex: 1, maxWidth: px(44) }}>
            <BarcodeSVG value={item.referencia} height={px(14)} fontSize={px(2.3)} />
          </div>
        ) : <div style={{ flex: 1 }} />}
        {cfg.mostrarPreco && (
          <div className="etq-lp-preco" style={{ fontSize: px(6), whiteSpace: "nowrap" }}>{preco}</div>
        )}
      </div>
    </div>
  );
}

function PreviewLabelPlaca({ item, cfg, logo, sc }) {
  const px = v => v * sc;

  return (
    <div className="etq-label etq-l-placa" style={{ width: px(50), height: px(80) }}>
      <div className="etq-placa-header" style={{ paddingBottom: px(2), marginBottom: px(2) }}>
        {cfg.mostrarLogo && logo && (
          <img src={logo} alt="" style={{ height: px(8), marginRight: px(2), objectFit: "contain" }} />
        )}
        <div className="etq-placa-titulo" style={{ fontSize: px(5) }}>
          {item.titulo || "TÍTULO"}
        </div>
      </div>
      {item.subtitulo && (
        <div className="etq-placa-sub" style={{ fontSize: px(3.5), marginBottom: px(2) }}>
          {item.subtitulo}
        </div>
      )}
      {cfg.mostrarReferencia && item.referencia && (
        <div className="etq-placa-refs" style={{ fontSize: px(2.8) }}>
          <span>REF: {item.referencia}</span>
        </div>
      )}
      {cfg.mostrarBarcode && item.referencia && (
        <div style={{ width: px(44), marginTop: "auto" }}>
          <BarcodeSVG value={item.referencia} height={px(10)} fontSize={px(2.5)} />
        </div>
      )}
    </div>
  );
}


function PreviewLabelTecido({ item, cfg, logo, sc }) {
  const px = v => v * sc;

  return (
    <div className="etq-label etq-l-tecido" style={{ width: px(277), height: px(190) }}>

      {/* Coluna principal */}
      <div className="etq-tec-main">

        {/* Logo + Nome */}
        <div className="etq-tec-top" style={{ marginBottom: px(4) }}>
          {cfg.mostrarLogo && logo && (
            <img src={logo} alt="" style={{ height: px(22), marginRight: px(4), flexShrink: 0, objectFit: "contain" }} />
          )}
          <div className="etq-tec-nome" style={{ fontSize: px(13) }}>
            {item.nome || "Nome do Tecido"}
          </div>
        </div>

        <div className="etq-tec-divider" />

        {/* Info */}
        <div className="etq-tec-info" style={{ fontSize: px(5.5), gap: "5%", rowGap: px(3) }}>
          {item.fornecedor    && <span><b>Fornecedor:</b> {item.fornecedor}</span>}
          {item.refFornecedor && <span><b>Ref. Forn.:</b> {item.refFornecedor}</span>}
          {item.referencia    && <span><b>Ref. Int.:</b> {item.referencia}</span>}
        </div>

        {/* Campo manual: Lote */}
        <div style={{ display: "flex", alignItems: "center", gap: px(3), marginTop: px(5) }}>
          <span style={{ fontSize: px(5), fontWeight: "700", color: "#444", flexShrink: 0, letterSpacing: px(0.3) }}>LOTE</span>
          <div style={{ width: px(38), height: px(13), border: `${px(0.6)}px solid #555`, borderRadius: px(1.5) }} />
        </div>

        {/* Barcode */}
        {cfg.mostrarBarcode && item.referencia && (
          <div style={{ marginTop: "auto", paddingTop: px(4) }}>
            <BarcodeSVG value={item.referencia} height={px(30)} fontSize={px(5)} />
          </div>
        )}
      </div>

      {/* Coluna direita: ícone + metragem + cor */}
      <div className="etq-tec-side">
        <img src="/tecido.png" alt="" style={{ width: px(22), height: px(22), objectFit: "contain", opacity: 0.18, marginBottom: px(5) }} />
        <div className="etq-tec-metragem" style={{ fontSize: px(10) }}>
          <div>{item.comprimento ? `${item.comprimento}m` : "—m"}</div>
          <div style={{ fontSize: px(7), color: "#999", margin: `${px(2)}px 0` }}>×</div>
          <div>{item.largura ? `${item.largura}m` : "—m"}</div>
        </div>
        {item.cor && (
          <div className="etq-tec-cor" style={{ fontSize: px(5), marginTop: px(6) }}>
            <span className="etq-tec-cor-dot" style={{ width: px(5), height: px(5) }} />
            {item.cor}
          </div>
        )}
      </div>

    </div>
  );
}

function PreviewLabelCortina({ item, cfg, logo, sc }) {
  const px = v => v * sc;
  return (
    <div className="etq-label etq-l-cortina" style={{ width: px(50), height: px(80) }}>

      {/* Header: logo */}
      <div className="etq-cor-header">
        {cfg.mostrarLogo && logo && (
          <img src={logo} alt="" className="etq-cor-logo" style={{ height: px(6) }} />
        )}
      </div>

      {/* Body: campos (esquerda) + foto (direita) */}
      <div className="etq-cor-body">
        {/* Coluna campos */}
        <div className="etq-cor-fields">
          <div className="etq-cor-field">
            <span className="etq-cor-key" style={{ fontSize: px(2.2) }}>CLIENTE</span>
            <div className="etq-cor-val" style={{ fontSize: px(4) }}>{item.cliente || "—"}</div>
          </div>
          <div className="etq-cor-field">
            <span className="etq-cor-key" style={{ fontSize: px(2.2) }}>PEDIDO</span>
            <div className="etq-cor-val" style={{ fontSize: px(3.5) }}>{item.pedido || "—"}</div>
          </div>
          <div className="etq-cor-field etq-cor-field-grow">
            <span className="etq-cor-key" style={{ fontSize: px(2.2) }}>ITENS</span>
            <div className="etq-cor-itens" style={{ fontSize: px(2.9) }}>{item.itens || "—"}</div>
          </div>
        </div>

        {/* Coluna imagem */}
        <div className="etq-cor-side-img">
          <img src="/cortina.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>

      {/* Footer: Trilhos */}
      <div className="etq-cor-footer">
        <span className="etq-cor-key" style={{ fontSize: px(2.2) }}>TRILHOS PRONTOS?</span>
        <div className="etq-cor-opcoes">
          <div className="etq-cor-opcao">
            <div className="etq-cor-box" style={{ width: px(4.5), height: px(4.5), borderWidth: px(0.5) }} />
            <span style={{ fontSize: px(3.5) }}>Sim</span>
          </div>
          <div className="etq-cor-opcao">
            <div className="etq-cor-box" style={{ width: px(4.5), height: px(4.5), borderWidth: px(0.5) }} />
            <span style={{ fontSize: px(3.5) }}>Não</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function renderPreviewLabel(tipo, item, cfg, logo, sc, i) {
  if (tipo === "produto") return <PreviewLabelProduto key={i} item={item} cfg={cfg} logo={logo} sc={sc} />;
  if (tipo === "placa")   return <PreviewLabelPlaca   key={i} item={item} cfg={cfg} logo={logo} sc={sc} />;
  if (tipo === "cortina") return <PreviewLabelCortina key={i} item={item} cfg={cfg} logo={logo} sc={sc} />;
  if (tipo === "tecido")  return <PreviewLabelTecido  key={i} item={item} cfg={cfg} logo={logo} sc={sc} />;
  return null;
}

/* ─────────────────────────────────────────
   Labels de IMPRESSÃO (unidades em mm/pt)
───────────────────────────────────────── */
function PrintLabelProduto({ item, cfg, logo }) {
  const preco = Number(item.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div style={{ width: "50mm", height: "80mm", border: "1pt solid #444", display: "flex", flexDirection: "column", padding: "2mm", boxSizing: "border-box", overflow: "hidden", fontFamily: "Arial, sans-serif", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm", flex: 1, overflow: "hidden" }}>
        {cfg.mostrarLogo && logo && <img src={logo} alt="" style={{ height: "8mm", objectFit: "contain", flexShrink: 0 }} />}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {cfg.mostrarNome && <div style={{ fontSize: "9pt", fontWeight: "bold", lineHeight: 1.2 }}>{item.nome || "—"}</div>}
          {cfg.mostrarReferencia && item.referencia && <div style={{ fontSize: "6pt", color: "#333", marginTop: "0.4mm" }}>Ref: {item.referencia}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "1mm" }}>
        {cfg.mostrarBarcode && item.referencia && (
          <div style={{ width: "44mm" }}>
            <BarcodeSVG value={item.referencia} height={22} fontSize={5} />
          </div>
        )}
        {cfg.mostrarPreco && <div style={{ fontSize: "14pt", fontWeight: "900" }}>{preco}</div>}
      </div>
    </div>
  );
}

function PrintLabelPlaca({ item, cfg, logo }) {
  return (
    <div style={{ width: "50mm", height: "80mm", border: "1pt solid #444", display: "flex", flexDirection: "column", padding: "3mm", boxSizing: "border-box", fontFamily: "Arial, sans-serif", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "2mm", borderBottom: "1pt solid #555", paddingBottom: "2mm", marginBottom: "2mm" }}>
        {cfg.mostrarLogo && logo && <img src={logo} alt="" style={{ height: "8mm", objectFit: "contain" }} />}
        <div style={{ fontSize: "12pt", fontWeight: "900", letterSpacing: "0.5pt" }}>{item.titulo || "TÍTULO"}</div>
      </div>
      {item.subtitulo && <div style={{ fontSize: "9pt", color: "#222", marginBottom: "2mm" }}>{item.subtitulo}</div>}
      {cfg.mostrarReferencia && item.referencia && (
        <div style={{ fontSize: "7pt", color: "#333", marginBottom: "auto" }}>
          REF: {item.referencia}
        </div>
      )}
      {cfg.mostrarBarcode && item.referencia && (
        <div style={{ width: "44mm" }}>
          <BarcodeSVG value={item.referencia} height={20} fontSize={6} />
        </div>
      )}
    </div>
  );
}


function PrintLabelTecido({ item, cfg, logo }) {
  const base = { fontFamily: "Arial, sans-serif", background: "#fff", boxSizing: "border-box" };
  return (
    <div style={{ ...base, width: "277mm", height: "190mm", border: "0.5pt solid #bbb", display: "flex", overflow: "hidden" }}>

      {/* Coluna principal */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10mm 10mm 8mm 10mm", overflow: "hidden" }}>

        {/* Logo + Nome */}
        <div style={{ display: "flex", alignItems: "center", gap: "6mm", marginBottom: "7mm" }}>
          {cfg.mostrarLogo && logo && (
            <img src={logo} alt="" style={{ height: "22mm", objectFit: "contain", flexShrink: 0 }} />
          )}
          <div style={{ fontSize: "42pt", fontWeight: "900", lineHeight: 1.05, letterSpacing: "-0.5pt", color: "#111" }}>
            {item.nome || "—"}
          </div>
        </div>

        {/* Divisória */}
        <div style={{ borderTop: "0.5pt solid #ccc", marginBottom: "7mm" }} />

        {/* Campos info */}
        <div style={{ display: "flex", gap: "10mm", fontSize: "14pt", color: "#333", flexWrap: "wrap", lineHeight: 1.7 }}>
          {item.fornecedor    && <span><b>Fornecedor:</b> {item.fornecedor}</span>}
          {item.refFornecedor && <span><b>Ref. Forn.:</b> {item.refFornecedor}</span>}
          {item.referencia    && <span><b>Ref. Int.:</b> {item.referencia}</span>}
        </div>

        {/* Campo manual: Lote */}
        <div style={{ display: "flex", alignItems: "center", gap: "5mm", marginTop: "7mm" }}>
          <span style={{ fontSize: "13pt", fontWeight: "700", color: "#333", flexShrink: 0, letterSpacing: "0.5pt" }}>LOTE</span>
          <div style={{ width: "34mm", height: "11mm", border: "0.8pt solid #444", borderRadius: "1.5mm" }} />
        </div>

        {/* Barcode grande */}
        {cfg.mostrarBarcode && item.referencia && (
          <div style={{ marginTop: "auto", width: "180mm" }}>
            <BarcodeSVG value={item.referencia} height={58} fontSize={12} />
          </div>
        )}
      </div>

      {/* Coluna direita: ícone + metragem + cor */}
      <div style={{ width: "72mm", flexShrink: 0, borderLeft: "0.5pt solid #ddd", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8mm 6mm", background: "#fafafa" }}>
        <img src="/tecido.png" alt="" style={{ width: "22mm", height: "22mm", objectFit: "contain", opacity: 0.15, marginBottom: "6mm" }} />
        <div style={{ fontSize: "34pt", fontWeight: "900", textAlign: "center", lineHeight: 1.25, color: "#111" }}>
          <div>{item.comprimento ? `${item.comprimento}m` : "—"}</div>
          <div style={{ fontSize: "22pt", color: "#999", margin: "3mm 0" }}>×</div>
          <div>{item.largura ? `${item.largura}m` : "—"}</div>
        </div>
        {item.cor && (
          <div style={{ marginTop: "8mm", fontSize: "13pt", color: "#444", textAlign: "center", fontWeight: "700", display: "flex", alignItems: "center", gap: "3mm" }}>
            <span style={{ display: "inline-block", width: "9mm", height: "9mm", borderRadius: "50%", background: "#888", flexShrink: 0 }} />
            {item.cor}
          </div>
        )}
      </div>

    </div>
  );
}

function PrintLabelCortina({ item, cfg, logo }) {
  const base = { fontFamily: "Arial, sans-serif", background: "#fff", boxSizing: "border-box" };
  return (
    <div style={{ ...base, width: "50mm", height: "80mm", border: "1pt solid #444", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header: logo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2mm 2.5mm", borderBottom: "1pt solid #555", background: "#f5f5f5" }}>
        {cfg.mostrarLogo && logo && (
          <img src={logo} alt="" style={{ height: "6mm", objectFit: "contain" }} />
        )}
      </div>

      {/* Body: campos (esquerda) + foto (direita) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Coluna campos */}
        <div style={{ flex: 1, padding: "2.5mm", display: "flex", flexDirection: "column", gap: "2mm", overflow: "hidden" }}>
          <div>
            <div style={{ fontSize: "4.5pt", fontWeight: "700", color: "#555", letterSpacing: "0.8pt", marginBottom: "0.5mm", textTransform: "uppercase" }}>Cliente</div>
            <div style={{ fontSize: "9pt", fontWeight: "800", color: "#111", lineHeight: 1.15 }}>{item.cliente || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: "4.5pt", fontWeight: "700", color: "#555", letterSpacing: "0.8pt", marginBottom: "0.5mm", textTransform: "uppercase" }}>Pedido</div>
            <div style={{ fontSize: "8pt", fontWeight: "700", color: "#222" }}>{item.pedido || "—"}</div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: "4.5pt", fontWeight: "700", color: "#555", letterSpacing: "0.8pt", marginBottom: "0.5mm", textTransform: "uppercase" }}>Itens</div>
            <div style={{ fontSize: "6.5pt", color: "#333", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{item.itens || "—"}</div>
          </div>
        </div>

        {/* Coluna imagem */}
        <div style={{ width: "16mm", flexShrink: 0, borderLeft: "1pt solid #555", overflow: "hidden" }}>
          <img src="/cortina.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      </div>

      {/* Footer: Trilhos */}
      <div style={{ padding: "2mm 2.5mm", borderTop: "1pt solid #555", background: "#f5f5f5" }}>
        <div style={{ fontSize: "4.5pt", fontWeight: "700", color: "#444", letterSpacing: "0.5pt", marginBottom: "1.5mm" }}>TRILHOS PRONTOS?</div>
        <div style={{ display: "flex", gap: "5mm" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
            <div style={{ width: "4.5mm", height: "4.5mm", border: "0.8pt solid #333", borderRadius: "0.8mm", flexShrink: 0 }} />
            <span style={{ fontSize: "8pt", fontWeight: "700" }}>Sim</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
            <div style={{ width: "4.5mm", height: "4.5mm", border: "0.8pt solid #333", borderRadius: "0.8mm", flexShrink: 0 }} />
            <span style={{ fontSize: "8pt", fontWeight: "700" }}>Não</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function renderPrintLabel(tipo, item, cfg, logoAtiva, i) {
  if (item === null) {
    const m = MODELOS[tipo];
    return <div key={i} style={{ width: `${m.w}mm`, height: `${m.h}mm` }} />;
  }
  if (tipo === "produto") return <PrintLabelProduto key={i} item={item} cfg={cfg} logo={logoAtiva} />;
  if (tipo === "placa")   return <PrintLabelPlaca   key={i} item={item} cfg={cfg} logo={logoAtiva} />;
  if (tipo === "cortina") return <PrintLabelCortina key={i} item={item} cfg={cfg} logo={logoAtiva} />;
  if (tipo === "tecido")  return <PrintLabelTecido  key={i} item={item} cfg={cfg} logo={logoAtiva} />;
  return null;
}

/* ─────────────────────────────────────────
   Configurações de campos por template
───────────────────────────────────────── */
const CFG_CAMPOS = {
  cortina: [["mostrarLogo", "Logotipo"]],
  produto: [
    ["mostrarNome",      "Nome"],
    ["mostrarPreco",     "Preço"],
    ["mostrarReferencia","Referência"],
    ["mostrarBarcode",   "Código de Barras"],
    ["mostrarLogo",      "Logotipo"],
  ],
  placa: [
    ["mostrarLogo",      "Logotipo"],
    ["mostrarReferencia","Referência"],
    ["mostrarBarcode",   "Código de Barras"],
  ],
  tecido: [
    ["mostrarLogo",    "Logotipo"],
    ["mostrarBarcode", "Código de Barras"],
  ],
};

/* ─────────────────────────────────────────
   Formulário de item por template
───────────────────────────────────────── */
function ItemFormProduto({ item, cfg, update }) {
  return (
    <>
      <input className="etq-field" placeholder="Nome do produto" value={item.nome}
        onChange={e => update("nome", e.target.value)} />
      <div className="etq-field-row">
        <input className="etq-field" placeholder="Preço (ex: 99.90)" value={item.preco}
          onChange={e => update("preco", e.target.value)} />
        <input className="etq-field etq-field-qty" type="number" min="1" placeholder="Qtd"
          value={item.quantidade} onChange={e => update("quantidade", e.target.value)} />
      </div>
      <input className="etq-field" placeholder="Referência (usado como código de barras)" value={item.referencia}
        onChange={e => update("referencia", e.target.value)} />
    </>
  );
}

function ItemFormPlaca({ item, cfg, update }) {
  return (
    <>
      <input className="etq-field" placeholder="Título" value={item.titulo}
        onChange={e => update("titulo", e.target.value)} />
      <input className="etq-field" placeholder="Subtítulo (opcional)" value={item.subtitulo}
        onChange={e => update("subtitulo", e.target.value)} />
      <input className="etq-field" placeholder="Referência (usado como código de barras)" value={item.referencia}
        onChange={e => update("referencia", e.target.value)} />
    </>
  );
}


function ItemFormCortina({ item, update }) {
  return (
    <>
      <input className="etq-field" placeholder="Nome do cliente" value={item.cliente}
        onChange={e => update("cliente", e.target.value)} />
      <input className="etq-field" placeholder="Número do pedido" value={item.pedido}
        onChange={e => update("pedido", e.target.value)} />
      <textarea className="etq-field etq-field-textarea" placeholder={"Itens (um por linha)\nex: Blackout 2,40×2,10\n    Voil 1,80×2,10"} value={item.itens}
        onChange={e => update("itens", e.target.value)} rows={4} />
    </>
  );
}

function ItemFormTecido({ item, update }) {
  return (
    <>
      <input className="etq-field" placeholder="Nome do tecido" value={item.nome}
        onChange={e => update("nome", e.target.value)} />
      <div className="etq-field-row etq-field-metragem">
        <input className="etq-field" placeholder="Comprimento (ex: 47.5)" value={item.comprimento}
          onChange={e => update("comprimento", e.target.value)} />
        <span className="etq-metragem-sep">×</span>
        <input className="etq-field" placeholder="Largura (ex: 3.30)" value={item.largura}
          onChange={e => update("largura", e.target.value)} />
      </div>
      <input className="etq-field" placeholder="Cor (ex: Azul Royal)" value={item.cor}
        onChange={e => update("cor", e.target.value)} />
      <input className="etq-field" placeholder="Fornecedor" value={item.fornecedor}
        onChange={e => update("fornecedor", e.target.value)} />
      <div className="etq-field-row">
        <input className="etq-field" placeholder="Ref. interna (código de barras)" value={item.referencia}
          onChange={e => update("referencia", e.target.value)} />
        <input className="etq-field" placeholder="Ref. fornecedor" value={item.refFornecedor}
          onChange={e => update("refFornecedor", e.target.value)} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────
   Modal de confirmação de impressão
───────────────────────────────────────── */
function PrintModal({ open, onClose, onPrint, modelo, quantidade, ignorar }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const orientacao = modelo.landscape ? "Paisagem" : "Retrato";

  return (
    <div className="etqprint-overlay">
      <div className="etqprint-modal" role="dialog" aria-modal="true">

        <div className="etqprint-header">
          <span className="etqprint-title">Imprimir etiquetas</span>
          <button className="etqprint-close" onClick={onClose} title="Fechar">
            <FaTimes />
          </button>
        </div>

        <div className="etqprint-body">
          <div className="etqprint-icon"><FaPrint /></div>

          <div className="etqprint-info">
            <div className="etqprint-row">
              <span className="etqprint-key">Tipo</span>
              <span className="etqprint-val">{modelo.label}</span>
            </div>
            <div className="etqprint-row">
              <span className="etqprint-key">Etiquetas</span>
              <span className="etqprint-val">
                <strong>{quantidade}</strong> {quantidade === 1 ? "etiqueta" : "etiquetas"}
              </span>
            </div>
            <div className="etqprint-row">
              <span className="etqprint-key">Papel</span>
              <span className="etqprint-val">A4 {orientacao} · {modelo.pageW}×{modelo.pageH}mm</span>
            </div>
            {ignorar > 0 && (
              <div className="etqprint-row">
                <span className="etqprint-key">Posições ignoradas</span>
                <span className="etqprint-val">{ignorar}</span>
              </div>
            )}
          </div>

          <p className="etqprint-desc">
            Ao confirmar, a caixa de diálogo da impressora será aberta. Certifique-se de selecionar
            o papel <strong>A4</strong> com orientação <strong>{orientacao}</strong>.
          </p>
        </div>

        <div className="etqprint-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onPrint}>
            <FaPrint /> Imprimir agora
          </button>
        </div>

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Página principal
───────────────────────────────────────── */
const PREVIEW_W = 520;

export default function Etiquetas() {
  const [tipo, setTipo] = useState("produto");
  const [cfg, setCfg] = useState({
    mostrarNome: true, mostrarPreco: true, mostrarReferencia: false,
    mostrarBarcode: true, mostrarLogo: false,
    ignorarPrimeiras: 0,
  });
  const [itens, setItens] = useState([{ ...ITEM_DEFAULTS.produto, id: Date.now() }]);
  const [logoSelecionada, setLogoSelecionada] = useState(null); // id da logo ativa
  const [configAberta,   setConfigAberta]   = useState(false);
  const [printAberto,    setPrintAberto]    = useState(false);

  const { logos, carregando: logosCarregando, salvar: salvarLogo, remover: removerLogo } = useLogos();

  // URL Cloudinary da logo ativa (ou null)
  const logoAtiva = logos.find(l => l.id === logoSelecionada)?.url || null;

  // se a logo selecionada foi removida, limpa a seleção
  useEffect(() => {
    if (logoSelecionada && !logos.find(l => l.id === logoSelecionada)) {
      setLogoSelecionada(null);
    }
  }, [logos, logoSelecionada]);

  const modelo = MODELOS[tipo];
  const scale  = PREVIEW_W / modelo.pageW;
  const paperH = modelo.pageH * scale;

  function handleTipo(t) {
    setTipo(t);
    setItens([{ ...ITEM_DEFAULTS[t], id: Date.now() }]);
  }

  function addItem() {
    setItens(p => [...p, { ...ITEM_DEFAULTS[tipo], id: Date.now() + Math.random() }]);
  }

  function removeItem(id) {
    setItens(p => p.filter(i => i.id !== id));
  }

  function updateItem(id, k, v) {
    setItens(p => p.map(i => i.id === id ? { ...i, [k]: v } : i));
  }

  const labelsParaImprimir = tipo === "produto"
    ? itens.flatMap(it => Array.from({ length: Math.max(1, Number(it.quantidade) || 1) }, () => it))
    : itens;

  const ignorar = Number(cfg.ignorarPrimeiras) || 0;
  const labelsComIgnore = [...Array(ignorar).fill(null), ...labelsParaImprimir];

  const camposCfg = CFG_CAMPOS[tipo] || [];

  return (
    <div className="etq-page">

      {/* ── Header ── */}
      <div className="etq-header">
        <div>
          <h1 className="etq-title">Gerador de Etiquetas</h1>
          <p className="etq-subtitle">Configure e visualize antes de imprimir</p>
        </div>
        <div className="etq-header-actions">
          <button className="btn btn-secondary" onClick={() => setConfigAberta(true)}>
            <FaCog /> Configurações
          </button>
          <button className="btn btn-primary" onClick={() => setPrintAberto(true)}>
            <FaPrint /> Imprimir
          </button>
        </div>
      </div>

      <div className="etq-body">

        {/* ── Painel de configuração ── */}
        <aside className="etq-config">

          {/* Tipo de template */}
          <div className="etq-section">
            <div className="etq-section-label">Tipo de etiqueta</div>
            <div className="etq-type-tabs">
              {Object.entries(MODELOS).map(([k, m]) => (
                <button key={k} className={`etq-tab${tipo === k ? " active" : ""}`} onClick={() => handleTipo(k)}>
                  <span className="etq-tab-label">{m.label}</span>
                  <span className="etq-tab-dim">{m.w}×{m.h}mm</span>
                </button>
              ))}
            </div>
          </div>

          {/* Campos visíveis */}
          {camposCfg.length > 0 && (
            <div className="etq-section">
              <div className="etq-section-label">Campos visíveis</div>
              <div className="etq-checks">
                {camposCfg.map(([k, label]) => (
                  <label key={k} className="etq-check-row">
                    <input type="checkbox" checked={!!cfg[k]}
                      onChange={() => setCfg(p => ({ ...p, [k]: !p[k] }))} />
                    {label}
                  </label>
                ))}
              </div>

              {tipo === "produto" && (
                <div className="etq-ignore-row">
                  <span>Ignorar primeiras</span>
                  <input type="number" min="0" max="100" className="etq-num-input"
                    value={cfg.ignorarPrimeiras}
                    onChange={e => setCfg(p => ({ ...p, ignorarPrimeiras: Number(e.target.value) }))} />
                  <span>etiquetas</span>
                </div>
              )}
            </div>
          )}

          {/* Seletor de logo salva */}
          {cfg.mostrarLogo && tipo !== "veiculo" && (
            <div className="etq-section">
              <div className="etq-section-label">Logotipo</div>
              {logos.length === 0 ? (
                <div className="etq-logo-vazio">
                  Nenhuma logo cadastrada.{" "}
                  <button className="etq-link" onClick={() => setConfigAberta(true)}>
                    Adicionar em Configurações
                  </button>
                </div>
              ) : (
                <div className="etq-logo-grid">
                  <button
                    className={`etq-logo-opt${!logoSelecionada ? " active" : ""}`}
                    onClick={() => setLogoSelecionada(null)}
                  >
                    <span className="etq-logo-opt-none">Nenhuma</span>
                  </button>
                  {logos.map(l => (
                    <button
                      key={l.id}
                      className={`etq-logo-opt${logoSelecionada === l.id ? " active" : ""}`}
                      onClick={() => setLogoSelecionada(l.id)}
                      title={l.nome}
                    >
                      <img src={l.url} alt={l.nome} className="etq-logo-opt-img" />
                      <span className="etq-logo-opt-nome">{l.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lista de itens */}
          <div className="etq-section etq-items-section">
            <div className="etq-section-label">Itens</div>
            <div className="etq-items-list">
              {itens.map(item => (
                <div key={item.id} className="etq-item-card">
                  {tipo === "produto" && (
                    <ItemFormProduto item={item} cfg={cfg} update={(k, v) => updateItem(item.id, k, v)} />
                  )}
                  {tipo === "placa" && (
                    <ItemFormPlaca item={item} cfg={cfg} update={(k, v) => updateItem(item.id, k, v)} />
                  )}
                  {tipo === "cortina" && (
                    <ItemFormCortina item={item} update={(k, v) => updateItem(item.id, k, v)} />
                  )}
                  {tipo === "tecido" && (
                    <ItemFormTecido item={item} update={(k, v) => updateItem(item.id, k, v)} />
                  )}
                  {itens.length > 1 && (
                    <button className="etq-remove-btn" onClick={() => removeItem(item.id)} title="Remover item">
                      <FaTrash />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary etq-add-btn" onClick={addItem}>
              <FaPlus /> Adicionar item
            </button>
          </div>

        </aside>

        {/* ── Painel de prévia ── */}
        <section className="etq-preview-section">
          <div className="etq-preview-bar">
            <span className="etq-count-badge">
              {labelsParaImprimir.length} etiqueta{labelsParaImprimir.length !== 1 ? "s" : ""}
            </span>
            <span className="etq-model-info">
              {modelo.label} · {modelo.w}×{modelo.h}mm · A4
            </span>
            {ignorar > 0 && (
              <span className="etq-ignore-badge">{ignorar} ignorada{ignorar !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="etq-preview-scroll">
            <div className="etq-paper" style={{ width: PREVIEW_W, height: paperH }}>
              <div
                className="etq-paper-grid"
                style={{
                  padding: `${modelo.mV * scale}px ${modelo.mH * scale}px`,
                  gap: `${modelo.gV * scale}px ${modelo.gH * scale}px`,
                  gridTemplateColumns: `repeat(${modelo.cols}, ${modelo.w * scale}px)`,
                }}
              >
                {labelsComIgnore.map((item, i) =>
                  item === null
                    ? <div key={`skip-${i}`} className="etq-skip-slot"
                        style={{ width: modelo.w * scale, height: modelo.h * scale }} />
                    : renderPreviewLabel(tipo, item, cfg, logoAtiva, scale, i)
                )}
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* ── Modal de impressão ── */}
      <PrintModal
        open={printAberto}
        onClose={() => setPrintAberto(false)}
        onPrint={() => { setPrintAberto(false); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }}
        modelo={modelo}
        quantidade={labelsParaImprimir.length}
        ignorar={ignorar}
      />

      {/* ── Modal de configurações ── */}
      <EtiquetasConfig
        open={configAberta}
        onClose={() => setConfigAberta(false)}
        logos={logos}
        carregando={logosCarregando}
        onSalvar={salvarLogo}
        onRemover={removerLogo}
      />

      {/* ── Orientação de impressão dinâmica ── */}
      <style>{`@media print { @page { size: A4 ${modelo.landscape ? "landscape" : "portrait"}; margin: 0; } }`}</style>

      {/* ── Área de impressão (oculta na tela) ── */}
      <div className="etq-print-only">
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${modelo.cols}, ${modelo.w}mm)`,
          gap: `${modelo.gV}mm ${modelo.gH}mm`,
          padding: `${modelo.mV}mm ${modelo.mH}mm`,
          background: "white",
        }}>
          {labelsComIgnore.map((item, i) => renderPrintLabel(tipo, item, cfg, logoAtiva, i))}
        </div>
      </div>

    </div>
  );
}

/* ── Checklist de Perfil do Arquiteto — opções compartilhadas ──
   Usado pelo formulário de cadastro (Arquitetos.jsx) e pelo
   relatório de perfil (Relatorios.jsx). */

export const MESES_NOME = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export const OPCOES_SIM_NAO = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
];

export const OPCOES_COMUNICACAO = [
  { value: "whatsapp", label: "WhatsApp rápido" },
  { value: "ligacao",  label: "Ligação" },
  { value: "reuniao",  label: "Reunião presencial" },
];

export const OPCOES_PADRAO_ATENDIMENTO = [
  { value: "alto",      label: "Alto Padrão / Luxo" },
  { value: "medio",     label: "Médio Padrão" },
  { value: "comercial", label: "Comercial/Corporativo" },
];

export const OPCOES_ESTILO = [
  { value: "minimalista",   label: "Minimalista/Moderno" },
  { value: "classico",      label: "Clássico/Imponente" },
  { value: "rustico",       label: "Rústico/Orgânico" },
  { value: "contemporaneo", label: "Contemporâneo" },
];

export const OPCOES_PRODUTOS = [
  { value: "cortinas_persianas", label: "Cortinas/Persianas" },
  { value: "papeis_parede",      label: "Papéis de Parede" },
  { value: "tecidos_exclusivos", label: "Tecidos Exclusivos" },
];

export const OPCOES_QUEM_DECIDE = [
  { value: "arquiteto", label: "O próprio arquiteto" },
  { value: "equipe",    label: "Um funcionário/especificador da equipe" },
];

export const OPCOES_MOMENTO = [
  { value: "projeto", label: "Projeto/Detalhamento" },
  { value: "obra",    label: "Obra/Medição final" },
];

export const OPCOES_TRAUMA = [
  { value: "atraso",      label: "Atraso na entrega" },
  { value: "erro_medida", label: "Erro de instalação/medida" },
  { value: "assistencia", label: "Falta de assistência pós-venda" },
  { value: "orcamento",   label: "Orçamento confuso" },
];

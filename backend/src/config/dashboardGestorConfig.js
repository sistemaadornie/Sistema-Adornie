"use strict";

const ETAPAS_FUNIL = [
  { numero: 1, nome: "Verificação",  responsavel: "Consultoras",           descricao: "Conferência do PDF, categorização dos itens e vínculos do pedido." },
  { numero: 2, nome: "Conferência",  responsavel: "Equipe de conferência", descricao: "Medição em campo e preenchimento da ficha das consultoras." },
  { numero: 3, nome: "Confecção",    responsavel: "Ateliê / fornecedores", descricao: "Produção das peças no ateliê e com fornecedores parceiros." },
  { numero: 4, nome: "Produto",      responsavel: "Estoque",               descricao: "Produto pronto e conferido, aguardando separação." },
  { numero: 5, nome: "Agendamento",  responsavel: "Coordenação",           descricao: "Definição de equipe, veículo e data da instalação." },
  { numero: 6, nome: "Separação",    responsavel: "Almoxarifado",          descricao: "Itens separados e carregados para a instalação." },
  { numero: 7, nome: "Instalação",   responsavel: "Equipes de campo",      descricao: "Execução da instalação no endereço do cliente." },
  { numero: 8, nome: "Concluído",    responsavel: "—",                     descricao: "Pedido finalizado e entregue ao cliente." },
];

const MAPA_BAIRROS = [
  { id: "batel",            nome: "Batel",            x: 44, y: 54 },
  { id: "aguaverde",        nome: "Água Verde",       x: 39, y: 69 },
  { id: "bigorrilho",       nome: "Bigorrilho",       x: 33, y: 44 },
  { id: "centro",           nome: "Centro",           x: 56, y: 39 },
  { id: "ecoville",         nome: "Ecoville",         x: 22, y: 60 },
  { id: "cabral",           nome: "Cabral",           x: 62, y: 29 },
  { id: "juveve",           nome: "Juvevê",           x: 66, y: 46 },
  { id: "portao",           nome: "Portão",           x: 47, y: 80 },
  { id: "santafelicidade",  nome: "Sta. Felicidade",  x: 26, y: 28 },
  { id: "altoxv",           nome: "Alto da XV",       x: 72, y: 60 },
];
const MAPA_BAIRROS_OUTROS = { id: "outros", nome: "Outros", x: 90, y: 88 };

const MAPA_CIDADES = [
  { id: "cwb", nome: "Curitiba",            x: 40, y: 52 },
  { id: "bc",  nome: "Balneário Camboriú",  x: 80, y: 74 },
  { id: "sjp", nome: "S. José dos Pinhais", x: 52, y: 63 },
  { id: "joi", nome: "Joinville",           x: 70, y: 56 },
  { id: "fln", nome: "Florianópolis",       x: 82, y: 86 },
  { id: "blu", nome: "Blumenau",            x: 68, y: 66 },
  { id: "pg",  nome: "Ponta Grossa",        x: 24, y: 44 },
  { id: "mga", nome: "Maringá",             x: 16, y: 30 },
];
const MAPA_CIDADES_OUTROS = { id: "outros", nome: "Outros", x: 90, y: 88 };

function buscarCoordenada(nome, lista) {
  const alvo = (nome || "").trim().toLowerCase();
  if (!alvo) return null;
  return lista.find((r) => r.nome.toLowerCase() === alvo) || null;
}

module.exports = {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
};

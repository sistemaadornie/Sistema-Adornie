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

// Os 75 bairros oficiais de Curitiba (IPPUC), com centroide aproximado.
const MAPA_BAIRROS = [
  { id: "abranches",           nome: "Abranches",            lat: -25.3709, lng: -49.2707 },
  { id: "ahu",                 nome: "Ahú",                   lat: -25.4040, lng: -49.2602 },
  { id: "altoboqueirao",       nome: "Alto Boqueirão",        lat: -25.5284, lng: -49.2442 },
  { id: "altodagloria",        nome: "Alto da Glória",        lat: -25.4192, lng: -49.2626 },
  { id: "altodaruaxv",         nome: "Alto da Rua XV",        lat: -25.4270, lng: -49.2502 },
  { id: "atuba",                nome: "Atuba",                 lat: -25.3888, lng: -49.2052 },
  { id: "augusta",             nome: "Augusta",               lat: -25.4540, lng: -49.3784 },
  { id: "bacacheri",           nome: "Bacacheri",             lat: -25.3972, lng: -49.2367 },
  { id: "bairroalto",          nome: "Bairro Alto",           lat: -25.4112, lng: -49.2069 },
  { id: "barreirinha",         nome: "Barreirinha",           lat: -25.3704, lng: -49.2610 },
  { id: "batel",               nome: "Batel",                 lat: -25.4444, lng: -49.2881 },
  { id: "bigorrilho",          nome: "Bigorrilho",            lat: -25.4333, lng: -49.2972 },
  { id: "boavista",            nome: "Boa Vista",             lat: -25.3884, lng: -49.2437 },
  { id: "bomretiro",           nome: "Bom Retiro",            lat: -25.4104, lng: -49.2754 },
  { id: "boqueirao",           nome: "Boqueirão",             lat: -25.5031, lng: -49.2369 },
  { id: "butiatuvinha",        nome: "Butiatuvinha",          lat: -25.3894, lng: -49.3550 },
  { id: "cabral",              nome: "Cabral",                lat: -25.4061, lng: -49.2520 },
  { id: "cachoeira",           nome: "Cachoeira",             lat: -25.3576, lng: -49.2637 },
  { id: "cajuru",              nome: "Cajuru",                lat: -25.4621, lng: -49.2056 },
  { id: "campinadosiqueira",   nome: "Campina do Siqueira",   lat: -25.4386, lng: -49.3108 },
  { id: "campocomprido",       nome: "Campo Comprido",        lat: -25.4418, lng: -49.3395 },
  { id: "campodesantana",      nome: "Campo de Santana",      lat: -25.5916, lng: -49.3371 },
  { id: "capaoraso",           nome: "Capão Raso",            lat: -25.5043, lng: -49.2961 },
  { id: "capaodaimbuia",       nome: "Capão da Imbuia",       lat: -25.4373, lng: -49.2112 },
  { id: "cascatinha",          nome: "Cascatinha",            lat: -25.4140, lng: -49.3107 },
  { id: "caximba",             nome: "Caximba",               lat: -25.6165, lng: -49.3542 },
  { id: "centro",              nome: "Centro",                lat: -25.4342, lng: -49.2714 },
  { id: "centrocivico",        nome: "Centro Cívico",         lat: -25.4175, lng: -49.2687 },
  { id: "cidadeindustrial",    nome: "Cidade Industrial",     lat: -25.4507, lng: -49.3557 },
  { id: "cristorei",           nome: "Cristo Rei",            lat: -25.4332, lng: -49.2430 },
  { id: "fanny",               nome: "Fanny",                 lat: -25.4822, lng: -49.2698 },
  { id: "fazendinha",          nome: "Fazendinha",            lat: -25.4781, lng: -49.3259 },
  { id: "ganchinho",           nome: "Ganchinho",             lat: -25.5597, lng: -49.2513 },
  { id: "guabirotuba",         nome: "Guabirotuba",           lat: -25.4657, lng: -49.2430 },
  { id: "guaira",              nome: "Guaíra",                lat: -25.4701, lng: -49.2745 },
  { id: "hauer",               nome: "Hauer",                 lat: -25.4777, lng: -49.2493 },
  { id: "hugolange",           nome: "Hugo Lange",            lat: -25.4176, lng: -49.2454 },
  { id: "jardimbotanico",      nome: "Jardim Botânico",       lat: -25.4431, lng: -49.2450 },
  { id: "jardimsocial",        nome: "Jardim Social",         lat: -25.4191, lng: -49.2342 },
  { id: "jardimdasamericas",   nome: "Jardim das Américas",   lat: -25.4563, lng: -49.2316 },
  { id: "juveve",              nome: "Juvevê",                lat: -25.4129, lng: -49.2583 },
  { id: "lamenhapequena",      nome: "Lamenha Pequena",       lat: -25.3661, lng: -49.3356 },
  { id: "lindoia",             nome: "Lindóia",               lat: -25.4799, lng: -49.2768 },
  { id: "merces",              nome: "Mercês",                lat: -25.4221, lng: -49.2919 },
  { id: "mossungue",           nome: "Mossunguê",             lat: -25.4380, lng: -49.3274 },
  { id: "novomundo",           nome: "Novo Mundo",            lat: -25.4890, lng: -49.2941 },
  { id: "orleans",             nome: "Orleans",                lat: -25.4260, lng: -49.3670 },
  { id: "parolin",             nome: "Parolin",                lat: -25.4627, lng: -49.2661 },
  { id: "pilarzinho",          nome: "Pilarzinho",             lat: -25.3927, lng: -49.2830 },
  { id: "pinheirinho",         nome: "Pinheirinho",            lat: -25.5215, lng: -49.2935 },
  { id: "portao",              nome: "Portão",                 lat: -25.4749, lng: -49.3008 },
  { id: "pradovelho",          nome: "Prado Velho",            lat: -25.4516, lng: -49.2572 },
  { id: "reboucas",            nome: "Rebouças",               lat: -25.4455, lng: -49.2649 },
  { id: "riviera",             nome: "Riviera",                lat: -25.4315, lng: -49.3802 },
  { id: "santacandida",        nome: "Santa Cândida",          lat: -25.3706, lng: -49.2343 },
  { id: "santafelicidade",     nome: "Santa Felicidade",       lat: -25.4040, lng: -49.3287 },
  { id: "santaquiteria",       nome: "Santa Quitéria",         lat: -25.4604, lng: -49.3113 },
  { id: "santoinacio",         nome: "Santo Inácio",           lat: -25.4276, lng: -49.3254 },
  { id: "seminario",           nome: "Seminário",              lat: -25.4494, lng: -49.3046 },
  { id: "saobraz",             nome: "São Braz",               lat: -25.4190, lng: -49.3483 },
  { id: "saofrancisco",        nome: "São Francisco",          lat: -25.4234, lng: -49.2758 },
  { id: "saojoao",             nome: "São João",               lat: -25.3946, lng: -49.3122 },
  { id: "saolourenco",         nome: "São Lourenço",           lat: -25.3914, lng: -49.2674 },
  { id: "saomiguel",           nome: "São Miguel",             lat: -25.5044, lng: -49.3602 },
  { id: "sitiocercado",        nome: "Sítio Cercado",          lat: -25.5417, lng: -49.2703 },
  { id: "taboao",              nome: "Taboão",                 lat: -25.3724, lng: -49.2801 },
  { id: "taruma",              nome: "Tarumã",                 lat: -25.4285, lng: -49.2284 },
  { id: "tatuquara",           nome: "Tatuquara",              lat: -25.5667, lng: -49.3096 },
  { id: "tingui",              nome: "Tingui",                 lat: -25.3877, lng: -49.2203 },
  { id: "uberaba",             nome: "Uberaba",                lat: -25.4859, lng: -49.2194 },
  { id: "umbara",              nome: "Umbará",                 lat: -25.5679, lng: -49.2852 },
  { id: "vilaizabel",          nome: "Vila Izabel",            lat: -25.4578, lng: -49.2947 },
  { id: "vistaalegre",         nome: "Vista Alegre",           lat: -25.4091, lng: -49.2915 },
  { id: "xaxim",               nome: "Xaxim",                  lat: -25.5065, lng: -49.2641 },
  { id: "aguaverde",           nome: "Água Verde",             lat: -25.4531, lng: -49.2779 },
];
const MAPA_BAIRROS_OUTROS = { id: "outros", nome: "Outros", lat: -25.4850, lng: -49.2200 };

const MAPA_CIDADES = [
  { id: "cwb", nome: "Curitiba",            lat: -25.4284, lng: -49.2733 },
  { id: "bc",  nome: "Balneário Camboriú",  lat: -26.9906, lng: -48.6349 },
  { id: "sjp", nome: "S. José dos Pinhais", lat: -25.5301, lng: -49.2064 },
  { id: "joi", nome: "Joinville",           lat: -26.3045, lng: -48.8487 },
  { id: "fln", nome: "Florianópolis",       lat: -27.5954, lng: -48.5480 },
  { id: "blu", nome: "Blumenau",            lat: -26.9194, lng: -49.0661 },
  { id: "pg",  nome: "Ponta Grossa",        lat: -25.0950, lng: -50.1619 },
  { id: "mga", nome: "Maringá",             lat: -23.4205, lng: -51.9331 },
];
const MAPA_CIDADES_OUTROS = { id: "outros", nome: "Outros", lat: -25.6000, lng: -50.0000 };

// Apelidos/abreviações comuns digitadas no cadastro (texto livre) que não batem
// com o nome oficial do bairro, mapeados após normalização (sem acento/pontuação).
const ALIASES_REGIAO = {
  "alto da xv": "alto da rua xv",
  "sta felicidade": "santa felicidade",
  "cic": "cidade industrial",
  "sao jose dos pinhais": "s jose dos pinhais",
};

const DIACRITICOS = new RegExp("[̀-ͯ]", "g");

function normalizar(str) {
  return (str || "")
    .normalize("NFD").replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buscarCoordenada(nome, lista) {
  const alvo = normalizar(nome);
  if (!alvo) return null;
  const chave = ALIASES_REGIAO[alvo] || alvo;
  return lista.find((r) => normalizar(r.nome) === chave) || null;
}

module.exports = {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada, normalizar,
};

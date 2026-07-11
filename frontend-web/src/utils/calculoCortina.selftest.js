import {
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
  calcularQuantForro,
} from './calculoCortina.js';

const entrada = {
  tipoOS: 'CORTINA',
  feitaPor: 'POR ALTURA',
  espacador: '7,00',
  tipoWave: 'G',
  abertura: 'SEM ABERTURA',
  larguraTrilho: 4.92,
  larguraTecido: 3.3,
  alturaCortina: 2.84,
  vendeuBarraAplicada: 'NÃO',
  alturaBarra: 0.5,
  quantTomas: 0,
  tamanhoTomas: 0,
};

const resultado = {
  clipesSemAbertura: clipesSemAbertura(entrada),
  quantTecidoCortina: calcularQuantTecidoCortina(entrada),
  quantEntretela: calcularQuantEntretela(entrada),
  quantBarrado: calcularQuantBarrado(entrada),
};
resultado.sobraBarrado = calcularSobraBarrado({ ...entrada, quantBarrado: resultado.quantBarrado });

const esperado = {
  clipesSemAbertura: 74,
  quantTecidoCortina: '4 alturas x 3,45 = 14,00 mts',
  quantEntretela: '12,06 mts',
  quantBarrado: '',
  sobraBarrado: 'VENDER BARRADO',
};

let ok = true;
for (const chave of Object.keys(esperado)) {
  if (resultado[chave] !== esperado[chave]) {
    ok = false;
    console.error(`FALHOU [${chave}]: esperado ${JSON.stringify(esperado[chave])}, obtido ${JSON.stringify(resultado[chave])}`);
  }
}

const casosForro = {
  forro_franzida13_semAbertura: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Franzida 1,3', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '5 alturas x 2,91 = 15,00 mts',
  },
  forro_franzida18_comAbertura: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Franzida 1,8', abertura: 'COM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '7 alturas x 2,91 = 20,50 mts',
  },
  forro_outros_calculoManual: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'Outros', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: 'Cálculo manual necessário (tipo wave = Outros)',
  },
  forro_G_regressao: {
    entrada: {
      tecidoForro: 'Microfibra branca', larguraForro: 1.50, larguraTrilho: 4.92,
      tipoWave: 'G', abertura: 'SEM ABERTURA', forroCosturado: 'JUNTO',
      alturaCortina: 2.84, alturaBarraForro: 0, espacador: '7,00', franzimento: 0,
    },
    esperado: '8 alturas x 2,91 = 23,50 mts',
  },
};

for (const [nome, caso] of Object.entries(casosForro)) {
  const obtido = calcularQuantForro(caso.entrada);
  if (obtido !== caso.esperado) {
    ok = false;
    console.error(`FALHOU [${nome}]: esperado ${JSON.stringify(caso.esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

if (ok) {
  console.log('OK: calculoCortina.js bate com o caso de teste da planilha.');
  process.exit(0);
} else {
  process.exit(1);
}

import {
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
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

if (ok) {
  console.log('OK: calculoCortina.js bate com o caso de teste da planilha.');
  process.exit(0);
} else {
  process.exit(1);
}

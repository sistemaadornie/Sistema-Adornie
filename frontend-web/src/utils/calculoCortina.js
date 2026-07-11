function ceilingTo(value, significance) {
  if (!significance) return 0;
  return Math.ceil(value / significance) * significance;
}

function roundUp(value, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.ceil(value * f) / f;
}

function fmt(value, digits = 2) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function passoEspacador(espacador) {
  const v = String(espacador).trim();
  if (v === '3,6' || v === '3.6') return 0.036;
  if (v === '5,00' || v === '5,0' || v === '5') return 0.05;
  if (v === '7,00' || v === '7') return 0.07;
  return null;
}

function fatorWave(tipoWave) {
  if (tipoWave === 'P') return 0.1;
  if (tipoWave === 'M') return 0.13;
  return 0.16;
}

function fatorEntretelaBase(tipoWave) {
  if (tipoWave === 'P') return 0.16;
  if (tipoWave === 'M') return 0.19;
  return 0.22;
}

function fatorEntretelaAbertura(tipoWave) {
  if (tipoWave === 'P') return 0.32;
  if (tipoWave === 'M') return 0.38;
  return 0.44;
}

function osValida(tipoOS) {
  return tipoOS === 'CORTINA' || tipoOS === 'FORRO + CORTINA';
}

function clipesAberturaCentral({ tipoOS, abertura, espacador, larguraTrilho }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  const passo = passoEspacador(espacador);
  if (!(abertura === 'COM ABERTURA' && larguraTrilho > 0 && passo !== null)) return '';

  const step1 = ceilingTo(larguraTrilho / passo, 2);
  const step2 = ceilingTo(step1 / 2, 2);
  return step2 + 2;
}

function clipesSemAbertura({ tipoOS, abertura, espacador, larguraTrilho }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  const passo = passoEspacador(espacador);
  if (!(abertura === 'SEM ABERTURA' && larguraTrilho > 0 && passo !== null)) return '';

  return ceilingTo(larguraTrilho / passo, 2) + 2;
}

function larguraPainelUnico({ espacador, larguraTrilho, tipoWave }) {
  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);
  return (a * 2 + 2) * wave + 0.3;
}

function larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave }) {
  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);
  const b = roundUp(((a * 2) / 2) / 2, 0);
  return (b * 2 + 2) * wave + 0.3;
}

function larguraPainelNecessaria({ espacador, larguraTrilho, tipoWave, abertura }) {
  if (abertura === 'COM ABERTURA') {
    return larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave }) * 2;
  }
  return larguraPainelUnico({ espacador, larguraTrilho, tipoWave });
}

function calcularQuantTecidoCortina({
  tipoOS, feitaPor, abertura, espacador, larguraTrilho, tipoWave, larguraTecido,
  alturaCortina, vendeuBarraAplicada, alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (!larguraTrilho || !espacador || !tipoWave || !abertura) return '';

  const larguraPainel = larguraPainelNecessaria({ espacador, larguraTrilho, tipoWave, abertura });

  if (feitaPor === 'POR LARGURA') {
    const alturaMinima =
      vendeuBarraAplicada === 'SIM'
        ? alturaCortina + 0.11
        : alturaCortina + 0.11 + alturaBarra + quantTomas * tamanhoTomas * 2;

    if (larguraTecido >= alturaMinima) {
      return `${fmt(larguraPainel)} mts`;
    }
    return 'Faltou tecido p/ cortina';
  }

  if (feitaPor === 'POR ALTURA') {
    if (!larguraTecido) return 'Informar largura do tecido';

    const numAlturas = roundUp(larguraPainel / larguraTecido, 0);
    const alturaTotal = alturaCortina + 0.11 + alturaBarra + quantTomas * tamanhoTomas * 2;
    const totalMts = ceilingTo(numAlturas * alturaTotal, 0.5);

    return `${numAlturas} alturas x ${fmt(alturaTotal)} = ${fmt(totalMts)} mts`;
  }

  return '';
}

function calcularQuantEntretela({ tipoOS, abertura, espacador, larguraTrilho, tipoWave }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (!larguraTrilho || !espacador || !abertura) return '';

  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);

  let valor;
  if (abertura === 'COM ABERTURA') {
    const b = roundUp(((a * 2) / 2) / 2, 0);
    valor = (b * 2 + 2) * wave * 2 + fatorEntretelaAbertura(tipoWave);
  } else {
    valor = (a * 2 + 2) * wave + fatorEntretelaBase(tipoWave);
  }

  return `${fmt(valor)} mts`;
}

function calcularQuantBarrado({
  tipoOS, feitaPor, abertura, espacador, larguraTrilho, tipoWave, larguraTecido,
  vendeuBarraAplicada, alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (feitaPor === 'POR ALTURA') return '';
  if (vendeuBarraAplicada !== 'SIM') return '0,00 mts';
  if (!larguraTrilho || !espacador) return '';

  const larguraBarra = alturaBarra * 2 + 0.04 + quantTomas * tamanhoTomas * 2;

  if (larguraBarra > larguraTecido) return 'Faltou tecido p/ barrado';

  let valor;
  if (abertura === 'COM ABERTURA') {
    const ladoUnico = larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave });
    valor = larguraBarra * 2 <= larguraTecido ? ladoUnico : ladoUnico * 2;
  } else {
    valor = larguraPainelUnico({ espacador, larguraTrilho, tipoWave });
  }

  return `${fmt(valor)} mts`;
}

function calcularSobraBarrado({
  tipoOS, abertura, larguraTecido, vendeuBarraAplicada,
  alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0, quantBarrado,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (quantBarrado === 'NÃO PRECISA DE BARRADO') return 'SEM SOBRA DE TECIDO';
  if (vendeuBarraAplicada === 'NÃO') return 'VENDER BARRADO';
  if (!quantBarrado) return '';

  const larguraBarra = alturaBarra * 2 + 0.04 + quantTomas * tamanhoTomas * 2;
  const sobra =
    abertura === 'COM ABERTURA' ? larguraTecido - larguraBarra * 2 : larguraTecido - larguraBarra;

  if (sobra < 0) return 'não cabe na largura do tecido';
  return `${quantBarrado} x ${fmt(sobra)} mts`;
}

const FATORES_FRANZIDA = {
  'Franzida 1,3': 1.3,
  'Franzida 1,8': 1.8,
};

function calcularQuantForro({
  abertura, espacador, larguraTrilho, tipoWave, tecidoForro, larguraForro,
  alturaCortina, alturaBarraForro = 0, forroCosturado, franzimento = 0,
}) {
  if (!tecidoForro) return '';
  if (!larguraForro) return 'Informar largura do tecido do forro';

  let x50 = 0;
  if (forroCosturado === 'JUNTO') {
    if (tipoWave === 'Outros') {
      return 'Cálculo manual necessário (tipo wave = Outros)';
    }
    const fatorFranzida = FATORES_FRANZIDA[tipoWave];
    if (fatorFranzida) {
      x50 = larguraTrilho * fatorFranzida + (abertura === 'COM ABERTURA' ? 0.2 : 0.1);
    } else {
      const wave = fatorWave(tipoWave);
      const clipesCentral = clipesAberturaCentral({ abertura, espacador, larguraTrilho });
      const clipesSemAb = clipesSemAbertura({ abertura, espacador, larguraTrilho });
      x50 =
        abertura === 'COM ABERTURA'
          ? (clipesCentral || 0) * wave + 0.1 + ((clipesCentral || 0) * wave + 0.1)
          : (clipesSemAb || 0) * wave + 0.1;
    }
  } else if (forroCosturado === 'SEPARADO') {
    x50 = larguraTrilho * franzimento + (abertura === 'COM ABERTURA' ? 0.2 : 0.1);
  }

  const x51 = alturaCortina + 0.07 + alturaBarraForro;
  const x52 = larguraForro > 0 ? roundUp(x50 / larguraForro, 0) : 0;

  if (larguraForro >= x51) {
    return `${fmt(x50)} mts`;
  }
  const total = ceilingTo(x52 * x51, 0.5);
  return `${x52} alturas x ${fmt(x51)} = ${fmt(total)} mts`;
}

export {
  clipesAberturaCentral,
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
  calcularQuantForro,
};

"use strict";

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inicioMes(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function inicioTrimestre(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function inicioAno(d) {
  return new Date(d.getFullYear(), 0, 1);
}

function inicioDoPeriodo(periodo, hoje) {
  if (periodo === "trimestre") return inicioTrimestre(hoje);
  if (periodo === "ano") return inicioAno(hoje);
  return inicioMes(hoje);
}

function getPeriodoAtual(periodo, hoje = new Date()) {
  return { inicio: toISODate(inicioDoPeriodo(periodo, hoje)), fim: toISODate(hoje) };
}

function getPeriodoAnterior(periodo, hoje = new Date()) {
  const inicioAtual = inicioDoPeriodo(periodo, hoje);
  const fimAnterior = new Date(inicioAtual);
  fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = inicioDoPeriodo(periodo, fimAnterior);
  return { inicio: toISODate(inicioAnterior), fim: toISODate(fimAnterior) };
}

module.exports = { getPeriodoAtual, getPeriodoAnterior };

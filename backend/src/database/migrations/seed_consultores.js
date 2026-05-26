/**
 * Seed: cria/ativa todos os consultores (vendedores)
 * Email: primeironome@gmail.com  |  Senha: primeironome123456789
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const db     = require("../db");

const EMPRESA_ID = 1;
const SETOR_ID   = 3; // Comercial

const CONSULTORES = [
  { nome: "DAG",             telefone: "(41) 99231-8265", email_ref: "vendas3@adornie.com.br"         },
  { nome: "ARIELA",          telefone: "(41) 33244-3205", email_ref: null                             },
  { nome: "BARBARA",         telefone: "(41) 98902-1455", email_ref: "barbarasitta@outlook.com"       },
  { nome: "BEATRIZ",         telefone: null,              email_ref: "bea.oliveiramello@gmail.com"    },
  { nome: "GRAZI GALDINO",   telefone: "(41) 99264-3696", email_ref: "vendas2@adornie.com.br"         },
  { nome: "GUSTAVO CELANTE", telefone: "(41) 99729-7140", email_ref: "gustavo@adornie.com.br"         },
  { nome: "HERBERT",         telefone: "(41) 99842-3450", email_ref: "herbert@adornie.com.br"         },
  { nome: "LAURA BACH",      telefone: null,              email_ref: null                             },
  { nome: "MARIANE",         telefone: "(41) 98795-7074", email_ref: null                             },
  { nome: "REBECCA",         telefone: "(41) 98701-7732", email_ref: null                             },
  { nome: "NATALIA WITTS",   telefone: "(11) 91612-5111", email_ref: "vendas5@adornie.com.br"         },
  { nome: "RAFAELLA SARTORI",telefone: "(41) 98515-8602", email_ref: null                             },
  { nome: "THAYS",           telefone: "(41) 98902-9125", email_ref: "vendas6@adornie.com.br"         },
];

function primeiroNome(nome) {
  return nome.split(" ")[0].toLowerCase();
}

async function run() {
  for (const c of CONSULTORES) {
    const login = primeiroNome(c.nome);
    const email = `${login}@gmail.com`;
    const senha = `${login}123456789`;
    const hash  = await bcrypt.hash(senha, 10);

    // Verifica se já existe pelo email de login
    const existe = await db.query(
      `SELECT id, status FROM usuarios WHERE email = $1 AND empresa_id = $2`,
      [email, EMPRESA_ID]
    );

    if (existe.rows.length > 0) {
      // Já existe → só garante que está ativo
      await db.query(
        `UPDATE usuarios SET status = 'aprovado', nome_completo = $1 WHERE id = $2`,
        [c.nome, existe.rows[0].id]
      );
      console.log(`✔ Ativado:  ${c.nome} (${email})`);
    } else {
      // Não existe → insere
      await db.query(
        `INSERT INTO usuarios (empresa_id, email, senha, nome_completo, setor_id, status)
         VALUES ($1, $2, $3, $4, $5, 'aprovado')`,
        [EMPRESA_ID, email, hash, c.nome, SETOR_ID]
      );
      console.log(`✚ Criado:   ${c.nome} (${email}) senha: ${senha}`);
    }
  }
  console.log("\nPronto! Todos os consultores estão ativos.");
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error("ERRO:", e.message); process.exit(1); });

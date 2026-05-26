const fs   = require("fs");
const path = require("path");
const db   = require("./db");

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node run-migration.js <arquivo.sql>");
    process.exit(1);
  }

  const sqlPath = path.resolve(__dirname, "migrations", file);
  if (!fs.existsSync(sqlPath)) {
    console.error(`Arquivo não encontrado: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`Executando ${file}...`);

  try {
    await db.query(sql);
    console.log("Migration executada com sucesso.");
  } catch (err) {
    console.error("Erro ao executar migration:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

run();

const db = require("./src/database/db");
const bcrypt = require("bcryptjs");

async function createAdmin() {
  const email = "leoadm@gmail.com";
  const password = "ana010484";
  const name = "Leo Administrador";
  const empresaId = 1;
  const hash = await bcrypt.hash(password, 10);
  
  // 1. Check if user already exists
  const existing = await db.query("SELECT id FROM usuarios WHERE email = $1", [email]);
  let userId;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    await db.query("UPDATE usuarios SET senha = $1, nome_completo = $2, status = 'aprovado' WHERE id = $3", [hash, name, userId]);
    console.log("User updated.");
  } else {
    const insert = await db.query(
      "INSERT INTO usuarios (empresa_id, email, senha, nome_completo, status) VALUES ($1, $2, $3, $4, 'aprovado') RETURNING id",
      [empresaId, email, hash, name]
    );
    userId = insert.rows[0].id;
    console.log("User created.");
  }
  
  // 2. Fetch all permissions from database
  const perms = await db.query("SELECT id, codigo FROM permissoes");
  console.log(`Found ${perms.rows.length} permissions.`);
  
  // 3. Clear existing user permissions
  await db.query("DELETE FROM usuario_permissoes WHERE usuario_id = $1", [userId]);
  
  // 4. Insert all permissions for this user
  for (const perm of perms.rows) {
    await db.query("INSERT INTO usuario_permissoes (usuario_id, permissao_id) VALUES ($1, $2)", [userId, perm.id]);
  }
  
  console.log(`Successfully assigned all ${perms.rows.length} permissions to user ${email}.`);
}

createAdmin()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });

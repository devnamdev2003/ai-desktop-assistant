const { Client } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL;

async function createTables() {
  console.log('Connecting to Neon PostgreSQL database...');

  // Parse connection details and ensure SSL is enabled
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('Successfully connected to Neon PostgreSQL.');

    console.log('Running DDL migrations...');

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        full_name VARCHAR(255),
        avatar_url VARCHAR(1024),
        google_id VARCHAR(128) UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_superuser BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_users_id ON users(id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id);`);
    console.log('  ✔ Created table: users');

    // 2. Refresh Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_refresh_tokens_id ON refresh_tokens(id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_refresh_tokens_token_hash ON refresh_tokens(token_hash);`);
    console.log('  ✔ Created table: refresh_tokens');

    // 3. Conversations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_conversations_id ON conversations(id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations(user_id);`);
    console.log('  ✔ Created table: conversations');

    // 4. Chat Messages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender VARCHAR(32) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_chat_messages_id ON chat_messages(id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id ON chat_messages(conversation_id);`);
    console.log('  ✔ Created table: chat_messages');

    // 5. Alembic Version Table (to keep Alembic in sync)
    await client.query(`
      CREATE TABLE IF NOT EXISTS alembic_version (
        version_num VARCHAR(32) NOT NULL,
        CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
      );
    `);
    const versionCheck = await client.query(`SELECT version_num FROM alembic_version LIMIT 1;`);
    if (versionCheck.rows.length === 0) {
      await client.query(`INSERT INTO alembic_version (version_num) VALUES ('001_initial_schema');`);
      console.log('  ✔ Registered Alembic migration: 001_initial_schema');
    }

    // Verify all created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\nAll public tables in database:');
    res.rows.forEach((row) => console.log(`  • ${row.table_name}`));

    console.log('\nAll tables created and verified successfully!');
  } catch (err) {
    console.error('Database migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTables();

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function getSchema() {
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'sp_v2_%'
      ORDER BY table_name
    `);
    
    console.log('=== SettlePaisa V2 Database Schema ===\n');
    
    for (const { table_name } of tablesResult.rows) {
      console.log(`\n## Table: ${table_name}\n`);
      
      // Get columns
      const columnsResult = await pool.query(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);
      
      console.log('| Column | Type | Nullable | Default |');
      console.log('|--------|------|----------|---------|');
      
      for (const col of columnsResult.rows) {
        const type = col.character_maximum_length 
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type;
        const nullable = col.is_nullable === 'YES' ? 'Yes' : 'No';
        const def = col.column_default || '-';
        console.log(`| ${col.column_name} | ${type} | ${nullable} | ${def} |`);
      }
      
      // Get indexes
      const indexesResult = await pool.query(`
        SELECT 
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = $1
          AND schemaname = 'public'
        ORDER BY indexname
      `, [table_name]);
      
      if (indexesResult.rows.length > 0) {
        console.log('\n**Indexes:**');
        for (const idx of indexesResult.rows) {
          console.log(`- ${idx.indexname}`);
        }
      }
      
      // Get foreign keys
      const fkResult = await pool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      `, [table_name]);
      
      if (fkResult.rows.length > 0) {
        console.log('\n**Foreign Keys:**');
        for (const fk of fkResult.rows) {
          console.log(`- ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        }
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getSchema();

import 'dotenv/config';
import fs from 'node:fs/promises';
import {pool} from './db.js';

let client;
try {
  client=await pool.connect();
  await client.query('BEGIN');
  await client.query(await fs.readFile(new URL('../sql/centre-photos.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');
  console.log('Centre photo galleries enabled. Existing covers preserved.');
} catch(error) {
  if(client) await client.query('ROLLBACK');
  console.error(error.message); process.exitCode=1;
} finally { client?.release(); await pool.end(); }

import 'dotenv/config'; import fs from 'node:fs/promises'; import {pool} from './db.js';
try{await pool.query(await fs.readFile(new URL('../sql/schema.sql',import.meta.url),'utf8'));console.log('Database schema initialized.')}catch(e){console.error(e.message);process.exitCode=1}finally{await pool.end()}

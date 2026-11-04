import 'dotenv/config'; import pg from 'pg'; const {Pool}=pg;
export const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false,max:10,connectionTimeoutMillis:10000});
pool.on('error',e=>console.error('PostgreSQL pool error:',e.message));

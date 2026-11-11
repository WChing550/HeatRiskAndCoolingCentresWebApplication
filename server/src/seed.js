import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function seedAdmin() {
  const adminEmail = 'admin@example.com';
  const plainPassword = 'ChangeMe!2026';

  try {
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (!existingUser.rowCount) {
      const passwordHash = await bcrypt.hash(plainPassword, 12);

      await pool.query(
        `INSERT INTO users (full_name, email, username, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        ['System Administrator', adminEmail, 'admin', passwordHash, 'admin']
      );

      console.log(`Demo admin created: ${adminEmail} / ${plainPassword}`);
    } else {
      console.log('Admin already exists.');
    }

    console.log('No centres seeded: add only verified real Kuala Lumpur facilities.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedAdmin();
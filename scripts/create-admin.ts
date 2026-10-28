#!/usr/bin/env -S npx tsx

/**
 * CLI script to create an admin account in sanakenno-next.
 *
 * Usage: pnpm exec tsx scripts/create-admin.ts
 */

import { createInterface } from 'node:readline';
import argon2 from 'argon2';
import { createDb } from '../packages/server/src/db/connection.js';
import {
  createAdminUser,
  getAdminByUsername,
} from '../packages/server/src/features/admin-auth/admin-auth.queries.js';

const MIN_PASSWORD_LENGTH = 12;

function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf-8');

      let input = '';
      const onData = (chunk: string) => {
        for (const ch of chunk) {
          if (ch === '\n' || ch === '\r' || ch === '\u0004') {
            stdin.setRawMode(false);
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            rl.close();
            resolve(input);
            return;
          } else if (ch === '\u0003') {
            process.exit(1);
          } else if (ch === '\u007F' || ch === '\b') {
            if (input.length > 0) {
              input = input.slice(0, -1);
            }
          } else {
            input += ch;
          }
        }
      };

      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const dbPath = process.env.DATABASE_PATH || './sanakenno.db';
  const db = createDb(dbPath);

  try {
    console.log('--- Luo Sanakenno-ylläpitäjä ---\n');

    const username = (await prompt('Käyttäjätunnus: ')).trim();
    if (!username) {
      console.error('Käyttäjätunnus ei voi olla tyhjä.');
      process.exit(1);
    }

    const existing = await getAdminByUsername(db, username);
    if (existing) {
      console.error(`Käyttäjätunnus '${username}' on jo olemassa.`);
      process.exit(1);
    }

    const password = await prompt('Salasana (vähintään 12 merkkiä): ', true);
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`Salasanan on oltava vähintään ${MIN_PASSWORD_LENGTH} merkkiä.`);
      process.exit(1);
    }

    const confirmPassword = await prompt('Vahvista salasana: ', true);
    if (password !== confirmPassword) {
      console.error('Salasanat eivät täsmää.');
      process.exit(1);
    }

    console.log('\nTiivistetään salasana argon2id:llä...');
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const adminId = await createAdminUser(db, username, hash);
    console.log(`\nYlläpitäjä '${username}' (id: ${adminId}) luotu onnistuneesti!`);
  } finally {
    await db.destroy();
  }
}

void main();

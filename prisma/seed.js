/* eslint-disable */
const { PrismaClient, Role } = require('@prisma/client');
const argon2 = require('argon2');

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const maskEmail = (email) => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '<invalid>';
  return `${local[0]}***@${domain}`;
};

async function main() {
  const emailRaw = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!emailRaw || !password) {
    console.log('[seed] ADMIN_EMAIL not set, skipping');
    return;
  }

  const email = emailRaw.toLowerCase().trim();

  if (!PASSWORD_REGEX.test(password)) {
    throw new Error(
      '[seed] ADMIN_PASSWORD must be 8-128 chars with at least one lower, one upper, and one digit',
    );
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const sameHash = await argon2.verify(existing.passwordHash, password).catch(() => false);
      if (sameHash && existing.role === Role.ADMIN) {
        console.log(`[seed] admin already up to date: ${maskEmail(email)}`);
        return;
      }
      const passwordHash = sameHash ? existing.passwordHash : await argon2.hash(password, ARGON_OPTS);
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: Role.ADMIN },
      });
      console.log(`[seed] admin updated: ${maskEmail(email)}`);
      return;
    }
    const passwordHash = await argon2.hash(password, ARGON_OPTS);
    await prisma.user.create({
      data: { email, passwordHash, role: Role.ADMIN },
    });
    console.log(`[seed] admin created: ${maskEmail(email)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(
    `[seed] failed: ${err && err.stack ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});

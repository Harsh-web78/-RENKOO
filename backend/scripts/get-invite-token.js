const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invite = await prisma.organizationInvite.findUnique({
    where: { id: 'cmtl6vcu00001v3ronitee6lp' },
    select: { token: true, email: true, role: true, organizationId: true }
  });
  console.log(JSON.stringify(invite, null, 2));
}

main().finally(() => prisma.$disconnect());

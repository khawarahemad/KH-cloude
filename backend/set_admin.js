// Promoting a user to ADMIN in KH Cloud database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: node set_admin.js <user-email>");
    const allUsers = await prisma.user.findMany();
    console.log("\nAvailable registered users in database:");
    allUsers.forEach(u => {
      console.log(`- ${u.name} (${u.email}) [Current Role: ${u.role}]`);
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.error(`User with email "${email}" not found.`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' }
  });

  console.log(`\n🎉 Success! Promoted "${user.name}" (${user.email}) to ADMIN!`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const plans = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'For small businesses getting started with SEO growth.',
    monthlyPrice: 29,
    yearlyPrice: 290,
    currency: 'USD',
    active: true,
    public: true,
    maxWebsites: 1,
    maxKeywords: 500,
    maxCompetitors: 5,
    maxAiPrompts: 100,
    maxAiScans: 10,
    maxUsers: 1,
    maxClients: 0,
    maxReports: 5,
    maxCrawlCredits: 10,
    maxApiCalls: 1000,
    maxAiCredits: 100,
  },
  {
    code: 'PRO',
    name: 'Pro',
    description: 'For growing businesses and serious SEO teams.',
    monthlyPrice: 79,
    yearlyPrice: 790,
    currency: 'USD',
    active: true,
    public: true,
    maxWebsites: 3,
    maxKeywords: 2500,
    maxCompetitors: 15,
    maxAiPrompts: 500,
    maxAiScans: 50,
    maxUsers: 3,
    maxClients: 0,
    maxReports: 25,
    maxCrawlCredits: 50,
    maxApiCalls: 5000,
    maxAiCredits: 500,
  },
  {
    code: 'AGENCY',
    name: 'Agency',
    description: 'For agencies managing multiple clients.',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    currency: 'USD',
    active: true,
    public: true,
    maxWebsites: 15,
    maxKeywords: 10000,
    maxCompetitors: 50,
    maxAiPrompts: 2000,
    maxAiScans: 200,
    maxUsers: 10,
    maxClients: 25,
    maxReports: 100,
    maxCrawlCredits: 200,
    maxApiCalls: 20000,
    maxAiCredits: 2000,
  },
  {
    code: 'SCALE',
    name: 'Scale',
    description: 'For larger teams with advanced usage requirements.',
    monthlyPrice: 499,
    yearlyPrice: 4990,
    currency: 'USD',
    active: true,
    public: true,
    maxWebsites: 50,
    maxKeywords: 50000,
    maxCompetitors: 200,
    maxAiPrompts: 10000,
    maxAiScans: 1000,
    maxUsers: 50,
    maxClients: 100,
    maxReports: 500,
    maxCrawlCredits: 1000,
    maxApiCalls: 100000,
    maxAiCredits: 10000,
  },
];

async function main() {
  console.log('?? Updating RENKOO plans to USD...');

  for (const plan of plans) {
    const result = await prisma.plan.upsert({
      where: {
        code: plan.code,
      },
      update: plan,
      create: plan,
    });

    console.log(
      `? ${result.code} — $${result.monthlyPrice}/month — $${result.yearlyPrice}/year`,
    );
  }

  console.log('?? USD plans updated successfully.');
}

main()
  .catch((error) => {
    console.error('? Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

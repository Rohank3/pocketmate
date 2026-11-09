import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database reset for fresh testing...");

  // 1. Delete all operational activity records
  const deletedMessages = await prisma.chatMessage.deleteMany({});
  console.log(`• Deleted ${deletedMessages.count} chat messages.`);

  const deletedThreads = await prisma.chatThread.deleteMany({});
  console.log(`• Deleted ${deletedThreads.count} chat threads.`);

  const deletedOverrides = await prisma.transactionCategoryOverride.deleteMany({});
  console.log(`• Deleted ${deletedOverrides.count} transaction category overrides.`);

  const deletedRules = await prisma.merchantCategoryRule.deleteMany({});
  console.log(`• Deleted ${deletedRules.count} merchant category rules.`);

  const deletedEntries = await prisma.budgetEntry.deleteMany({});
  console.log(`• Deleted ${deletedEntries.count} budget entries.`);

  const deletedSplitItems = await prisma.splitItem.deleteMany({});
  console.log(`• Deleted ${deletedSplitItems.count} split items.`);

  const deletedSplitRecords = await prisma.splitRecord.deleteMany({});
  console.log(`• Deleted ${deletedSplitRecords.count} split records.`);

  const deletedEvents = await prisma.scheduledEvent.deleteMany({});
  console.log(`• Deleted ${deletedEvents.count} scheduled events.`);

  const deletedContacts = await prisma.contact.deleteMany({});
  console.log(`• Deleted ${deletedContacts.count} contacts.`);

  // 2. Reset all budget category expenditures to zero
  const updatedCategories = await prisma.budgetCategory.updateMany({
    data: { currentSpent: 0.0 },
  });
  console.log(`• Reset ${updatedCategories.count} budget categories to $0.00 spent.`);

  // 3. Ensure Dave Chen sandbox user exists with pristine baseline categories
  const daveEmail = "dave.chen.pm@personal.example.com";
  const user = await prisma.user.upsert({
    where: { email: daveEmail },
    update: {
      name: "Dave Chen",
      persona: "GENERAL",
    },
    create: {
      email: daveEmail,
      name: "Dave Chen",
      persona: "GENERAL",
    },
  });

  const baselineCategories = [
    { name: "Groceries", monthlyCap: 350.0, color: "#10b981" },
    { name: "Dining", monthlyCap: 250.0, color: "#3b82f6" },
    { name: "Shopping", monthlyCap: 200.0, color: "#a855f7" },
    { name: "Entertainment", monthlyCap: 150.0, color: "#6366f1" },
  ];

  for (const cat of baselineCategories) {
    await prisma.budgetCategory.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: cat.name,
        },
      },
      update: {
        monthlyCap: cat.monthlyCap,
        currentSpent: 0.0,
        color: cat.color,
      },
      create: {
        userId: user.id,
        name: cat.name,
        monthlyCap: cat.monthlyCap,
        currentSpent: 0.0,
        color: cat.color,
      },
    });
  }

  console.log("✅ Database successfully cleared and restored to pristine testing baseline!");
}

main()
  .catch((e) => {
    console.error("❌ Reset Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

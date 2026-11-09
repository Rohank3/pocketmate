import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Cleaning up rogue alert scheduled events...");
  const deletedEvents = await prisma.scheduledEvent.deleteMany({
    where: {
      OR: [
        { title: { contains: "Alert", mode: "insensitive" } },
        { title: { contains: "Soft Cap", mode: "insensitive" } },
        { title: { contains: "Threshold", mode: "insensitive" } }
      ]
    }
  });
  console.log(`Deleted ${deletedEvents.count} rogue scheduled events.`);

  console.log("Updating BudgetCategory records with alertThreshold and softCap...");
  const categories = await prisma.budgetCategory.findMany();
  for (const cat of categories) {
    const softCap = cat.monthlyCap * 0.80;
    await prisma.budgetCategory.update({
      where: { id: cat.id },
      data: {
        alertThreshold: 0.80,
        softCap: softCap,
      }
    });
    console.log(`Updated ${cat.name} (Cap: $${cat.monthlyCap}) -> 80% soft cap: $${softCap}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

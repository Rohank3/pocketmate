export interface SandboxAccount {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  type: "PERSONAL" | "BUSINESS";
  initialBalance: number;
}

export const ALL_SANDBOX_ACCOUNTS: SandboxAccount[] = [
  { name: "Dave Chen", firstName: "Dave", lastName: "Chen", email: "dave.chen.pm@personal.example.com", type: "PERSONAL", initialBalance: 3450 },
  { name: "Mark Spencer", firstName: "Mark", lastName: "Spencer", email: "mark.spencer.pm@personal.example.com", type: "PERSONAL", initialBalance: 210 },
  { name: "Nexus Retail", firstName: "Nexus", lastName: "Retail", email: "nexus.retail.us@business.example.com", type: "BUSINESS", initialBalance: 8500 },
  { name: "Alex Morgan", firstName: "Alex", lastName: "Morgan", email: "alex.morgan.studio@business.example.com", type: "BUSINESS", initialBalance: 7500 },
  { name: "Oliver Wright", firstName: "Oliver", lastName: "Wright", email: "oliver.wright.us@personal.example.com", type: "PERSONAL", initialBalance: 650 },
  { name: "Leo Vance", firstName: "Leo", lastName: "Vance", email: "leo.vance.student@personal.example.com", type: "PERSONAL", initialBalance: 420 },
  { name: "Chloe Dubois", firstName: "Chloe", lastName: "Dubois", email: "chloe.dubois.design@business.example.com", type: "BUSINESS", initialBalance: 6200 },
  { name: "Elena Weber", firstName: "Elena", lastName: "Weber", email: "elena.weber.tech@business.example.com", type: "BUSINESS", initialBalance: 9400 },
  { name: "Lukas Becker", firstName: "Lukas", lastName: "Becker", email: "lukas.becker.dev@personal.example.com", type: "PERSONAL", initialBalance: 1800 },
  { name: "Camille Laurent", firstName: "Camille", lastName: "Laurent", email: "camille.laurent.art@personal.example.com", type: "PERSONAL", initialBalance: 3100 },
  { name: "Antoine Moreau", firstName: "Antoine", lastName: "Moreau", email: "antoine.moreau.cafe@business.example.com", type: "BUSINESS", initialBalance: 5750 },
  { name: "Sarah Jenkins", firstName: "Sarah", lastName: "Jenkins", email: "sarah.jenkins.exec@personal.example.com", type: "PERSONAL", initialBalance: 8200 },
  { name: "Liam Wilson", firstName: "Liam", lastName: "Wilson", email: "liam.wilson.music@personal.example.com", type: "PERSONAL", initialBalance: 520 },
  { name: "Weiming Tan", firstName: "Weiming", lastName: "Tan", email: "weiming.tan.ventures@business.example.com", type: "BUSINESS", initialBalance: 9800 },
  { name: "Kenji Sato", firstName: "Kenji", lastName: "Sato", email: "kenji.sato.gaming@personal.example.com", type: "PERSONAL", initialBalance: 4500 },
  { name: "Marco Rossi", firstName: "Marco", lastName: "Rossi", email: "marco.rossi.travel@personal.example.com", type: "PERSONAL", initialBalance: 2400 },
  { name: "Sofia Martinez", firstName: "Sofia", lastName: "Martinez", email: "sofia.martinez.food@personal.example.com", type: "PERSONAL", initialBalance: 720 },
  { name: "Daan Vandijk", firstName: "Daan", lastName: "Vandijk", email: "daan.vandijk.logistics@business.example.com", type: "BUSINESS", initialBalance: 8900 },
];

/**
 * Resolves a loose user query or contact name against the 18 live PayPal Sandbox accounts.
 */
export function findSandboxAccount(query: string): SandboxAccount | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. Direct email match
  const byEmail = ALL_SANDBOX_ACCOUNTS.find((a) => a.email.toLowerCase() === q);
  if (byEmail) return byEmail;

  // 2. Exact full name match
  const byFullName = ALL_SANDBOX_ACCOUNTS.find((a) => a.name.toLowerCase() === q);
  if (byFullName) return byFullName;

  // 3. First name exact match
  const byFirstName = ALL_SANDBOX_ACCOUNTS.find((a) => a.firstName.toLowerCase() === q);
  if (byFirstName) return byFirstName;

  // 4. Substring in full name or email prefix
  const bySubstring = ALL_SANDBOX_ACCOUNTS.find(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      q.includes(a.firstName.toLowerCase()) ||
      a.email.toLowerCase().includes(q)
  );
  if (bySubstring) return bySubstring;

  return null;
}

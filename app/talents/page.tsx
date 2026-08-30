import { TalentCalculator } from "@/components/TalentCalculator";
import { getMidnightWarriorTalentData } from "@/lib/talentCalculatorData";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Калькулятор талантов — Midnight",
  description: "Калькулятор талантов World of Warcraft для дополнения Midnight.",
};

export default async function TalentsPage() {
  try {
    const data = await getMidnightWarriorTalentData();
    return <TalentCalculator data={data} />;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("[talents] data load failed", error);
    return <TalentCalculator data={null} />;
  }
}

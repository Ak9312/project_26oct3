import BriefGenerator from "@/components/BriefGenerator";

export const metadata = { title: "Briefs · BriefRadar admin" };

export default function AdminBriefsPage() {
  return <BriefGenerator mode="admin" />;
}

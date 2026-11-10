import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BirthdayApp from "@/components/BirthdayApp";
import { loadSharedArchive, SHARE_ID_PATTERN } from "@/lib/share-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "生日档案",
  description: "一份只读的生日心意。",
  robots: { index: false, follow: false },
};

export default async function SharedBirthdayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SHARE_ID_PATTERN.test(id)) notFound();
  const archive = await loadSharedArchive(id);
  if (!archive) notFound();
  return <BirthdayApp initialArchive={archive} readOnly />;
}

import type { Metadata } from "next";
import { DownloadThankYouContent } from "./ThankYouClient";

export const metadata: Metadata = {
  title: "Check Your Email - CapVeri",
  description: "Your download link is on the way. Check your inbox.",
  robots: { index: false, follow: false },
};

export default async function DownloadThankYouPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DownloadThankYouContent slug={slug} />;
}

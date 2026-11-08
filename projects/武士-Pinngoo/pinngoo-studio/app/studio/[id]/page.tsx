import StudioClient from "./studio-client";

export const dynamic = "force-dynamic";
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  return <StudioClient id={(await params).id} />;
}

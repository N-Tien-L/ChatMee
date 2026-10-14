import { notFound } from "next/navigation";
import { PreviewWorkspace } from "./PreviewWorkspace";

/**
 * Milestone B preview of the workspace on mock data (CM-084). Development only; removed before milestone C.
 */
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewWorkspace />;
}

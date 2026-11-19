"use client";

import { useTransition } from "react";
import { updateAsset } from "@/app/(app)/admin/actions";

export function AssetToggle({ assetId, active }: { assetId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => void (await updateAsset(assetId, { active: !active })))}>
      {active ? "사용 중지" : "사용 재개"}
    </button>
  );
}

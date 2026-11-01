import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";

export const dynamic = "force-dynamic";

function validateModelLimits(modelLimits) {
  if (!modelLimits || typeof modelLimits !== "object" || Array.isArray(modelLimits)) {
    return false;
  }
  const allowedFields = ["contextWindow", "compactWindow", "maxOutput"];
  for (const [key, value] of Object.entries(modelLimits)) {
    if (typeof key !== "string" || !key.trim()) return false;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const valueKeys = Object.keys(value);
    for (const field of valueKeys) {
      if (!allowedFields.includes(field)) return false;
      const num = value[field];
      if (typeof num !== "number" || !Number.isFinite(num) || num <= 0) return false;
    }
  }
  return true;
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ modelLimits: settings.modelLimits || {} });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { modelLimits } = body;
    if (!validateModelLimits(modelLimits)) {
      return NextResponse.json({ error: "Invalid modelLimits structure" }, { status: 400 });
    }
    const updated = await updateSettings({ modelLimits });
    return NextResponse.json({ modelLimits: updated.modelLimits || {} });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { compressMessages } from "./index.js";
import { compressWithHeadroom, formatHeadroomLog, formatHeadroomSizeLog, isHeadroomPhantomSavings } from "./headroom.js";
import { injectCaveman } from "./caveman.js";
import { injectPonytail } from "./ponytail.js";
import { injectCombinedPrompt } from "./combinedPrompt.js";
import { injectCustomPrompt } from "./customPrompt.js";
import { compressWithPxpipe } from "./pxpipe.js";

function getJsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value) || "").length;
  } catch {
    return 0;
  }
}

export async function runTokenSaverPipeline({
  body,
  finalFormat,
  upstreamModel,
  tokenSaverEnabled = true,
  rtkEnabled = false,
  preTranslateRtk = null,
  headroomEnabled = false,
  headroomUrl = "",
  headroomCompressUserMessages = false,
  headroomTimeoutMs,
  cavemanEnabled = false,
  cavemanLevel = null,
  ponytailEnabled = false,
  ponytailLevel = null,
  customPromptEnabled = false,
  customPrompt = "",
  pxpipeEnabled = false,
  pxpipeMinChars,
  pxpipeTimeoutMs,
  pxpipeTransform,
  onPxpipeEvent,
  log,
  reqTag,
}) {
  const xf = [];
  let currentBody = body;

  const rtkStats = preTranslateRtk || compressMessages(currentBody, tokenSaverEnabled && rtkEnabled);
  const rtkSavedBytes = rtkStats ? Math.max(0, (rtkStats.bytesBefore || 0) - (rtkStats.bytesAfter || 0)) : 0;
  const rtkReduction = (rtkStats && rtkStats.bytesBefore > 0)
    ? rtkSavedBytes / rtkStats.bytesBefore
    : 0;

  if (rtkStats?.hits?.length) xf.push(`RTK:${rtkStats.hits.length}`);

  const bodySizeAfterRtk = getJsonBytes(currentBody);
  const isRtkActive = Boolean(preTranslateRtk || (tokenSaverEnabled && rtkEnabled));
  const shouldSkipHeadroom = isRtkActive && (rtkReduction >= 0.15 || bodySizeAfterRtk < 32 * 1024);

  const headroomDiagnostics = {};
  let headroomStats = null;
  let headroomSavedBytes = 0;

  if (tokenSaverEnabled && headroomEnabled && !shouldSkipHeadroom) {
    headroomStats = await compressWithHeadroom(currentBody, {
      enabled: true,
      url: headroomUrl,
      model: upstreamModel,
      format: finalFormat,
      compressUserMessages: headroomCompressUserMessages,
      timeoutMs: headroomTimeoutMs,
      diagnostics: headroomDiagnostics,
    });
    const headroomLine = formatHeadroomLog(headroomStats);
    const headroomSizeLine = formatHeadroomSizeLog(headroomDiagnostics);
    if (headroomLine) {
      log?.info?.("HEADROOM", `${headroomLine}${headroomSizeLine ? ` | ${headroomSizeLine}` : ""}`);
      if (isHeadroomPhantomSavings(headroomStats, headroomDiagnostics)) {
        log?.warn?.("HEADROOM", `reported token delta, but messages and outbound JSON shrank <5% | ${formatHeadroomSizeLog(headroomDiagnostics)}`);
      }
    } else {
      log?.warn?.("HEADROOM", `skipped: ${headroomDiagnostics.reason || "compression unavailable"}${headroomDiagnostics.endpoint ? ` (${headroomDiagnostics.endpoint})` : ""}`);
    }

    if (headroomDiagnostics.before?.bodyBytes && headroomDiagnostics.after?.bodyBytes) {
      headroomSavedBytes = Math.max(0, headroomDiagnostics.before.bodyBytes - headroomDiagnostics.after.bodyBytes);
    } else if (typeof headroomStats?.bytes_saved === "number") {
      headroomSavedBytes = Math.max(0, headroomStats.bytes_saved);
    } else if (typeof headroomStats?.savedBytes === "number") {
      headroomSavedBytes = Math.max(0, headroomStats.savedBytes);
    }
  } else if (tokenSaverEnabled && headroomEnabled) {
    if (rtkReduction >= 0.15) {
      headroomDiagnostics.reason = "skipped: rtk reduction >= 15%";
    } else if (bodySizeAfterRtk < 32 * 1024) {
      headroomDiagnostics.reason = "skipped: body under 32KB";
    }
    log?.warn?.("HEADROOM", `skipped: ${headroomDiagnostics.reason || "compression unavailable"}${headroomDiagnostics.endpoint ? ` (${headroomDiagnostics.endpoint})` : ""}`);
  }

  const isCavemanActive = Boolean(tokenSaverEnabled && cavemanEnabled && cavemanLevel);
  const isPonytailActive = Boolean(tokenSaverEnabled && ponytailEnabled && ponytailLevel);
  const outputStyleActive = [];

  if (isCavemanActive && isPonytailActive) {
    injectCombinedPrompt(currentBody, finalFormat, cavemanLevel, ponytailLevel);
    outputStyleActive.push("caveman", "ponytail");
    xf.push(`CAVEMAN:${cavemanLevel}`);
    xf.push(`PONYTAIL:${ponytailLevel}`);
  } else if (isCavemanActive) {
    injectCaveman(currentBody, finalFormat, cavemanLevel);
    outputStyleActive.push("caveman");
    xf.push(`CAVEMAN:${cavemanLevel}`);
  } else if (isPonytailActive) {
    injectPonytail(currentBody, finalFormat, ponytailLevel);
    outputStyleActive.push("ponytail");
    xf.push(`PONYTAIL:${ponytailLevel}`);
  }

  if (customPromptEnabled && injectCustomPrompt(currentBody, finalFormat, customPrompt)) {
    xf.push(`CUSTOMPROMPT:${customPrompt.trim().length}c`);
  }

  const bodySizeForPxpipe = getJsonBytes(currentBody);
  let pxpipeSummary = null;
  if (pxpipeEnabled && bodySizeForPxpipe >= 100 * 1024) {
    const pxpipeResult = await compressWithPxpipe(currentBody, {
      enabled: true,
      format: finalFormat,
      model: upstreamModel,
      minChars: pxpipeMinChars,
      timeoutMs: pxpipeTimeoutMs,
      transform: pxpipeTransform,
    });
    pxpipeSummary = pxpipeResult.summary;
    if (pxpipeResult.body) currentBody = pxpipeResult.body;
    if (pxpipeSummary?.applied) xf.push(`PXPIPE:${pxpipeSummary.imageCount}img`);
    try { onPxpipeEvent?.(pxpipeSummary); } catch {}
  }

  const tokenSaverStats = {
    rtk: { savedBytes: rtkSavedBytes },
    headroom: { savedBytes: headroomSavedBytes },
    outputStyle: { active: outputStyleActive },
  };

  return {
    body: currentBody,
    tokenSaverStats,
    rtkStats,
    headroomStats,
    headroomDiagnostics,
    pxpipeSummary,
    xf,
  };
}

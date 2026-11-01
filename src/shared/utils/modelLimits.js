export function resolveModelLimit(modelLimits, providerId, modelId, alias) {
  if (!modelLimits || typeof modelLimits !== "object") return null;

  const keys = [
    providerId && modelId ? `${providerId}/${modelId}` : null,
    alias && modelId ? `${alias}/${modelId}` : null,
    providerId ? `${providerId}/*` : null,
    alias ? `${alias}/*` : null,
    modelId || null,
    "*",
  ];

  for (const key of keys) {
    if (key && modelLimits[key] && typeof modelLimits[key] === "object") {
      return modelLimits[key];
    }
  }

  return null;
}

export function applyModelLimit(model, limitOverride) {
  if (!model || !limitOverride) return model;

  if (limitOverride.compactWindow) {
    model.context_length = limitOverride.compactWindow;
    if (model.capabilities) {
      model.capabilities.compactWindow = limitOverride.compactWindow;
    }
  } else if (limitOverride.contextWindow) {
    model.context_length = limitOverride.contextWindow;
  }

  if (limitOverride.contextWindow) {
    if (model.capabilities) {
      model.capabilities.contextWindow = limitOverride.contextWindow;
    }
    if ("contextWindow" in model) {
      model.contextWindow = limitOverride.contextWindow;
    }
  }

  if (limitOverride.maxOutput) {
    model.max_completion_tokens = limitOverride.maxOutput;
    if (model.capabilities) {
      model.capabilities.maxOutput = limitOverride.maxOutput;
    }
  }

  return model;
}

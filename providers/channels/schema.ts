import { z } from "zod";
import { supportedModels } from "@/providers/database/mongodb/models/model-price";

const channelConfigFields = {
  name: z.string().min(1).max(80),
  baseUrl: z.string().url().max(500),
  models: z.array(z.object({ public: z.enum(supportedModels), upstream: z.string().min(1) })).min(1),
  priority: z.coerce.number().int().min(0),
  inputCostPer1kTokensMicros: z.number().int().min(0).nullable(),
  outputCostPer1kTokensMicros: z.number().int().min(0).nullable(),
  cacheReadCostPer1kTokensMicros: z.number().int().min(0).nullable().default(null),
  cacheWriteCostPer1kTokensMicros: z.number().int().min(0).nullable().default(null),
  // 模型级成本覆盖：同一渠道内不同模型单价不同时用（如 deepseek 的 flash/pro）
  modelCosts: z.record(z.object({
    inputCostPer1kTokensMicros: z.number().int().min(0),
    outputCostPer1kTokensMicros: z.number().int().min(0),
    cacheReadCostPer1kTokensMicros: z.number().int().min(0).optional(),
    cacheWriteCostPer1kTokensMicros: z.number().int().min(0).optional(),
  })).default({}),
  enabled: z.boolean(),
  timeoutMs: z.number().int().min(1000).max(300000),
};

function validateCosts(value: { inputCostPer1kTokensMicros: number | null; outputCostPer1kTokensMicros: number | null }, context: z.RefinementCtx) {
  if ((value.inputCostPer1kTokensMicros === null) !== (value.outputCostPer1kTokensMicros === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "输入和输出成本必须同时配置或同时留空" });
  }
}

export const channelConfigSchema = z.object(channelConfigFields).strict().superRefine(validateCosts);
export const channelCreateSchema = z.object({ ...channelConfigFields, apiKey: z.string().min(1) }).strict().superRefine(validateCosts);

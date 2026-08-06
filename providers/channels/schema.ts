import { z } from "zod";

const channelConfigFields = {
  name: z.string().min(1).max(80),
  baseUrl: z.string().url().max(500),
  models: z.array(z.object({ public: z.string().min(1), upstream: z.string().min(1) })).min(1),
  priority: z.coerce.number().int().min(0),
  inputCostPer1kTokensMicros: z.number().int().min(0).nullable(),
  outputCostPer1kTokensMicros: z.number().int().min(0).nullable(),
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

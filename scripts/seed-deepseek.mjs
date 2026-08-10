import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import mongoose from "mongoose";

const root = path.resolve(import.meta.dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile(path.join(root, ".env.local"));

const MONGODB_URI = process.env.MONGODB_URI;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Pass it in the environment or add it to zmzai-relay/.env.local.");
}

if (!DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY is required. Pass the DeepSeek key in the environment.");
}

const reasoningEfforts = ["low", "medium", "high", "xhigh", "max"];
const supportedModels = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "deepseek-v4-flash", "deepseek-v4-pro"];
const channelProtocols = ["openai-compat"];

const modelPriceSchema = new mongoose.Schema({
  model: { type: String, required: true, trim: true, unique: true, maxlength: 120, enum: supportedModels },
  inputPricePer1kMicros: { type: Number, required: true, min: 0 },
  outputPricePer1kMicros: { type: Number, required: true, min: 0 },
  maxInputTokens: { type: Number, required: true, min: 1, max: 2_000_000 },
  maxOutputTokens: { type: Number, required: true, min: 1, max: 500_000 },
  allowedReasoningEfforts: { type: [String], enum: reasoningEfforts, required: true, default: () => [...reasoningEfforts] },
  enabled: { type: Boolean, required: true, default: true },
}, { strict: "throw", timestamps: true });

const modelMappingSchema = new mongoose.Schema({
  public: { type: String, required: true, trim: true },
  upstream: { type: String, required: true, trim: true },
}, { _id: false, strict: "throw" });

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  baseUrl: { type: String, required: true, trim: true, maxlength: 500 },
  apiKey: { type: String, required: true, select: false },
  protocol: { type: String, enum: channelProtocols, required: true, default: "openai-compat" },
  models: { type: [modelMappingSchema], required: true, default: [] },
  priority: { type: Number, required: true, default: 10 },
  inputCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
  outputCostPer1kTokensMicros: { type: Number, default: null, min: 0 },
  enabled: { type: Boolean, required: true, default: true },
  timeoutMs: { type: Number, required: true, default: 60000, min: 1000 },
}, { strict: "throw", timestamps: true });

const ModelPrice = mongoose.models.ModelPrice ?? mongoose.model("ModelPrice", modelPriceSchema);
const Channel = mongoose.models.Channel ?? mongoose.model("Channel", channelSchema);

function cnyYuanToMicros(value) {
  return Math.round((value * 100 * 1_000_000) / 800);
}

const prices = [
  {
    model: "deepseek-v4-flash",
    inputPricePer1kMicros: cnyYuanToMicros(0.001),
    outputPricePer1kMicros: cnyYuanToMicros(0.002),
    maxInputTokens: 1_000_000,
    maxOutputTokens: 384_000,
    allowedReasoningEfforts: ["low", "high", "xhigh", "max"],
    enabled: true,
  },
  {
    model: "deepseek-v4-pro",
    inputPricePer1kMicros: cnyYuanToMicros(0.003),
    outputPricePer1kMicros: cnyYuanToMicros(0.006),
    maxInputTokens: 1_000_000,
    maxOutputTokens: 384_000,
    allowedReasoningEfforts: ["low", "high", "xhigh", "max"],
    enabled: true,
  },
];

await mongoose.connect(MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 10_000 });

for (const price of prices) {
  await ModelPrice.findOneAndUpdate(
    { model: price.model },
    { $set: price },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

// 渠道成本是渠道级而不是模型级（usage 按渠道快照 input/outputCostPer1kTokensMicros 记账），
// flash 与 pro 单价不同，所以拆成两个官方渠道各自映射单一模型，避免 flash 流量被 pro 成本高估。
// 若早前中间版本留下过合并单渠道 deepseek-official，先清理，保证映射与成本一一对应。
await Channel.deleteMany({ name: "deepseek-official" });

const channels = [
  {
    name: "deepseek-official-flash",
    model: "deepseek-v4-flash",
    input: 0.001,
    output: 0.002,
  },
  {
    name: "deepseek-official-pro",
    model: "deepseek-v4-pro",
    input: 0.003,
    output: 0.006,
  },
];

for (const channel of channels) {
  await Channel.findOneAndUpdate(
    { name: channel.name },
    {
      $set: {
        name: channel.name,
        baseUrl: "https://api.deepseek.com",
        apiKey: DEEPSEEK_API_KEY,
        protocol: "openai-compat",
        models: [{ public: channel.model, upstream: channel.model }],
        priority: 10,
        inputCostPer1kTokensMicros: cnyYuanToMicros(channel.input),
        outputCostPer1kTokensMicros: cnyYuanToMicros(channel.output),
        enabled: true,
        timeoutMs: 120_000,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

await mongoose.disconnect();

console.log(`DeepSeek channels (${channels.map((c) => c.name).join(", ")}) and model prices have been configured.`);

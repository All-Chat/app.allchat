/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/queue.ts
import mongoose from "mongoose";

// ==========================================
// 1. MONGODB SCHEMAS (Replaces Redis)
// ==========================================
const JobSchema = new mongoose.Schema({
  queue: { type: String, required: true, index: true },
  name: { type: String, required: true },
  data: { type: Object, required: true },
  status: { type: String, default: "pending", index: true },
  result: { type: Object },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  lockedAt: { type: Date },
  opts: { type: Object, default: {} },
});

const CacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true },
  expireAt: { type: Date, required: true },
});
// Auto-delete cache documents when they expire
CacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const Job = (mongoose.models.Job as any) || mongoose.model("Job", JobSchema);
const Cache = (mongoose.models.Cache as any) || mongoose.model("Cache", CacheSchema);

// ==========================================
// 2. MOCK REDIS CLIENT (For Caching)
// ==========================================
class MockRedisClient {
  async get(key: string) {
    const doc = await Cache.findOne({ key }).lean();
    return doc?.value || null;
  }
  async set(key: string, value: string, opts?: any) {
    const ex = opts?.EX || 3600; // Default 1 hour expiry
    const expireAt = new Date(Date.now() + ex * 1000);
    await Cache.updateOne(
      { key },
      { $set: { value, expireAt } },
      { upsert: true }
    );
    return "OK";
  }
  async del(key: string) {
    await Cache.deleteOne({ key });
    return 1;
  }
}
const mockClient = new MockRedisClient();

// ==========================================
// 3. MOCK BULLMQ QUEUE (For Adding Jobs)
// ==========================================
async function addJob(queue: string, name: string, data: any, opts: any = {}) {
  const job = await Job.create({ queue, name, data, status: "pending", opts });
  return {
    id: job._id.toString(),
    waitUntilFinished: async () => {
      const start = Date.now();
      const timeout = 300000; // 5 minutes timeout for API to wait
      while (Date.now() - start < timeout) {
        const j = await Job.findById(job._id).lean();
        if (j?.status === "completed") return j.result;
        if (j?.status === "failed") throw new Error(j.error || "Job failed");
        if (!j) return null; // Removed (e.g. removeOnComplete)
        await new Promise((r) => setTimeout(r, 500)); // Poll every 500ms
      }
      throw new Error("Job timeout");
    },
  };
}

class MongoQueue {
  queueName: string;
  constructor(queueName: string) {
    this.queueName = queueName;
  }
  async add(name: string, data: any, opts?: any) {
    return addJob(this.queueName, name, data, opts);
  }
  // Allows existing code `await queue.client` to use MongoDB cache seamlessly
  get client() {
    return mockClient;
  }
}

class MongoQueueEvents {
  constructor(queueName: string) {}
}

// ==========================================
// 4. EXPORTS
// ==========================================
export const campaignQueue = new MongoQueue("campaign-processing");
export const countsQueue = new MongoQueue("counts-processing");
export const countsQueueEvents = new MongoQueueEvents("counts-processing");
export const reportQueue = new MongoQueue("report-processing");
export const reportQueueEvents = new MongoQueueEvents("report-processing");
export const statsQueue = new MongoQueue("stats-processing");
export const statsQueueEvents = new MongoQueueEvents("stats-processing");

export { Job, Cache };

import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;
const queues = new Map<string, Queue>();

export function redisConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      connectTimeout: 1500,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 2) return null;
        return 200;
      },
    });
    connection.on("error", () => {
      /* Redis is optional; campaigns fall back to an in-process dialer */
    });
  }
  return connection;
}

function queue(name: string) {
  const existing = queues.get(name);
  if (existing) return existing;
  const created = new Queue(name, { connection: redisConnection() });
  queues.set(name, created);
  return created;
}

export function campaignQueue() {
  return queue("campaign-dial");
}

export function crawlQueue() {
  return queue("site-crawl");
}

export function emailQueue() {
  return queue("workflow-email");
}

function withTimeout<T>(promise: Promise<T>, ms = 1500) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Redis unavailable")), ms)),
  ]);
}

export function addCampaignTick(campaignId: string, delay?: number) {
  return withTimeout(campaignQueue().add("tick", { campaignId }, delay ? { delay } : undefined));
}

export async function addEmailJob(data: { workflowId: string; callId: string; summary: string }) {
  const { sendWorkflowEmail } = await import("./email");
  await sendWorkflowEmail(data.workflowId, data.callId, data.summary);
}

let redisAvailable: boolean | null = null;

async function ensureRedis() {
  if (redisAvailable === false) throw new Error("Redis unavailable");
  const redis = redisConnection();
  if (redis.status === "wait") await withTimeout(redis.connect(), 1200);
}

export async function tryAddCampaignTick(campaignId: string, delay?: number) {
  try {
    await ensureRedis();
    await withTimeout(campaignQueue().add("tick", { campaignId }, delay ? { delay } : undefined));
    redisAvailable = true;
  } catch (err) {
    redisAvailable = false;
    throw err;
  }
}

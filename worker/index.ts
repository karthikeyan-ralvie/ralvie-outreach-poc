import { Worker } from "bullmq";
import { redisConnection } from "../src/lib/queues";
import { tickCampaign } from "../src/lib/campaigns/tick";
import { crawlWebsite } from "../src/lib/knowledge/crawl";
import { sendWorkflowEmail } from "../src/lib/email";

const connection = redisConnection();

new Worker(
  "campaign-dial",
  async (job) => {
    await tickCampaign(job.data.campaignId);
  },
  { connection, concurrency: 1 },
);

new Worker(
  "site-crawl",
  async (job) => {
    await crawlWebsite(job.data.docId, job.data.url);
  },
  { connection, concurrency: 2 },
);

new Worker(
  "workflow-email",
  async (job) => {
    await sendWorkflowEmail(job.data.workflowId, job.data.callId, job.data.summary || "");
  },
  { connection, concurrency: 4 },
);

console.log("Switchboard worker listening for campaign, crawl, and email jobs");

// lib/queue.ts
import { Queue, QueueEvents } from 'bullmq';

export const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1' ? {} : undefined, 
  maxRetriesPerRequest: null,
  keepAlive: 30000,
  enableReadyCheck: false,
  connectTimeout: 10000,
};

export const campaignQueue = new Queue('campaign-processing', { connection });
export const countsQueue = new Queue('counts-processing', { connection });
export const countsQueueEvents = new QueueEvents('counts-processing', { connection });
export const reportQueue = new Queue('report-processing', { connection });
export const reportQueueEvents = new QueueEvents('report-processing', { connection });

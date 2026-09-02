/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/ai-agent.ts
import { pipeline } from '@huggingface/transformers';

let extractorPromise: Promise<any> | null = null;
const getExtractor = async () => {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
};

const agentCache: Map<string, { chunks: string[], embeddings: number[][], hash: string }> = new Map();

const simpleHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
};

const chunkText = (rawDocumentation: string) => {
  const rawLines = rawDocumentation.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';
  const headerRegex = /^[A-Z][A-Z0-9 \-\/&]+:$/;

  for (const line of rawLines) {
    const trimmedLine = line.trim();
    if (headerRegex.test(trimmedLine)) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = trimmedLine + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
};

const calculateSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const aVal = vecA[i];
    const bVal = vecB[i] ?? 0;

    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const formatBeautifully = (text: string) => {
  return text.replace(/->/g, ' ➜ ');
};

export const getAgentResponse = async (userMessage: string, agentId: string, agentDetails: string) => {
  try {
    const extractor = await getExtractor();
    if (!extractor) return null;

    const hash = simpleHash(agentDetails);
    let cached = agentCache.get(agentId);

    if (!cached || cached.hash !== hash) {
      const chunks = chunkText(agentDetails);
      const embeddings: number[][] = await Promise.all(
        chunks.map(async (chunk) => {
          const output = await extractor(chunk, { pooling: 'mean', normalize: true });
          return Array.from(output.data as ArrayLike<number>);
        })
      );
      cached = { chunks, embeddings, hash };
      agentCache.set(agentId, cached);
    }

    const activeCache = cached;
    if (!activeCache) return null;

    const queryOutput = await extractor(userMessage, { pooling: 'mean', normalize: true });
    const queryEmbedding: number[] = Array.from(queryOutput.data as ArrayLike<number>);

    let bestMatch: string | null = null;
    let highestScore = 0;

    for (let i = 0; i < activeCache.chunks.length; i++) {
      const score = calculateSimilarity(queryEmbedding, activeCache.embeddings[i]);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = activeCache.chunks[i];
      }
    }

    if (highestScore > 0.30 && bestMatch) {
      return formatBeautifully(bestMatch);
    }

    return null; // No match found
  } catch (error) {
    console.error("AI Agent processing error:", error);
    return null;
  }
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline } from '@huggingface/transformers';

// --- Model Loaders ---

// Generative model for reasoning and answering (100% Free & Local)
let generatorPromise: Promise<any> | null = null;
const getGenerator = async () => {
  if (!generatorPromise) {
    // Using Qwen1.5-0.5B-Chat: a very small, fast, free local model good for instructions
    generatorPromise = pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
      device: 'cpu',
    });
  }
  return generatorPromise;
};

// Embedding model for semantic search (100% Free & Local)
let extractorPromise: Promise<any> | null = null;
const getExtractor = async () => {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
};

// --- Vector Similarity ---
const calculateSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// --- Main RAG Function ---
export const getAgentResponse = async (userMessage: string, agentId: string, agentDetails: string) => {
  try {
    const extractor = await getExtractor();
    const generator = await getGenerator();

    // 1. Chunk the knowledge base by paragraphs for better context
    const chunks = agentDetails.split('\n\n').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    if (chunks.length === 0) return null;

    // 2. Create embeddings for chunks
    const chunkEmbeddings = await Promise.all(
      chunks.map(async (chunk: string) => {
        const output = await extractor(chunk, { pooling: 'mean', normalize: true });
        return Array.from(output.data as Float32Array);
      })
    );

    // 3. Embed user question
    const queryOutput = await extractor(userMessage, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(queryOutput.data as Float32Array);

    // 4. Find the best matching chunk (Context)
    let bestMatch = null;
    let highestScore = 0;
    for (let i = 0; i < chunks.length; i++) {
      const score = calculateSimilarity(queryEmbedding, chunkEmbeddings[i]);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = chunks[i];
      }
    }

    // If similarity is too low, return null to trigger the fallback message
    if (highestScore < 0.25 || !bestMatch) {
      console.log(`[AI Agent] No relevant context found (Score: ${highestScore})`);
      return null;
    }

    console.log(`[AI Agent] Found relevant context (Score: ${highestScore}). Generating response...`);

    // 5. Construct the prompt for the Generative AI
    // Using the ChatML format which Qwen and similar models understand
    const systemPrompt = `You are a helpful AI assistant. Answer the user's question using ONLY the provided Context. If the context does not contain the exact answer (like a specific price), follow the rules in the context (e.g., say you don't have the info and offer to connect them with the team). Keep answers short and conversational.`;
    
    const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\nContext:\n${bestMatch}\n\nQuestion: ${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

    // 6. Generate the response
    const output = await generator(prompt, {
      max_new_tokens: 150,
      temperature: 0.3, // Lower temperature for more factual, less creative responses
      do_sample: true,
      repetition_penalty: 1.1,
    });

    let generatedText = output[0].generated_text;
    
    // Extract only the assistant's reply (after the last <|im_start|>assistant\n)
    const assistantTag = "<|im_start|>assistant\n";
    const assistantIndex = generatedText.lastIndexOf(assistantTag);
    
    if (assistantIndex !== -1) {
      generatedText = generatedText.substring(assistantIndex + assistantTag.length);
    }
    
    // Clean up any trailing tags
    generatedText = generatedText.split("<|im_end|>")[0].trim();

    if (!generatedText || generatedText.length === 0) {
      return null;
    }
    
    console.log(`[AI Agent] Generated Reply: ${generatedText}`);
    return generatedText;
  } catch (error) {
    console.error("AI Agent processing error:", error);
    return null;
  }
};

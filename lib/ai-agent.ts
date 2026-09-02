/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline } from '@huggingface/transformers';

// Generative model for reasoning and answering (100% Free & Local)
let generatorPromise: Promise<any> | null = null;
const getGenerator = async () => {
  if (!generatorPromise) {
    // Using Qwen1.5-0.5B-Chat
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

const calculateSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

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
        return Array.from(output.data) as number[];
      })
    );

    // 3. Embed user question
    const queryOutput = await extractor(userMessage, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(queryOutput.data) as number[];

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
    const systemPrompt = `You are a helpful AI assistant. Read the Context and answer the User's question. Provide ONLY the direct answer. Do not add conversational filler. Keep it under 2 sentences.`;
    
    const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\nContext:\n${bestMatch}\n\nQuestion: ${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

    // 6. Generate the response with strict settings to prevent rambling
    const output = await generator(prompt, {
      max_new_tokens: 60,       // Hard limit so it can't ramble
      temperature: 0.1,         // Very low temperature for factual answers
      do_sample: false,         // Greedy decoding: forces the most likely tokens, preventing hallucinations
      repetition_penalty: 1.5, // Strong penalty to stop repeating text
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

    // Fallback if the model somehow leaked the prompt or generated garbage
    if (generatedText.toLowerCase().includes("instead only") || generatedText.toLowerCase().includes("this should come")) {
      return null; // Trigger fallback message instead of sending garbage
    }

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

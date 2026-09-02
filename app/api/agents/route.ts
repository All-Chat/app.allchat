/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline } from '@huggingface/transformers';

// Generative model for reasoning and answering
let generatorPromise: Promise<any> | null = null;
const getGenerator = async () => {
  if (!generatorPromise) {
    // Using a very small instruction-tuned model that can run in Node.js
    generatorPromise = pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
      device: 'cpu',
    });
  }
  return generatorPromise;
};

// Embedding model for semantic search
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

    // If similarity is very low, we don't have relevant context. Return null to trigger fallback.
    if (highestScore < 0.25 || !bestMatch) {
      console.log(`[AI Agent] No relevant context found (Score: ${highestScore})`);
      return null;
    }

    console.log(`[AI Agent] Found relevant context (Score: ${highestScore}). Generating response...`);

    // 5. Construct the prompt for the generative model
    const prompt = `<|im_start|>system
You are a helpful AI assistant. Use the following context to answer the user's question. If the context does not contain the answer, say you don't know. Keep the answer concise and conversational.<|im_end|>
<|im_start|>user
Context:
 ${bestMatch}

Question: ${userMessage}<|im_end|>
<|im_start|>assistant
`;

    // 6. Generate response
    const output = await generator(prompt, {
      max_new_tokens: 150,
      temperature: 0.7,
      do_sample: true,
      top_k: 50,
      repetition_penalty: 1.1,
    });

    let generatedText = output[0].generated_text;
    
    // Extract only the assistant's reply
    const assistantIndex = generatedText.indexOf("<|im_start|>assistant\n");
    if (assistantIndex !== -1) {
      generatedText = generatedText.substring(assistantIndex + "<|im_start|>assistant\n".length);
    }
    
    // Clean up any trailing tags
    generatedText = generatedText.split("<|im_end|>")[0].trim();

    if (!generatedText || generatedText.length === 0) {
      return null;
    }
    
    return generatedText;
  } catch (error) {
    console.error("AI Agent processing error:", error);
    return null;
  }
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline } from '@huggingface/transformers';

// Generative model for reasoning and answering (100% Free & Local)
let generatorPromise: Promise<any> | null = null;
const getGenerator = async () => {
  if (!generatorPromise) {
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

    // 1. Chunk the knowledge base by paragraphs for better context
    const chunks = agentDetails.split('\n\n').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    if (chunks.length === 0) return null;

    // 2. Create embeddings for chunks
    const chunkEmbeddings: number[][] = await Promise.all(
      chunks.map(async (chunk: string) => {
        const output = await extractor(chunk, { pooling: 'mean', normalize: true });
        return Array.from(output.data as number[]);
      })
    );

    // 3. Embed user question
    const queryOutput = await extractor(userMessage, { pooling: 'mean', normalize: true });
    const queryEmbedding: number[] = Array.from(queryOutput.data as number[]);

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

    console.log(`[AI Agent] Found relevant context (Score: ${highestScore}).`);

    // 5. SMART EXTRACTION: If the context is a predefined Q&A pair, return the exact answer.
    // This prevents the AI from hallucinating or rewriting the perfect answer you already wrote.
    if (bestMatch.includes("Q:") && bestMatch.includes("A:")) {
      const answerPart = bestMatch.split("A:")[1]?.trim();
      if (answerPart && answerPart.length > 0) {
        // If there are multiple Q&A pairs in the chunk, find the one most relevant to the question
        const qaPairs = bestMatch.split(/Q:/).filter((p: string) => p.trim().length > 0);
        for (const pair of qaPairs) {
          if (pair.toLowerCase().includes(userMessage.toLowerCase().split('?')[0]) || pair.includes("?")) {
            const ans = pair.split("A:")[1]?.trim();
            if (ans && ans.length > 0) {
              console.log(`[AI Agent] Returning exact predefined Q&A answer.`);
              return ans;
            }
          }
        }
        
        console.log(`[AI Agent] Returning exact predefined Q&A answer.`);
        return answerPart;
      }
    }

    console.log(`[AI Agent] Generating conversational response...`);

    // 6. If it's a paragraph of rules/info, use the Generative AI
    const generator = await getGenerator();
    
    // Construct the prompt for the Generative AI
    const systemPrompt = `You are a helpful WhatsApp assistant. Answer the question using ONLY the Context. Do not invent car names or prices. If the Context does not have the exact info, say you don't have it and offer to connect them with the team. Keep it under 2 sentences.`;
    
    const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\nContext:\n${bestMatch}\n\nQuestion: ${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

    const output = await generator(prompt, {
      max_new_tokens: 60,
      temperature: 0.1,
      do_sample: false,
      repetition_penalty: 1.5,
    });

    let generatedText = output[0].generated_text;
    
    const assistantTag = "<|im_start|>assistant\n";
    const assistantIndex = generatedText.lastIndexOf(assistantTag);
    
    if (assistantIndex !== -1) {
      generatedText = generatedText.substring(assistantIndex + assistantTag.length);
    }
    
    generatedText = generatedText.split("<|im_end|>")[0].trim();

    // Fallback if the model generated garbage or leaked the prompt
    if (generatedText.toLowerCase().includes("instead only") || generatedText.toLowerCase().includes("this should come")) {
      return null;
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

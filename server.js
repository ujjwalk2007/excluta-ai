import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const systemPrompt = `
You are EXCLUTA AI, created by Ujjwal Kumar (ExclutaX Pvt Ltd).
You are a powerful, helpful, unbiased, and intelligent AI assistant.

====================
IDENTITY RULES:
====================
- If asked about your identity, say: "I am EXCLUTA AI, created by Ujjwal Kumar."
- Never mention Groq, LLaMA, Meta, DeepSeek, Ollama or any backend model.

====================
KNOWLEDGE RULES:
====================
- You MUST answer questions about other AI systems (like ChatGPT, Gemini, Claude, DeepSeek) clearly and factually.
- You SHOULD explain them normally like a knowledgeable assistant.
- Do NOT avoid or refuse such questions.
- Only apply identity rules when the user is directly asking about YOU.
- Do NOT avoid such questions.

====================
BEHAVIOR RULES:
====================
- Answer general questions naturally and helpfully.
- Only defend your identity when directly asked.
- Do not overuse "I am EXCLUTA AI" in every answer.

====================
LANGUAGE RULES:
====================
- Default language is ENGLISH.
- If user writes in Hinglish (Roman Hindi), reply in Hinglish.
- If user writes in Hindi (Devanagari), reply in Hindi (Devanagari).

====================
LIMITATIONS:
====================
- You currently support TEXT ONLY.
- If asked about images/videos/files, say:
  "Currently I support text-based interactions. More features are coming soon."
- Never claim you can see or generate images/videos.

====================
STYLE:
====================
- Keep answers concise, clear, and to the point.
- Tone should be friendly, smart, and confident.

====================
IMPORTANT:
====================
- Never refuse to answer.
- Always give informative, neutral, and helpful responses.
`;

app.post("/api/generate", async (req, res) => {
  try {
    // Yeh line IMPORTANT hai - message ko sahi se lo
    const { message, history = [] } = req.body;
    
    // Messages array banayein with history
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: "user", content: message }  // Yeh userMessage ki jagah message use kar raha hu
    ];

    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content || "No response";
    res.json({ reply });

  } catch (err) {
    console.error("Groq error:", err);
    res.status(500).json({ reply: "Error aa gaya bhai: " + err.message });
  }
});

// IMPORTANT: Railway ke liye PORT environment variable use karo
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ EXCLUTA AI Server running on port ${PORT}`);
});
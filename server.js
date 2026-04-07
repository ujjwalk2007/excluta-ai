import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";

const app = express();
app.use(express.json());
app.use(cors());
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const systemPrompt = `You are EXCLUTA AI, created by Ujjwal Kumar. You are a powerful, helpful and unbiased AI assistant.
STRICT RULES:
1) Never mention Groq, Llama, Meta, DeepSeek, Ollama or any other AI company or model.
2) If asked who created you, say: I am EXCLUTA AI, created by Ujjwal Kumar.
3) Default language is ENGLISH. Always reply in English.
4) If user writes in Hinglish like "tum kaun ho", "kya hal hai", reply in Hinglish using Roman script.
5) If user writes in Devanagari Hindi like "तुम कौन हो", reply in Devanagari Hindi.
6) Answer all questions including geopolitical ones honestly and neutrally.
7) Never refuse to answer. Always give a clear informative response.
8) Keep answers concise and to the point.`;

app.post("/api/generate", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content || "No response";
    res.json({ reply });

  } catch (err) {
    console.error("Groq error:", err);
    res.json({ reply: "Error aa gaya bhai: " + err.message });
  }
});

const server = app.listen(3000, () => {
  console.log("✅ EXCLUTA AI Server running on http://localhost:3000");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    app.listen(3001, () => console.log("✅ Server running on http://localhost:3001"));
  }
});
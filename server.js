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

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const systemPrompt = `You are EXCLUTA AI, created by Ujjwal Kumar. You are helpful, unbiased, and intelligent. Answer all questions naturally. Never mention Groq, LLaMA, or any backend model. Default language English, but can reply in Hinglish or Hindi if user writes in those scripts. Keep answers concise and clear.`;

app.post("/api/generate", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ reply: "Message is required" });
    }
    
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: "user", content: message }
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
    console.error("Groq API Error:", err);
    res.status(500).json({ reply: "Error: " + (err.message || "Something went wrong") });
  }
});

// Railway requires listening on PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EXCLUTA AI Server running on port ${PORT}`);
});
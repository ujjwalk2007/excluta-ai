import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = pdfParseModule.default;
import mammoth from 'mammoth';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Uploads folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: fileFilter
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ============ INITIALIZE BOTH MODELS ============
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// System Prompt (same for both)
const systemPrompt = `You are EXCLUTA AI, created by Ujjwal Kumar (ExclutaX Pvt Ltd).
You are a powerful, helpful, unbiased, and intelligent AI assistant.

IDENTITY RULES:
- If asked about your identity, say: "I am EXCLUTA AI, created by Ujjwal Kumar."
- Never mention Groq, Google, Gemini, LLaMA, or any backend model.

LANGUAGE RULES:
- Default language is ENGLISH.
- If user writes in Hinglish, reply in Hinglish.
- If user writes in Hindi, reply in Hindi.

STYLE:
- Keep answers concise, clear, and to the point.
- Tone should be friendly, smart, and confident.`;

// Function to extract text from file
async function extractTextFromFile(filePath, mimeType) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text;
    }
    
    if (mimeType === 'application/msword' || 
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }
    
    if (mimeType.startsWith('image/')) {
      const base64Image = fileBuffer.toString('base64');
      return { type: 'image', mimeType: mimeType, data: base64Image };
    }
    
    if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    }
    
    return null;
  } catch (error) {
    console.error('Text extraction error:', error);
    return null;
  }
}

// File upload endpoint
app.post("/api/upload", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const extracted = await extractTextFromFile(req.file.path, req.file.mimetype);
    
    let response = {
      success: true,
      filename: req.file.originalname,
      fileType: req.file.mimetype,
      message: "File uploaded successfully"
    };
    
    if (typeof extracted === 'string') {
      response.extractedText = extracted;
    } else if (extracted && extracted.type === 'image') {
      response.imageBase64 = extracted.data;
      response.mimeType = extracted.mimeType;
    }
    
    res.json(response);
    
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============ MAIN CHAT ENDPOINT ============
// Auto-route: Image → Gemini, Text → Llama
app.post("/api/generate", async (req, res) => {
  try {
    const { message, history = [], fileContext = null } = req.body;
    
    console.log("=== GENERATE CALLED ===");
    console.log("Message:", message);
    console.log("Has fileContext:", !!fileContext);
    if (fileContext) {
      console.log("Has imageBase64:", !!fileContext.imageBase64);
      console.log("ImageBase64 length:", fileContext.imageBase64 ? fileContext.imageBase64.length : 0);
    }
    
    // ✅ RULE 1: Agar IMAGE hai (base64 present) → GEMINI VISION
    if (fileContext && fileContext.imageBase64 && fileContext.imageBase64.length > 100) {
      console.log("📸 IMAGE detected! Using Gemini Vision...");
      
      const imageData = {
        inlineData: {
          data: fileContext.imageBase64,
          mimeType: fileContext.mimeType || "image/png"
        }
      };
      
      const prompt = message || "Describe this image in detail. What do you see? Tell me everything.";
      
      const result = await geminiModel.generateContent([prompt, imageData]);
      const reply = result.response.text();
      
      console.log("✅ Gemini replied!");
      return res.json({ reply, model: "gemini-vision" });
    }
    
    // ✅ RULE 2: Agar DOCUMENT hai (extractedText) → LLAMA
    if (fileContext && fileContext.extractedText) {
      console.log("📄 DOCUMENT detected! Using Llama...");
      
      const messages = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.text })),
        { role: "user", content: `Document content: ${fileContext.extractedText}\n\nUser question: ${message || "Summarize this"}` }
      ];
      
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
      });
      
      return res.json({ reply: completion.choices[0].message.content, model: "llama" });
    }
    
    // ✅ RULE 3: Sirf TEXT → LLAMA
    console.log("💬 TEXT only! Using Llama...");
    
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.text })),
      { role: "user", content: message || "Hello" }
    ];
    
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
    });
    
    res.json({ reply: completion.choices[0].message.content, model: "llama" });
    
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ reply: "Error: " + err.message });
  }
});
   console.log("FileContext check:", fileContext ? "has fileContext" : "no fileContext", fileContext ? (fileContext.imageBase64 ? "has imageBase64" : "no imageBase64") : ""); 
    if (hasImage) {
      console.log("📸 Image detected → Using Gemini");
      console.log("FileContext check:", fileContext ? "has fileContext" : "no fileContext", fileContext ? (fileContext.imageBase64 ? "has imageBase64" : "no imageBase64") : "");
      // Build prompt with system instruction and history
      let chatHistory = systemPrompt + "\n\n";
      for (const msg of history) {
        chatHistory += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
      }
      
      const userMessage = message || "Describe this image";
      console.log("Sending to Gemini with image length:", fileContext.imageBase64.length);
      const imageData = {
        inlineData: {
          data: fileContext.imageBase64,
          mimeType: fileContext.mimeType || "image/png"
        }
      };
      
      const result = await geminiModel.generateContent({
  contents: [
    {
      role: "user",
      parts: [
        { text: userMessage },
        {
          inlineData: {
            mimeType: fileContext.mimeType || "image/png",
            data: fileContext.imageBase64
          }
        }
      ]
    }
  ]
});
      
      const reply = result.response.text();
      return res.json({ reply, model: "gemini" });
    }
    
    // NO IMAGE → Llama use kar (text-only, fast)
    console.log("💬 Text only → Using Llama 3.3");
    
    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      }))
    ];
    
    // Agar document/file text hai (PDF, Word, TXT) toh woh bhi bhejo
    let userMessage = message;
    if (fileContext && fileContext.extractedText) {
      userMessage = `[User uploaded a document: ${fileContext.filename}]\n\nFile content:\n${fileContext.extractedText}\n\nUser's question: ${message || "What is this document about?"}`;
    }
    
    messages.push({ role: "user", content: userMessage });
    
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1024,
    });
    
    const reply = completion.choices[0]?.message?.content || "No response";
    res.json({ reply, model: "llama" });
    
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ reply: "Error: " + (err.message || "Something went wrong") });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EXCLUTA AI Running`);
  console.log(`   📸 Images → Gemini 2.0 Flash`);
  console.log(`   💬 Text → Llama 3.3 70B`);
});
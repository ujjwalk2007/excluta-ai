import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
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

// Create uploads folder if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: fileFilter
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Function to extract text from file
async function extractTextFromFile(filePath, mimeType) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    // PDF files
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text;
    }
    
    // Word documents
    if (mimeType === 'application/msword' || 
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }
    
    // Image files - use OCR or just describe the image
    if (mimeType.startsWith('image/')) {
      // Get image metadata
      const metadata = await sharp(fileBuffer).metadata();
      return `[Image uploaded: ${metadata.width}x${metadata.height} ${mimeType}]`;
    }
    
    // Text files
    if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    }
    
    return null;
  } catch (error) {
    console.error('Text extraction error:', error);
    return null;
  }
}

// Clean up old files (optional)
function cleanupOldFiles() {
  const files = fs.readdirSync(uploadDir);
  const now = Date.now();
  files.forEach(file => {
    const filePath = path.join(uploadDir, file);
    const stats = fs.statSync(filePath);
    // Delete files older than 1 hour
    if (now - stats.mtimeMs > 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
    }
  });
}

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

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

====================
FILE HANDLING RULES:
====================
- When user uploads an image, describe what you see in the image.
- When user uploads a document, extract and understand the text content.
- Answer questions based on the uploaded file content.
- If asked about images/files, respond helpfully based on the uploaded content.

====================
LANGUAGE RULES:
====================
- Default language is ENGLISH.
- If user writes in Hinglish (Roman Hindi like "tum kaun ho"), reply in Hinglish.
- If user writes in Hindi (Devanagari like "तुम कौन हो"), reply in Hindi (Devanagari).

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

// File upload endpoint
app.post("/api/upload", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const filePath = req.file.path;
    const extractedText = await extractTextFromFile(filePath, req.file.mimetype);
    
    res.json({
      success: true,
      filename: req.file.originalname,
      fileType: req.file.mimetype,
      extractedText: extractedText,
      message: "File uploaded successfully"
    });
    
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Chat endpoint with file context support
app.post("/api/generate", async (req, res) => {
  try {
    const { message, history = [], fileContext = null } = req.body;
    
    if (!message && !fileContext) {
      return res.status(400).json({ reply: "Message or file is required" });
    }
    
    let userMessage = message;
    
    // If file context exists, add it to the message
    if (fileContext && fileContext.extractedText) {
      userMessage = `[User uploaded a file: ${fileContext.filename}]\n\nFile content:\n${fileContext.extractedText}\n\nUser's question: ${message || "What is this file about?"}`;
    } else if (fileContext) {
      userMessage = `[User uploaded an image: ${fileContext.filename}]\n\nUser's question: ${message || "Describe this image"}`;
    }
    
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: "user", content: userMessage }
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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EXCLUTA AI Server running on port ${PORT}`);
});
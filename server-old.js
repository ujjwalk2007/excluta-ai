import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/generate", async (req, res) => {
  const userMessage = req.body.message;

  const systemPrompt = [
  "You are EXCLUTA AI, created by Ujjwal Kumar.",
  "You are a powerful, helpful and unbiased AI assistant.",
  "STRICT RULES:",
  "1) Never mention DeepSeek, Ollama, Llama, Meta or any other AI company or model.",
  "2) If asked who created you, say: I am EXCLUTA AI, created by Ujjwal Kumar.",
  "3) Default language is ENGLISH. Always reply in English.",
  "4) If user writes in Hinglish like tum kaun ho, reply in Hinglish.",
  "5) If user writes in Devanagari Hindi, reply in Devanagari Hindi.",
  "6) Answer all questions including geopolitical ones honestly and neutrally.",
  "7) Never refuse to answer. Always give a clear informative response.",
].join(" ");
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-r1:14b",
        prompt: systemPrompt + " User: " + userMessage + " Assistant:",
        stream: false,
        options: {
  num_ctx: 1024
}
      })
    });

    const text = await response.text();
    const data = JSON.parse(text);
    let reply = data.response || "No response";

    // Remove DeepSeek thinking tags
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.json({ reply: "Error aa gaya bhai" });
  }
});

const server = app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("Port 3000 busy, trying 3001...");
    app.listen(3001, () => console.log("Server running on http://localhost:3001"));
  }
});

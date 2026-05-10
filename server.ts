import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lazy initialize Groq
  let groqClient: Groq | null = null;
  function getGroq() {
    if (!groqClient) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY environment variable is required");
      }
      groqClient = new Groq({ apiKey });
    }
    return groqClient;
  }

  // API Route for Search
  app.post("/api/ai/search", async (req, res) => {
    const { query } = req.body;
    try {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        throw new Error("TAVILY_API_KEY environment variable is required");
      }
      const tvly = tavily({ apiKey });
      const searchResponse = await tvly.search(query, {
        searchDepth: "advanced",
        maxResults: 5,
        includeAnswer: true
      });
      res.json(searchResponse);
    } catch (error: any) {
      console.error("Search API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for AI operations
  app.post("/api/ai/completion", async (req, res) => {
    const { prompt, model = "llama-3.3-70b-versatile", jsonMode = false } = req.body;

    try {
      const groq = getGroq();
      const options: any = {
        messages: [{ role: "user", content: prompt }],
        model: model,
      };

      if (jsonMode) {
        options.response_format = { type: "json_object" };
      }

      const completion = await groq.chat.completions.create(options);
      res.json({ text: completion.choices[0]?.message?.content || "" });
    } catch (error: any) {
      console.error("Groq API Error:", error);
      res.status(error.status || 500).json({ 
        error: error.message,
        details: error.error || {}
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

async function createServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  app.use(vite.middlewares);
  
  // Serve static files
  app.use(express.static('client/public'));

  // API route for token generation
  app.get('/token', async (req, res) => {
    try {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Token generation error:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // Handle SSR requests
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      // Read the index.html and Apply Vite HTML transforms
      const template  = await vite.transformIndexHtml(url, fs.readFileSync('./client/index.html', 'utf-8'));

      // Load the server entry module
      const { render } = await vite.ssrLoadModule('./client/entry-server.jsx');

      // Render the app
      const appHtml = await render(url);

      // Inject the app-rendered HTML into the template - exmaple was missing the appHtml?.html
      const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html)

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

createServer();
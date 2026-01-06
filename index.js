import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs/promises"; // For reading files
import path from "path";
import handlebars from "handlebars";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 3000;

// Limit payload size to prevent memory overflow
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use("/assets", express.static(path.join(__dirname, "assets")));


/* ======================================================
   HTML TEMPLATES (Memory-efficient inline templates)
====================================================== */

// Template 1: Text-only (gradient background)
const TEXT_ONLY_TEMPLATE = (data) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 24px;
      padding: 60px;
      max-width: 900px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .tag {
      display: inline-block;
      background: ${data.tagColor || '#10b981'};
      color: white;
      padding: 10px 24px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 24px;
    }
    .headline {
      font-size: 52px;
      font-weight: 800;
      color: #1f2937;
      margin: 24px 0;
      line-height: 1.2;
      word-wrap: break-word;
    }
    .summary {
      font-size: 24px;
      color: #6b7280;
      line-height: 1.6;
      margin: 24px 0;
      word-wrap: break-word;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
    }
    .date {
      font-size: 16px;
      color: #9ca3af;
      font-weight: 500;
    }
    .branding {
      font-size: 16px;
      color: #667eea;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    ${data.tag ? `<span class="tag">${data.tag}</span>` : ''}
    <h1 class="headline">${data.headline || 'Your Headline Here'}</h1>
    ${data.summary ? `<p class="summary">${data.summary}</p>` : ''}
    <div class="footer">
      <div class="date">${data.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      ${data.branding ? `<div class="branding">${data.branding}</div>` : ''}
    </div>
  </div>
</body>
</html>`;

// Template 2: Background image with text overlay
const BG_IMAGE_TEMPLATE = (data) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      overflow: hidden;
    }
    .bg-container {
      position: relative;
      width: 100%;
      height: 100vh;
      background-image: url('${data.backgroundImageUrl}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 60px;
    }
    .tag {
      display: inline-block;
      background: ${data.tagColor || 'rgba(16, 185, 129, 0.9)'};
      color: white;
      padding: 10px 24px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
      backdrop-filter: blur(10px);
      width: fit-content;
    }
    .headline {
      font-size: 56px;
      font-weight: 800;
      color: white;
      margin: 20px 0;
      line-height: 1.2;
      text-shadow: 0 4px 12px rgba(0,0,0,0.5);
      word-wrap: break-word;
      max-width: 90%;
    }
    .summary {
      font-size: 26px;
      color: rgba(255, 255, 255, 0.95);
      line-height: 1.6;
      margin: 20px 0;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      word-wrap: break-word;
      max-width: 85%;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 30px;
    }
    .date {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 500;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    .branding {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 600;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div class="bg-container">
    <div class="overlay">
      ${data.tag ? `<span class="tag">${data.tag}</span>` : ''}
      <h1 class="headline">${data.headline || 'Your Headline Here'}</h1>
      ${data.summary ? `<p class="summary">${data.summary}</p>` : ''}
      <div class="footer">
        <div class="date">${data.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        ${data.branding ? `<div class="branding">${data.branding}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

/* ======================================================
   BROWSER MANAGER (OPTIMIZED FOR LOW MEMORY)
====================================================== */
let browserPromise = null;
let lastActivityTime = Date.now();
const BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function getBrowser() {
  if (browserPromise) {
    lastActivityTime = Date.now();
    return browserPromise;
  }

  browserPromise = (async () => {
    try {
      console.log("🚀 Launching Chromium...");

      const executablePath = await chromium.executablePath();

      const browser = await puppeteer.launch({
        executablePath,
        headless: chromium.headless,
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--single-process",
          "--no-zygote",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-dev-tools",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-first-run",
          "--disable-infobars",
          "--disable-breakpad",
          "--disable-canvas-aa",
          "--disable-2d-canvas-clip-aa",
          "--disable-gl-drawing-for-tests",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--disable-web-security",
          "--allow-file-access-from-files",
        ],
        defaultViewport: {
          width: 1080,
          height: 1350,
        },
      });

      console.log("✅ Browser launched successfully");
      return browser;
    } catch (error) {
      browserPromise = null;
      console.error("❌ Browser launch failed:", error.message);
      throw error;
    }
  })();

  return browserPromise;
}

// Cleanup idle browser to free memory
setInterval(async () => {
  if (browserPromise && Date.now() - lastActivityTime > BROWSER_IDLE_TIMEOUT) {
    try {
      console.log("🧹 Closing idle browser...");
      const browser = await browserPromise;
      await browser.close();
      browserPromise = null;
      console.log("✅ Browser closed");
    } catch (err) {
      console.error("❌ Error closing browser:", err.message);
      browserPromise = null;
    }
  }
}, 60000); // Check every minute

/* ======================================================
   HELPER FUNCTIONS
====================================================== */

// Sanitize text to prevent XSS
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ======================================================
   TEMPLATE ENGINE LOADER
====================================================== */
async function getRenderedHtml(templateName, data) {
  try {
    // 1. Construct the file path
    const filePath = path.join(process.cwd(), 'templates', `${templateName}.html`);

    console.log(filePath)
    // 2. Read the HTML file
    const templateSource = await fs.readFile(filePath, 'utf-8');

    // 3. Compile with Handlebars
    const template = handlebars.compile(templateSource);

    // 4. Return HTML with injected data
    return template(data);
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error.message);
    throw new Error(`Template '${templateName}' not found or invalid.`);
  }
}


/* ======================================================
   API ENDPOINTS
====================================================== */

app.post("/generate-image", async (req, res) => {
  let page = null;
  const startTime = Date.now();

  try {
    const {
      templateName, // <--- New field: e.g., "news-neon"
      data,         // <--- New field: Object containing headline, body, etc.
      options = {},
    } = req.body;

    if (!templateName || !data) {
      return res.status(400).json({ error: "Missing 'templateName' or 'data' object" });
    }

    // Generate HTML
    const html = await getRenderedHtml(templateName, data);

    // Size check
    const htmlSize = Buffer.byteLength(html, 'utf8');
    if (htmlSize > 5 * 1024 * 1024) { // 5MB limit
      return res.status(413).json({
        error: "HTML content too large",
        maxSize: "5MB",
        currentSize: `${(htmlSize / 1024 / 1024).toFixed(2)}MB`
      });
    }

    console.log(`📄 Rendering (${(htmlSize / 1024).toFixed(2)}KB)`);

    const browser = await getBrowser();
    page = await browser.newPage();

    // Configure viewport
    await page.setViewport({
      width: options.width || 1080,
      height: options.height || 1350,
      deviceScaleFactor: options.scale || 2,
    });

    // Set content with timeout
    await page.setContent(html, {
      waitUntil: "networkidle2", // More lenient than networkidle0
      timeout: 30000, // 30 seconds
    });

    // Wait for fonts (with timeout)
    await Promise.race([
      page.evaluateHandle("document.fonts.ready"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch(() => console.warn("⚠️ Font loading timeout"));

    // Wait for all images to actually load and decode
    await page.evaluate(async () => {
      const selectors = Array.from(document.querySelectorAll("img"));
      await Promise.all([
        document.fonts.ready,
        ...selectors.map((img) => {
          if (img.complete) return;
          return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = resolve; // Continue even if one image fails
          });
        }),
        // Also wait for the background image if it exists
        new Promise((resolve) => {
          const bgLayer = document.querySelector('.bg-layer');
          if (!bgLayer) return resolve();
          const style = window.getComputedStyle(bgLayer);
          const url = style.backgroundImage.slice(4, -1).replace(/"/g, "");
          if (!url || url === 'none') return resolve();

          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        })
      ]);
    });

    // Capture screenshot
    const image = await page.screenshot({
      type: "png",
      optimizeForSpeed: true,
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Image generated in ${duration}ms (${(image.length / 1024).toFixed(2)}KB)`);

    res.set({
      "Content-Type": "image/png",
      "Content-Length": image.length,
      "X-Generation-Time": `${duration}ms`,
    }).send(image);

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`❌ Generation failed after ${duration}ms:`, err.message);

    res.status(500).json({
      error: "Image generation failed",
      message: err.message,
      duration: `${duration}ms`,
    });
  } finally {
    if (page) {
      await page.close().catch(() => null);
      console.log("🧹 Page closed");
    }
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: "healthy",
    browserReady: !!browserPromise,
    memory: {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
    },
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "HTML to Image Converter",
    status: "online",
    endpoints: {
      generate: "POST /generate-image",
      health: "GET /health",
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

/* ======================================================
   SERVER STARTUP
====================================================== */
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);

  // Warm up browser in background
  getBrowser()
    .then(() => console.log("🔥 Browser warmed up"))
    .catch((e) => console.error("❌ Warmup failed:", e.message));
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  process.exit(0);
});
import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs/promises"; // For reading files
import path from "path";
import handlebars from "handlebars";
import { fileURLToPath } from "url";
import axios from "axios";
import { google } from "googleapis";
import { instagramGetUrl } from "instagram-url-direct";
import { createWriteStream, createReadStream, existsSync, unlinkSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// UPLOAD CONFIG & AUTH
// =====================
const CLIENT_ID = "1097502371492-qd87edioo8nk9hgbrnfp8lvuq0kms3cl.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost";

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
// Read tokens synchronously at startup
try {
  const tokensPath = path.join(process.cwd(), "tokens.json");
  if (existsSync(tokensPath)) {
    const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
    oauth2Client.setCredentials(tokens);
    console.log("✅ YouTube Upload Tokens loaded");
  } else {
    console.warn("⚠️ tokens.json not found, upload will fail");
  }
} catch (e) {
  console.error("❌ Failed to load tokens:", e.message);
}

const youtube = google.youtube({ version: "v3", auth: oauth2Client });

// =====================
// UPLOAD HELPERS
// =====================
async function downloadFile(url, outputPath) {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const writer = createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Limit payload size to prevent memory overflow
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use("/assets", express.static(path.join(__dirname, "assets")));



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
      upload: "POST /upload-from-reel",
      health: "GET /health",
    },
  });
});

/* ======================================================
   YOUTUBE UPLOAD ENDPOINT
====================================================== */
app.post("/upload-from-reel", async (req, res) => {
  const { reelUrl, title, description } = req.body;

  if (!reelUrl) {
    return res.status(400).json({ error: "Instagram Reel URL is required" });
  }

  const tempFileName = `reel_${Date.now()}.mp4`;
  const tempPath = path.join(process.cwd(), tempFileName);

  try {
    console.log("🔍 Extracting direct video link from Reel...");

    // ROBUST CHECK: Some versions use .default, others call the module directly
    const getLinkFunc = (typeof instagramGetUrl === 'function')
      ? instagramGetUrl
      : instagramGetUrl.default;

    if (typeof getLinkFunc !== 'function') {
      throw new Error("The Instagram scraper library failed to load properly.");
    }

    const results = await getLinkFunc(reelUrl);

    // Check various common return properties for this library
    const directMp4Url = results.url_list?.[0] || results.links?.[0]?.url || results.media;

    if (!directMp4Url) {
      console.log("Scraper Response:", results);
      throw new Error("Could not find a valid video link. The Reel might be private or the scraper is blocked.");
    }

    console.log("🔗 Found direct link:", directMp4Url);

    console.log("⬇️ Downloading video...");
    await downloadFile(directMp4Url, tempPath);

    console.log("⬆️ Uploading to YouTube...");
    const youtubeResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title || "New Short",
          description: description || "Uploaded from Instagram Reel",
          tags: ["shorts", "reels"],
          categoryId: "22",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: createReadStream(tempPath),
      },
    });


    if (existsSync(tempPath)) unlinkSync(tempPath);

    res.status(200).json({
      success: true,
      youtubeId: youtubeResponse.data.id,
      url: `https://youtube.com/shorts/${youtubeResponse.data.id}`
    });

  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    console.error("❌ Upload Process failed:", error.message);
    res.status(500).json({
      error: "Failed to process reel",
      details: error.message
    });
  }
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
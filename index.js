import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload size for large HTML
app.use(express.json({ limit: "50mb" }));

/* ======================================================
   BROWSER SINGLETON (FIXED FOR ETXTBSY)
====================================================== */

let browserPromise = null;

async function getBrowser() {
  // If a promise already exists (pending or resolved), return it.
  // This prevents multiple requests from trying to extract Chromium at once.
  if (browserPromise) return browserPromise;

  browserPromise = (async () => {
    try {
      console.log("⏳ Resolving Chromium path...");
      const executablePath = await chromium.executablePath();
      
      console.log("🚀 Launching Browser...");
      return await puppeteer.launch({
        executablePath,
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--single-process",
          "--no-zygote",
          "--disable-dev-shm-usage",
        ],
      });
    } catch (error) {
      // If launch fails, reset the promise so the next request can try again
      browserPromise = null;
      console.error("❌ Failed to launch browser:", error);
      throw error;
    }
  })();

  return browserPromise;
}

/* ======================================================
   TEMPLATE GENERATORS
====================================================== */

const generateTextTemplate = ({ headline, summary, tag, date }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
    body {
      width: 1080px;
      height: 1350px;
      margin: 0;
      padding: 80px;
      background: #050505;
      color: white;
      font-family: 'Plus Jakarta Sans', sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .tag { color: #60a5fa; letter-spacing: 3px; font-weight: 800; text-transform: uppercase; }
    h1 { font-size: 72px; margin: 20px 0; line-height: 1.1; }
    p { font-size: 28px; line-height: 1.5; color: #e5e7eb; }
    small { margin-top: 20px; color: #9ca3af; font-size: 20px; }
  </style>
</head>
<body>
  <div class="tag">${tag || "UPDATE"}</div>
  <h1>${headline}</h1>
  <p>${summary}</p>
  <small>${date || ""}</small>
</body>
</html>
`;

const generateImageTemplate = ({ headline, summary, tag, imageUrl }) => {
  const safeUrl = imageUrl.replace(/'/g, "%27");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    body {
      width: 1080px;
      height: 1350px;
      margin: 0;
      padding: 80px;
      background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.8)), url('${safeUrl}') center / cover no-repeat;
      font-family: 'Inter', sans-serif;
      color: white;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      box-sizing: border-box;
    }
    .tag { font-weight: 700; color: #60a5fa; margin-bottom: 10px; }
    h1 { font-size: 64px; text-transform: uppercase; margin: 10px 0; line-height: 1; }
    p { font-size: 30px; margin-bottom: 40px; }
  </style>
</head>
<body>
  <div class="tag">${tag || "NEWS"}</div>
  <h1>${headline}</h1>
  <p>${summary}</p>
</body>
</html>
`;
};

/* ======================================================
   API ENDPOINT
====================================================== */

app.post("/generate-image", async (req, res) => {
  let page;

  try {
    const {
      headline,
      summary,
      tag,
      date,
      backgroundImageUrl,
      htmlOverride,
      options,
    } = req.body;

    const width = options?.width || 1080;
    const height = options?.height || 1350;
    const scale = options?.scale || 2;

    let html;
    let waitForNetwork = false;

    if (htmlOverride) {
      html = htmlOverride;
      waitForNetwork = true;
    } else if (backgroundImageUrl) {
      html = generateImageTemplate({
        headline,
        summary,
        tag,
        imageUrl: backgroundImageUrl,
      });
      waitForNetwork = true;
    } else {
      html = generateTextTemplate({ headline, summary, tag, date });
    }

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setViewport({
      width,
      height,
      deviceScaleFactor: scale,
    });

    await page.setContent(html, {
      waitUntil: waitForNetwork ? "networkidle2" : "domcontentloaded",
      timeout: 60000,
    });

    // Wait for fonts to ensure text looks professional
    try {
      await page.waitForFunction("document.fonts.ready", { timeout: 5000 });
    } catch (_) {
      console.warn("⚠️ Font loading timed out, proceeding with fallback fonts.");
    }

    const image = await page.screenshot({ type: "png" });

    res.set("Content-Type", "image/png");
    res.send(image);
  } catch (err) {
    console.error("❌ Error generating image:", err);
    res.status(500).json({
      error: "Failed to generate image",
      details: err.message,
    });
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
  }
});

/* ======================================================
   HEALTH CHECK
====================================================== */

app.get("/", (_, res) => {
  res.send("✅ Image generation server is active and warm.");
});

/* ======================================================
   START SERVER & WARM UP
====================================================== */

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Warm up the browser immediately on deployment
  try {
    console.log("⚙️  Performing cold start warm-up...");
    await getBrowser();
    console.log("✨ Chromium initialized and ready for requests.");
  } catch (err) {
    console.error("⚠️ Warm-up failed. Chromium will try to initialize on the first request.");
  }
});
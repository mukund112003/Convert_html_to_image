import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload to handle large HTML, but try to avoid sending Base64 images/fonts if possible
app.use(express.json({ limit: "50mb" }));

/* ======================================================
   BROWSER MANAGER (MEMORY OPTIMIZED)
====================================================== */
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;

  browserPromise = (async () => {
    try {
      console.log("⏳ Initializing Chromium...");
      
      // Explicitly set graphics mode for serverless
      await chromium.font(
        "https://raw.githack.com/googlefonts/noto-emoji/main/fonts/NotoColorEmoji.ttf"
      ); // Optional: Preload a lightweight font to stabilize font loader

      const executablePath = await chromium.executablePath();
      
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
          // MEMORY OPTIMIZATION FLAGS
          "--disable-dev-shm-usage", // Uses disk instead of RAM for shared mem
          "--disable-gpu",           // Save GPU memory
          "--disable-software-rasterizer",
          "--mute-audio",
          "--disable-extensions",
        ],
      });
    } catch (error) {
      browserPromise = null; 
      console.error("❌ Browser launch failed:", error);
      throw error;
    }
  })();

  return browserPromise;
}

/* ======================================================
   API ENDPOINT
====================================================== */
app.post("/generate-image", async (req, res) => {
  let page = null;
  try {
    const { backgroundImageUrl, htmlOverride, options } = req.body; // Simplified for brevity

    // 1. Validation: Prevent Massive Base64 logs
    if (htmlOverride && htmlOverride.length > 10 * 1024 * 1024) {
      console.warn("⚠️ Warning: HTML Payload is larger than 10MB. This may cause OOM crashes.");
    }

    const browser = await getBrowser();
    page = await browser.newPage();

    // 2. Set Viewport
    await page.setViewport({
      width: options?.width || 1080,
      height: options?.height || 1350,
      deviceScaleFactor: options?.scale || 2,
    });

    // 3. Set Content with increased timeout
    // Using networkidle0 waits until there are no more than 0 network connections for at least 500 ms.
    await page.setContent(htmlOverride, { 
      waitUntil: "networkidle0", 
      timeout: 60000 // 60 seconds timeout
    });

    // 4. Memory-Safe Font Loading Check
    // Instead of waiting for fonts indefinitely, we check efficiently
    await page.evaluateHandle("document.fonts.ready").catch((e) => {
        console.warn("⚠️ Fonts might not have fully loaded, capturing anyway.");
    });

    const image = await page.screenshot({ type: "png", optimizeForSpeed: true });
    
    res.set("Content-Type", "image/png").send(image);

  } catch (err) {
    // 5. SANITIZE ERROR LOGS
    // Do NOT print 'err' directly if it contains the massive HTML string, it clogs the logs.
    console.error("❌ Generation Error: ", err.message); 
    res.status(500).json({ error: "Generation failed", details: err.message });
  } finally {
    if (page) {
        // Force clean up to free RAM immediately
        await page.close().catch(() => null); 
    }
  }
});

app.get("/", (req, res) => res.send("✅ Server Alive"));

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await getBrowser().catch(e => console.error("Warmup failed", e));
});
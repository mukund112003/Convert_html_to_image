import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3000;


// INCREASE BODY LIMIT for large HTML payloads
app.use(express.json({ limit: '50mb' })); 

// ==========================================
// TEMPLATE GENERATORS
// ==========================================

// Template A: Text-Only (Neon Glass)
const generateTextTemplate = ({ headline, summary, tag, date }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-dark: #050505; --accent-glow: #60a5fa; --text-main: #ffffff; --text-muted: #94a3b8;
      --glass-border: rgba(255, 255, 255, 0.1); --glass-bg: rgba(20, 20, 25, 0.6);
    }
    body { width: 1080px; height: 1350px; font-family: 'Plus Jakarta Sans', sans-serif; background-color: var(--bg-dark); color: var(--text-main); overflow: hidden; display: flex; flex-direction: column; position: relative; }
    .bg-gradient { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at 100% 0%, #1e1e2f 0%, #050505 50%); z-index: -2; }
    .orb { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; opacity: 0.6; }
    .orb-1 { width: 500px; height: 500px; background: #2563eb; top: -100px; left: -100px; }
    .orb-2 { width: 400px; height: 400px; background: #7c3aed; bottom: -50px; right: -50px; opacity: 0.4; }
    .container { padding: 80px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; backdrop-filter: blur(10px); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 30px; }
    .brand { display: flex; align-items: center; gap: 15px; font-size: 1.6rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .brand-icon { width: 12px; height: 12px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e; }
    .date-pill { background: var(--glass-border); padding: 10px 24px; border-radius: 50px; font-weight: 600; font-size: 1.2rem; color: var(--text-muted); }
    .content { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
    .tag { color: var(--accent-glow); font-weight: 700; letter-spacing: 3px; text-transform: uppercase; font-size: 1.4rem; }
    .headline { font-size: 6rem; line-height: 1.1; font-weight: 800; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .highlight { color: var(--accent-glow); -webkit-text-fill-color: var(--accent-glow); }
    .summary-card { background: var(--glass-bg); border: 1px solid var(--glass-border); padding: 40px; border-radius: 24px; margin-top: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
    .summary-text { font-size: 2.2rem; line-height: 1.5; color: #e2e8f0; font-weight: 500; }
    .footer { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; color: var(--text-muted); font-size: 1.4rem; font-weight: 600; }
    .arrow { font-size: 2rem; }
  </style>
</head>
<body>
  <div class="bg-gradient"></div><div class="orb orb-1"></div><div class="orb orb-2"></div>
  <div class="container">
    <div class="header">
      <div class="brand"><div class="brand-icon"></div>Daily.Ai</div>
      <div class="date-pill">${date || 'TODAY'}</div>
    </div>
    <div class="content">
      <div class="tag">${tag || 'UPDATE'}</div>
      <h1 class="headline">${headline}</h1>
      <div class="summary-card">
        <p class="summary-text">${summary}</p>
      </div>
    </div>
    <div class="footer"><div>Swipe for details</div><div class="arrow">→</div></div>
  </div>
</body>
</html>
`;

// Template B: Image Background (Editorial Overlay)
const generateImageTemplate = ({ headline, summary, tag, imageUrl }) => {
  // <--- UPDATED: Safely encode URL to prevent CSS breakage if it has quotes
  const safeUrl = imageUrl.replace(/'/g, "%27"); 
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --brand-color: #00f2ff; }
    body { width: 1080px; height: 1350px; font-family: 'Inter', sans-serif; background-color: #000; color: #fff; overflow: hidden; position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: 80px; }
    /* <--- UPDATED: Use safeUrl here */
    .bg-image { position: absolute; inset: 0; z-index: -2; background-image: url('${safeUrl}'); background-size: cover; background-position: center; }
    .overlay-gradient { position: absolute; inset: 0; z-index: -1; background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.95) 85%, rgba(0,0,0,1) 100%); }
    .top-brand-tag { position: absolute; top: 60px; left: 60px; background: var(--brand-color); color: #000; padding: 10px 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; font-size: 1.2rem; }
    .content-container { max-width: 900px; margin-bottom: 40px; }
    .news-tag { display: inline-block; color: var(--brand-color); font-weight: 700; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 3px; font-size: 1.4rem; border-bottom: 3px solid var(--brand-color); padding-bottom: 5px; }
    .headline { font-size: 5.5rem; font-weight: 900; line-height: 1.05; text-transform: uppercase; margin-bottom: 30px; text-shadow: 0 5px 15px rgba(0,0,0,0.5); }
    .caption-box { border-left: 6px solid var(--brand-color); padding-left: 30px; }
    .caption-text { font-size: 2.4rem; font-weight: 500; line-height: 1.4; color: #e0e0e0; }
  </style>
</head>
<body>
  <div class="bg-image"></div>
  <div class="overlay-gradient"></div>
  <div class="top-brand-tag">Daily.Ai</div>
  <div class="content-container">
    <div class="news-tag">${tag || 'NEWS'}</div>
    <h1 class="headline">${headline}</h1>
    <div class="caption-box"><p class="caption-text">${summary}</p></div>
  </div>
</body>
</html>
`;
}


// ==========================================
// API ENDPOINT
// ==========================================
app.post('/generate-image', async (req, res) => {
    let browser = null;
    console.log("Generating image...");

    try {
        const { 
            headline, summary, tag, date, backgroundImageUrl, htmlOverride, options 
        } = req.body;

        const viewportWidth = options?.width || 1080;
        const viewportHeight = options?.height || 1350;
        const scale = options?.scale || 2;

        let finalHtml;
        // <--- UPDATED: Strategy selection variable
        let shouldUseNetworkWait = false; 

        // LOGIC: Choose template & Wait Strategy
        if (htmlOverride) {
            finalHtml = htmlOverride;
            shouldUseNetworkWait = true; // Assume custom HTML needs network resources
        } else if (backgroundImageUrl) {
            finalHtml = generateImageTemplate({ headline, summary, tag, imageUrl: backgroundImageUrl });
            shouldUseNetworkWait = true; // <--- UPDATED: Images require network wait
        } else {
            finalHtml = generateTextTemplate({ headline, summary, tag, date });
            shouldUseNetworkWait = false; // <--- UPDATED: Text only can use fast wait
        }

        browser = await puppeteer.launch({ 
            headless: "new",
            executablePath: puppeteer.executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor: scale });

        // <--- UPDATED: Conditional Loading Strategy based on content type
        if (shouldUseNetworkWait) {
            // IMAGE MODE: Wait for network activity to settle (fetches images)
            console.log("Mode: Image/Complex - Waiting for network idle...");
            try {
                 // networkidle2 allows 2 active connections (good for stubborn tracking scripts)
                 // Give it 90s for large images
                await page.setContent(finalHtml, { waitUntil: "networkidle2", timeout: 90000 });
                // Extra tiny sleep to allow image decoding after download finishes
                await new Promise(r => setTimeout(r, 1000)); 
            } catch (e) {
                console.warn("Network wait timed out, attempting to snap anyway.");
            }
        } else {
            // TEXT MODE: Fast load, just wait for structure
            console.log("Mode: Text Only - Fast load...");
            await page.setContent(finalHtml, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        // Always double-check fonts
        try {
            await page.waitForFunction('document.fonts.ready', { timeout: 5000 });
        } catch (error) {
            console.log("⚠️ Fonts check timed out, using fallback.");
        }

        const imageBuffer = await page.screenshot({ type: 'png', fullPage: false });

        console.log("Image generated successfully.");
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);

    } catch (error) {
        console.error("Error generating image:", error.message);
        // Only send error json if headers haven't been sent yet (avoids double response error)
        if (!res.headersSent) {
             res.status(500).json({ error: "Failed to generate image", details: error.message });
        }
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/', (req, res) => {
    res.send('You server is Started');
});

app.listen(PORT, () => {
  console.log(`🚀 Image Gen API running on port ${PORT}`);
});

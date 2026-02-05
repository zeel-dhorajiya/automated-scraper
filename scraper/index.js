const admin = require('firebase-admin');
const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  // 1. Initialize Firebase Admin
  // IMPORTANT: serviceAccountKey.json must exist in this directory.
  // In CI, this file is generated from a secret.
  try {
    const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized.');
  } catch (error) {
    console.error('Error initializing Firebase Admin. Make sure serviceAccountKey.json exists and is valid.');
    console.error(error);
    process.exit(1);
  }

  const db = admin.firestore();

  // 2. Launch Puppeteer
  // 'new' headless mode is recommended.
  // No sandbox flags are needed for many CI environments, especially simplified ones.
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // 3. Navigate and Scrape
    const url = 'https://example.com';
    console.log(`Navigating to ${url}...`);
    await page.goto(url);

    const scrapedData = await page.evaluate(() => {
      const title = document.querySelector('h1')?.innerText || 'No Title Found';
      const content = document.querySelector('p')?.innerText || 'No Content Found';
      return { title, content };
    });

    console.log('Scraped Data:', scrapedData);

    // 4. Save to Firestore
    const docRef = db.collection('scraped_data').doc();
    await docRef.set({
      title: scrapedData.title,
      content: scrapedData.content,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Data saved to Firestore with ID: ${docRef.id}`);

  } catch (error) {
    console.error('Error during scraping:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    // Explicitly exit to ensure the process finishes
    process.exit(0);
  }
}

run();

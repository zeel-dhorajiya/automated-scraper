const admin = require('firebase-admin');
const cheerio = require('cheerio');
const fs = require('fs');

// --- CONFIGURATION ---
const TARGET_URL = "https://levvvel.com/coin-master-free-spins-coins/";

async function run() {
    // 1. Initialize Firebase Admin
    try {
        const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
        // Check if already initialized to avoid errors during local testing with re-runs
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        console.log('Firebase Admin initialized.');
    } catch (error) {
        console.error('Error initializing Firebase Admin. Make sure serviceAccountKey.json exists.');
        console.error(error);
        process.exit(1);
    }

    const db = admin.firestore();

    try {
        // 2. Fetch and Scrape
        console.log(`Fetching ${TARGET_URL}...`);

        // Add User-Agent to avoid basic bot detection
        const response = await fetch(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Response Status: ${response.status}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);

        // DEBUG: Log the page title to check for blocking (e.g. Cloudflare)
        console.log(`Page Title: ${$('title').text().trim()}`);
        console.log(`HTML Length: ${html.length}`);

        // Selector from the original project
        const selector = "a[href^='https://rewards.coinmaster.com'], a[href^='https://coinmaster.onelink.me']";
        const elements = $(selector);

        console.log(`Found ${elements.length} links.`);

        if (elements.length === 0) {
            console.log("No links found. Exiting.");
            return;
        }

        const batch = db.batch();
        const collectionRef = db.collection('scraped_data');
        let count = 0;

        elements.each((i, el) => {
            const linkUrl = $(el).attr('href');
            const linkTitle = $(el).text().trim() || "Free Reward";
            // Logic mimicking source: check if title contains "coin"
            const type = linkTitle.toLowerCase().includes("coin") ? "coins" : "spins";

            // Create a unique ID based on the URL to prevent duplicates (optional, but good practice)
            // For simplicity, we'll let Firestore generate IDs or just add new docs. 
            // To avoid duplicates, we could query first, but for now we just add.
            // Better approach for "latest" list: Just add them. The frontend limits to 20.

            const docRef = collectionRef.doc(); // Auto-ID
            batch.set(docRef, {
                title: linkTitle,
                url: linkUrl,
                type: type,
                timestamp: admin.firestore.FieldValue.serverTimestamp() // Server time
            });
            count++;
        });

        // 3. Save to Firestore
        await batch.commit();
        console.log(`Successfully saved ${count} links to Firestore.`);

    } catch (error) {
        console.error('Error during scraping:', error);
        process.exit(1);
    }
}

run();

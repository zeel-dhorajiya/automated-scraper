const admin = require('firebase-admin');
const cheerio = require('cheerio');
const fs = require('fs');

// --- CONFIGURATION ---
const TARGET_URL = "https://levvvel.com/coin-master-free-spins-coins/";
const DB_PATH_PREFIX = "DB-3";

async function run() {
    // 1. Initialize Firebase Admin
    let db;
    try {
        const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
        const projectId = serviceAccount.project_id;

        // Construct Database URL. 
        // Note: Newer Firebase projects use <project-id>-default-rtdb.firebaseio.com
        // Older ones use <project-id>.firebaseio.com
        // We will try the default modern format.
        const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: databaseURL
            });
        }
        console.log(`Firebase Admin initialized. Target DB: ${databaseURL}`);
        db = admin.database();

    } catch (error) {
        console.error('Error initializing Firebase Admin. Make sure serviceAccountKey.json exists.');
        console.error(error);
        process.exit(1);
    }

    try {
        // 2. Fetch and Scrape
        console.log(`Fetching ${TARGET_URL}...`);

        // Add User-Agent (Fix for blocking)
        const response = await fetch(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`Response Status: ${response.status}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);

        // DEBUG
        console.log(`Page Title: ${$('title').text().trim()}`);

        // Selector from the original project
        const selector = "a[href^='https://rewards.coinmaster.com'], a[href^='https://coinmaster.onelink.me']";
        const elements = $(selector);

        console.log(`Found ${elements.length} links.`);

        if (elements.length === 0) {
            console.log("No links found. Exiting.");
            return;
        }

        // 3. Process Data for Realtime Database
        const newSpins = {};
        const newCoins = {};

        elements.each((i, el) => {
            const linkUrl = $(el).attr('href');
            const linkTitle = $(el).text().trim() || "Free Reward";
            const type = linkTitle.toLowerCase().includes("coin") ? "coins" : "spins";

            const item = {
                url: linkUrl,
                title: linkTitle,
                type: type
            };

            // Generate a random ID (UUID-like)
            const key = getUUID();

            if (type === "spins") {
                newSpins[key] = item;
            } else {
                newCoins[key] = item;
            }
        });

        // 4. Update Firebase
        const currentTime = Date.now();
        const readableTime = new Date().toLocaleString('en-US', {
            month: 'short', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const updates = {};
        updates[`${DB_PATH_PREFIX}/spins`] = newSpins;
        updates[`${DB_PATH_PREFIX}/coins`] = newCoins;
        updates[`${DB_PATH_PREFIX}/lastUpdated`] = currentTime;
        updates[`${DB_PATH_PREFIX}/lastUpdatedReadable`] = readableTime;

        console.log(`Uploading ${Object.keys(newSpins).length} Spins and ${Object.keys(newCoins).length} Coins to ${DB_PATH_PREFIX}...`);

        await db.ref().update(updates);
        console.log("SUCCESS: Firebase Realtime Database updated.");

    } catch (error) {
        console.error('Error during scraping:', error);
        process.exit(1);
    }
}

// Helper to generate IDs like the android app
function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

run();

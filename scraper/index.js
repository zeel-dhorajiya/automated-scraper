const admin = require('firebase-admin');
const cheerio = require('cheerio');
const fs = require('fs');

// --- CONFIGURATION ---
const TARGET_URL = "https://levvvel.com/coin-master-free-spins-coins/";
const DB_PATH_PREFIX = "DB-1";

// --- TELEGRAM HELPER ---
async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("Telegram credentials not found in environment. Skipping alert.");
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `🚨 **Spins Scraper Alert** 🚨\n\n${message}`,
                parse_mode: 'Markdown'
            })
        });
        console.log("Telegram alert sent successfully.");
    } catch (err) {
        console.error("Failed to send Telegram alert:", err);
    }
}

async function run() {
    // 1. Initialize Firebase Admin
    let db1, firestore1, db2, firestore2;
    try {
        const path = require('path');
        const serviceAccount1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
        const serviceAccount2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey2.json'), 'utf8'));

        // Project 1
        const projectId1 = serviceAccount1.project_id;
        const databaseURL1 = `https://${projectId1}-default-rtdb.firebaseio.com`;

        // Project 2
        const projectId2 = serviceAccount2.project_id;
        const databaseURL2 = `https://${projectId2}-default-rtdb.firebaseio.com`;

        if (!admin.apps.length) {
            // Initialize App 1
            const app1 = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount1),
                databaseURL: databaseURL1
            }, 'app1');
            db1 = admin.database(app1);
            firestore1 = admin.firestore(app1);

            // Initialize App 2
            const app2 = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount2),
                databaseURL: databaseURL2
            }, 'app2');
            db2 = admin.database(app2);
            firestore2 = admin.firestore(app2);

            console.log(`Firebase Apps initialized.`);
            console.log(`Account 1: ${projectId1} (${databaseURL1})`);
            console.log(`Account 2: ${projectId2} (${databaseURL2})`);
        }

    } catch (error) {
        console.error('Error initializing Firebase Admin. Make sure both serviceAccountKey.json and serviceAccountKey2.json exist.');
        console.error(error);
        await sendTelegramAlert(`Critical Error: Firebase Admin Initialization Failed!\n\`\`\`${error.message}\`\`\``);
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
            await sendTelegramAlert("Warning: The scraper completed successfully but found **0 links** on the target page.");
            return;
        }

        // 3. Fetch Existing Data to Detect New Links
        const existingUrls = new Set();
        try {
            console.log("Fetching existing data to check for new links...");
            const snapshot = await db1.ref(DB_PATH_PREFIX).once('value');
            const data = snapshot.val();
            if (data) {
                if (data.spins) Object.values(data.spins).forEach(item => existingUrls.add(item.url));
                if (data.coins) Object.values(data.coins).forEach(item => existingUrls.add(item.url));
            }
            console.log(`Found ${existingUrls.size} existing links in database.`);
        } catch (e) {
            console.warn("Failed to fetch existing data for comparison:", e.message);
        }

        const newlyDiscoveredLinks = [];

        // 4. Process Data for Realtime Database
        const newSpins = {};
        const newCoins = {};

        // Helper to get ordinal suffix (st, nd, rd, th)
        function getOrdinal(n) {
            const s = ["th", "st", "nd", "rd"];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        }

        // Helper to format date string
        function formatDate(date) {
            if (!date) return null;
            const day = getOrdinal(date.getDate());
            const month = date.toLocaleString('en-US', { month: 'short' });
            const year = date.getFullYear();
            return `${day} ${month}, ${year}`;
        }

        // Helper to parse date from URL (e.g., _20260207)
        function getDateFromUrl(url) {
            const match = url.match(/_(\d{8})/);
            if (match) {
                const dateStr = match[1];
                const year = parseInt(dateStr.substring(0, 4));
                const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
                const day = parseInt(dateStr.substring(6, 8));
                return new Date(year, month, day);
            }
            return null;
        }

        // Helper to parse date from Header (e.g., "February 6")
        function getDateFromHeader(headerText) {
            const currentYear = new Date().getFullYear();
            // Match "Month DD"
            const match = headerText.match(/([a-zA-Z]+)\s+(\d{1,2})/);
            if (match) {
                const monthName = match[1];
                const day = match[2];
                // Use default JS Date parsing
                const date = new Date(`${monthName} ${day}, ${currentYear}`);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            if (headerText.toLowerCase().includes("today")) {
                return new Date();
            }
            return null;
        }

        // Iterate over H2 headers to find sections
        $('h2').each((i, headerEl) => {
            const headerText = $(headerEl).text().trim();
            let sectionDate = getDateFromHeader(headerText);

            // Find the associated list (UL/OL)
            let next = $(headerEl).next();
            while (next.length && next[0].name !== 'ul' && next[0].name !== 'ol' && next[0].name !== 'h2') {
                next = next.next();
            }

            if (next.length && (next[0].name === 'ul' || next[0].name === 'ol')) {
                const links = next.find("a[href^='https://rewards.coinmaster.com'], a[href^='https://coinmaster.onelink.me']");

                links.each((j, linkEl) => {
                    const linkUrl = $(linkEl).attr('href');
                    const linkTitle = $(linkEl).text().trim() || "Free Reward";
                    const type = linkTitle.toLowerCase().includes("coin") ? "coins" : "spins";

                    // Determine Date Object
                    let dateObj = getDateFromUrl(linkUrl);
                    if (!dateObj) {
                        dateObj = sectionDate;
                    }
                    // Fallback to today
                    if (!dateObj) {
                        dateObj = new Date();
                    }

                    const item = {
                        url: linkUrl,
                        title: linkTitle,
                        type: type,
                        date: formatDate(dateObj),
                        timestamp: dateObj.getTime(),
                        scraped_at: Date.now()
                    };

                    // Check if this is a newly discovered link
                    if (!existingUrls.has(linkUrl)) {
                        newlyDiscoveredLinks.push(item);
                        // Also add it to the set so we don't count duplicates on the same page
                        existingUrls.add(linkUrl);
                    }

                    // Generate a random ID (UUID-like)
                    const key = getUUID();

                    if (type === "spins") {
                        newSpins[key] = item;
                    } else {
                        newCoins[key] = item;
                    }
                });
            }
        });

        // 5. Update Firebase (Both Projects)
        const currentTime = Date.now();
        const readableTime = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            month: 'short', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const updates = {};
        updates[`${DB_PATH_PREFIX}/spins`] = newSpins;
        updates[`${DB_PATH_PREFIX}/coins`] = newCoins;
        updates[`${DB_PATH_PREFIX}/lastUpdated`] = currentTime;
        updates[`${DB_PATH_PREFIX}/lastUpdatedReadable`] = readableTime;

        console.log(`Uploading data to both Firebase accounts...`);

        const firestoreData = {
            spins: newSpins,
            coins: newCoins,
            lastUpdated: currentTime,
            lastUpdatedReadable: readableTime
        };

        // Execute all updates in parallel using allSettled so one failure doesn't stop the others
        console.log("Starting parallel updates to all databases...");
        const results = await Promise.allSettled([
            // Project 1
            db1.ref().update(updates).then(() => "Project 1: Realtime Database update success"),
            firestore1.collection('scraped_data').doc(DB_PATH_PREFIX).set(firestoreData).then(() => "Project 1: Firestore update success"),

            // Project 2
            db2.ref().update(updates).then(() => "Project 2: Realtime Database update success"),
            firestore2.collection('scraped_data').doc(DB_PATH_PREFIX).set(firestoreData).then(() => "Project 2: Firestore update success")
        ]);

        let successCount = 0;
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                console.log(`✅ ${result.value}`);
                successCount++;
            } else {
                console.error(`❌ ${result.reason.message || result.reason}`);
            }
        });

        if (successCount > 0) {
            console.log(`Process completed with ${successCount}/4 updates successful.`);

            // Notify user of newly discovered links
            if (newlyDiscoveredLinks.length > 0) {
                const spinsCount = newlyDiscoveredLinks.filter(l => l.type === 'spins').length;
                const coinsCount = newlyDiscoveredLinks.filter(l => l.type === 'coins').length;
                console.log(`Found ${newlyDiscoveredLinks.length} new links. Sending Telegram alert...`);
                await sendTelegramAlert(`🎉 **Found New Links!** 🎉\n\n🎰 Spins: ${spinsCount}\n🪙 Coins: ${coinsCount}\n\nTotal new links added to database: ${newlyDiscoveredLinks.length}`);
            } else {
                console.log("No new links were found in this run.");
            }

        } else {
            console.error("All updates failed.");
            await sendTelegramAlert("Critical Error: All Firebase database updates failed!");
            process.exit(1);
        }
        process.exit(0);

    } catch (error) {
        console.error('Error during scraping:', error);
        await sendTelegramAlert(`Critical Error: Scraping Process Failed!\n\`\`\`${error.message}\`\`\``);
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

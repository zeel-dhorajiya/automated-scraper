const admin = require('firebase-admin');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const TARGET_URL = "https://dicedreamsfreerolls.de/";
const DB_PATH_PREFIX = "DB-1"; 

async function run() {
    let db3;
    try {
        const serviceAccount3Path = path.join(__dirname, 'serviceAccountKey3.json');
        if (!fs.existsSync(serviceAccount3Path)) {
            throw new Error('serviceAccountKey3.json not found in scraper directory.');
        }
        
        const serviceAccount3 = JSON.parse(fs.readFileSync(serviceAccount3Path, 'utf8'));
        const projectId3 = serviceAccount3.project_id;
        const databaseURL3 = `https://${projectId3}-default-rtdb.firebaseio.com`;

        const app3 = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount3),
            databaseURL: databaseURL3
        }, 'diceDreamsApp');
        db3 = admin.database(app3);
        console.log(`Firebase Project 3 initialized: ${projectId3}`);

    } catch (error) {
        console.error('Error initializing Firebase Project 3:', error.message);
        process.exit(1);
    }

    try {
        console.log(`Fetching ${TARGET_URL}...`);
        const response = await fetch(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        const newRolls = {};
        
        // Helper to generate IDs
        function getHash(str) {
            const crypto = require('crypto');
            return crypto.createHash('md5').update(str).digest('hex');
        }

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

        // Helper to follow intermediate links
        async function getFinalRewardUrl(intermediateUrl) {
            try {
                const res = await fetch(intermediateUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const body = await res.text();
                const match = body.match(/https:\/\/rewards\.dicedreams\.com\/[^"']+/);
                return match ? match[0].replace(/&amp;/g, '&') : null;
            } catch (err) {
                console.error(`Error following ${intermediateUrl}:`, err.message);
                return null;
            }
        }

        // Strategy 1: Find reward cards and process them
        const containers = $(".bg-white.rounded-lg.shadow-md.p-6");
        console.log(`Found ${containers.length} reward cards.`);

        for (let i = 0; i < containers.length; i++) {
            const container = $(containers[i]);
            let title = container.find('h3').text().trim();
            const collectBtn = container.find('a').filter((idx, el) => $(el).text().toLowerCase().includes('collect'));
            let href = collectBtn.attr('href');

            if (!href) continue;

            // Handle intermediate links
            if (href.includes('dreams.playmodapk.de') || href.includes('dreams.modapk48.com')) {
                console.log(`Following intermediate link for "${title}": ${href}`);
                const finalUrl = await getFinalRewardUrl(href);
                if (finalUrl) {
                    href = finalUrl;
                } else {
                    console.log(`Could not resolve final URL for ${href}`);
                    continue; 
                }
            }

            if (!href.includes('rewards.dicedreams.com') && !href.includes('reward-link') && !href.includes('dicedreams')) continue;

            // Extract and parse date
            const dateStr = container.find('.text-xs.text-gray-400').text().trim(); // e.g., "March 13, 2026 at 06:08 PM"
            let dateObj = null;
            if (dateStr) {
                // Remove "at HH:MM AM/PM" part for simpler parsing if needed, but Date() can handle it
                dateObj = new Date(dateStr.replace(' at ', ' '));
            }
            
            if (!dateObj || isNaN(dateObj.getTime())) {
                dateObj = new Date(); // Fallback to now
            }

            // Expiration check: links expire in 3 days (per website FAQ)
            const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
            const isExpired = (Date.now() - dateObj.getTime()) > threeDaysInMs;
            
            // Ensure title is complete (e.g., "50 Rolls")
            if (!title.toLowerCase().includes('rolls') && !title.toLowerCase().includes('coins')) {
                const altText = container.find('img').attr('alt') || '';
                if (altText.toLowerCase().includes('rolls')) {
                    title = `${title} Rolls`;
                } else if (altText.toLowerCase().includes('coins')) {
                    title = `${title} Coins`;
                }
            }

            const key = getHash(href);
            newRolls[key] = {
                url: href,
                title: title || "Dice Dreams Reward",
                type: 'rolls',
                date: formatDate(dateObj),
                isExpired: isExpired,
                scraped_at: Date.now(),
                timestamp: dateObj.getTime()
            };
        }

        // Strategy 2: Extract from JSON in script tags (Next.js state) as a fallback
        const scripts = $("script");
        scripts.each((i, el) => {
            const content = $(el).text();
            if (content.includes('reward_link')) {
                try {
                    // Look for JSON-like patterns for reward_link
                    const regex = /"reward_link":"(https:[^"]+)"/g;
                    let match;
                    while ((match = regex.exec(content)) !== null) {
                        const url = match[1].replace(/\\u0026/g, '&');
                        const key = getHash(url);
                        if (!newRolls[key]) {
                            newRolls[key] = {
                                url: url,
                                title: "Dice Dreams Free Rolls",
                                type: 'rolls',
                                date: null,
                                isExpired: false, // Fallback links assumed active unless proven otherwise
                                scraped_at: Date.now(),
                                timestamp: Date.now()
                            };
                        }
                    }
                } catch (e) {
                    console.error("Error parsing script JSON:", e.message);
                }
            }
        });

        const rollCount = Object.keys(newRolls).length;
        if (rollCount > 0) {
            const updates = {};
            updates[`${DB_PATH_PREFIX}/rolls`] = newRolls;
            updates[`${DB_PATH_PREFIX}/lastUpdated`] = Date.now();
            updates[`${DB_PATH_PREFIX}/lastUpdatedReadable`] = new Date().toLocaleString();
            
            console.log(`Updating Firebase Database with ${rollCount} links...`);
            await db3.ref().update(updates);
            console.log(`✅ Successfully updated ${rollCount} rolls in Project 3.`);
        } else {
            console.log("⚠️ No rolls found to update. Check the website structure.");
        }
        process.exit(0);
    } catch (error) {
        console.error('❌ Scraping failed:', error.message);
        process.exit(1);
    }
}

run();

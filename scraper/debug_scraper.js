const cheerio = require('cheerio');

async function debug() {
    const TARGET_URL = "https://levvvel.com/coin-master-free-spins-coins/";
    console.log(`Fetching ${TARGET_URL}...`);
    const response = await fetch(TARGET_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const headers = $('h2');
    console.log(`Found ${headers.length} H2 headers.`);

    headers.each((i, el) => {
        const text = $(el).text().trim();
        console.log(`H2 [${i}]: ${text}`);

        // Check for following sibling that contains links
        // We look for the next 'ul' or 'ol'
        let next = $(el).next();
        while (next.length && next[0].name !== 'ul' && next[0].name !== 'ol' && next[0].name !== 'h2') {
            next = next.next();
        }

        if (next.length && (next[0].name === 'ul' || next[0].name === 'ol')) {
            const links = next.find("a[href^='https://rewards.coinmaster.com'], a[href^='https://coinmaster.onelink.me']");
            console.log(`  -> Found ${links.length} reward links in following list.`);
        } else {
            console.log(`  -> No immediate list found.`);
        }
    });

}

debug();

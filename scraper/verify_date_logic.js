// Helper to just verify logic
// Helper to parse date from URL (e.g., _20260207)
function getDateFromUrl(url) {
    const match = url.match(/_(\d{8})/);
    if (match) {
        const dateStr = match[1];
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1; // Months are 0-indexed in JS
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
        const day = match[2].padStart(2, '0');
        const date = new Date(`${monthName} ${day}, ${currentYear}`);
        if (!isNaN(date.getTime())) {
            // Format as YYYY-MM-DD
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    if (headerText.toLowerCase().includes("today")) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return null;
}

console.log("Testing URL Date Parsing:");
console.log("  _20260207 ->", getDateFromUrl("https://rewards.coinmaster.com/rewards/rewards.html?c=pe_TWIKUgvVE_20260207"));
console.log("  _20260205 ->", getDateFromUrl("https://rewards.coinmaster.com/rewards/rewards.html?c=pe_EMAILXHqOzQ_20260205"));
console.log("  No date ->", getDateFromUrl("https://rewards.coinmaster.com/rewards/rewards.html?c=pe_TWIKUgvVE"));

console.log("\nTesting Header Date Parsing:");
console.log("  February 6 ->", getDateFromHeader("Coin Master free spins & coins February 6"));
console.log("  Today’s Coin Master... ->", getDateFromHeader("Today’s Coin Master free spins & coins"));
console.log("  No date ->", getDateFromHeader("Coin Master tips & tricks"));

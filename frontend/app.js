import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ⚠️ REPLACE THIS WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    // Paste your config object here
};

const linksContainer = document.getElementById('links-container');

// Check if config is set
if (!firebaseConfig.projectId) {
    linksContainer.innerHTML = `
        <div style="text-align: center; color: red; padding: 20px;">
            <h3>Configuration Required</h3>
            <p>Please open <code>frontend/app.js</code> and add your Firebase Config.</p>
        </div>
    `;
    throw new Error("Firebase Config missing");
}

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DB_PATH_PREFIX = "DB-1";

function init() {
    console.log("Initializing...");
    fetchLinks();
}

function fetchLinks() {
    // We listen to the entire DB-3 node to get both spins and coins, 
    // or we can listen to them separately. Listening to parent is easier if data isn't huge.
    // For efficiency, let's just listen to 'spins' and 'coins' separately and merge them.
    // Actually, listening to the parent DB-3 is fine for this scale.

    const dbRef = ref(db, DB_PATH_PREFIX);

    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            renderEmptyState();
            return;
        }

        let allLinks = [];

        if (data.spins) {
            Object.values(data.spins).forEach(item => allLinks.push(item));
        }
        if (data.coins) {
            Object.values(data.coins).forEach(item => allLinks.push(item));
        }

        // Sort? The original code didn't seem to have a timestamp in the item object itself, 
        // just a global lastUpdated. But usually users want newest first.
        // The list is re-scraped every time, so the order in the array matches the order found on the page.
        // We'll preserve that order or just reverse it if we want newest (top of page) first.
        // Since we are merging two objects, order might be lost.
        // Let's just render them. 

        if (allLinks.length === 0) {
            renderEmptyState();
        } else {
            linksContainer.innerHTML = '';
            // Newest on page usually means "top". 
            // We just render them.
            allLinks.forEach(renderLinkItem);
        }

    }, (error) => {
        console.error("Firebase Error:", error);
        linksContainer.innerHTML = `<div style="text-align:center; color: red;">Error loading data.</div>`;
    });
}


function renderLinkItem(link) {
    const item = document.createElement('div');
    item.className = 'list-item';

    // Simple icon logic based on type
    const iconChar = link.type === 'coins' ? 'C' : 'S';

    // We don't have per-item timestamp in the scraping logic we copied,
    // so we omit the time in the list item or use generic text.

    item.innerHTML = `
        <div class="item-left">
            <div class="item-icon ${link.type}">
                ${iconChar}
            </div>
            <div class="item-info">
                <h4>${link.title || 'Free Reward'}</h4>
                <div class="meta">
                    <span class="type-tag">${link.type || 'reward'}</span>
                </div>
            </div>
        </div>
        <a href="${link.url}" target="_blank" class="btn-collect">GET</a>
    `;

    const btn = item.querySelector('.btn-collect');
    btn.addEventListener('click', () => {
        btn.classList.add('collected');
        btn.innerText = "OPEN";
    });

    linksContainer.appendChild(item);
}

function renderEmptyState() {
    linksContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
            <p>No links found yet.</p>
        </div>
    `;
}

init();

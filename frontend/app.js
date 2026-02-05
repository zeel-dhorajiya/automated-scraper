import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ REPLACE THIS WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    // Paste your config object here
};

// Check if config is set
if (!firebaseConfig.projectId) {
    document.getElementById('links-container').innerHTML = `
        <div style="text-align: center; color: red; padding: 20px;">
            <h3>Configuration Required</h3>
            <p>Please open <code>frontend/app.js</code> and add your Firebase Config.</p>
        </div>
    `;
    throw new Error("Firebase Config missing");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const linksContainer = document.getElementById('links-container');

async function fetchLinks() {
    try {
        const q = query(
            collection(db, "scraped_data"),
            orderBy("timestamp", "desc"),
            limit(20)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            renderEmptyState();
            return;
        }

        linksContainer.innerHTML = ''; // Clear loading

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            renderLinkItem(data);
        });

    } catch (error) {
        console.error("Error fetching documents: ", error);
        linksContainer.innerHTML = `<div style="text-align:center; color: red;">Error loading data.</div>`;
    }
}

function renderLinkItem(link) {
    const item = document.createElement('div');
    item.className = 'list-item';

    // Simple icon logic based on type
    const iconChar = link.type === 'coins' ? 'C' : 'S'; // Placeholder since we don't have images yet
    // If you want to use the images from the source project, you'd need to copy them to frontend/resources

    const dateStr = link.timestamp ? new Date(link.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    item.innerHTML = `
        <div class="item-left">
            <div class="item-icon ${link.type}">
                ${iconChar}
            </div>
            <div class="item-info">
                <h4>${link.title || 'Free Reward'}</h4>
                <div class="meta">
                    <span class="type-tag">${link.type || 'reward'}</span>
                    <span class="time">${dateStr}</span>
                </div>
            </div>
        </div>
        <a href="${link.url}" target="_blank" class="btn-collect">GET</a>
    `;

    // Click effect
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

fetchLinks();

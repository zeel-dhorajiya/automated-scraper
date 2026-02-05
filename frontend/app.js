import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
    // apiKey: "API_KEY",
    // authDomain: "PROJECT_ID.firebaseapp.com",
    // projectId: "PROJECT_ID",
    // storageBucket: "PROJECT_ID.appspot.com",
    // messagingSenderId: "SENDER_ID",
    // appId: "APP_ID"
};

// Check if config is set
if (!firebaseConfig.projectId) {
    document.getElementById('app').innerHTML = `
        <div style="grid-column: 1/-1; color: red; text-align: center;">
            <h2>Configuration Required</h2>
            <p>Please update <code>frontend/app.js</code> with your Firebase Configuration.</p>
        </div>
    `;
    throw new Error("Firebase Config missing");
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fetchData() {
    const appElement = document.getElementById('app');

    try {
        const q = query(
            collection(db, "scraped_data"),
            orderBy("timestamp", "desc"),
            limit(20)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            appElement.innerHTML = '<div class="loading">No scraped data found yet.</div>';
            return;
        }

        appElement.innerHTML = ''; // Clear loading state

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : 'N/A';

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h2>${data.title || 'No Title'}</h2>
                <p class="content">${data.content || 'No content available'}</p>
                <div class="timestamp">Scraped: ${date}</div>
            `;
            appElement.appendChild(card);
        });

    } catch (error) {
        console.error("Error fetching documents: ", error);
        appElement.innerHTML = `<div class="loading" style="color: red;">Error loading data: ${error.message}</div>`;
    }
}

fetchData();

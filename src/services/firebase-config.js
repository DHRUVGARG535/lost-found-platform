// =============================================================================
// FIREBASE CONFIGURATION AND INITIALIZATION
// =============================================================================

// Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyD8PfXRCYEfq25FCz3y5DIfRNgqzq3nY04",
    authDomain: "lostandfoundgeu-89ccc.firebaseapp.com",
    projectId: "lostandfoundgeu-89ccc",
    storageBucket: "lostandfoundgeu-89ccc.firebasestorage.app",
    messagingSenderId: "176572857311",
    appId: "1:176572857311:web:a4c8f8cdd13b3e73c5626a",
    measurementId: "G-L3ZHH64W45"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
const itemsCollection = db.collection('lost_items');

// Export Firebase services for other modules
export {
    db,
    storage,
    auth,
    itemsCollection,
    firebaseConfig
};
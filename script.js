// Campus Lost & Found Platform - Main JavaScript File
// This file contains all Firebase integrations and application logic

// =============================================================================
// FIREBASE CONFIGURATION
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

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

// =============================================================================
// AUTH UI HYDRATION (prevents navbar flicker on navigation)
// =============================================================================
const AUTH_UI_CACHE_KEY = 'lf_ui_auth_v1';

function readCachedAuthUiState() {
    try {
        const raw = window.localStorage.getItem(AUTH_UI_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return { isLoggedIn: !!parsed.isLoggedIn, isAdmin: !!parsed.isAdmin };
    } catch {
        return null;
    }
}

function writeCachedAuthUiState(next) {
    try {
        window.localStorage.setItem(AUTH_UI_CACHE_KEY, JSON.stringify({
            isLoggedIn: !!next?.isLoggedIn,
            isAdmin: !!next?.isAdmin,
            updatedAt: Date.now()
        }));
    } catch {
        // ignore
    }
}

function applyAuthUiClasses(state) {
    const root = document.documentElement;
    if (!root) return;
    root.classList.add('lf-auth-hydrated');
    root.classList.toggle('lf-logged-in', !!state?.isLoggedIn);
    root.classList.toggle('lf-admin', !!state?.isAdmin);
}

// Apply cached state early (CSS uses these classes)
applyAuthUiClasses(readCachedAuthUiState());

// Centralized item statuses for consistency
const ITEM_STATUS = {
    LOST: 'Lost',
    FOUND: 'Found',
    RESOLVED: 'resolved',
    RETURNED: 'returned',
    CLAIMED: 'claimed',
    PENDING: 'pending'
};

// Centralized categories (keep in sync with HTML <select> options)
const ITEM_CATEGORIES = [
    'Electronics',
    'Documents',
    'ID Card',
    'Clothing',
    'Accessories',
    'Books & Stationery',
    'Others'
];

// Lightweight debounce helper (for search inputs etc.)
// Use slightly longer delay on mobile to reduce lag while typing
function debounce(fn, delay) {
    if (delay === undefined) {
        delay = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 400 : 250;
    }
    let timeoutId;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================
let currentUser = null;
let items = [];
let currentItemId = null;
let currentItemData = null;
let resolvedItems = [];
let isSigningOut = false;

// =============================================================================
// ROLE HELPERS (user / finder / admin)
// =============================================================================

async function getCurrentUserRole() {
    if (!currentUser) return 'user';

    try {
        const token = await currentUser.getIdTokenResult();

        if (token.claims && token.claims.admin === true) {
            return 'admin';
        }

        if (token.claims && typeof token.claims.role === 'string') {
            // Expected values: 'user', 'finder', 'admin' (admin also has admin === true)
            return token.claims.role;
        }

        return 'user';
    } catch (error) {
        console.error('Error fetching user role:', error);
        return 'user';
    }
}

async function isAdmin() {
    return (await getCurrentUserRole()) === 'admin';
}

async function isFinder() {
    return (await getCurrentUserRole()) === 'finder';
}

// =============================================================================
// AUTHENTICATION FUNCTIONS
// =============================================================================

// Check if user is authenticated
function checkAuth() {
    // Handle Google sign-in redirect return (when popup was blocked)
    auth.getRedirectResult().then((result) => {
        if (result.user) {
            showAlert('Login successful!', 'success');
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'login.html') {
                window.location.href = 'index.html';
            }
        }
    }).catch((error) => {
        if (error.code && !error.code.startsWith('auth/')) return;
        handleAuthError(error);
    });

    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI();

        // Load appropriate content based on page
        const currentPage = window.location.pathname.split('/').pop();
        console.log('Current page:', currentPage, 'User:', user);

        const authRequiredPages = ['myitems.html', 'report.html', 'myclaims.html'];
        if (authRequiredPages.includes(currentPage)) {
            if (!user) {
                console.log('No user, showing auth required');
                showAuthRequired();
            } else {
                console.log('User logged in, hiding auth required');
                hideAuthRequired();
                if (currentPage === 'myitems.html') {
                    loadUserItems();
                } else if (currentPage === 'myclaims.html') {
                    loadMyClaims();
                }
            }
        }
    });
}

// Update authentication UI elements
function updateAuthUI() {
    const loginLink = document.getElementById('loginLink');
    const logoutLink = document.getElementById('logoutLink');
    const adminLink = document.getElementById('adminLink');
    const welcomeBanner = document.getElementById('welcomeBanner');
    const welcomeNameEl = document.getElementById('welcomeName');

    if (currentUser) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'block';
        // Apply cached role immediately (prevents admin link flicker)
        const cached = readCachedAuthUiState();
        applyAuthUiClasses({ isLoggedIn: true, isAdmin: !!cached?.isAdmin });
        writeCachedAuthUiState({ isLoggedIn: true, isAdmin: !!cached?.isAdmin });

        // Show friendly welcome message on pages that support it (index)
        if (welcomeBanner && welcomeNameEl) {
            const rawName = currentUser.displayName || currentUser.email || '';
            const fallbackName = currentUser.email ? currentUser.email.split('@')[0] : '';
            const finalName = rawName || fallbackName || 'User';
            welcomeNameEl.textContent = finalName;
            welcomeBanner.style.display = 'block';
        }
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';
        applyAuthUiClasses({ isLoggedIn: false, isAdmin: false });
        writeCachedAuthUiState({ isLoggedIn: false, isAdmin: false });

        if (welcomeBanner && welcomeNameEl) {
            welcomeBanner.style.display = 'none';
            welcomeNameEl.textContent = '';
        }
    }

    // Admin link visibility and hiding user-specific links for admins
    if (currentUser) {
        currentUser.getIdTokenResult()
            .then((token) => {
                const isAdmin = token.claims && token.claims.admin === true;

                // Show/Hide Admin Link if it exists
                if (adminLink) {
                    adminLink.style.display = isAdmin ? 'block' : 'none';
                }

                applyAuthUiClasses({ isLoggedIn: true, isAdmin });
                writeCachedAuthUiState({ isLoggedIn: true, isAdmin });

                // Hide Report/My Items/My Claims for admins to declutter
                const reportLink = document.getElementById('navReportLink');
                const myItemsLink = document.getElementById('navMyItemsLink');
                const myClaimsLink = document.getElementById('navMyClaimsLink');
                if (isAdmin) {
                    if (reportLink) reportLink.style.display = 'none';
                    if (myItemsLink) myItemsLink.style.display = 'none';
                    if (myClaimsLink) myClaimsLink.style.display = 'none';
                } else {
                    if (reportLink) reportLink.style.display = 'block';
                    if (myItemsLink) myItemsLink.style.display = 'block';
                    if (myClaimsLink) myClaimsLink.style.display = 'block';
                }
            })
            .catch((err) => {
                console.error('Error getting token result:', err);
                if (adminLink) adminLink.style.display = 'none';
                applyAuthUiClasses({ isLoggedIn: true, isAdmin: false });
                writeCachedAuthUiState({ isLoggedIn: true, isAdmin: false });
            });
    } else {
        if (adminLink) adminLink.style.display = 'none';
    }
}

// Show authentication required message
function showAuthRequired() {
    const authRequired = document.getElementById('authRequired');
    const form = document.getElementById('reportForm');
    const filterSection = document.getElementById('filterSection');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const itemsContainer = document.getElementById('itemsContainer');
    const noItemsMessage = document.getElementById('noItemsMessage');

    console.log('Showing auth required:', {
        authRequired: !!authRequired,
        form: !!form,
        filterSection: !!filterSection
    });

    if (authRequired) authRequired.style.display = 'block';
    if (form) form.style.display = 'none';
    if (filterSection) filterSection.style.display = 'none';
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    if (itemsContainer) itemsContainer.innerHTML = '';
    if (noItemsMessage) noItemsMessage.style.display = 'none';
    const claimsContentSection = document.getElementById('claimsContentSection');
    if (claimsContentSection) claimsContentSection.style.display = 'none';
}

// Hide authentication required message
function hideAuthRequired() {
    const authRequired = document.getElementById('authRequired');
    const form = document.getElementById('reportForm');
    const filterSection = document.getElementById('filterSection');

    if (authRequired) authRequired.style.display = 'none';
    if (form) form.style.display = 'block';
    if (filterSection) filterSection.style.display = 'block';
    const claimsContentSection = document.getElementById('claimsContentSection');
    if (claimsContentSection) claimsContentSection.style.display = 'block';

    console.log('Auth required hidden, form shown');
}

// Sign up function
async function signUp(email, password) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        showAlert('Account created successfully!', 'success');
        return userCredential.user;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Sign in function
async function signIn(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        showAlert('Login successful!', 'success');
        return userCredential.user;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

// Sign out function
async function signOut() {
    try {
        if (isSigningOut) {
            return;
        }
        isSigningOut = true;

        // Update cached UI state immediately to avoid flicker during redirect
        writeCachedAuthUiState({ isLoggedIn: false, isAdmin: false });
        applyAuthUiClasses({ isLoggedIn: false, isAdmin: false });

        await auth.signOut();

        // Persist a one-time flag so the next page (login) can show a success toast
        try {
            window.sessionStorage.setItem('lf_logout_success', '1');
        } catch (storageError) {
            console.warn('Unable to persist logout flag:', storageError);
        }

        window.location.href = 'login.html';
    } catch (error) {
        showAlert('Error signing out: ' + error.message, 'danger');
        isSigningOut = false;
    }
}

// Sign in with Google (popup; falls back to redirect if popup blocked)
async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const userCredential = await auth.signInWithPopup(provider);
        showAlert('Login successful!', 'success');
        return userCredential.user;
    } catch (error) {
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
            try {
                await auth.signInWithRedirect(provider);
                return null; // Page will reload; getRedirectResult() handles success
            } catch (redirectError) {
                handleAuthError(redirectError);
                throw redirectError;
            }
        }
        handleAuthError(error);
        throw error;
    }
}

// Handle authentication errors
function handleAuthError(error) {
    console.error('Auth error:', error);
    let message = 'An error occurred. Please try again.';

    if (error && error.code) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'This email is already registered.';
                break;
            case 'auth/weak-password':
                message = 'Password should be at least 6 characters.';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address.';
                break;
            case 'auth/user-not-found':
                message = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password.';
                break;
            case 'auth/too-many-requests':
                message = 'Too many failed attempts. Please try again later.';
                break;
            case 'auth/popup-closed-by-user':
                message = 'Sign-in popup was closed before completion.';
                break;
            case 'auth/popup-blocked':
                message = 'Sign-in popup was blocked. Try "Continue with Google" again or allow popups.';
                break;
            case 'auth/cancelled-popup-request':
                message = 'Sign-in was cancelled.';
                break;
            case 'auth/operation-not-allowed':
                message = 'This sign-in method is not enabled. Enable Email/Password or Google in Firebase Console → Authentication → Sign-in method.';
                break;
            case 'auth/account-exists-with-different-credential':
                message = 'An account already exists with this email. Try signing in with email/password.';
                break;
            case 'auth/unauthorized-domain':
                message = 'This domain is not authorized for sign-in. Add your domain (e.g. localhost) in Firebase Console → Authentication → Authorized domains.';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Check your internet connection and try again.';
                break;
            case 'auth/web-storage-unsupported':
                message = 'Browser storage is blocked. Enable cookies for this site or try another browser.';
                break;
            case 'auth/internal-error':
                message = 'Server error. Please try again in a moment.';
                break;
            case 'auth/invalid-api-key':
            case 'auth/api-key-not-valid':
                message = 'Invalid app configuration. Please contact support.';
                break;
            default:
                // For any other auth error, show Firebase message if available
                if (error.code.startsWith('auth/') && error.message) {
                    message = error.message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '').trim() || message;
                }
                break;
        }
    } else if (error && error.message) {
        message = error.message;
    }

    showAlert(message, 'danger');
}

// =============================================================================
// FIRESTORE FUNCTIONS
// =============================================================================

// Helper: map Firestore doc to a public listing item (no sensitive fields)
function mapDocToPublicListingItem(doc) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        // Public-facing fields
        itemName: data.itemName || data.title || 'Untitled Item',
        category: data.category || 'Uncategorized',
        status: data.status || 'available',
        createdAt: data.createdAt || null,
        userId: data.userId || null
    };
}

// Load all items from Firestore
async function loadItems() {
    try {
        showLoading(true);
        const snapshot = await itemsCollection.orderBy('createdAt', 'desc').get();
        const fetchedItems = [];

        snapshot.forEach(doc => {
            fetchedItems.push(mapDocToPublicListingItem(doc));
        });

        items = fetchedItems.filter(item => !isResolvedStatus(item.status));
        displayItems(items);
        showLoading(false);
    } catch (error) {
        console.error('Error loading items:', error);
        showAlert('Error loading items: ' + error.message, 'danger');
        showLoading(false);
    }
}

// Load user's items from Firestore
async function loadUserItems() {
    if (!currentUser) {
        console.log('No current user, cannot load user items');
        showAuthRequired();
        return;
    }

    try {
        showLoading(true);
        console.log('Loading items for user:', currentUser.uid);

        // Try to load items with proper error handling
        let snapshot;
        try {
            snapshot = await itemsCollection
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();
        } catch (queryError) {
            console.warn('OrderBy query failed, trying without orderBy:', queryError);
            // If orderBy fails, try without it (in case of missing index)
            snapshot = await itemsCollection
                .where('userId', '==', currentUser.uid)
                .get();
        }

        const userItems = [];
        snapshot.forEach(doc => {
            const itemData = mapDocToPublicListingItem(doc);
            console.log('Processing item:', doc.id, itemData);
            userItems.push(itemData);
        });

        items = userItems.filter(item => !isResolvedStatus(item.status));
        console.log('Loaded user items:', items.length, items);
        displayItems(items);
        showLoading(false);
    } catch (error) {
        console.error('Error loading user items:', error);
        showAlert('Error loading your items: ' + error.message, 'danger');
        showLoading(false);

        // Show empty state on error
        displayItems([]);
    }
}

async function loadMyClaims() {
    if (!currentUser) return;
    const container = document.getElementById('myClaimsContainer');
    const spinner = document.getElementById('claimsLoadingSpinner');
    const noClaimsMessage = document.getElementById('noClaimsMessage');
    if (!container) return;
    try {
        if (spinner) spinner.style.display = 'block';
        if (noClaimsMessage) noClaimsMessage.style.display = 'none';
        const snapshot = await db.collection('claims')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        const claimsPromises = snapshot.docs.map(async (doc) => {
            const claim = { id: doc.id, ...doc.data() };
            if (claim.status === 'approved' && claim.itemId) {
                try {
                    const itemDoc = await itemsCollection.doc(claim.itemId).get();
                    if (itemDoc.exists) {
                        const itemData = itemDoc.data();
                        claim.enquiryName = itemData.enquiryName;
                        claim.enquiryPhone = itemData.enquiryPhone;
                        // Also fetch location if needed, though usually enquiry name is enough
                    }
                } catch (e) {
                    console.error('Error fetching item details for claim:', e);
                }
            }
            return claim;
        });

        const claims = await Promise.all(claimsPromises);
        displayMyClaims(claims);
    } catch (error) {
        console.error('Error loading claims:', error);
        container.innerHTML = '';
        if (noClaimsMessage) {
            noClaimsMessage.style.display = 'block';
            noClaimsMessage.innerHTML = '<p class="text-muted mb-0">Unable to load your claims.</p>';
        }
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

function displayMyClaims(claims) {
    const container = document.getElementById('myClaimsContainer');
    const noClaimsMessage = document.getElementById('noClaimsMessage');
    if (!container) return;
    if (!claims || claims.length === 0) {
        container.innerHTML = '';
        if (noClaimsMessage) noClaimsMessage.style.display = 'block';
        return;
    }
    if (noClaimsMessage) noClaimsMessage.style.display = 'none';
    const html = claims.map(claim => {
        const status = (claim.status || 'pending').toLowerCase();
        let statusLabel = 'Pending';
        let statusClass = 'bg-secondary';
        if (status === 'approved') { statusLabel = 'Accepted'; statusClass = 'bg-success'; }
        else if (status === 'rejected') { statusLabel = 'Rejected'; statusClass = 'bg-danger'; }
        let dateStr = '—';
        if (claim.createdAt) {
            try {
                const ts = claim.createdAt.toDate ? claim.createdAt.toDate() : (claim.createdAt.seconds ? new Date(claim.createdAt.seconds * 1000) : null);
                if (ts) dateStr = formatDate(ts);
            } catch (e) { }
        }
        const itemName = claim.itemName || 'Unknown item';
        const itemId = claim.itemId || '';
        const rejectionReason = (claim.rejectionReason || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <span class="badge ${statusClass} mb-2">${statusLabel}</span>
                        <h6 class="card-title">${itemName}</h6>
                        <p class="text-muted small mb-1"><i class="fas fa-calendar me-1"></i>${dateStr}</p>
                        ${status === 'rejected' && rejectionReason ? `<p class="small text-danger mb-0">${rejectionReason}</p>` : ''}
                        ${status === 'approved' ? `
                            <div class="mt-2 p-2 bg-light rounded border border-success bg-opacity-10">
                                <p class="mb-1 small text-success"><strong><i class="fas fa-check-circle me-1"></i>Ready for Collection</strong></p>
                                <p class="mb-1 small"><strong>Place:</strong> ${claim.enquiryName || 'Enquiry Desk'}</p>
                                <p class="mb-0 small"><strong>Phone:</strong> ${claim.enquiryPhone || 'Not available'}</p>
                            </div>
                        ` : ''}
                        <a href="item.html?id=${encodeURIComponent(itemId)}" class="btn btn-outline-primary btn-sm mt-2">View item</a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    if (typeof requestAnimationFrame !== 'function') {
        container.innerHTML = html;
        return;
    }
    requestAnimationFrame(() => { container.innerHTML = html; });
}

async function loadResolvedItems() {
    try {
        showLoading(true);
        console.log('Loading resolved items for history view');

        resolvedItems = [];

        // Load items that are marked as resolved
        const resolvedSnapshot = await itemsCollection
            .where('status', '==', ITEM_STATUS.RESOLVED)
            .get();

        resolvedSnapshot.forEach(doc => {
            resolvedItems.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Also include items marked as returned (admin action)
        const returnedSnapshot = await itemsCollection
            .where('status', '==', ITEM_STATUS.RETURNED)
            .get();

        returnedSnapshot.forEach(doc => {
            resolvedItems.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort by resolution time (fallback to updatedAt, then createdAt)
        resolvedItems.sort((a, b) => {
            const aSource = a.resolvedAt || a.updatedAt || a.createdAt;
            const bSource = b.resolvedAt || b.updatedAt || b.createdAt;

            const aDate = aSource?.toDate
                ? aSource.toDate().getTime()
                : (aSource?.seconds || 0) * 1000;
            const bDate = bSource?.toDate
                ? bSource.toDate().getTime()
                : (bSource?.seconds || 0) * 1000;

            return (bDate || 0) - (aDate || 0);
        });

        updateHistorySummary(resolvedItems);
        // History filter removed: always show all resolved/returned items
        displayHistoryItems(resolvedItems);
        showLoading(false);
    } catch (error) {
        console.error('Error loading resolved items:', error);
        showAlert('Error loading resolved items: ' + error.message, 'danger');
        updateHistorySummary([]);
        displayHistoryItems([]);
        showLoading(false);
    }
}

// Add new item to Firestore
async function addItem(itemData) {
    try {
        const docRef = await itemsCollection.add({
            ...itemData,
            reporterPhone: itemData.reporterPhone || itemData.contactPhone || '',
            givenToEnquiry: itemData.givenToEnquiry ?? false,
            enquiryName: itemData.enquiryName ?? null,
            enquiryPhone: itemData.enquiryPhone ?? null,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Item added with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding item:', error);
        throw error;
    }
}

// Update item in Firestore
async function updateItem(itemId, itemData) {
    try {
        await itemsCollection.doc(itemId).update({
            ...itemData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Item updated:', itemId);
    } catch (error) {
        console.error('Error updating item:', error);
        throw error;
    }
}

// Delete item from Firestore
async function deleteItem(itemId) {
    try {
        await itemsCollection.doc(itemId).delete();
        console.log('Item deleted:', itemId);
    } catch (error) {
        console.error('Error deleting item:', error);
        throw error;
    }
}

// Get single item from Firestore
async function getItem(itemId) {
    try {
        const doc = await itemsCollection.doc(itemId).get();
        if (doc.exists) {
            return {
                id: doc.id,
                ...doc.data()
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting item:', error);
        throw error;
    }
}

// =============================================================================
// FIREBASE STORAGE FUNCTIONS
// =============================================================================

// Upload image to Firebase Storage
async function uploadImage(file, itemId) {
    if (!file) return null;

    try {
        const storageRef = storage.ref();
        const imageRef = storageRef.child(`item-images/${itemId}/${file.name}`);

        const snapshot = await imageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();

        console.log('Image uploaded:', downloadURL);
        return downloadURL;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

// Delete image from Firebase Storage
async function deleteImage(imageUrl) {
    if (!imageUrl) return;

    try {
        const imageRef = storage.refFromURL(imageUrl);
        await imageRef.delete();
        console.log('Image deleted:', imageUrl);
    } catch (error) {
        console.error('Error deleting image:', error);
        // Don't throw error as image might not exist
    }
}

// =============================================================================
// UI FUNCTIONS
// =============================================================================

function isResolvedStatus(status) {
    const s = (status || '').toLowerCase();
    return s === 'resolved' || s === 'returned';
}

// Display items in the grid (uses rAF to avoid blocking main thread and reduce mobile lag)
function displayItems(itemsToShow) {
    const container = document.getElementById('itemsContainer');
    const noItemsMessage = document.getElementById('noItemsMessage');

    if (!container) return;

    function paint() {
        if (itemsToShow.length === 0) {
            container.innerHTML = '';
            if (noItemsMessage) {
                noItemsMessage.style.display = 'flex';
            }
            return;
        }
        if (noItemsMessage) noItemsMessage.style.display = 'none';
        container.innerHTML = itemsToShow.map(item => createItemCard(item)).join('');
    }

    if (typeof requestAnimationFrame !== 'function') {
        paint();
        return;
    }
    requestAnimationFrame(paint);
}

// Create item card HTML
function createItemCard(item) {
    try {
        const title = item.itemName || item.title || 'Untitled Item';
        const category = item.category || 'Uncategorized';
        const rawStatus = (item.status || 'available').toString();
        const normalizedStatus = rawStatus.toLowerCase();

        // Map internal status values to user-friendly labels
        let statusLabel = 'Available';
        let statusClass = 'badge-status-available';

        if (normalizedStatus === 'claimed' || normalizedStatus === 'pending') {
            statusLabel = 'Claim Pending';
            statusClass = 'badge-status-claimed';
        } else if (normalizedStatus === 'returned' || normalizedStatus === 'resolved') {
            statusLabel = 'Returned';
            statusClass = 'badge-status-returned';
        } else if (normalizedStatus === 'lost') {
            statusLabel = 'Lost';
            statusClass = 'badge-status-lost';
        } else if (normalizedStatus === 'found') {
            statusLabel = 'Found';
            statusClass = 'badge-status-found';
        }

        // Handle date formatting safely
        let date = 'Unknown date';
        if (item.createdAt) {
            try {
                if (item.createdAt.toDate && typeof item.createdAt.toDate === 'function') {
                    date = formatDate(item.createdAt.toDate());
                } else if (item.createdAt instanceof Date) {
                    date = formatDate(item.createdAt);
                } else if (item.createdAt.seconds) {
                    date = formatDate(new Date(item.createdAt.seconds * 1000));
                }
            } catch (dateError) {
                console.warn('Date formatting error:', dateError);
                date = 'Unknown date';
            }
        }

        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card item-card h-100">
                    <div class="card-body d-flex flex-column position-relative">
                        <span class="item-status-badge badge-status ${statusClass}">
                            ${statusLabel}
                        </span>
                        <h5 class="card-title mb-2">${title}</h5>
                        <p class="text-muted small mb-1">
                            <i class="fas fa-tags me-1"></i>${category}
                        </p>
                        <p class="text-muted small mb-3">
                            <i class="fas fa-calendar me-1"></i>${date}
                        </p>
                        <div class="mt-auto d-grid">
                            <button class="btn btn-primary btn-sm" onclick="viewItem('${item.id}')">
                                <i class="fas fa-hand-paper me-1"></i>View &amp; Claim
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error creating item card:', error, item);
        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card item-card h-100">
                    <div class="card-body">
                        <h5 class="card-title text-danger">Error loading item</h5>
                        <p class="card-text text-muted">There was an error displaying this item.</p>
                    </div>
                </div>
            </div>
        `;
    }
}

function displayHistoryItems(itemsToShow) {
    const container = document.getElementById('historyItemsContainer');
    const emptyState = document.getElementById('historyEmptyState');

    if (!container) return;

    function paint() {
        if (!itemsToShow || itemsToShow.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }
        if (emptyState) emptyState.style.display = 'none';
        container.innerHTML = itemsToShow.map(item => createHistoryCard(item)).join('');
    }
    if (typeof requestAnimationFrame !== 'function') {
        paint();
        return;
    }
    requestAnimationFrame(paint);
}

function updateHistorySummary(items = []) {
    const totalEl = document.getElementById('historyResolvedCount');
    const enquiryEl = document.getElementById('historyEnquiryCount');
    const directEl = document.getElementById('historyDirectCount');

    if (!totalEl || !enquiryEl || !directEl) return;

    const total = items.length;
    const enquiry = items.filter(item => item.givenToEnquiry).length;
    const direct = total - enquiry;

    totalEl.textContent = total;
    enquiryEl.textContent = enquiry;
    directEl.textContent = direct;
}

function filterHistoryItems(filterValue = 'all') {
    let filtered = resolvedItems;
    if (filterValue === 'enquiry') {
        filtered = resolvedItems.filter(item => item.givenToEnquiry);
    } else if (filterValue === 'reporter') {
        filtered = resolvedItems.filter(item => !item.givenToEnquiry);
    }

    displayHistoryItems(filtered);
}

function createHistoryCard(item) {
    const imageUrl = item.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image';
    const contactFromEnquiry = !!item.givenToEnquiry;
    const contactLabel = contactFromEnquiry ? 'Building Enquiry' : 'Reporter';
    const contactName = contactFromEnquiry ? (item.enquiryName || 'Not provided') : (item.contactName || 'Not provided');
    const contactPhone = contactFromEnquiry ? (item.enquiryPhone || 'Not provided') : (item.reporterPhone || item.contactPhone || 'Not provided');

    // Prefer the actual resolution time; fall back to last update / creation time
    let resolvedDate = 'Unknown date';
    const resolvedSource = item.resolvedAt || item.updatedAt || item.createdAt;

    if (resolvedSource) {
        try {
            if (resolvedSource.toDate && typeof resolvedSource.toDate === 'function') {
                resolvedDate = formatDate(resolvedSource.toDate());
            } else if (resolvedSource instanceof Date) {
                resolvedDate = formatDate(resolvedSource);
            } else if (resolvedSource.seconds) {
                resolvedDate = formatDate(new Date(resolvedSource.seconds * 1000));
            }
        } catch (error) {
            console.warn('Error formatting resolved date:', error);
        }
    }

    return `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card h-100 history-card">
                <div class="position-relative">
                    <img src="${imageUrl}" loading="lazy" class="card-img-top item-image" alt="${item.title || 'Item'}">
                    <span class="badge badge-resolved item-status-badge text-uppercase">Resolved</span>
                </div>
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${item.title || 'Untitled Item'}</h5>
                    <p class="text-muted small mb-2">
                        <i class="fas fa-calendar-check me-1"></i>
                        Resolved on ${resolvedDate}
                    </p>
                    <p class="text-muted small mb-3">
                        <i class="fas fa-map-marker-alt me-1"></i>
                        ${item.location || 'Unknown location'}
                    </p>
                    <div class="mt-auto">
                        <p class="mb-1"><strong>${contactLabel} Name:</strong> ${contactName}</p>
                        <p class="mb-0"><strong>${contactLabel} Phone:</strong> ${contactPhone}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// View single item details
async function viewItem(itemId) {
    window.location.href = `item.html?id=${itemId}`;
}

// Load and display single item
async function loadItemDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');

    if (!itemId) {
        showItemNotFound();
        return;
    }

    try {
        showLoading(true);
        const item = await getItem(itemId);

        if (!item) {
            showItemNotFound();
            return;
        }

        displayItemDetails(item);
        showLoading(false);
    } catch (error) {
        console.error('Error loading item details:', error);
        showAlert('Error loading item details: ' + error.message, 'danger');
        showLoading(false);
    }
}

// Display item details
async function displayItemDetails(item) {
    const itemDetails = document.getElementById('itemDetails');
    const actionButtons = document.getElementById('actionButtons');

    if (!itemDetails) return;

    // Store current item data for editing
    currentItemData = item;
    currentItemId = item.id;
    console.log('Item data stored for editing:', currentItemData);

    const role = await getCurrentUserRole();
    const isAdminUser = role === 'admin';
    const enquiryActionSection = document.getElementById('enquiryActionSection');
    const resolveBtn = document.getElementById('resolveBtn');

    // Update item information (public fields)
    const itemTitleEl = document.getElementById('itemTitle');
    const itemStatusEl = document.getElementById('itemStatus');
    const itemCategoryEl = document.getElementById('itemCategory');

    if (itemTitleEl) {
        itemTitleEl.textContent = item.itemName || item.title || 'Untitled Item';
    }

    if (itemStatusEl) {
        // Status badge is only meaningful for admins and item owners
        itemStatusEl.textContent = item.status || 'Unknown';
        if (!isAdminUser) {
            itemStatusEl.style.display = 'none';
        } else {
            itemStatusEl.style.display = 'inline-block';
        }
    }

    if (itemCategoryEl) {
        itemCategoryEl.textContent = item.category || 'Uncategorized';
    }

    const itemDateEl = document.getElementById('itemDate');
    if (itemDateEl) {
        if (item.createdAt && typeof item.createdAt.toDate === 'function') {
            itemDateEl.textContent = formatDate(item.createdAt.toDate());
        } else if (item.date) {
            const parsedDate = new Date(item.date);
            itemDateEl.textContent = isNaN(parsedDate) ? item.date : formatDate(parsedDate);
        } else {
            itemDateEl.textContent = 'Not available';
        }
    }

    const descriptionSection = document.getElementById('descriptionSection');
    const reporterSection = document.getElementById('reporterSection');
    const contactSection = document.getElementById('contactSection');
    const descriptionEl = document.getElementById('itemDescription');
    const reporterEl = document.getElementById('itemReporter');
    const claimButtonContainer = document.getElementById('claimButtonContainer');

    if (isAdminUser) {
        // Admins can view full item details and finder contact
        if (descriptionSection) descriptionSection.style.display = 'block';
        if (reporterSection) reporterSection.style.display = 'block';
        if (contactSection) contactSection.style.display = 'block';

        if (descriptionEl) {
            descriptionEl.textContent = item.description || 'No description';
        }

        if (reporterEl) {
            reporterEl.textContent = item.userEmail || 'Unknown';
        }

        // Update contact information with building enquiry support
        const contactHeading = document.getElementById('contactInfoHeading');
        const contactNameEl = document.getElementById('contactName');
        const isGivenToEnquiry = !!item.givenToEnquiry;

        if (contactHeading) {
            contactHeading.textContent = isGivenToEnquiry ? 'Building Enquiry Contact' : 'Reporter Contact';
        }

        if (contactNameEl) {
            if (isGivenToEnquiry) {
                contactNameEl.textContent = item.enquiryName || 'Not provided';
            } else {
                contactNameEl.textContent = item.contactName || 'Not provided';
            }
        }

        if (claimButtonContainer) {
            claimButtonContainer.style.display = 'none';
        }
    } else {
        // Normal users see only limited fields and a claim button
        if (descriptionSection) descriptionSection.style.display = 'none';
        if (reporterSection) reporterSection.style.display = 'none';
        if (contactSection) contactSection.style.display = 'none';

        if (claimButtonContainer) {
            // Only show claim button if viewer is logged in and not the owner
            if (currentUser && item.userId !== currentUser.uid) {
                claimButtonContainer.style.display = 'block';
                const claimBtn = document.getElementById('claimBtn');
                if (claimBtn) {
                    const existingClaimId = `${item.id}_${currentUser.uid}`;
                    db.collection('claims').doc(existingClaimId).get().then((snap) => {
                        if (snap.exists) {
                            claimBtn.disabled = true;
                            claimBtn.textContent = 'Already claimed';
                        }
                    }).catch(() => { });
                }
            } else {
                claimButtonContainer.style.display = 'none';
            }
        }
    }

    // Show action buttons if user owns the item
    if (currentUser && item.userId === currentUser.uid) {
        if (actionButtons) {
            actionButtons.style.display = 'block';
        }
        // For non-admin owners (users viewing their own item from "My Items"),
        // only allow Edit and Delete – hide "Mark as Resolved" and Building Enquiry UI.
        if (!isAdminUser) {
            if (resolveBtn) {
                resolveBtn.style.display = 'none';
            }
            if (enquiryActionSection) {
                enquiryActionSection.style.display = 'none';
            }
        } else {
            // Admins can still see and use resolve + enquiry controls if needed
            if (resolveBtn) {
                resolveBtn.style.display = isResolvedStatus(item.status) ? 'none' : 'block';
            }
            initializeEnquirySection(item);
            if (enquiryActionSection) {
                enquiryActionSection.style.display = 'block';
            }
        }
    } else if (actionButtons) {
        actionButtons.style.display = 'none';
    }

    itemDetails.style.display = 'block';
}

// Sensitive fields are still stored in Firestore, but intentionally not rendered
// in the public item details UI. A future admin panel can use this accessor.
function getSensitiveItemFieldsForAdmin(item) {
    return {
        location: item?.location ?? null,
        reporterPhone: item?.reporterPhone ?? item?.contactPhone ?? null,
        imageUrl: item?.imageUrl ?? null
    };
}

// =============================================================================
// CLAIM FUNCTIONS
// =============================================================================

async function handleClaimItem() {
    if (!currentUser) {
        showAlert('Please login to claim this item.', 'warning');
        return;
    }

    if (!currentItemId) {
        showAlert('No item selected to claim.', 'danger');
        return;
    }

    try {
        const role = await getCurrentUserRole();
        if (role === 'admin') {
            showAlert('Admins do not need to claim items.', 'info');
            return;
        }

        await updateItem(currentItemId, {
            claimRequestedBy: currentUser.uid,
            claimRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            claimRequesterEmail: currentUser.email || null
        });

        showAlert('Your claim has been sent to the admin for review.', 'success');
    } catch (error) {
        console.error('Error submitting claim:', error);
        showAlert('Error submitting claim: ' + error.message, 'danger');
    }
}

// New claim flow using a detailed form and subcollection
function openClaimModal() {
    if (!currentUser) {
        showAlert('Please login to claim this item.', 'warning');
        return;
    }

    if (!currentItemId) {
        showAlert('No item selected to claim.', 'danger');
        return;
    }

    const modalEl = document.getElementById('claimModal');
    if (!modalEl) return;

    const claimModal = new bootstrap.Modal(modalEl);

    const nameInput = document.getElementById('claimName');
    const phoneInput = document.getElementById('claimPhone');
    if (nameInput && !nameInput.value) {
        nameInput.value = currentUser.displayName || '';
    }
    if (phoneInput && !phoneInput.value && currentUser.phoneNumber) {
        phoneInput.value = currentUser.phoneNumber;
    }

    claimModal.show();
}

async function handleClaimForm(event) {
    if (event) {
        event.preventDefault();
    }

    if (!currentUser) {
        showAlert('Please login to claim this item.', 'warning');
        return;
    }

    if (!currentItemId) {
        showAlert('No item selected to claim.', 'danger');
        return;
    }

    const role = await getCurrentUserRole();
    if (role === 'admin') {
        showAlert('Admins do not need to claim items.', 'info');
        return;
    }

    // One claim per user per item: block if user already claimed this item
    const claimId = `${currentItemId}_${currentUser.uid}`;
    try {
        const existingClaim = await db.collection('claims').doc(claimId).get();
        if (existingClaim.exists) {
            showAlert('You have already submitted a claim for this item. You cannot claim it again.', 'warning');
            return;
        }
    } catch (e) {
        console.warn('Could not check existing claim:', e);
    }

    const nameInput = document.getElementById('claimName');
    const phoneInput = document.getElementById('claimPhone');
    const descInput = document.getElementById('claimDescription');
    const lostWhereInput = document.getElementById('claimLostWhere');
    const markInput = document.getElementById('claimIdentifyingMark');
    const billInput = document.getElementById('claimBillImage');
    const submitBtn = document.getElementById('submitClaimBtn');
    const spinner = document.getElementById('claimSpinner');

    if (!nameInput || !phoneInput || !descInput || !lostWhereInput || !markInput || !submitBtn) {
        showAlert('Claim form is not available. Please reload the page.', 'danger');
        return;
    }

    const userName = nameInput.value.trim();
    const userPhone = phoneInput.value.trim();
    const proofDescription = descInput.value.trim();
    const lostLocation = lostWhereInput.value.trim();
    const identifyingMark = markInput.value.trim();
    const billFile = billInput?.files?.[0] || null;

    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;

    try {
        if (!userName || !userPhone || !proofDescription || !lostLocation || !identifyingMark) {
            throw new Error('Please fill in all required fields.');
        }

        if (!phoneRegex.test(userPhone)) {
            throw new Error('Please enter a valid phone number.');
        }

        // claimId already set above (duplicate check)
        // Final confirmation
        const confirmed = window.confirm('Submit this claim for admin review? You will need to show proof of ownership when you collect the item.');
        if (!confirmed) {
            return;
        }

        submitBtn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';

        let billImageURL = null;

        if (billFile) {
            try {
                const storageRef = storage.ref();
                // Store in claim-proofs/{claimId}/{filename}
                const billRef = storageRef.child(`claim-proofs/${claimId}/${Date.now()}-${billFile.name}`);
                const snapshot = await billRef.put(billFile);
                billImageURL = await snapshot.ref.getDownloadURL();
            } catch (uploadError) {
                console.error('Error uploading bill image:', uploadError);
                // Continue without bill image or fail? User request said "optional string", so continue.
            }
        }

        // Ensure we have item data (especially image)
        if (currentItemId && (!currentItemData || !currentItemData.imageUrl)) {
            try {
                console.log('Refetching item data for claim submission...');
                const itemDoc = await itemsCollection.doc(currentItemId).get();
                if (itemDoc.exists) {
                    const fetchedData = itemDoc.data();
                    currentItemData = { ...currentItemData, ...fetchedData };
                    // Normalize image URL
                    currentItemData.imageUrl = fetchedData.imageUrl || fetchedData.photoURL || fetchedData.imageURL || null;
                }
            } catch (e) {
                console.error('Error fetching item data for claim:', e);
            }
        }

        const itemName = currentItemData?.itemName || currentItemData?.title || 'Unknown Item';
        const itemImageRaw = currentItemData?.imageUrl || currentItemData?.photoURL || currentItemData?.imageURL || null;

        const claimData = {
            itemId: currentItemId,
            itemName: itemName,
            itemImage: itemImageRaw,
            userId: currentUser.uid,
            userName: userName,
            userPhone: userPhone,
            proofDescription: proofDescription,
            identifyingMark: identifyingMark,
            lostLocation: lostLocation,
            billImageURL: billImageURL,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedAt: null,
            reviewedBy: null
        };

        // Save to root 'claims' collection with composite ID
        await db.collection('claims').doc(claimId).set(claimData);

        showAlert('Claim Submitted! Your claim is pending admin review.', 'success');

        if (billInput) billInput.value = '';
        descInput.value = '';
        lostWhereInput.value = '';
        markInput.value = '';

        const modalEl = document.getElementById('claimModal');
        const claimModal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (claimModal) {
            claimModal.hide();
        }

        // Disable claim button? The user request said "Disable claim button".
        const claimBtn = document.getElementById('claimBtn');
        if (claimBtn) {
            claimBtn.disabled = true;
            claimBtn.textContent = 'Claim Submitted';
        }

    } catch (error) {
        console.error('Error submitting claim:', error);
        showAlert('Error submitting claim: ' + error.message, 'danger');
    } finally {
        submitBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// Show item not found message
function showItemNotFound() {
    const itemNotFound = document.getElementById('itemNotFound');
    const itemDetails = document.getElementById('itemDetails');

    if (itemNotFound) itemNotFound.style.display = 'block';
    if (itemDetails) itemDetails.style.display = 'none';
}

// Show/hide loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

// Show alert message (used as lightweight toast)
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer') || createAlertContainer();

    const alertId = 'alert-' + Date.now();
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show alert-toast" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    alertContainer.insertAdjacentHTML('beforeend', alertHTML);

    // Scroll newest alert into view so users always see feedback
    try {
        const alertElement = document.getElementById(alertId);
        if (alertElement && typeof alertElement.scrollIntoView === 'function') {
            alertElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (e) {
        // Ignore scroll issues – alert is still visible in most layouts
    }

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}

// Create alert container if it doesn't exist
function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alertContainer';
    container.className = 'position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

// Format date for display
function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// =============================================================================
// FORM HANDLING FUNCTIONS
// =============================================================================

// Handle report form submission
async function handleReportForm(event) {
    event.preventDefault();

    if (!currentUser) {
        showAlert('Please login to report an item.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const submitSpinner = document.getElementById('submitSpinner');

    try {
        // Show loading state (only if button exists)
        if (submitBtn) submitBtn.disabled = true;
        if (submitSpinner) submitSpinner.style.display = 'inline-block';

        // Get form data
        const formData = {
            title: document.getElementById('itemTitle').value.trim(),
            description: document.getElementById('itemDescription').value.trim(),
            location: document.getElementById('itemLocation').value.trim(),
            status: ITEM_STATUS.FOUND,
            date: document.getElementById('itemDate').value,
            category: (document.getElementById('itemCategory')?.value || '').trim(),
            contactPhone: document.getElementById('contactPhone').value.trim(),
            contactName: document.getElementById('contactName').value.trim()
        };
        formData.status = 'Found';

        formData.reporterPhone = formData.contactPhone;

        // Building enquiry (required) – from report page
        const reportEnquiryNameEl = document.getElementById('reportEnquiryName');
        const reportEnquiryPhoneEl = document.getElementById('reportEnquiryPhone');
        formData.givenToEnquiry = true;
        formData.enquiryName = reportEnquiryNameEl ? reportEnquiryNameEl.value.trim() : '';
        formData.enquiryPhone = reportEnquiryPhoneEl ? reportEnquiryPhoneEl.value.trim() : '';

        // Validate form data
        if (!formData.title || !formData.description || !formData.location || !formData.status || !formData.date || !formData.contactPhone || !formData.contactName) {
            throw new Error('Please fill in all required fields.');
        }

        if (!formData.enquiryName || !formData.enquiryPhone) {
            throw new Error('Please provide the building enquiry desk name and phone number.');
        }

        // Validate phone number format (basic validation)
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(formData.contactPhone)) {
            throw new Error('Please enter a valid phone number.');
        }

        if (!phoneRegex.test(formData.enquiryPhone)) {
            throw new Error('Please enter a valid enquiry phone number.');
        }

        // Add item to Firestore first to get ID
        const itemId = await addItem(formData);

        // Upload image if provided
        const imageFile = document.getElementById('itemImage').files[0];
        if (imageFile) {
            const imageUrl = await uploadImage(imageFile, itemId);
            await updateItem(itemId, { imageUrl });
        }

        // Show success message
        const successModal = new bootstrap.Modal(document.getElementById('successModal'));
        successModal.show();

        // Clear form
        clearForm();

    } catch (error) {
        console.error('Error submitting form:', error);
        showAlert('Error submitting form: ' + error.message, 'danger');
    } finally {
        // Hide loading state
        if (submitBtn) submitBtn.disabled = false;
        if (submitSpinner) submitSpinner.style.display = 'none';
    }
}

// Clear report form
function clearForm() {
    const form = document.getElementById('reportForm');
    if (form) form.reset();
    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) imagePreview.style.display = 'none';
    const previewImg = document.getElementById('previewImg');
    if (previewImg) previewImg.src = '';
    const itemStatus = document.getElementById('itemStatus');
    if (itemStatus) itemStatus.value = 'Found';
}

// Handle image preview
function handleImagePreview(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
}

// Handle login form submission
async function handleLoginForm(event) {
    event.preventDefault();

    const emailEl = document.getElementById('loginEmail');
    const passwordEl = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');
    const loginSpinner = document.getElementById('loginSpinner');
    if (!emailEl || !passwordEl) return;

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    try {
        if (loginBtn) { loginBtn.disabled = true; }
        if (loginSpinner) { loginSpinner.style.display = 'inline-block'; }

        await signIn(email, password);

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (error) {
        // Error already shown in signIn/handleAuthError
    } finally {
        if (loginBtn) { loginBtn.disabled = false; }
        if (loginSpinner) { loginSpinner.style.display = 'none'; }
    }
}

// Handle signup form submission
async function handleSignupForm(event) {
    event.preventDefault();

    const emailEl = document.getElementById('signupEmail');
    const passwordEl = document.getElementById('signupPassword');
    const confirmEl = document.getElementById('confirmPassword');
    const signupBtn = document.getElementById('signupBtn');
    const signupSpinner = document.getElementById('signupSpinner');
    const nameEl = document.getElementById('signupName');
    if (!emailEl || !passwordEl || !confirmEl || !nameEl) return;

    const fullName = nameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;

    try {
        if (!fullName) {
            showAlert('Please enter your full name.', 'danger');
            return;
        }

        if (password !== confirmPassword) {
            showAlert('Passwords do not match.', 'danger');
            return;
        }

        if (signupBtn) { signupBtn.disabled = true; }
        if (signupSpinner) { signupSpinner.style.display = 'inline-block'; }

        const user = await signUp(email, password);

        // Store the display name on the Firebase Auth profile for later use
        if (user && typeof user.updateProfile === 'function') {
            try {
                await user.updateProfile({ displayName: fullName });
            } catch (profileError) {
                console.warn('Failed to update display name:', profileError);
            }
        }

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (error) {
        // Error already shown in signUp/handleAuthError
    } finally {
        if (signupBtn) { signupBtn.disabled = false; }
        if (signupSpinner) { signupSpinner.style.display = 'none'; }
    }
}

// Handle Google sign-in
async function handleGoogleSignIn() {
    const googleBtn = document.getElementById('googleSignInBtn');

    try {
        if (googleBtn) {
            googleBtn.disabled = true;
            googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in with Google...';
        }

        const user = await signInWithGoogle();
        // If popup succeeded (user returned), redirect. If redirect was used, page will reload.
        if (user) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        }

    } catch (error) {
        // Error shown in signInWithGoogle/handleAuthError
    } finally {
        if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.innerHTML = '<i class="fab fa-google me-2"></i>Continue with Google';
        }
    }
}

// =============================================================================
// SEARCH AND FILTER FUNCTIONS
// =============================================================================

// Filter items based on search and status
function filterItems() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';

    let filteredItems = items;

    // Filter by search term
    if (searchTerm) {
        filteredItems = filteredItems.filter(item =>
            (item.itemName && item.itemName.toLowerCase().includes(searchTerm)) ||
            (item.category && item.category.toLowerCase().includes(searchTerm)) ||
            (item.location && item.location.toLowerCase().includes(searchTerm)) ||
            (item.description && item.description.toLowerCase().includes(searchTerm))
        );
    }

    // Filter by status
    if (statusFilter) {
        filteredItems = filteredItems.filter(item => item.status === statusFilter);
    }

    // Filter by category
    if (categoryFilter) {
        filteredItems = filteredItems.filter(item => item.category === categoryFilter);
    }

    displayItems(filteredItems);
}

// =============================================================================
// EDIT FUNCTIONS
// =============================================================================

// Open edit modal and populate with current item data
function openEditModal(item) {
    console.log('Opening edit modal for item:', item);

    try {
        // Populate form fields with current item data
        document.getElementById('editItemTitle').value = item.title || '';
        document.getElementById('editItemCategory').value = item.category || '';
        document.getElementById('editItemStatus').value = item.status || '';
        document.getElementById('editItemDescription').value = item.description || '';
        document.getElementById('editItemLocation').value = item.location || '';
        document.getElementById('editItemDate').value = item.date || '';
        document.getElementById('editContactPhone').value = item.contactPhone || '';
        document.getElementById('editContactName').value = item.contactName || '';

        // Clear image preview
        document.getElementById('editImagePreview').style.display = 'none';
        document.getElementById('editItemImage').value = '';

        // Show modal
        const editModal = new bootstrap.Modal(document.getElementById('editModal'));
        editModal.show();

        console.log('Edit modal opened successfully');
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showAlert('Error opening edit form: ' + error.message, 'danger');
    }
}

// Handle edit form submission
async function handleEditForm() {
    if (!currentUser) {
        showAlert('Please login to edit an item.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('saveEditBtn');
    const editSpinner = document.getElementById('editSpinner');

    try {
        // Show loading state
        saveBtn.disabled = true;
        editSpinner.style.display = 'inline-block';

        // Get form data
        const formData = {
            title: document.getElementById('editItemTitle').value.trim(),
            category: (document.getElementById('editItemCategory')?.value || '').trim(),
            description: document.getElementById('editItemDescription').value.trim(),
            location: document.getElementById('editItemLocation').value.trim(),
            status: document.getElementById('editItemStatus').value,
            date: document.getElementById('editItemDate').value,
            contactPhone: document.getElementById('editContactPhone').value.trim(),
            contactName: document.getElementById('editContactName').value.trim()
        };

        // Validate form data
        if (!formData.title || !formData.description || !formData.location || !formData.status || !formData.date || !formData.contactPhone || !formData.contactName) {
            throw new Error('Please fill in all required fields.');
        }

        // Validate phone number format
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(formData.contactPhone)) {
            throw new Error('Please enter a valid phone number.');
        }

        formData.reporterPhone = formData.contactPhone;

        // Update item in Firestore
        await updateItem(currentItemId, formData);

        // Upload new image if provided
        const imageFile = document.getElementById('editItemImage').files[0];
        if (imageFile) {
            const imageUrl = await uploadImage(imageFile, currentItemId);
            await updateItem(currentItemId, { imageUrl });
        }

        // Close modal
        const editModal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
        editModal.hide();

        // Show success message
        showAlert('Item updated successfully!', 'success');

        // Reload item details
        loadItemDetails();

    } catch (error) {
        console.error('Error updating item:', error);
        showAlert('Error updating item: ' + error.message, 'danger');
    } finally {
        // Hide loading state
        saveBtn.disabled = false;
        editSpinner.style.display = 'none';
    }
}

async function markItemResolved() {
    if (!currentUser || !currentItemId) {
        showAlert('You must be logged in to update this item.', 'warning');
        return;
    }

    try {
        const resolveBtn = document.getElementById('resolveBtn');
        if (resolveBtn) resolveBtn.disabled = true;

        await updateItem(currentItemId, {
            status: ITEM_STATUS.RESOLVED,
            resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showAlert('Item marked as resolved!', 'success');
        await loadItemDetails();
    } catch (error) {
        console.error('Error marking item resolved:', error);
        showAlert('Error marking item resolved: ' + error.message, 'danger');
    } finally {
        const resolveBtn = document.getElementById('resolveBtn');
        if (resolveBtn) resolveBtn.disabled = false;
    }
}

function initializeEnquirySection(item) {
    const toggle = document.getElementById('actionGivenToEnquiry');
    const nameInput = document.getElementById('actionEnquiryName');
    const phoneInput = document.getElementById('actionEnquiryPhone');

    if (!toggle || !nameInput || !phoneInput) return;

    const isGiven = !!item.givenToEnquiry;
    toggle.checked = isGiven;
    updateEnquiryFieldsVisibility(isGiven);
    nameInput.value = item.enquiryName || '';
    phoneInput.value = item.enquiryPhone || '';
}

function updateEnquiryFieldsVisibility(isVisible) {
    const fields = document.getElementById('actionEnquiryFields');
    if (fields) {
        fields.style.display = isVisible ? 'block' : 'none';
    }
}

async function saveEnquiryDetails() {
    if (!currentUser || !currentItemId) {
        showAlert('You must be logged in to update enquiry details.', 'warning');
        return;
    }

    const toggle = document.getElementById('actionGivenToEnquiry');
    const nameInput = document.getElementById('actionEnquiryName');
    const phoneInput = document.getElementById('actionEnquiryPhone');
    const saveBtn = document.getElementById('saveEnquiryBtn');
    const spinner = document.getElementById('saveEnquirySpinner');

    if (!toggle || !nameInput || !phoneInput || !saveBtn) return;

    const isGiven = toggle.checked;
    const enquiryName = nameInput.value.trim();
    const enquiryPhone = phoneInput.value.trim();
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;

    try {
        saveBtn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';

        if (isGiven) {
            if (!enquiryName || !enquiryPhone) {
                throw new Error('Please provide the building enquiry contact name and phone number.');
            }
            if (!phoneRegex.test(enquiryPhone)) {
                throw new Error('Please enter a valid enquiry phone number.');
            }
        }

        await updateItem(currentItemId, {
            givenToEnquiry: isGiven,
            enquiryName: isGiven ? enquiryName : null,
            enquiryPhone: isGiven ? enquiryPhone : null
        });

        showAlert('Building enquiry information updated.', 'success');
        await loadItemDetails();
    } catch (error) {
        console.error('Error updating enquiry details:', error);
        showAlert('Error updating enquiry details: ' + error.message, 'danger');
    } finally {
        saveBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// =============================================================================
// BUILDING ENQUIRY (ADMIN-ONLY DESTINATION)
// =============================================================================

function openBuildingEnquiryModal() {
    if (!currentUser) {
        showAlert('You must be logged in to submit a building enquiry.', 'warning');
        return;
    }

    if (!currentItemId) {
        showAlert('No item selected for building enquiry.', 'danger');
        return;
    }

    const modalEl = document.getElementById('buildingEnquiryModal');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

// Handle edit image preview
function handleEditImagePreview(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('editImagePreview');
    const previewImg = document.getElementById('editPreviewImg');

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
}

// =============================================================================
// DELETE FUNCTIONS
// =============================================================================

// Delete item with confirmation
async function deleteItemWithConfirmation(itemId) {
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();

    // Set up confirmation handler
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = async () => {
        try {
            // Get item to delete image
            const item = await getItem(itemId);
            if (item && item.imageUrl) {
                await deleteImage(item.imageUrl);
            }

            // Delete item from Firestore
            await deleteItem(itemId);

            deleteModal.hide();
            showAlert('Item deleted successfully!', 'success');

            // Reload appropriate page
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'myitems.html') {
                loadUserItems();
            } else if (currentPage === 'item.html') {
                window.location.href = 'index.html';
            } else if (currentPage === 'history.html') {
                loadResolvedItems();
            } else {
                loadItems();
            }

        } catch (error) {
            console.error('Error deleting item:', error);
            showAlert('Error deleting item: ' + error.message, 'danger');
        }
    };
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Initialize page based on current URL
function initializePage() {
    const currentPage = window.location.pathname.split('/').pop();

    // Set up common event listeners
    setupCommonEventListeners();

    // Page-specific initialization
    switch (currentPage) {
        case 'index.html':
        case '':
            loadItems();
            break;
        case 'myitems.html':
            console.log('Initializing myitems.html, currentUser:', currentUser);
            if (currentUser) {
                loadUserItems();
            } else {
                console.log('No user logged in, showing auth required');
                showAuthRequired();
            }
            break;
        case 'myclaims.html':
            if (currentUser) {
                hideAuthRequired();
                loadMyClaims();
            } else {
                showAuthRequired();
            }
            break;
        case 'item.html':
            loadItemDetails();
            break;
        case 'report.html':
            console.log('Initializing report.html, currentUser:', currentUser);
            if (currentUser) {
                hideAuthRequired();
            } else {
                showAuthRequired();
            }
            break;
        case 'history.html':
            loadResolvedItems();
            break;
        case 'login.html':
            // Show one-time logout success message if user was redirected here after logging out
            try {
                const logoutFlag = window.sessionStorage.getItem('lf_logout_success');
                if (logoutFlag) {
                    showAlert('You have been logged out successfully.', 'success');
                    window.sessionStorage.removeItem('lf_logout_success');
                }
            } catch (e) {
                // Ignore storage issues – login still works without the toast
            }
            break;
    }
}

// Set up common event listeners
function setupCommonEventListeners() {
    // Logout button
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Prevent multiple rapid logout attempts
            if (isSigningOut) {
                return;
            }
            logoutLink.classList.add('disabled');
            logoutLink.setAttribute('aria-disabled', 'true');
            signOut();
        });
    }

    // Search and filter inputs
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const categoryFilterEl = document.getElementById('categoryFilter');
    const debouncedFilter = debounce(filterItems);

    if (searchInput) {
        searchInput.addEventListener('input', debouncedFilter);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', filterItems);
    }
    if (categoryFilterEl) {
        categoryFilterEl.addEventListener('change', filterItems);
    }

    const historyFilterSelect = document.getElementById('historyFilterSelect');
    if (historyFilterSelect) {
        historyFilterSelect.addEventListener('change', (event) => {
            filterHistoryItems(event.target.value);
        });
    }

    // Report form
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', handleReportForm);
    }

    // Image preview
    const imageInput = document.getElementById('itemImage');
    if (imageInput) {
        imageInput.addEventListener('change', handleImagePreview);
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginForm);
    }

    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignupForm);
    }

    // Google sign-in button
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }

    // Edit button (only present on item detail pages)
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (currentItemData) {
                openEditModal(currentItemData);
            } else {
                showAlert('No item data available for editing', 'warning');
            }
        });
    }

    // Save edit button
    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', handleEditForm);
    }

    // Edit image preview
    const editImageInput = document.getElementById('editItemImage');
    if (editImageInput) {
        editImageInput.addEventListener('change', handleEditImagePreview);
    }

    const actionEnquiryToggle = document.getElementById('actionGivenToEnquiry');
    if (actionEnquiryToggle) {
        actionEnquiryToggle.addEventListener('change', (event) => {
            updateEnquiryFieldsVisibility(event.target.checked);
        });
    }

    const saveEnquiryBtn = document.getElementById('saveEnquiryBtn');
    if (saveEnquiryBtn) {
        saveEnquiryBtn.addEventListener('click', saveEnquiryDetails);
    }

    const openBuildingEnquiryBtn = document.getElementById('openBuildingEnquiryBtn');
    if (openBuildingEnquiryBtn) {
        openBuildingEnquiryBtn.addEventListener('click', openBuildingEnquiryModal);
    }

    const resolveBtn = document.getElementById('resolveBtn');
    if (resolveBtn) {
        resolveBtn.addEventListener('click', markItemResolved);
    }

    // Delete buttons
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (currentItemId) {
                deleteItemWithConfirmation(currentItemId);
            }
        });
    }

    // Claim button (normal users)
    const claimBtn = document.getElementById('claimBtn');
    if (claimBtn) {
        claimBtn.addEventListener('click', openClaimModal);
    }

    const submitClaimBtn = document.getElementById('submitClaimBtn');
    if (submitClaimBtn) {
        submitClaimBtn.addEventListener('click', handleClaimForm);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        checkAuth();
        initializePage();
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('An unexpected error occurred while loading the app. Please refresh and try again.', 'danger');
    }
});

// Global safety nets for uncaught errors and promise rejections
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error || event.message);
    showAlert('Something went wrong. Please try again or refresh the page.', 'danger');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showAlert('A network or server error occurred. Please try again.', 'danger');
});

// Make functions globally available
window.viewItem = viewItem;
window.clearForm = clearForm;
window.deleteItemWithConfirmation = deleteItemWithConfirmation;
window.openEditModal = openEditModal;
window.handleEditForm = handleEditForm;

// Test function for debugging
window.testEdit = function () {
    console.log('Testing edit functionality...');
    console.log('Current user:', currentUser);
    console.log('Current item data:', currentItemData);
    console.log('Current item ID:', currentItemId);

    if (currentItemData) {
        console.log('Opening edit modal with test data');
        openEditModal(currentItemData);
    } else {
        console.log('No item data available for testing');
    }
};


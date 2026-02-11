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
// GLOBAL VARIABLES
// =============================================================================
let currentUser = null;
let items = [];
let currentItemId = null;
let currentItemData = null;
let resolvedItems = [];

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
        
        const authRequiredPages = ['myitems.html', 'report.html'];
        if (authRequiredPages.includes(currentPage)) {
            if (!user) {
                console.log('No user, showing auth required');
                showAuthRequired();
            } else {
                console.log('User logged in, hiding auth required');
                hideAuthRequired();
                if (currentPage === 'myitems.html') {
                    loadUserItems();
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
    
    if (currentUser) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'block';
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';
    }

    // Admin link visibility (role-based)
    if (adminLink) {
        if (!currentUser) {
            adminLink.style.display = 'none';
        } else {
            currentUser.getIdTokenResult()
                .then((token) => {
                    adminLink.style.display = (token.claims && token.claims.admin === true) ? 'block' : 'none';
                })
                .catch(() => {
                    adminLink.style.display = 'none';
                });
        }
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
}

// Hide authentication required message
function hideAuthRequired() {
    const authRequired = document.getElementById('authRequired');
    const form = document.getElementById('reportForm');
    const filterSection = document.getElementById('filterSection');
    
    if (authRequired) authRequired.style.display = 'none';
    if (form) form.style.display = 'block';
    if (filterSection) filterSection.style.display = 'block';
    
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
        await auth.signOut();
        showAlert('Logged out successfully!', 'success');
        window.location.href = 'index.html';
    } catch (error) {
        showAlert('Error signing out: ' + error.message, 'danger');
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

async function loadResolvedItems() {
    try {
        showLoading(true);
        console.log('Loading resolved items for history view');
        const snapshot = await itemsCollection
            .where('status', '==', 'resolved')
            .get();
        
        resolvedItems = [];
        snapshot.forEach(doc => {
            resolvedItems.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        resolvedItems.sort((a, b) => {
            const aDate = a.resolvedAt?.toDate ? a.resolvedAt.toDate().getTime() : (a.resolvedAt?.seconds || 0) * 1000;
            const bDate = b.resolvedAt?.toDate ? b.resolvedAt.toDate().getTime() : (b.resolvedAt?.seconds || 0) * 1000;
            return (bDate || 0) - (aDate || 0);
        });

        updateHistorySummary(resolvedItems);
        filterHistoryItems(document.getElementById('historyFilterSelect')?.value || 'all');
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
    return (status || '').toLowerCase() === 'resolved';
}

// Display items in the grid
function displayItems(itemsToShow) {
    const container = document.getElementById('itemsContainer');
    const noItemsMessage = document.getElementById('noItemsMessage');
    
    if (!container) return;
    
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

// Create item card HTML
function createItemCard(item) {
    try {
        const title = item.itemName || item.title || 'Untitled Item';
        const category = item.category || 'Uncategorized';

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
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title mb-2">${title}</h5>
                        <p class="text-muted small mb-1">
                            <i class="fas fa-tags me-1"></i>${category}
                        </p>
                        <p class="text-muted small mb-3">
                            <i class="fas fa-calendar me-1"></i>${date}
                        </p>
                        <div class="mt-auto d-grid">
                            <button class="btn btn-primary btn-sm" onclick="viewItem('${item.id}')">
                                <i class="fas fa-hand-paper me-1"></i>Claim this item
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
    
    if (!itemsToShow || itemsToShow.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = itemsToShow.map(item => createHistoryCard(item)).join('');
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
    
    let resolvedDate = 'Unknown date';
    if (item.resolvedAt) {
        try {
            if (item.resolvedAt.toDate && typeof item.resolvedAt.toDate === 'function') {
                resolvedDate = formatDate(item.resolvedAt.toDate());
            } else if (item.resolvedAt instanceof Date) {
                resolvedDate = formatDate(item.resolvedAt);
            } else if (item.resolvedAt.seconds) {
                resolvedDate = formatDate(new Date(item.resolvedAt.seconds * 1000));
            }
        } catch (error) {
            console.warn('Error formatting resolved date:', error);
        }
    }
    
    return `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card h-100 history-card">
                <div class="position-relative">
                    <img src="${imageUrl}" class="card-img-top item-image" alt="${item.title || 'Item'}">
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
        const resolveBtn = document.getElementById('resolveBtn');
        if (resolveBtn) {
            resolveBtn.style.display = isResolvedStatus(item.status) ? 'none' : 'block';
        }
        initializeEnquirySection(item);
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

    const claimantName = nameInput.value.trim();
    const claimantPhone = phoneInput.value.trim();
    const claimDescription = descInput.value.trim();
    const lostWhere = lostWhereInput.value.trim();
    const identifyingMark = markInput.value.trim();
    const billFile = billInput?.files?.[0] || null;

    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;

    try {
        if (!claimantName || !claimantPhone || !claimDescription || !lostWhere || !identifyingMark) {
            throw new Error('Please fill in all required fields.');
        }

        if (!phoneRegex.test(claimantPhone)) {
            throw new Error('Please enter a valid phone number.');
        }

        submitBtn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';

        let billImageUrl = null;

        if (billFile) {
            try {
                const storageRef = storage.ref();
                const billRef = storageRef.child(`claim-bills/${currentItemId}/${currentUser.uid}/${Date.now()}-${billFile.name}`);
                const snapshot = await billRef.put(billFile);
                billImageUrl = await snapshot.ref.getDownloadURL();
            } catch (uploadError) {
                console.error('Error uploading bill image:', uploadError);
                // Continue without bill image
            }
        }

        const claimData = {
            itemId: currentItemId,
            claimantId: currentUser.uid,
            claimantEmail: currentUser.email || null,
            claimantName,
            claimantPhone,
            claimDescription,
            lostWhere,
            identifyingMark,
            billImageUrl,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await itemsCollection.doc(currentItemId).collection('claims').add(claimData);

        showAlert('Your claim has been submitted and is pending admin review.', 'success');

        if (billInput) billInput.value = '';
        descInput.value = '';
        lostWhereInput.value = '';
        markInput.value = '';

        const modalEl = document.getElementById('claimModal');
        const claimModal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (claimModal) {
            claimModal.hide();
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

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
    
    const alertId = 'alert-' + Date.now();
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.insertAdjacentHTML('beforeend', alertHTML);
    
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
        // Show loading state
        submitBtn.disabled = true;
        submitSpinner.style.display = 'inline-block';
        
        // Get form data
        const formData = {
            title: document.getElementById('itemTitle').value.trim(),
            description: document.getElementById('itemDescription').value.trim(),
            location: document.getElementById('itemLocation').value.trim(),
            status: document.getElementById('itemStatus').value,
            date: document.getElementById('itemDate').value,
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
        submitBtn.disabled = false;
        submitSpinner.style.display = 'none';
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
        reader.onload = function(e) {
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
    if (!emailEl || !passwordEl || !confirmEl) return;
    
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;
    
    try {
        if (password !== confirmPassword) {
            showAlert('Passwords do not match.', 'danger');
            return;
        }
        
        if (signupBtn) { signupBtn.disabled = true; }
        if (signupSpinner) { signupSpinner.style.display = 'inline-block'; }
        
        await signUp(email, password);
        
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
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    
    let filteredItems = items;
    
    // Filter by search term
    if (searchTerm) {
        filteredItems = filteredItems.filter(item => 
            (item.itemName && item.itemName.toLowerCase().includes(searchTerm)) ||
            (item.category && item.category.toLowerCase().includes(searchTerm))
        );
    }
    
    // Filter by status
    if (statusFilter) {
        filteredItems = filteredItems.filter(item => item.status === statusFilter);
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
            status: 'resolved',
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

async function handleBuildingEnquirySubmit() {
    if (!currentUser || !currentItemId) {
        showAlert('You must be logged in to submit a building enquiry.', 'warning');
        return;
    }

    const role = await getCurrentUserRole();
    if (role === 'admin') {
        showAlert('Admins do not need to submit building enquiries.', 'info');
        return;
    }

    const buildingNameEl = document.getElementById('buildingName');
    const floorEl = document.getElementById('buildingFloor');
    const roomEl = document.getElementById('buildingRoom');
    const notesEl = document.getElementById('buildingNotes');
    const submitBtn = document.getElementById('submitBuildingEnquiryBtn');
    const spinner = document.getElementById('buildingEnquirySpinner');

    if (!buildingNameEl || !floorEl || !roomEl || !submitBtn) {
        showAlert('Building enquiry form is not available. Please reload the page.', 'danger');
        return;
    }

    const buildingName = buildingNameEl.value.trim();
    const floor = floorEl.value.trim();
    const roomNumber = roomEl.value.trim();
    const additionalNotes = (notesEl?.value || '').trim();

    try {
        if (!buildingName || !floor || !roomNumber) {
            throw new Error('Please fill in all required building enquiry fields.');
        }

        submitBtn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';

        const enquiryData = {
            itemId: currentItemId,
            buildingName,
            floor,
            roomNumber,
            additionalNotes,
            submittedBy: currentUser.uid,
            submittedEmail: currentUser.email || null,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await itemsCollection.doc(currentItemId).collection('building_enquiries').add(enquiryData);

        showAlert('Building enquiry has been submitted to the admin.', 'success');

        buildingNameEl.value = '';
        floorEl.value = '';
        roomEl.value = '';
        if (notesEl) notesEl.value = '';

        const modalEl = document.getElementById('buildingEnquiryModal');
        const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (modal) {
            modal.hide();
        }
    } catch (error) {
        console.error('Error submitting building enquiry:', error);
        showAlert('Error submitting building enquiry: ' + error.message, 'danger');
    } finally {
        submitBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// Handle edit image preview
function handleEditImagePreview(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('editImagePreview');
    const previewImg = document.getElementById('editPreviewImg');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
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
            // Forms already set up in HTML
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
            signOut();
        });
    }
    
    // Search and filter inputs
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterItems);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterItems);
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
    
    // Edit button
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        console.log('Edit button found, adding event listener');
        editBtn.addEventListener('click', () => {
            console.log('Edit button clicked, currentItemData:', currentItemData);
            if (currentItemData) {
                openEditModal(currentItemData);
            } else {
                console.error('No current item data available');
                showAlert('No item data available for editing', 'warning');
            }
        });
    } else {
        console.error('Edit button not found in DOM');
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
    checkAuth();
    initializePage();
});

// Make functions globally available
window.viewItem = viewItem;
window.clearForm = clearForm;
window.deleteItemWithConfirmation = deleteItemWithConfirmation;
window.openEditModal = openEditModal;
window.handleEditForm = handleEditForm;

// Test function for debugging
window.testEdit = function() {
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


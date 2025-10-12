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

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================
let currentUser = null;
let items = [];
let currentItemId = null;
let currentItemData = null;

// =============================================================================
// AUTHENTICATION FUNCTIONS
// =============================================================================

// Check if user is authenticated
function checkAuth() {
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI();
        
        // Load appropriate content based on page
        const currentPage = window.location.pathname.split('/').pop();
        console.log('Current page:', currentPage, 'User:', user);
        
        if (currentPage === 'myitems.html' || currentPage === 'report.html') {
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
    
    if (currentUser) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'block';
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';
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

// Handle authentication errors
function handleAuthError(error) {
    let message = 'An error occurred. Please try again.';
    
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
    }
    
    showAlert(message, 'danger');
}

// =============================================================================
// FIRESTORE FUNCTIONS
// =============================================================================

// Load all items from Firestore
async function loadItems() {
    try {
        showLoading(true);
        const snapshot = await db.collection('items').orderBy('createdAt', 'desc').get();
        items = [];
        
        snapshot.forEach(doc => {
            items.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
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
            snapshot = await db.collection('items')
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();
        } catch (queryError) {
            console.warn('OrderBy query failed, trying without orderBy:', queryError);
            // If orderBy fails, try without it (in case of missing index)
            snapshot = await db.collection('items')
                .where('userId', '==', currentUser.uid)
                .get();
        }
        
        items = [];
        snapshot.forEach(doc => {
            const itemData = doc.data();
            console.log('Processing item:', doc.id, itemData);
            items.push({
                id: doc.id,
                ...itemData
            });
        });
        
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

// Add new item to Firestore
async function addItem(itemData) {
    try {
        const docRef = await db.collection('items').add({
            ...itemData,
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
        await db.collection('items').doc(itemId).update({
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
        await db.collection('items').doc(itemId).delete();
        console.log('Item deleted:', itemId);
    } catch (error) {
        console.error('Error deleting item:', error);
        throw error;
    }
}

// Get single item from Firestore
async function getItem(itemId) {
    try {
        const doc = await db.collection('items').doc(itemId).get();
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
        const statusClass = item.status === 'Lost' ? 'badge-lost' : 'badge-found';
        const imageUrl = item.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image';
        
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
        
        // Handle description safely
        const description = item.description || 'No description';
        const shortDescription = description.length > 100 ? description.substring(0, 100) + '...' : description;
        
        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card item-card h-100" onclick="viewItem('${item.id}')">
                    <div class="position-relative">
                        <img src="${imageUrl}" class="card-img-top item-image" alt="${item.title || 'Item'}">
                        <span class="badge ${statusClass} item-status-badge">${item.status || 'Unknown'}</span>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${item.title || 'Untitled Item'}</h5>
                        <p class="card-text text-muted small">${shortDescription}</p>
                        <div class="mt-auto">
                            <div class="row text-muted small mb-2">
                                <div class="col-6">
                                    <i class="fas fa-map-marker-alt me-1"></i>
                                    ${item.location || 'Unknown location'}
                                </div>
                                <div class="col-6 text-end">
                                    <i class="fas fa-calendar me-1"></i>
                                    ${date}
                                </div>
                            </div>
                            <div class="row text-muted small">
                                <div class="col-6">
                                    <i class="fas fa-user me-1"></i>
                                    ${item.contactName || 'Unknown'}
                                </div>
                                <div class="col-6 text-end">
                                    <i class="fas fa-phone me-1"></i>
                                    ${item.contactPhone || 'No phone'}
                                </div>
                            </div>
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
function displayItemDetails(item) {
    const itemDetails = document.getElementById('itemDetails');
    const actionButtons = document.getElementById('actionButtons');
    
    if (!itemDetails) return;
    
    // Store current item data for editing
    currentItemData = item;
    currentItemId = item.id;
    console.log('Item data stored for editing:', currentItemData);
    
    // Update item information
    document.getElementById('itemTitle').textContent = item.title;
    document.getElementById('itemStatus').textContent = item.status;
    document.getElementById('itemLocation').textContent = item.location;
    document.getElementById('itemDate').textContent = formatDate(item.createdAt.toDate());
    document.getElementById('itemDescription').textContent = item.description;
    document.getElementById('itemReporter').textContent = item.userEmail || 'Unknown';
    
    // Update contact information
    document.getElementById('contactName').textContent = item.contactName || 'Not provided';
    document.getElementById('contactPhone').textContent = item.contactPhone || 'Not provided';
    const contactPhoneLink = document.getElementById('contactPhoneLink');
    if (item.contactPhone) {
        contactPhoneLink.href = `tel:${item.contactPhone}`;
        contactPhoneLink.classList.add('text-primary');
    } else {
        contactPhoneLink.href = '#';
        contactPhoneLink.classList.remove('text-primary');
    }
    
    // Update image
    const imageContainer = document.getElementById('itemImageContainer');
    const noImageMessage = document.getElementById('noImageMessage');
    const itemImage = document.getElementById('itemImage');
    
    if (item.imageUrl) {
        itemImage.src = item.imageUrl;
        imageContainer.style.display = 'block';
        noImageMessage.style.display = 'none';
    } else {
        imageContainer.style.display = 'none';
        noImageMessage.style.display = 'block';
    }
    
    // Show action buttons if user owns the item
    if (currentUser && item.userId === currentUser.uid) {
        if (actionButtons) {
            actionButtons.style.display = 'block';
        }
    }
    
    itemDetails.style.display = 'block';
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
        
        // Validate form data
        if (!formData.title || !formData.description || !formData.location || !formData.status || !formData.date || !formData.contactPhone || !formData.contactName) {
            throw new Error('Please fill in all required fields.');
        }
        
        // Validate phone number format (basic validation)
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(formData.contactPhone)) {
            throw new Error('Please enter a valid phone number.');
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
    document.getElementById('reportForm').reset();
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('previewImg').src = '';
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
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const loginSpinner = document.getElementById('loginSpinner');
    
    try {
        loginBtn.disabled = true;
        loginSpinner.style.display = 'inline-block';
        
        await signIn(email, password);
        
        // Redirect to home page
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        // Error handled in signIn function
    } finally {
        loginBtn.disabled = false;
        loginSpinner.style.display = 'none';
    }
}

// Handle signup form submission
async function handleSignupForm(event) {
    event.preventDefault();
    
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const signupBtn = document.getElementById('signupBtn');
    const signupSpinner = document.getElementById('signupSpinner');
    
    try {
        // Validate passwords match
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
        }
        
        signupBtn.disabled = true;
        signupSpinner.style.display = 'inline-block';
        
        await signUp(email, password);
        
        // Redirect to home page
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        // Error handled in signUp function
    } finally {
        signupBtn.disabled = false;
        signupSpinner.style.display = 'none';
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
            item.title.toLowerCase().includes(searchTerm) ||
            item.description.toLowerCase().includes(searchTerm) ||
            item.location.toLowerCase().includes(searchTerm) ||
            (item.contactName && item.contactName.toLowerCase().includes(searchTerm)) ||
            (item.contactPhone && item.contactPhone.includes(searchTerm))
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
    
    // Delete buttons
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (currentItemId) {
                deleteItemWithConfirmation(currentItemId);
            }
        });
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


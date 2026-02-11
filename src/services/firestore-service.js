// =============================================================================
// FIRESTORE SERVICE
// =============================================================================

import { itemsCollection, firebase } from './firebase-config.js';
import { showAlert } from '../utils/ui-helpers.js';
import { isResolvedStatus } from '../utils/constants.js';

// =============================================================================
// ITEM MODEL HELPERS
// =============================================================================
//
// Public Item shape (what normal users can see)
// - itemName
// - category
// - status
// - createdBy
// - isVerified
// - createdAt
//
// Hidden fields (admin only, NOT exposed to normal users)
// - description
// - location
// - photoURL
// - finderContact
//
function mapDocToPublicItem(doc) {
    const data = doc.data() || {};

    return {
        id: doc.id,
        itemName: data.itemName || data.title || 'Untitled Item',
        category: data.category || 'Uncategorized',
        status: data.status || 'available',
        createdBy: data.createdBy || data.userId || null,
        isVerified: data.isVerified === true,
        createdAt: data.createdAt || null,

        // Non-sensitive flags still needed for UI/history
        givenToEnquiry: !!data.givenToEnquiry,
        enquiryName: data.enquiryName || null,
        enquiryPhone: data.enquiryPhone || null,
        resolvedAt: data.resolvedAt || null
    };
}

// Load all items from Firestore
async function loadItems() {
    try {
        showLoading(true);
        const snapshot = await itemsCollection.orderBy('createdAt', 'desc').get();
        const fetchedItems = [];
        
        snapshot.forEach(doc => {
            fetchedItems.push(mapDocToPublicItem(doc));
        });
        
        const activeItems = fetchedItems.filter(item => !isResolvedStatus(item.status));
        displayItems(activeItems);
        showLoading(false);
        return activeItems;
    } catch (error) {
        console.error('Error loading items:', error);
        showAlert('Error loading items: ' + error.message, 'danger');
        showLoading(false);
        return [];
    }
}

// Load user's items from Firestore
async function loadUserItems() {
    const { getCurrentUser } = await import('./auth-service.js');
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
        console.log('No current user, cannot load user items');
        const { showAuthRequired } = await import('./auth-service.js');
        showAuthRequired();
        return [];
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
            const itemData = mapDocToPublicItem(doc);
            console.log('Processing item:', doc.id, itemData);
            userItems.push(itemData);
        });
        
        const activeItems = userItems.filter(item => !isResolvedStatus(item.status));
        console.log('Loaded user items:', activeItems.length, activeItems);
        displayItems(activeItems);
        showLoading(false);
        return activeItems;
        
    } catch (error) {
        console.error('Error loading user items:', error);
        showAlert('Error loading your items: ' + error.message, 'danger');
        showLoading(false);
        
        // Show empty state on error
        displayItems([]);
        return [];
    }
}

async function loadResolvedItems() {
    try {
        showLoading(true);
        console.log('Loading resolved items for history view');
        const snapshot = await itemsCollection
            .where('status', '==', 'resolved')
            .get();
        
        const resolvedItems = [];
        snapshot.forEach(doc => {
            resolvedItems.push(mapDocToPublicItem(doc));
        });
        
        resolvedItems.sort((a, b) => {
            const aDate = a.resolvedAt?.toDate ? a.resolvedAt.toDate().getTime() : (a.resolvedAt?.seconds || 0) * 1000;
            const bDate = b.resolvedAt?.toDate ? b.resolvedAt.toDate().getTime() : (b.resolvedAt?.seconds || 0) * 1000;
            return (bDate || 0) - (aDate || 0);
        });

        updateHistorySummary(resolvedItems);
        filterHistoryItems(document.getElementById('historyFilterSelect')?.value || 'all');
        showLoading(false);
        return resolvedItems;
    } catch (error) {
        console.error('Error loading resolved items:', error);
        showAlert('Error loading resolved items: ' + error.message, 'danger');
        updateHistorySummary([]);
        displayHistoryItems([]);
        showLoading(false);
        return [];
    }
}

// Add new item to Firestore
async function addItem(itemData) {
    const { getCurrentUser } = await import('./auth-service.js');
    const currentUser = getCurrentUser();
    
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
            return mapDocToPublicItem(doc);
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting item:', error);
        throw error;
    }
}

// Sensitive fields are still stored in Firestore, but intentionally not
// returned from public loaders above. This accessor is for an admin panel ONLY
// and enforces an admin check before returning hidden fields.
async function getSensitiveItemFieldsForAdmin(itemId) {
    const { getCurrentUser } = await import('./auth-service.js');
    const currentUser = getCurrentUser();

    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    // Require a custom auth claim "admin" on the Firebase user
    const token = await currentUser.getIdTokenResult();
    if (!token.claims || token.claims.admin !== true) {
        throw new Error('Not authorized to access sensitive item fields');
    }

    const doc = await itemsCollection.doc(itemId).get();
    if (!doc.exists) {
        return null;
    }

    const data = doc.data() || {};

    return {
        // Public model fields
        id: doc.id,
        itemName: data.itemName || data.title || 'Untitled Item',
        category: data.category || 'Uncategorized',
        status: data.status || 'available',
        createdBy: data.createdBy || data.userId || null,
        isVerified: data.isVerified === true,
        createdAt: data.createdAt || null,

        // Hidden fields (admin only)
        description: data.description ?? null,
        location: data.location ?? null,
        photoURL: data.photoURL ?? data.imageUrl ?? null,
        finderContact: data.finderContact ?? {
            name: data.contactName || null,
            phone: data.contactPhone || data.reporterPhone || null
        }
    };
}

// Import display functions (circular dependency handled via dynamic imports)
async function displayItems(itemsToShow) {
    const { displayItems: displayItemsUI } = await import('../components/item-display.js');
    return displayItemsUI(itemsToShow);
}

async function displayHistoryItems(itemsToShow) {
    const { displayHistoryItems: displayHistoryItemsUI } = await import('../components/item-display.js');
    return displayHistoryItemsUI(itemsToShow);
}

async function updateHistorySummary(items = []) {
    const { updateHistorySummary: updateSummary } = await import('../components/item-display.js');
    return updateSummary(items);
}

async function filterHistoryItems(filterValue = 'all') {
    const { filterHistoryItems: filterItems } = await import('../components/item-display.js');
    return filterItems(filterValue);
}

async function showLoading(show) {
    const { showLoading: setLoading } = await import('../utils/ui-helpers.js');
    return setLoading(show);
}

export {
    loadItems,
    loadUserItems,
    loadResolvedItems,
    addItem,
    updateItem,
    deleteItem,
    getItem,
    getSensitiveItemFieldsForAdmin
};
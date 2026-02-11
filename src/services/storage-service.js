// =============================================================================
// FIREBASE STORAGE SERVICE
// =============================================================================

import { storage } from './firebase-config.js';

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

export {
    uploadImage,
    deleteImage
};
// =============================================================================
// AUTHENTICATION SERVICE
// =============================================================================

import { auth } from './firebase-config.js';

// Current user state
let currentUser = null;

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

// Get current user
function getCurrentUser() {
    return currentUser;
}

export {
    checkAuth,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    getCurrentUser,
    updateAuthUI,
    showAuthRequired,
    hideAuthRequired
};
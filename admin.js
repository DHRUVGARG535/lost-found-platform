// =============================================================================
// ADMIN DASHBOARD
// =============================================================================

function adminShowLoading(isLoading) {
    const loading = document.getElementById('adminLoading');
    const dash = document.getElementById('adminDashboard');
    if (loading) loading.style.display = isLoading ? 'block' : 'none';
    if (dash) dash.style.display = isLoading ? 'none' : 'block';
}

function adminDenyAccess() {
    const denied = document.getElementById('adminAccessDenied');
    const dash = document.getElementById('adminDashboard');
    const loading = document.getElementById('adminLoading');
    if (denied) denied.style.display = 'block';
    if (dash) dash.style.display = 'none';
    if (loading) loading.style.display = 'none';
}

function adminFormatDate(value) {
    try {
        if (!value) return '—';
        if (value.toDate && typeof value.toDate === 'function') return formatDate(value.toDate());
        if (value instanceof Date) return formatDate(value);
        if (value.seconds) return formatDate(new Date(value.seconds * 1000));
        return '—';
    } catch {
        return '—';
    }
}

function escapeHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function adminResolveImageUrl(data = {}) {
    const candidates = [
        data.photoURL,
        data.photoUrl,
        data.imageUrl,
        data.imageURL,
        data.thumbnailUrl,
        data.thumbnailURL
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return '';
}

function adminStatusBadgeClass(status) {
    const normalized = String(status || '').toLowerCase();
    switch (normalized) {
        case 'available':
        case 'found':
            return 'bg-info';
        case 'claimed':
        case 'pending':
            return 'bg-warning';
        case 'returned':
        case 'resolved':
        case 'approved':
            return 'bg-success';
        case 'lost':
        case 'rejected':
            return 'bg-danger';
        default:
            return 'bg-secondary';
    }
}

async function requireAdminOrDeny() {
    if (!currentUser) return false;
    try {
        const token = await currentUser.getIdTokenResult();
        return token.claims && token.claims.admin === true;
    } catch (e) {
        console.error('Failed to verify admin claim:', e);
        return false;
    }
}

const adminItemsCache = {}; // Cache for item details (images, etc.)

async function adminLoadItems() {
    const tbody = document.getElementById('adminItemsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const snapshot = await itemsCollection.orderBy('createdAt', 'desc').limit(200).get();
    const rows = [];

    snapshot.forEach((doc) => {
        const d = doc.data() || {};
        // Cache item data for claims usage
        adminItemsCache[doc.id] = d;

        const itemName = d.itemName || d.title || 'Untitled Item';
        const category = d.category || 'Uncategorized';
        const status = d.status || 'available';
        const normalizedStatus = String(status).toLowerCase();
        const statusClass = adminStatusBadgeClass(status);
        const createdAt = adminFormatDate(d.createdAt);
        const finderName = d.contactName || d.reporterName || d.userEmail || d.reporterEmail || 'Unknown';
        const finderId = d.userId || d.createdBy || '—';
        const photoUrlRaw = adminResolveImageUrl(d);
        const location = d.location || d.foundLocation || d.lostLocation || 'Unknown location';
        const photoCellContent = photoUrlRaw
            ? `<img src="${escapeHtml(photoUrlRaw)}" alt="Item photo for ${escapeHtml(itemName)}" class="admin-item-thumb rounded">`
            : `<div class="admin-item-thumb-placeholder text-muted"><i class="fas fa-image"></i></div>`;

        const canMarkReturned = normalizedStatus !== 'returned' && normalizedStatus !== 'resolved';

        rows.push(`
            <tr>
                <td class="admin-item-thumb-cell" data-label="Photo">${photoCellContent}</td>
                <td data-label="Item">
                    <div class="fw-semibold">${escapeHtml(itemName)}</div>
                    <div class="text-muted small" title="ID: ${escapeHtml(doc.id)}"><i class="fas fa-map-marker-alt me-1"></i> ${escapeHtml(location)}</div>
                </td>
                <td data-label="Category">${escapeHtml(category)}</td>
                <td data-label="Status"><span class="badge ${statusClass} text-uppercase">${escapeHtml(status)}</span></td>
                <td class="text-muted small" data-label="Created">${escapeHtml(createdAt)}</td>
                <td class="text-muted small" title="ID: ${escapeHtml(finderId)}" data-label="Finder">${escapeHtml(finderName)}</td>
                <td class="text-end" data-label="Actions">
                    <div class="d-flex justify-content-end gap-2 admin-item-actions">
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="adminOpenItemDetails('${doc.id}')">
                            View
                        </button>
                        ${canMarkReturned ? `
                        <button class="btn btn-sm btn-outline-success btn-mark-returned" onclick="adminMarkReturned('${doc.id}')">
                            <span style="position: relative; z-index: 5;">Mark Returned</span>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('') || `<tr><td colspan="7" class="text-center text-muted py-4">No items found.</td></tr>`;
}

async function adminLoadClaims() {
    const tbody = document.getElementById('adminClaimsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Fetch from root 'claims' collection
    const snapshot = await db.collection('claims').orderBy('createdAt', 'desc').limit(300).get();
    const rows = [];

    snapshot.forEach((doc) => {
        const d = doc.data() || {};
        const status = d.status || 'pending';
        const submittedAt = adminFormatDate(d.createdAt);
        const itemId = d.itemId || '—';
        const claimant = d.userName || 'Unknown';
        const phone = d.userPhone || '—';

        // Try to get image from claim doc, fallback to item cache
        let photoUrlRaw = adminResolveImageUrl(d) || adminResolveImageUrl({ imageUrl: d.itemImage });

        // Fallback: Check global cache if missing from claim
        if (!photoUrlRaw && itemId && adminItemsCache[itemId]) {
            photoUrlRaw = adminResolveImageUrl(adminItemsCache[itemId]);
        }

        const photoCellContent = photoUrlRaw
            ? `<img src="${escapeHtml(photoUrlRaw)}" alt="Item" class="admin-item-thumb rounded">`
            : `<div class="admin-item-thumb-placeholder text-muted"><i class="fas fa-image"></i></div>`;

        const isPending = (String(status).toLowerCase() === 'pending');
        const actionsHtml = isPending
            ? `<div class="d-flex justify-content-end gap-2 flex-wrap">
                    <button class="btn btn-sm btn-outline-primary" onclick="adminOpenClaimDetails('${doc.id}')">View</button>
                    <button class="btn btn-sm btn-outline-success" onclick="adminApproveClaim('${doc.ref.path}', '${escapeHtml(itemId)}')">Approve</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="adminRejectClaim('${doc.ref.path}')">Reject</button>
               </div>`
            : `<div class="d-flex justify-content-end"><button class="btn btn-sm btn-outline-primary" onclick="adminOpenClaimDetails('${doc.id}')">View</button></div>`;

        rows.push(`
            <tr>
                <td class="admin-item-thumb-cell" data-label="Photo">${photoCellContent}</td>
                <td data-label="Item / Location">
                    <div class="fw-semibold">${escapeHtml(d.itemName || 'Unknown Item')}</div>
                    <div class="text-muted small" title="Item ID: ${escapeHtml(itemId)}"><i class="fas fa-map-marker-alt me-1"></i> ${escapeHtml(d.lostLocation || 'Location not provided')}</div>
                </td>
                <td data-label="Claimant">${escapeHtml(claimant)}</td>
                <td class="text-muted small" data-label="Phone">${escapeHtml(phone)}</td>
                <td data-label="Status"><span class="badge ${status === 'approved' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : 'bg-warning'} text-uppercase">${escapeHtml(status)}</span></td>
                <td class="text-muted small" data-label="Submitted">${escapeHtml(submittedAt)}</td>
                <td class="text-end" data-label="Actions">${actionsHtml}</td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('') || `<tr><td colspan="7" class="text-center text-muted py-4">No claims found.</td></tr>`;
}

// ... (existing code) ...

async function adminOpenClaimDetails(claimId) {
    const modalEl = document.getElementById('adminClaimModal');
    if (!modalEl) return;

    // Reset Modal
    document.getElementById('adminClaimModalId').textContent = 'ID: ' + claimId;
    document.getElementById('adminClaimModalName').textContent = '—';
    document.getElementById('adminClaimModalEmail').textContent = '—';
    document.getElementById('adminClaimModalPhone').textContent = '—';
    document.getElementById('adminClaimModalItemName').textContent = '—';
    document.getElementById('adminClaimModalStatus').textContent = '—';
    document.getElementById('adminClaimModalDate').textContent = '—';
    document.getElementById('adminClaimModalLocation').textContent = '—';
    document.getElementById('adminClaimModalDescription').textContent = '—';
    document.getElementById('adminClaimModalMarks').textContent = '—';

    const billContainer = document.getElementById('adminClaimModalBillContainer');
    const billImg = document.getElementById('adminClaimModalBill');
    const billLink = document.getElementById('adminClaimModalBillLink');
    if (billContainer) billContainer.style.display = 'none';
    if (billImg) { billImg.src = ''; billImg.alt = 'Loading...'; }

    const spinner = document.getElementById('adminClaimModalSpinner');
    const body = document.getElementById('adminClaimModalBody');
    const errorEl = document.getElementById('adminClaimModalError');
    if (spinner) spinner.style.display = 'block';
    if (body) body.style.display = 'none';
    if (errorEl) errorEl.classList.add('d-none');

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    try {
        const doc = await db.collection('claims').doc(claimId).get();
        if (!doc.exists) {
            throw new Error('Claim not found');
        }

        const data = doc.data();

        document.getElementById('adminClaimModalName').textContent = data.userName || 'Unknown';
        document.getElementById('adminClaimModalEmail').textContent = data.userEmail || ''; // Don't show ID
        document.getElementById('adminClaimModalPhone').textContent = data.userPhone || '—';
        document.getElementById('adminClaimModalItemName').textContent = data.itemName || '—';

        const statusEl = document.getElementById('adminClaimModalStatus');
        if (statusEl) {
            statusEl.textContent = (data.status || 'pending').toUpperCase();
            statusEl.className = `badge ${adminStatusBadgeClass(data.status)} text-uppercase`;
        }

        document.getElementById('adminClaimModalDate').textContent = adminFormatDate(data.createdAt);
        document.getElementById('adminClaimModalLocation').textContent = data.lostLocation || '—';
        document.getElementById('adminClaimModalDescription').textContent = data.proofDescription || '—';
        document.getElementById('adminClaimModalMarks').textContent = data.identifyingMark || '—';

        // Bill Image
        if (data.billImageURL) {
            if (billContainer) billContainer.style.display = 'block';
            if (billImg) billImg.src = data.billImageURL;
            if (billLink) billLink.href = data.billImageURL;
        }

        // Actions
        const actionsContainer = document.getElementById('adminClaimModalActions');
        if (actionsContainer) {
            const modalStatus = (data.status || 'pending').toLowerCase();
            if (modalStatus === 'pending') {
                actionsContainer.innerHTML = `
                    <button class="btn btn-success" onclick="adminApproveClaim('${doc.ref.path}', '${escapeHtml(data.itemId)}'); bootstrap.Modal.getInstance(document.getElementById('adminClaimModal')).hide();">Approve</button>
                    <button class="btn btn-danger ms-2" onclick="adminRejectClaim('${doc.ref.path}'); bootstrap.Modal.getInstance(document.getElementById('adminClaimModal')).hide();">Reject</button>
                `;
            } else {
                actionsContainer.innerHTML = '';
            }
        }

        if (spinner) spinner.style.display = 'none';
        if (body) body.style.display = 'block';

    } catch (error) {
        console.error('Error loading claim details:', error);
        if (spinner) spinner.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = 'Failed to load details: ' + error.message;
            errorEl.classList.remove('d-none');
        }
    }
}

window.adminOpenClaimDetails = adminOpenClaimDetails;

async function adminRefreshAll() {
    adminShowLoading(true);
    await Promise.allSettled([adminLoadItems(), adminLoadClaims()]);
    adminShowLoading(false);
}

// Actions
// Actions
async function adminApproveClaim(claimPath, itemId) {
    if (!confirm('Are you sure you want to APPROVE this claim? This will mark the item as claimed and reject other pending claims for this item.')) {
        return;
    }

    try {
        const claimRef = db.doc(claimPath);

        // 1. Approve this claim
        await claimRef.update({
            status: 'approved',
            reviewedBy: currentUser.uid,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update Item status to 'claimed' & reject other claims
        if (itemId && itemId !== '—') {
            await itemsCollection.doc(itemId).update({
                status: 'claimed',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Reject other PENDING claims for this item
            const otherClaimsSnapshot = await db.collection('claims')
                .where('itemId', '==', itemId)
                .where('status', '==', 'pending')
                .get();

            const batch = db.batch();
            let batchCount = 0;

            otherClaimsSnapshot.forEach(doc => {
                if (doc.ref.path !== claimRef.path) {
                    batch.update(doc.ref, {
                        status: 'rejected',
                        rejectionReason: 'Item claimed by another user',
                        reviewedBy: currentUser.uid,
                        reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    batchCount++;
                }
            });

            if (batchCount > 0) {
                await batch.commit();
                console.log(`Auto-rejected ${batchCount} other pending claims for item ${itemId}`);
            }
        }

        showAlert('Claim approved. Item marked as claimed.', 'success');
        await adminLoadClaims();
        await adminLoadItems(); // Update items table too
    } catch (e) {
        console.error('Approve claim failed:', e);
        showAlert('Failed to approve claim: ' + e.message, 'danger');
    }
}

async function adminRejectClaim(claimPath) {
    if (!confirm('Are you sure you want to REJECT this claim?')) {
        return;
    }

    try {
        const claimRef = db.doc(claimPath);
        await claimRef.update({
            status: 'rejected',
            reviewedBy: currentUser.uid,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showAlert('Claim rejected.', 'warning');
        await adminLoadClaims();
        await adminLoadItems(); // Refresh Items tab so status stays correct (reject does not set item to claimed)
    } catch (e) {
        console.error('Reject claim failed:', e);
        showAlert('Failed to reject claim: ' + e.message, 'danger');
    }
}

async function adminMarkReturned(itemId) {
    try {
        await itemsCollection.doc(itemId).update({
            status: 'returned',
            resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showAlert('Item marked as returned.', 'success');
        await adminLoadItems();
    } catch (e) {
        console.error('Mark returned failed:', e);
        showAlert('Failed to mark returned: ' + e.message, 'danger');
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshAdminBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', adminRefreshAll);
    }

    // Wait for auth state from script.js, then validate admin access
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;

        const isAdminUser = await requireAdminOrDeny();
        if (!isAdminUser) {
            adminDenyAccess();
            return;
        }

        adminShowLoading(true);
        const accessDenied = document.getElementById('adminAccessDenied');
        if (accessDenied && accessDenied.style) {
            accessDenied.style.display = 'none';
        }
        await adminRefreshAll();
    });
});

function adminResetItemModal() {
    const titleEl = document.getElementById('adminItemModalTitle');
    if (titleEl) titleEl.textContent = 'Item Details';

    const spinner = document.getElementById('adminItemModalSpinner');
    const body = document.getElementById('adminItemModalBody');
    const errorEl = document.getElementById('adminItemModalError');
    const imageEl = document.getElementById('adminItemModalImage');

    if (spinner) spinner.style.display = 'block';
    if (body) body.style.display = 'none';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('d-none');
    }
    if (imageEl) {
        imageEl.src = '';
        imageEl.style.display = 'none';
        imageEl.alt = 'Item photo';
        imageEl.onload = null;
        imageEl.onerror = null;
    }

    const textFields = [
        'adminItemModalId',
        'adminItemModalCategory',
        'adminItemModalCreated',
        'adminItemModalFinder',
        'adminItemModalLocation',
        'adminItemModalContact',
        'adminItemModalDescription'
    ];
    textFields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });

    const statusEl = document.getElementById('adminItemModalStatus');
    if (statusEl) {
        statusEl.textContent = '—';
        statusEl.className = 'badge bg-secondary text-uppercase';
    }
}

function adminShowItemModalError(message) {
    const spinner = document.getElementById('adminItemModalSpinner');
    const body = document.getElementById('adminItemModalBody');
    const errorEl = document.getElementById('adminItemModalError');

    if (spinner) spinner.style.display = 'none';
    if (body) body.style.display = 'none';
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('d-none');
    }
}

async function adminOpenItemDetails(itemId) {
    const modalEl = document.getElementById('adminItemModal');
    if (!modalEl) return;

    adminResetItemModal();
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    try {
        const doc = await itemsCollection.doc(itemId).get();
        if (!doc.exists) {
            adminShowItemModalError('Item not found or may have been removed.');
            showAlert('Item not found.', 'warning');
            return;
        }

        const data = doc.data() || {};
        const title = data.itemName || data.title || 'Untitled Item';
        const category = data.category || 'Uncategorized';
        const status = data.status || 'available';
        const createdAt = adminFormatDate(data.createdAt);
        const finderEmail = data.userEmail || data.reporterEmail || null;
        const location = data.location || data.foundLocation || data.lostLocation || '—';
        const description = data.description || data.details || '—';

        const contactName = data.contactName || data.finderContact?.name || null;
        const contactPhone = data.contactPhone || data.reporterPhone || data.finderContact?.phone || null;
        const contactInfoParts = [];
        if (contactName) contactInfoParts.push(contactName);
        if (contactPhone) contactInfoParts.push(contactPhone);
        const contactInfo = contactInfoParts.join(' • ') || '—';

        const statusBadge = document.getElementById('adminItemModalStatus');
        if (statusBadge) {
            statusBadge.textContent = String(status).toUpperCase();
            statusBadge.className = `badge ${adminStatusBadgeClass(status)} text-uppercase`;
        }

        const titleEl = document.getElementById('adminItemModalTitle');
        if (titleEl) titleEl.textContent = title;

        const idEl = document.getElementById('adminItemModalId');
        if (idEl) idEl.textContent = `ID: ${doc.id}`;

        const categoryEl = document.getElementById('adminItemModalCategory');
        if (categoryEl) categoryEl.textContent = category;

        const createdEl = document.getElementById('adminItemModalCreated');
        if (createdEl) createdEl.textContent = createdAt;

        const finderEl = document.getElementById('adminItemModalFinder');
        if (finderEl) {
            const finderParts = [];
            if (finderEmail) finderParts.push(finderEmail);
            if (contactName) finderParts.push(contactName);
            if (contactPhone) finderParts.push(contactPhone);
            finderEl.textContent = finderParts.join(' • ') || '—';
        }

        const locationEl = document.getElementById('adminItemModalLocation');
        if (locationEl) locationEl.textContent = location || '—';

        const contactEl = document.getElementById('adminItemModalContact');
        if (contactEl) contactEl.textContent = contactInfo;

        const descriptionEl = document.getElementById('adminItemModalDescription');
        if (descriptionEl) descriptionEl.textContent = description;

        const photoUrlRaw = adminResolveImageUrl(data);
        const imageEl = document.getElementById('adminItemModalImage');

        if (imageEl) {
            const hideImage = () => {
                imageEl.style.display = 'none';
            };

            if (photoUrlRaw) {
                imageEl.onload = () => {
                    imageEl.style.display = 'block';
                };
                imageEl.onerror = hideImage;
                imageEl.alt = `Item photo for ${title}`;
                imageEl.src = photoUrlRaw;
            } else {
                hideImage();
            }
        }

        const spinner = document.getElementById('adminItemModalSpinner');
        const body = document.getElementById('adminItemModalBody');
        if (spinner) spinner.style.display = 'none';
        if (body) body.style.display = 'block';
    } catch (error) {
        console.error('Failed to load admin item details:', error);
        adminShowItemModalError('Failed to load item details. Please try again.');
        showAlert('Failed to load item details: ' + (error?.message || error), 'danger');
    }
}

// Expose admin action handlers globally for inline onclick usage
window.adminApproveClaim = adminApproveClaim;
window.adminRejectClaim = adminRejectClaim;
window.adminMarkReturned = adminMarkReturned;
window.adminOpenItemDetails = adminOpenItemDetails;


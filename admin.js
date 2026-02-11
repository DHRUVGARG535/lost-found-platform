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

async function adminLoadItems() {
    const tbody = document.getElementById('adminItemsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const snapshot = await itemsCollection.orderBy('createdAt', 'desc').limit(200).get();
    const rows = [];

    snapshot.forEach((doc) => {
        const d = doc.data() || {};
        const itemName = d.itemName || d.title || 'Untitled Item';
        const category = d.category || 'Uncategorized';
        const status = d.status || 'available';
        const statusClass = adminStatusBadgeClass(status);
        const createdAt = adminFormatDate(d.createdAt);
        const finderId = d.userId || d.createdBy || '—';
        const photoUrlRaw = adminResolveImageUrl(d);
        const photoCellContent = photoUrlRaw
            ? `<img src="${escapeHtml(photoUrlRaw)}" alt="Item photo for ${escapeHtml(itemName)}" class="admin-item-thumb rounded">`
            : `<div class="admin-item-thumb-placeholder text-muted"><i class="fas fa-image"></i></div>`;

        rows.push(`
            <tr>
                <td class="admin-item-thumb-cell">${photoCellContent}</td>
                <td>
                    <div class="fw-semibold">${escapeHtml(itemName)}</div>
                    <div class="text-muted small">ID: ${escapeHtml(doc.id)}</div>
                </td>
                <td>${escapeHtml(category)}</td>
                <td><span class="badge ${statusClass} text-uppercase">${escapeHtml(status)}</span></td>
                <td class="text-muted small">${escapeHtml(createdAt)}</td>
                <td class="text-muted small">${escapeHtml(finderId)}</td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="adminOpenItemDetails('${doc.id}')">
                        View
                    </button>
                    <button class="btn btn-sm btn-outline-success ms-2" onclick="adminMarkReturned('${doc.id}')">
                        Mark Returned
                    </button>
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

    // Pull claims across all items
    const snapshot = await db.collectionGroup('claims').orderBy('createdAt', 'desc').limit(300).get();
    const rows = [];

    snapshot.forEach((doc) => {
        const d = doc.data() || {};
        const status = d.status || 'pending';
        const submittedAt = adminFormatDate(d.createdAt);
        const itemId = d.itemId || '—';
        const claimant = d.claimantName || d.claimantEmail || d.claimantId || '—';
        const phone = d.claimantPhone || '—';

        rows.push(`
            <tr>
                <td>
                    <div class="fw-semibold">${escapeHtml(itemId)}</div>
                    <div class="text-muted small">Claim: ${escapeHtml(doc.id)}</div>
                </td>
                <td>${escapeHtml(claimant)}</td>
                <td class="text-muted small">${escapeHtml(phone)}</td>
                <td><span class="badge ${status === 'approved' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : 'bg-warning'} text-uppercase">${escapeHtml(status)}</span></td>
                <td class="text-muted small">${escapeHtml(submittedAt)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-success" onclick="adminApproveClaim('${doc.ref.path}', '${escapeHtml(itemId)}')">Approve</button>
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="adminRejectClaim('${doc.ref.path}')">Reject</button>
                </td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('') || `<tr><td colspan="6" class="text-center text-muted py-4">No claims found.</td></tr>`;
}

async function adminLoadBuildingEnquiries() {
    const tbody = document.getElementById('adminEnquiriesTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const snapshot = await db.collectionGroup('building_enquiries').orderBy('createdAt', 'desc').limit(300).get();
    const rows = [];

    snapshot.forEach((doc) => {
        const d = doc.data() || {};
        const itemId = d.itemId || '—';
        const buildingName = d.buildingName || '—';
        const floor = d.floor || '—';
        const roomNumber = d.roomNumber || '—';
        const notes = d.additionalNotes || '—';
        const submittedAt = adminFormatDate(d.createdAt);

        rows.push(`
            <tr>
                <td>
                    <div class="fw-semibold">${escapeHtml(itemId)}</div>
                    <div class="text-muted small">Enquiry: ${escapeHtml(doc.id)}</div>
                </td>
                <td>${escapeHtml(buildingName)}</td>
                <td>${escapeHtml(floor)}</td>
                <td>${escapeHtml(roomNumber)}</td>
                <td class="text-muted small" style="max-width: 420px;">${escapeHtml(notes)}</td>
                <td class="text-muted small">${escapeHtml(submittedAt)}</td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('') || `<tr><td colspan="6" class="text-center text-muted py-4">No building enquiries found.</td></tr>`;
}

async function adminRefreshAll() {
    adminShowLoading(true);
    await Promise.allSettled([adminLoadItems(), adminLoadClaims(), adminLoadBuildingEnquiries()]);
    adminShowLoading(false);
}

// Actions
async function adminApproveClaim(claimPath, itemId) {
    try {
        const claimRef = db.doc(claimPath);
        await claimRef.update({
            status: 'approved',
            reviewedBy: currentUser.uid,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (itemId && itemId !== '—') {
            await itemsCollection.doc(itemId).update({
                status: 'claimed',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        showAlert('Claim approved.', 'success');
        await adminLoadClaims();
        await adminLoadItems();
    } catch (e) {
        console.error('Approve claim failed:', e);
        showAlert('Failed to approve claim: ' + e.message, 'danger');
    }
}

async function adminRejectClaim(claimPath) {
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
    } catch (e) {
        console.error('Reject claim failed:', e);
        showAlert('Failed to reject claim: ' + e.message, 'danger');
    }
}

async function adminMarkReturned(itemId) {
    try {
        await itemsCollection.doc(itemId).update({
            status: 'returned',
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


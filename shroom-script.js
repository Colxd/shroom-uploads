// Global variables
let currentFiles = [];
let currentFileId = null;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const uploadFileName = document.getElementById('uploadFileName');
const uploadFileSize = document.getElementById('uploadFileSize');
const filesGrid = document.getElementById('filesGrid');
const modalOverlay = document.getElementById('modalOverlay');
const shareLink = document.getElementById('shareLink');
const copyBtn = document.getElementById('copyBtn');
const toastContainer = document.getElementById('toastContainer');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    
    // Debug: Check if functions are available globally
    console.log('Global functions check:');
    console.log('downloadFileFromCard:', typeof window.downloadFileFromCard);
    console.log('copyShareLinkFromCard:', typeof window.copyShareLinkFromCard);
    console.log('deleteFileFromCard:', typeof window.deleteFileFromCard);
    console.log('openFileModal:', typeof window.openFileModal);
    console.log('switchSection:', typeof window.switchSection);
});

function initializeApp() {
    setupEventListeners();
    setupDragAndDrop();
    loadFiles();
    
    // Wait for Supabase to be available
    const checkSupabase = setInterval(() => {
        if (window.supabase) {
            clearInterval(checkSupabase);
            console.log('Supabase initialized successfully');
        }
    }, 100);
}

function setupEventListeners() {
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            switchSection(section);
        });
    });
    
    // Modal overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

function setupDragAndDrop() {
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!uploadArea.contains(e.relatedTarget)) {
            uploadArea.classList.remove('drag-over');
        }
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFiles(files);
        }
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleFiles(files);
    }
}

async function handleFiles(files) {
    for (const file of files) {
        await uploadFile(file);
    }
}

async function uploadFile(file) {
    if (!window.supabase) {
        showToast('Supabase not initialized', 'error');
        return;
    }

    // Show upload progress
    uploadProgressContainer.style.display = 'block';
    uploadFileName.textContent = file.name;
    uploadFileSize.textContent = formatFileSize(file.size);

    try {
        // Create a unique filename
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const uniqueFileName = `${timestamp}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
        
        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await window.supabase.storage
            .from('uploads')
            .upload(uniqueFileName, file);
        
        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw uploadError;
        }
        
        // Get public URL for the uploaded file
        const { data: urlData } = window.supabase.storage
            .from('uploads')
            .getPublicUrl(uniqueFileName);
        
        // Save file metadata to Supabase database
        const fileData = {
            name: file.name,
            original_name: file.name,
            size: file.size,
            type: file.type,
            upload_date: new Date().toISOString(),
            download_url: urlData.publicUrl,
            storage_ref: uniqueFileName,
            share_id: generateShareId()
        };
        
        console.log('Inserting file data:', fileData);
        
        const { data: insertData, error: insertError } = await window.supabase
            .from('files')
            .insert([fileData])
            .select();
        
        if (insertError) {
            console.error('Database insert error:', insertError);
            throw insertError;
        }
        
        console.log('File uploaded successfully:', insertData);
        
        showToast('File uploaded successfully!', 'success');
        uploadProgressContainer.style.display = 'none';
        
        // Reset progress
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        
        // Switch to files section and refresh
        switchSection('files');
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
        uploadProgressContainer.style.display = 'none';
    }
}

async function loadFiles() {
    if (!window.supabase) {
        return;
    }

    try {
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .order('upload_date', { ascending: false });
        
        if (error) {
            throw error;
        }
        
        currentFiles = files || [];
        renderFiles();
    } catch (error) {
        console.error('Error loading files:', error);
        showToast('Error loading files', 'error');
    }
}

function renderFiles() {
    if (currentFiles.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h4>No files uploaded yet</h4>
                <p>Upload your first file to get started</p>
            </div>
        `;
        return;
    }

    filesGrid.innerHTML = currentFiles.map(file => `
        <div class="file-card" onclick="openFileModal('${file.id}')">
            <div class="file-card-header">
                <div class="file-icon-card">
                    ${getFileIcon(file.type)}
                </div>
                <div class="file-info-card">
                    <h4>${file.name}</h4>
                    <p class="file-meta">${formatFileSize(file.size)}</p>
                    <p class="file-meta">${formatDate(file.upload_date)}</p>
                </div>
            </div>
            <div class="file-actions-card">
                <button class="file-action-btn" onclick="event.stopPropagation(); downloadFileFromCard('${file.id}')" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action-btn" onclick="event.stopPropagation(); copyShareLinkFromCard('${file.id}')" title="Copy Share Link">
                    <i class="fas fa-link"></i>
                </button>
                <button class="file-action-btn" onclick="event.stopPropagation(); deleteFileFromCard('${file.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.openFileModal = function(fileId) {
    // Convert fileId to number for comparison
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    if (!file) return;
    
    currentFileId = numericFileId;
    
    // Populate modal with file info
    document.getElementById('modalFileName').textContent = file.name;
    document.getElementById('modalFileSize').textContent = formatFileSize(file.size);
    document.getElementById('modalFileType').textContent = file.type || 'Unknown';
    document.getElementById('modalUploadDate').textContent = formatDate(file.upload_date);
    document.getElementById('modalFileIcon').innerHTML = getFileIcon(file.type);
    
    // Generate share link
    const shareUrl = generateShareUrl(file.share_id);
    shareLink.value = shareUrl;
    
    // Reset copy button
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
    copyBtn.classList.remove('copied');
    
    modalOverlay.classList.add('active');
};

window.closeModal = function() {
    modalOverlay.classList.remove('active');
    currentFileId = null;
};

function generateShareId() {
    return Math.random().toString(36).substr(2, 12);
}

function generateShareUrl(shareId) {
    // For hosted sites, use the proper origin
    return `https://shroomuploads.online?share=${shareId}`;
}

window.copyShareLink = async function() {
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareLink.value);
        } else {
            // Fallback for older browsers or non-secure contexts
            shareLink.select();
            shareLink.setSelectionRange(0, 99999); // For mobile devices
            document.execCommand('copy');
        }
        
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        copyBtn.classList.add('copied');
        showToast('Share link copied to clipboard!', 'success');
        
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback: show the link in a toast
        showToast(`Share link: ${shareLink.value}`, 'info');
    }
};

window.downloadCurrentFile = async function() {
    if (!currentFileId) return;
    
    // Convert currentFileId to number for comparison
    const numericFileId = parseInt(currentFileId);

    const file = currentFiles.find(f => f.id === numericFileId);
    if (!file) {
        console.error('File not found:', numericFileId);
        return;
    }
    
    try {
        // Fetch the file content as a blob
        const response = await fetch(file.download_url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();

        // Create a temporary URL for the blob
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl; // Use the blob URL
        link.download = file.name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the object URL after use
        URL.revokeObjectURL(blobUrl);
        
        showToast('Download started!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed', 'error');
    }
};

window.deleteCurrentFile = async function() {
    if (!currentFileId) return;
    
    const file = currentFiles.find(f => f.id === currentFileId);
    if (!file) return;
    
    // Show custom confirmation modal
    showDeleteConfirmation('Are you sure you want to delete this file?', async () => {
        try {
            // Delete from storage
            const { error: storageError } = await window.supabase.storage
                .from('uploads')
                .remove([file.storage_ref]);
            
            if (storageError) {
                throw storageError;
            }
            
            // Delete from database
            const { error: dbError } = await window.supabase
                .from('files')
                .delete()
                .eq('id', currentFileId);
            
            if (dbError) {
                throw dbError;
            }
            
            showToast('File deleted successfully!', 'success');
            closeModal();
            await loadFiles();
        } catch (error) {
            console.error('Delete error:', error);
            showToast('Failed to delete file', 'error');
        }
    });
};

// Helper functions for file card actions - Make them global
window.downloadFileFromCard = async function(fileId) {
    // Convert fileId to number for comparison
    const numericFileId = parseInt(fileId);
    
    const file = currentFiles.find(f => f.id === numericFileId);
    if (!file) {
        console.error('File not found:', numericFileId);
        return;
    }
    
    try {
        // Fetch the file content as a blob
        const response = await fetch(file.download_url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();

        // Create a temporary URL for the blob
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl; // Use the blob URL
        link.download = file.name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the object URL after use
        URL.revokeObjectURL(blobUrl);
        
        showToast('Download started!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed', 'error');
    }
};

window.copyShareLinkFromCard = async function(fileId) {
    // Convert fileId to number for comparison
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    if (!file) {
        console.error('File not found:', numericFileId);
        return;
    }
    
    const shareUrl = generateShareUrl(file.share_id);
    
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareUrl);
        } else {
            // Fallback for older browsers or non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
        showToast('Share link copied to clipboard!', 'success');
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback: show the link in a toast
        showToast(`Share link: ${shareUrl}`, 'info');
    }
};

window.deleteFileFromCard = async function(fileId) {
    // Convert fileId to number for comparison
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    if (!file) {
        console.error('File not found:', numericFileId);
        return;
    }
    
    // Show custom confirmation modal
    showDeleteConfirmation('Are you sure you want to delete this file?', async () => {
        try {
            // Delete from storage
            const { error: storageError } = await window.supabase.storage
                .from('uploads')
                .remove([file.storage_ref]);
            
            if (storageError) {
                throw storageError;
            }
            
            // Delete from database
            const { error: dbError } = await window.supabase
                .from('files')
                .delete()
                .eq('id', numericFileId);
            
            if (dbError) {
                throw dbError;
            }
            
            showToast('File deleted successfully!', 'success');
            await loadFiles();
        } catch (error) {
            console.error('Delete error:', error);
            showToast('Failed to delete file', 'error');
        }
    });
};

// Test function to verify buttons work
window.testButton = function() {
    console.log('Test button clicked!');
    showToast('Test button works!', 'success');
};

// Manual load files function for testing
window.manualLoadFiles = async function() {
    console.log('Manually loading files...');
    await loadFiles();
    console.log('Manual load complete. Files:', currentFiles);
};

// Check current files function
window.checkCurrentFiles = function() {
    console.log('Current files check:');
    console.log('currentFiles:', currentFiles);
    console.log('currentFiles.length:', currentFiles.length);
    console.log('currentFiles IDs:', currentFiles.map(f => f.id));
    return currentFiles;
};

window.refreshFiles = async function() {
    showToast('Refreshing files...', 'success');
    await loadFiles();
};

window.clearAllFiles = async function() {
    // Show custom confirmation modal
    showDeleteConfirmation('Are you sure you want to delete ALL files? This action cannot be undone.', async () => {
        try {
            // Delete all files from storage
            const storageRefs = currentFiles.map(file => file.storage_ref);
            const { error: storageError } = await window.supabase.storage
                .from('uploads')
                .remove(storageRefs);
            
            if (storageError) {
                throw storageError;
            }
            
            // Delete all files from database
            const { error: dbError } = await window.supabase
                .from('files')
                .delete()
                .neq('id', 0); // Delete all records
            
            if (dbError) {
                throw dbError;
            }
            
            showToast('All files deleted successfully!', 'success');
            await loadFiles();
        } catch (error) {
            console.error('Clear all error:', error);
            showToast('Failed to delete all files', 'error');
        }
    });
};

window.switchSection = function(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Switch sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');
    
    // Load files if switching to files section
    if (sectionName === 'files') {
        loadFiles();
    }
};

function getFileIcon(fileType) {
    if (!fileType) return '<i class="fas fa-file"></i>';
    
    if (fileType.startsWith('image/')) return '<i class="fas fa-file-image"></i>';
    if (fileType.startsWith('video/')) return '<i class="fas fa-file-video"></i>';
    if (fileType.startsWith('audio/')) return '<i class="fas fa-file-audio"></i>';
    if (fileType.includes('pdf')) return '<i class="fas fa-file-pdf"></i>';
    if (fileType.includes('word') || fileType.includes('document')) return '<i class="fas fa-file-word"></i>';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '<i class="fas fa-file-excel"></i>';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '<i class="fas fa-file-powerpoint"></i>';
    if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('7z')) return '<i class="fas fa-file-archive"></i>';
    if (fileType.startsWith('text/')) return '<i class="fas fa-file-alt"></i>';
    
    return '<i class="fas fa-file"></i>';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

function showDeleteConfirmation(message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal delete-confirmation-modal">
            <div class="modal-header">
                <h3 class="modal-title">Confirm Delete</h3>
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="confirmation-content">
                    <i class="fas fa-exclamation-triangle warning-icon"></i>
                    <p class="confirmation-message">${message}</p>
                </div>
                <div class="modal-actions">
                    <button class="action-btn secondary" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                        Cancel
                    </button>
                    <button class="action-btn danger" id="confirmDeleteBtn">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener to the confirm button
    const confirmBtn = modal.querySelector('#confirmDeleteBtn');
    confirmBtn.addEventListener('click', () => {
        // Disable button to prevent double-click
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        // Remove the modal
        modal.remove();
        
        // Execute the delete function
        onConfirm();
    });
}

// Check for shared file on page load
function checkSharedFile() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    
    if (shareId) {
        handleSharedFile(shareId);
    }
}

async function handleSharedFile(shareId) {
    try {
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .eq('share_id', shareId)
            .single();
        
        if (error) {
            throw error;
        }
        
        if (files) {
            // Show shared file download modal
            showSharedFileModal(files);
        } else {
            showToast('Shared file not found or has been deleted', 'error');
        }
    } catch (error) {
        console.error('Error loading shared file:', error);
        showToast('Error loading shared file', 'error');
    }
}

function showSharedFileModal(file) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Shared File</h3>
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="file-preview">
                    <div class="file-icon-large">
                        ${getFileIcon(file.type)}
                    </div>
                    <div class="file-info-modal">
                        <h4>${file.name}</h4>
                        <p class="file-meta">${formatFileSize(file.size)}</p>
                        <p class="file-meta">${file.type || 'Unknown'}</p>
                        <p class="file-meta">Shared: ${formatDate(file.upload_date)}</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="action-btn primary" onclick="downloadSharedFile('${file.download_url}', '${file.name}')">
                        <i class="fas fa-download"></i>
                        Download File
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function downloadSharedFile(downloadURL, fileName) {
    try {
        // Fetch the file content as a blob
        const response = await fetch(downloadURL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();

        // Create a temporary URL for the blob
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl; // Use the blob URL
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the object URL after use
        URL.revokeObjectURL(blobUrl);
        
        showToast('Download started!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed', 'error');
    }
}

// Initialize shared file check after Supabase is ready
document.addEventListener('DOMContentLoaded', () => {
    const checkSupabaseAndShare = setInterval(() => {
        if (window.supabase) {
            clearInterval(checkSupabaseAndShare);
            checkSharedFile();
        }
    }, 100);
});
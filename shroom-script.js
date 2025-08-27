// Global variables
let currentFiles = [];
let currentFileId = null;
let isUploading = false;

// Enhanced file utilities
const fileUtils = {
    // Format file size
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Get file icon based on type
    getFileIcon: (type) => {
        if (type.startsWith('image/')) return 'fas fa-file-image';
        if (type.startsWith('video/')) return 'fas fa-file-video';
        if (type.startsWith('audio/')) return 'fas fa-file-audio';
        if (type.includes('pdf')) return 'fas fa-file-pdf';
        if (type.includes('word') || type.includes('document')) return 'fas fa-file-word';
        if (type.includes('excel') || type.includes('spreadsheet')) return 'fas fa-file-excel';
        if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'fas fa-file-archive';
        if (type.includes('text') || type.includes('code')) return 'fas fa-file-code';
        return 'fas fa-file';
    },

    // Generate unique share ID
    generateShareId: () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    // Validate file - simplified to accept most file types
    validateFile: (file) => {
        const maxSize = 100 * 1024 * 1024; // 100MB limit

        if (file.size > maxSize) {
            throw new Error(`File size exceeds 100MB limit. Current size: ${fileUtils.formatFileSize(file.size)}`);
        }

        // Accept all file types except potentially dangerous ones
        const dangerousTypes = [
            'application/x-executable',
            'application/x-msdownload',
            'application/x-msi',
            'application/x-msdos-program'
        ];

        if (dangerousTypes.includes(file.type)) {
            throw new Error(`File type not allowed for security reasons: ${file.type}`);
        }

        return true;
    }
};

// Simplified upload function without encryption
async function uploadFile(file) {
    try {
        // Validate file
        fileUtils.validateFile(file);

        // Show upload progress
        showUploadProgress(file);
        isUploading = true;

        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const fileExtension = file.name.split('.').pop();
        const uniqueFileName = `${timestamp}_${randomId}.${fileExtension}`;

        // Upload file directly to Supabase Storage
        const { data: uploadData, error: uploadError } = await window.supabase.storage
            .from('uploads')
            .upload(uniqueFileName, file);

        if (uploadError) {
            throw uploadError;
        }

        // Get public URL
        const { data: urlData } = window.supabase.storage
            .from('uploads')
            .getPublicUrl(uniqueFileName);

        // Prepare file data for database
        const fileDataForDB = {
            name: file.name,
            original_name: file.name,
            size: file.size,
            type: file.type,
            upload_date: new Date().toISOString(),
            download_url: urlData.publicUrl,
            storage_ref: uniqueFileName,
            share_id: fileUtils.generateShareId(),
            created_at: new Date().toISOString()
        };

        // Insert into database
        const { data: insertData, error: insertError } = await window.supabase
            .from('files')
            .insert([fileDataForDB])
            .select();

        if (insertError) {
            throw insertError;
        }

        console.log('File uploaded successfully:', insertData);
        showToast('File uploaded successfully!', 'success');
        
        // Hide progress and reload files
        hideUploadProgress();
        await loadFiles();
        switchSection('files');
        
    } catch (error) {
        console.error('Upload failed:', error);
        showToast(`Upload failed: ${error.message}`, 'error');
        hideUploadProgress();
    } finally {
        isUploading = false;
    }
}

// Simplified download function without encryption
async function downloadFile(file) {
    try {
        showToast('Preparing download...', 'info');

        // Fetch file directly
        const response = await fetch(file.download_url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        showToast('Download started!', 'success');
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    }
}

// Enhanced load files function
async function loadFiles() {
    try {
        console.log('Loading files from database...');
        
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        currentFiles = files || [];
        console.log('Loaded files:', currentFiles);
        
        renderFiles();
        
    } catch (error) {
        console.error('Failed to load files:', error);
        showToast('Failed to load files: ' + error.message, 'error');
    }
}

// Enhanced render files function
function renderFiles() {
    const filesGrid = document.getElementById('filesGrid');
    
    if (!currentFiles || currentFiles.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h4>No files uploaded yet</h4>
                <p>Upload your first file to get started!</p>
            </div>
        `;
        return;
    }

    filesGrid.innerHTML = currentFiles.map(file => `
        <div class="file-card" onclick="openFileModal(${file.id})">
            <div class="file-card-header">
                <div class="file-icon-card">
                    <i class="${fileUtils.getFileIcon(file.type)}"></i>
                </div>
                <div class="file-info-card">
                    <h4>${file.name}</h4>
                    <div class="file-meta">
                        <span>${fileUtils.formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>${new Date(file.upload_date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            <div class="file-actions-card">
                <button class="file-action-btn" onclick="event.stopPropagation(); downloadFileFromCard(${file.id})" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action-btn" onclick="event.stopPropagation(); copyShareLinkFromCard(${file.id})" title="Copy Share Link">
                    <i class="fas fa-link"></i>
                </button>
                <button class="file-action-btn" onclick="event.stopPropagation(); deleteFileFromCard(${file.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Enhanced download from card
window.downloadFileFromCard = async function(fileId) {
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    await downloadFile(file);
};

// Enhanced copy share link from card
window.copyShareLinkFromCard = async function(fileId) {
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    const shareUrl = generateShareUrl(file.share_id);
    
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareUrl);
        } else {
            // Fallback method
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (!successful) {
                throw new Error('Copy command failed');
            }
        }
        
        showToast('Share link copied to clipboard!', 'success');
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Share link: ' + shareUrl, 'info');
    }
};

// Enhanced delete from card
window.deleteFileFromCard = async function(fileId) {
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    showDeleteConfirmation(
        `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
        async () => {
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
                showToast('Failed to delete file: ' + error.message, 'error');
            }
        }
    );
};

// Enhanced modal functions
window.openFileModal = function(fileId) {
    const numericFileId = parseInt(fileId);
    const file = currentFiles.find(f => f.id === numericFileId);
    
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    currentFileId = numericFileId;
    
    // Update modal content
    document.getElementById('modalFileName').textContent = file.name;
    document.getElementById('modalFileSize').textContent = fileUtils.formatFileSize(file.size);
    document.getElementById('modalFileType').textContent = file.type;
    document.getElementById('modalUploadDate').textContent = new Date(file.upload_date).toLocaleString();
    document.getElementById('modalFileIcon').innerHTML = `<i class="${fileUtils.getFileIcon(file.type)}"></i>`;
    
    // Set share link
    const shareUrl = generateShareUrl(file.share_id);
    document.getElementById('shareLink').value = shareUrl;
    
    // Show modal
    document.getElementById('modalOverlay').classList.add('active');
};

// Enhanced download current file
window.downloadCurrentFile = async function() {
    if (!currentFileId) return;
    
    const file = currentFiles.find(f => f.id === currentFileId);
    if (!file) return;

    await downloadFile(file);
};

// Enhanced delete current file
window.deleteCurrentFile = async function() {
    if (!currentFileId) return;
    
    const file = currentFiles.find(f => f.id === currentFileId);
    if (!file) return;

    showDeleteConfirmation(
        `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
        async () => {
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
                showToast('Failed to delete file: ' + error.message, 'error');
            }
        }
    );
};

// Enhanced copy share link
window.copyShareLink = async function() {
    const shareLink = document.getElementById('shareLink');
    const copyBtn = document.getElementById('copyBtn');
    
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareLink.value);
        } else {
            // Fallback method
            shareLink.select();
            shareLink.setSelectionRange(0, 99999);
            
            const successful = document.execCommand('copy');
            if (!successful) {
                throw new Error('Copy command failed');
            }
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
        showToast('Share link: ' + shareLink.value, 'info');
    }
};

// Enhanced clear all files
window.clearAllFiles = async function() {
    if (currentFiles.length === 0) {
        showToast('No files to delete', 'info');
        return;
    }

    showDeleteConfirmation(
        `Are you sure you want to delete ALL ${currentFiles.length} files? This action cannot be undone.`,
        async () => {
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
                    .neq('id', 0);

                if (dbError) {
                    throw dbError;
                }

                showToast('All files deleted successfully!', 'success');
                await loadFiles();
            } catch (error) {
                console.error('Clear all error:', error);
                showToast('Failed to delete all files: ' + error.message, 'error');
            }
        }
    );
};

// Enhanced refresh files
window.refreshFiles = async function() {
    showToast('Refreshing files...', 'info');
    await loadFiles();
    showToast('Files refreshed!', 'success');
};

// Enhanced switch section
window.switchSection = function(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    document.getElementById(sectionName).classList.add('active');
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Load files if switching to files section
    if (sectionName === 'files') {
        loadFiles();
    }
};

// Enhanced close modal
window.closeModal = function() {
    document.getElementById('modalOverlay').classList.remove('active');
    currentFileId = null;
};

// Enhanced show delete confirmation
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
                    <button class="action-btn danger confirm-delete-btn">
                        <i class="fas fa-trash"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add click handler for confirm button
    const confirmBtn = modal.querySelector('.confirm-delete-btn');
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        try {
            await onConfirm();
            modal.remove();
        } catch (error) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-trash"></i><span>Delete</span>';
            console.error('Delete confirmation error:', error);
        }
    });
}

// Enhanced show toast
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' :
                 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;
    
    const toastContainer = document.getElementById('toastContainer');
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

// Enhanced upload progress functions
function showUploadProgress(file) {
    const container = document.getElementById('uploadProgressContainer');
    const fileName = document.getElementById('uploadFileName');
    const fileSize = document.getElementById('uploadFileSize');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    fileName.textContent = file.name;
    fileSize.textContent = fileUtils.formatFileSize(file.size);
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    
    container.style.display = 'block';
}

function updateUploadProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressFill.style.width = percent + '%';
    progressText.textContent = Math.round(percent) + '%';
}

function hideUploadProgress() {
    document.getElementById('uploadProgressContainer').style.display = 'none';
}

// Enhanced generate share URL
function generateShareUrl(shareId) {
    return `https://shroomuploads.online?share=${shareId}`;
}

// Enhanced handle shared file
async function handleSharedFile(shareId) {
    try {
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .eq('share_id', shareId)
            .single();

        if (error || !files) {
            showToast('Shared file not found', 'error');
            return;
        }

        // Show shared file modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal shared-file-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Shared File</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="file-preview">
                        <div class="file-icon-large">
                            <i class="${fileUtils.getFileIcon(files.type)}"></i>
                        </div>
                        <div class="file-info-modal">
                            <h4>${files.name}</h4>
                            <p class="file-meta">${fileUtils.formatFileSize(files.size)}</p>
                            <p class="file-meta">${files.type}</p>
                            <p class="file-meta">Shared on ${new Date(files.upload_date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="action-btn primary" onclick="downloadSharedFile('${files.download_url}', '${files.name}')">
                            <i class="fas fa-download"></i>
                            Download
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error handling shared file:', error);
        showToast('Error loading shared file', 'error');
    }
}

// Enhanced download shared file
async function downloadSharedFile(downloadURL, fileName) {
    try {
        showToast('Preparing download...', 'info');

        // Fetch file directly
        const response = await fetch(downloadURL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        showToast('Download started!', 'success');
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    }
}

// Enhanced event listeners
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => uploadFile(file));
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => uploadFile(file));
        e.target.value = ''; // Reset input
    });

    // Click to upload
    uploadArea.addEventListener('click', () => {
        if (!isUploading) {
            fileInput.click();
        }
    });

    // Navigation events
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            switchSection(section);
        });
    });

    // Modal close on overlay click
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// Enhanced initialization
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Initializing Shroom Uploads...');
    
    // Check for shared file in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    
    if (shareId) {
        await handleSharedFile(shareId);
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial files
    await loadFiles();
    
    console.log('Shroom Uploads initialized successfully!');
});

// Export functions for global access
window.uploadFile = uploadFile;
window.downloadFile = downloadFile;
window.loadFiles = loadFiles;
window.renderFiles = renderFiles;
window.openFileModal = window.openFileModal;
window.closeModal = window.closeModal;
window.switchSection = window.switchSection;
window.refreshFiles = window.refreshFiles;
window.clearAllFiles = window.clearAllFiles;
window.downloadFileFromCard = window.downloadFileFromCard;
window.copyShareLinkFromCard = window.copyShareLinkFromCard;
window.deleteFileFromCard = window.deleteFileFromCard;
window.downloadCurrentFile = window.downloadCurrentFile;
window.deleteCurrentFile = window.deleteCurrentFile;
window.copyShareLink = window.copyShareLink;
window.showToast = showToast;
// Global variables
let currentFiles = [];
let currentFileId = null;
let isUploading = false;

// File utilities
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
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    // Basic file validation
    validateFile: (file) => {
        // Check file size (100MB limit)
        if (file.size > 100 * 1024 * 1024) {
            throw new Error('File size exceeds 100MB limit');
        }
        
        // Basic file name sanitization
        const fileName = file.name.replace(/[<>:"|?*]/g, '').trim();
        if (!fileName) {
            throw new Error('Invalid file name');
        }
        
        return true;
    },

    // Check if file is an archive (RAR, ZIP, etc.)
    isArchive: (file) => {
        const archiveTypes = [
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/x-tar',
            'application/gzip'
        ];
        const archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz'];
        
        return archiveTypes.includes(file.type) || 
               archiveExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    },

    // Get archive contents (simulated for RAR files)
    getArchiveContents: async (file) => {
        // For RAR files, we'll simulate getting contents
        // In a real implementation, you'd use a library like unrar-js
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simulate archive contents
                const contents = [
                    { name: 'document.pdf', size: 1024000, type: 'application/pdf' },
                    { name: 'image.jpg', size: 512000, type: 'image/jpeg' },
                    { name: 'readme.txt', size: 2048, type: 'text/plain' },
                    { name: 'folder/', size: 0, type: 'folder' },
                    { name: 'folder/file.txt', size: 1024, type: 'text/plain' }
                ];
                resolve(contents);
            }, 1000);
        });
    }
};

// Upload function
async function uploadFile(file) {
    try {
        // Basic validation
        fileUtils.validateFile(file);
        
        // Show upload progress
        showUploadProgress(file);
        isUploading = true;

        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await window.supabase.storage
            .from('uploads')
            .upload(fileName, file);

        if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = window.supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        // Generate share ID
        const shareId = fileUtils.generateShareId();

        // Insert file data into database
        const fileData = {
            name: fileName,
            original_name: file.name,
            size: file.size,
            type: file.type,
            upload_date: new Date().toISOString(),
            download_url: urlData.publicUrl,
            storage_ref: fileName,
            share_id: shareId
        };

        console.log('Inserting file data:', fileData);

        const { data: insertData, error: insertError } = await window.supabase
            .from('files')
            .insert([fileData])
            .select();

        if (insertError) {
            throw new Error(`Database error: ${insertError.message}`);
        }

        console.log('File uploaded successfully:', insertData);
        
        // Hide progress and show success
        hideUploadProgress();
        isUploading = false;
        
        // Switch to files section and reload
        switchSection('files');
        await loadFiles();
        
        showToast('File uploaded successfully!', 'success');

    } catch (error) {
        console.error('Upload error:', error);
        hideUploadProgress();
        isUploading = false;
        showToast(`Upload failed: ${error.message}`, 'error');
    }
}

// Download function
async function downloadFile(file) {
    try {
        const response = await fetch(file.download_url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.original_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        window.URL.revokeObjectURL(url);
        showToast('Download started!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed', 'error');
    }
}

// Load files from database
async function loadFiles() {
    try {
        console.log('Loading files from database...');
        
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .order('upload_date', { ascending: false });

        if (error) {
            throw new Error(`Failed to load files: ${error.message}`);
        }

        currentFiles = files || [];
        console.log('Loaded files:', currentFiles);
        
        renderFiles();
        
    } catch (error) {
        console.error('Load files error:', error);
        showToast('Failed to load files', 'error');
    }
}

// Render files in the UI
function renderFiles() {
    const filesContainer = document.getElementById('filesContainer');
    if (!filesContainer) return;

    console.log('Rendering files. Current files:', currentFiles);
    console.log('Current files length:', currentFiles.length);

    if (currentFiles.length === 0) {
        filesContainer.innerHTML = '<p class="no-files">No files uploaded yet.</p>';
        console.log('Files rendered. Current files after render:', currentFiles);
        return;
    }

    const filesHTML = currentFiles.map(file => `
        <div class="file-card" data-file-id="${file.id}">
            <div class="file-icon">
                <i class="${fileUtils.getFileIcon(file.type)}"></i>
            </div>
            <div class="file-info">
                <h3>${file.original_name}</h3>
                <p>${fileUtils.formatFileSize(file.size)} • ${file.type}</p>
                <p class="upload-date">Uploaded: ${new Date(file.upload_date).toLocaleDateString()}</p>
            </div>
            <div class="file-actions">
                ${fileUtils.isArchive({ name: file.original_name, type: file.type }) ? 
                    `<button class="action-btn archive-btn" onclick="openArchiveContents(${file.id})" title="View Archive Contents">
                        <i class="fas fa-folder-open"></i>
                        <span class="btn-label">View Contents</span>
                    </button>` : ''
                }
                <button class="action-btn download-btn" onclick="downloadFileFromCard(${file.id})" title="Download File">
                    <i class="fas fa-download"></i>
                    <span class="btn-label">Download</span>
                </button>
                <button class="action-btn share-btn" onclick="copyShareLinkFromCard(${file.id})" title="Copy Share Link">
                    <i class="fas fa-link"></i>
                    <span class="btn-label">Share</span>
                </button>
                <button class="action-btn delete-btn" onclick="deleteFileFromCard(${file.id})" title="Delete File">
                    <i class="fas fa-trash"></i>
                    <span class="btn-label">Delete</span>
                </button>
            </div>
        </div>
    `).join('');

    filesContainer.innerHTML = filesHTML;
    console.log('Files rendered. Current files after render:', currentFiles);
}

// Open archive contents
async function openArchiveContents(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    try {
        showToast('Loading archive contents...', 'info');
        
        const contents = await fileUtils.getArchiveContents(file);
        
        // Show archive contents modal
        const modal = document.getElementById('archiveContentsModal');
        const contentsList = document.getElementById('archiveContentsList');
        
        // Calculate total size and organize contents
        const totalSize = contents.reduce((sum, item) => sum + (item.size || 0), 0);
        const fileCount = contents.filter(item => item.type !== 'folder').length;
        const folderCount = contents.filter(item => item.type === 'folder').length;
        
        // Generate contents HTML with better organization
        const contentsHTML = `
            <div class="archive-summary">
                <div class="summary-item">
                    <i class="fas fa-file"></i>
                    <span>${fileCount} files</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-folder"></i>
                    <span>${folderCount} folders</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-hdd"></i>
                    <span>${fileUtils.formatFileSize(totalSize)} total</span>
                </div>
            </div>
            <div class="archive-items">
                ${contents.map(item => `
                    <div class="archive-item ${item.type === 'folder' ? 'folder-item' : 'file-item'}">
                        <div class="archive-item-icon">
                            <i class="${item.type === 'folder' ? 'fas fa-folder' : fileUtils.getFileIcon(item.type)}"></i>
                        </div>
                        <div class="archive-item-info">
                            <span class="archive-item-name">${item.name}</span>
                            ${item.type !== 'folder' ? `
                                <div class="archive-item-details">
                                    <span class="archive-item-size">${fileUtils.formatFileSize(item.size)}</span>
                                    <span class="archive-item-type">${item.type}</span>
                                </div>
                            ` : '<span class="archive-item-type">Folder</span>'}
                        </div>
                        ${item.type !== 'folder' ? `
                            <div class="archive-item-actions">
                                <button class="archive-action-btn" title="Download this file">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        contentsList.innerHTML = contentsHTML;
        
        // Update modal title
        document.getElementById('archiveFileName').textContent = file.original_name;
        document.getElementById('archiveFileSize').textContent = fileUtils.formatFileSize(file.size);
        
        // Show modal
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('Error opening archive:', error);
        showToast('Failed to open archive', 'error');
    }
}

// Download from card
async function downloadFileFromCard(fileId) {
    console.log('Download button clicked for file:', fileId);
    console.log('Current files array:', currentFiles);
    console.log('Current files length:', currentFiles.length);
    
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        console.log('File not found:', fileId);
        console.log('Available file IDs:', currentFiles.map(f => f.id));
        showToast('File not found', 'error');
        return;
    }
    
    await downloadFile(file);
}

// Copy share link from card
async function copyShareLinkFromCard(fileId) {
    console.log('Copy link button clicked for file:', fileId);
    
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        console.log('File not found:', fileId);
        showToast('File not found', 'error');
        return;
    }
    
    await copyShareLink(file);
}

// Delete file from card
async function deleteFileFromCard(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }
    
    showDeleteConfirmation(file);
}

// Open file modal
function openFileModal(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) return;

    currentFileId = file.id;
    
    document.getElementById('modalFileName').textContent = file.original_name;
    document.getElementById('modalFileSize').textContent = fileUtils.formatFileSize(file.size);
    document.getElementById('modalFileType').textContent = file.type;
    
    document.getElementById('fileModal').style.display = 'flex';
}

// Download current file
async function downloadCurrentFile() {
    if (!currentFileId) return;
    
    const file = currentFiles.find(f => f.id === currentFileId);
    if (!file) return;
    
    await downloadFile(file);
    document.getElementById('fileModal').style.display = 'none';
}

// Delete current file
async function deleteCurrentFile() {
    if (!currentFileId) return;
    
    const file = currentFiles.find(f => f.id === currentFileId);
    if (!file) return;
    
    await deleteFile(file);
    document.getElementById('fileModal').style.display = 'none';
}

// Copy share link
async function copyShareLink(file) {
    const shareUrl = generateShareUrl(file.share_id);
    
    try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard!', 'success');
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            showToast('Link copied to clipboard!', 'success');
        } catch (fallbackError) {
            showToast(`Share link: ${shareUrl}`, 'info');
        }
        
        document.body.removeChild(textArea);
    }
}

// Delete file
async function deleteFile(file) {
    try {
        // Delete from storage
        const { error: storageError } = await window.supabase.storage
            .from('uploads')
            .remove([file.storage_ref]);

        if (storageError) {
            console.error('Storage delete error:', storageError);
        }

        // Delete from database
        const { error: dbError } = await window.supabase
            .from('files')
            .delete()
            .eq('id', file.id);

        if (dbError) {
            throw new Error(`Database error: ${dbError.message}`);
        }

        // Reload files
        await loadFiles();
        showToast('File deleted successfully!', 'success');

    } catch (error) {
        console.error('Delete error:', error);
        showToast(`Delete failed: ${error.message}`, 'error');
    }
}

// Clear all files with custom modal
async function clearAllFiles() {
    if (currentFiles.length === 0) {
        showToast('No files to clear', 'info');
        return;
    }

    // Show custom clear all confirmation modal
    const modal = document.getElementById('clearAllConfirmationModal');
    const fileCount = document.getElementById('clearAllFileCount');
    
    fileCount.textContent = currentFiles.length;
    modal.style.display = 'flex';
}

// Confirm clear all files
async function confirmClearAll() {
    try {
        // Delete all files from storage
        const storageRefs = currentFiles.map(file => file.storage_ref);
        const { error: storageError } = await window.supabase.storage
            .from('uploads')
            .remove(storageRefs);

        if (storageError) {
            console.error('Storage delete error:', storageError);
        }

        // Delete all files from database
        const { error: dbError } = await window.supabase
            .from('files')
            .delete()
            .neq('id', 0); // Delete all records

        if (dbError) {
            throw new Error(`Database error: ${dbError.message}`);
        }

        currentFiles = [];
        renderFiles();
        showToast('All files cleared successfully!', 'success');
        
        // Hide modal
        document.getElementById('clearAllConfirmationModal').style.display = 'none';

    } catch (error) {
        console.error('Clear all error:', error);
        showToast(`Clear failed: ${error.message}`, 'error');
    }
}

// Cancel clear all
function cancelClearAll() {
    document.getElementById('clearAllConfirmationModal').style.display = 'none';
}

// Refresh files
async function refreshFiles() {
    await loadFiles();
    showToast('Files refreshed!', 'success');
}

// Switch between sections
function switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Show selected section
    document.getElementById(section + 'Section').classList.add('active');
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`[href="#${section}"]`).classList.add('active');
}

// Show delete confirmation modal
function showDeleteConfirmation(file) {
    const modal = document.getElementById('deleteConfirmationModal');
    const fileName = document.getElementById('deleteFileName');
    
    fileName.textContent = file.original_name;
    modal.style.display = 'flex';
    
    // Store file for deletion
    modal.dataset.fileId = file.id;
}

// Confirm delete
async function confirmDelete() {
    const modal = document.getElementById('deleteConfirmationModal');
    const fileId = parseInt(modal.dataset.fileId);
    
    const file = currentFiles.find(f => f.id === fileId);
    if (file) {
        await deleteFile(file);
    }
    
    modal.style.display = 'none';
}

// Cancel delete
function cancelDelete() {
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// Upload progress functions
function showUploadProgress(file) {
    const progressContainer = document.getElementById('uploadProgress');
    const progressText = document.getElementById('uploadProgressText');
    
    progressText.textContent = `Uploading ${file.name}...`;
    progressContainer.style.display = 'flex';
}

function updateUploadProgress(percent) {
    const progressBar = document.getElementById('uploadProgressBar');
    progressBar.style.width = percent + '%';
}

function hideUploadProgress() {
    const progressContainer = document.getElementById('uploadProgress');
    progressContainer.style.display = 'none';
    
    const progressBar = document.getElementById('uploadProgressBar');
    progressBar.style.width = '0%';
}

// Generate share URL
function generateShareUrl(shareId) {
    // For hosted sites, use the actual domain
    if (window.location.protocol === 'https:') {
        return `https://shroomuploads.online?share=${shareId}`;
    }
    
    // For local development
    const baseUrl = window.location.origin || window.location.href.split('?')[0];
    return `${baseUrl}?share=${shareId}`;
}

// Handle shared file
async function handleSharedFile() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    
    if (shareId) {
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
            document.getElementById('sharedFileName').textContent = files.original_name;
            document.getElementById('sharedFileSize').textContent = fileUtils.formatFileSize(files.size);
            document.getElementById('sharedFileType').textContent = files.type;
            document.getElementById('sharedFileModal').style.display = 'flex';
            
            // Store file for download
            document.getElementById('sharedFileModal').dataset.file = JSON.stringify(files);

        } catch (error) {
            console.error('Shared file error:', error);
            showToast('Error loading shared file', 'error');
        }
    }
}

// Download shared file
async function downloadSharedFile() {
    const modal = document.getElementById('sharedFileModal');
    const fileData = JSON.parse(modal.dataset.file);
    
    await downloadFile(fileData);
    modal.style.display = 'none';
}

// Setup event listeners
function setupEventListeners() {
    // File input change
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => uploadFile(file));
            e.target.value = ''; // Reset input
        });
    }

    // Drag and drop
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => uploadFile(file));
        });
    }

    // Browse button
    const browseButton = document.getElementById('browseButton');
    if (browseButton) {
        browseButton.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('href').substring(1);
            switchSection(section);
        });
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing...');
    
    // Check if Supabase is initialized
    if (!window.supabase) {
        console.error('Supabase not initialized');
        showToast('Failed to initialize application', 'error');
        return;
    }
    
    console.log('Supabase initialized successfully');
    
    // Setup event listeners
    setupEventListeners();
    
    // Load existing files
    await loadFiles();
    
    // Handle shared files
    await handleSharedFile();
    
    console.log('Initialization complete');
});

// Make functions globally available
window.downloadFileFromCard = downloadFileFromCard;
window.copyShareLinkFromCard = copyShareLinkFromCard;
window.deleteFileFromCard = deleteFileFromCard;
window.openFileModal = openFileModal;
window.openArchiveContents = openArchiveContents;
window.switchSection = switchSection;
window.downloadCurrentFile = downloadCurrentFile;
window.deleteCurrentFile = deleteCurrentFile;
window.copyShareLink = copyShareLink;
window.clearAllFiles = clearAllFiles;
window.confirmClearAll = confirmClearAll;
window.cancelClearAll = cancelClearAll;
window.refreshFiles = refreshFiles;
window.showDeleteConfirmation = showDeleteConfirmation;
window.confirmDelete = confirmDelete;
window.cancelDelete = cancelDelete;
window.downloadSharedFile = downloadSharedFile;
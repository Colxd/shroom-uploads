// Global variables
let currentFiles = [];
let selectedFiles = new Set();
let isBulkSelectMode = false;
let currentUser = null;
let pendingRegistration = null; // Store registration data for auto-login

// Authentication functions
const auth = {
    async signUp(email, password, name) {
        try {
            console.log('Starting signup process for:', email);
            
            const { data, error } = await window.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name },
                    emailRedirectTo: window.location.origin + '/index.html'
                }
            });
            
            if (error) {
                console.error('Signup error:', error);
                throw error;
            }
            
            console.log('Signup response:', data);
            
            if (data.user && !data.user.email_confirmed_at) {
                showToast('Account created successfully! Please check your email and click the verification link to activate your account.', 'success');
                showVerificationPending(email);
            } else if (data.user && data.user.email_confirmed_at) {
                showToast('Account created and verified successfully!', 'success');
                currentUser = data.user;
                uiUtils.updateUIForUser();
            } else {
                showToast('Account created! Please check your email for verification.', 'success');
            }
            
            return data;
        } catch (error) {
            console.error('Signup error:', error);
            showToast(error.message, 'error');
            throw error;
        }
    },

    async signIn(email, password) {
        try {
            console.log('Starting signin process for:', email);
            
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) {
                console.error('Signin error:', error);
                throw error;
            }
            
            console.log('Signin response:', data);
            
            if (data.user && !data.user.email_confirmed_at) {
                showToast('Please verify your email address before signing in. Check your inbox for the verification link.', 'warning');
                showVerificationPending(data.user.email);
                return;
            }
            
            currentUser = data.user;
            showToast('Signed in successfully!', 'success');
            uiUtils.updateUIForUser();
            return data;
        } catch (error) {
            console.error('Signin error:', error);
            showToast(error.message, 'error');
            throw error;
        }
    },

    async signInWithGoogle() {
        try {
            console.log('Starting Google signin...');
            
            const { data, error } = await window.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/index.html'
                }
            });
            
            if (error) {
                console.error('Google signin error:', error);
                throw error;
            }
            
            console.log('Google signin response:', data);
        } catch (error) {
            console.error('Google signin error:', error);
            showToast(error.message, 'error');
        }
    },

    async resendVerificationEmail(email) {
        try {
            console.log('Resending verification email to:', email);
            
            const { error } = await window.supabase.auth.resend({
                type: 'signup',
                email: email,
                options: {
                    emailRedirectTo: window.location.origin + '/index.html'
                }
            });
            
            if (error) {
                console.error('Resend error:', error);
                throw error;
            }
            
            showToast('Verification email sent! Please check your inbox.', 'success');
        } catch (error) {
            console.error('Resend error:', error);
            showToast('Failed to send verification email: ' + error.message, 'error');
        }
    },

    async signOut() {
        try {
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
            
            currentUser = null;
            showToast('Signed out successfully!', 'success');
            uiUtils.updateUIForGuest();
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    async getCurrentUser() {
        const { data: { user } } = await window.supabase.auth.getUser();
        return user;
    }
};

// Show verification pending message
function showVerificationPending(email) {
    const verificationDiv = document.createElement('div');
    verificationDiv.id = 'verificationPending';
    verificationDiv.className = 'verification-pending';
    verificationDiv.innerHTML = `
        <div class="verification-content">
            <div class="verification-icon">
                <i class="fas fa-envelope"></i>
            </div>
            <h3>Verify Your Email</h3>
            <p>We've sent a verification link to <strong>${email}</strong></p>
            <p>Please check your inbox and click the link to activate your account.</p>
            <div class="verification-actions">
                <button class="action-btn primary" onclick="auth.resendVerificationEmail('${email}')">
                    <i class="fas fa-paper-plane"></i>
                    Resend Email
                </button>
                <button class="action-btn secondary" onclick="hideVerificationPending()">
                    <i class="fas fa-times"></i>
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(verificationDiv);
}

// Hide verification pending message
function hideVerificationPending() {
    const verificationDiv = document.getElementById('verificationPending');
    if (verificationDiv) {
        verificationDiv.remove();
    }
}

// UI update functions
const uiUtils = {
    updateUIForUser: () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'none';
        document.getElementById('userProfile').style.display = 'block';
        
        // Update user info
        if (currentUser) {
            document.getElementById('userName').textContent = currentUser.user_metadata?.full_name || currentUser.email;
            document.getElementById('userEmail').textContent = currentUser.email;
            document.getElementById('userAvatar').src = currentUser.user_metadata?.avatar_url || 'https://via.placeholder.com/64';
        }
        
        // Load user's files
        loadFiles();
    },

    updateUIForGuest: () => {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('signupForm').style.display = 'none';
        document.getElementById('userProfile').style.display = 'none';
        
        // Clear files
        currentFiles = [];
        renderFiles();
    },

    showLoginForm: () => {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('signupForm').style.display = 'none';
    },

    showSignupForm: () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
    }
};

// File utilities
const fileUtils = {
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    getFileIcon: (type) => {
        if (type.startsWith('image/')) return 'fas fa-image';
        if (type.startsWith('video/')) return 'fas fa-video';
        if (type.startsWith('audio/')) return 'fas fa-music';
        if (type.includes('pdf')) return 'fas fa-file-pdf';
        if (type.includes('word') || type.includes('document')) return 'fas fa-file-word';
        if (type.includes('excel') || type.includes('spreadsheet')) return 'fas fa-file-excel';
        if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'fas fa-file-archive';
        if (type.includes('text') || type.includes('plain')) return 'fas fa-file-alt';
        return 'fas fa-file';
    },

    isArchive: (file) => {
        const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();
        return archiveTypes.some(type => fileName.includes(type) || fileType.includes(type));
    },

    getArchiveContents: async (file) => {
        // Simulated archive contents - in a real app, you'd use a library like JSZip
        const fileName = file.original_name.toLowerCase();
        if (fileName.includes('rar')) {
            return [
                { name: 'document.pdf', type: 'application/pdf', size: 1024000 },
                { name: 'image.jpg', type: 'image/jpeg', size: 512000 },
                { name: 'folder/', type: 'folder' },
                { name: 'folder/readme.txt', type: 'text/plain', size: 2048 }
            ];
        }
        return [
            { name: 'sample.txt', type: 'text/plain', size: 1024 },
            { name: 'image.png', type: 'image/png', size: 256000 }
        ];
    },

    generateShareId: () => {
        return Math.random().toString(36).substring(2, 12);
    },

    validateFile: (file) => {
        if (file.size > 100 * 1024 * 1024) { // 100MB limit
            return { valid: false, error: 'File size must be less than 100MB' };
        }
        return { valid: true };
    }
};

// Load files from database
async function loadFiles() {
    if (!currentUser) {
        console.log('No user logged in, cannot load files');
        return;
    }

    try {
        console.log('Loading files from database for user:', currentUser.id);
        
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('upload_date', { ascending: false });

        if (error) throw error;

        currentFiles = files || [];
        console.log('Loaded files for user:', currentFiles.length);
        
        renderFiles();
        updateStats();
    } catch (error) {
        console.error('Error loading files:', error);
        showToast('Failed to load files', 'error');
    }
}

// Handle shared file access
async function handleSharedFile() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    
    if (!shareId) return;

    try {
        // Get file by share ID (this bypasses user isolation for shared files)
        const { data: files, error } = await window.supabase
            .from('files')
            .select('*')
            .eq('share_id', shareId)
            .limit(1);

        if (error) throw error;

        if (files && files.length > 0) {
            const sharedFile = files[0];
            showSharedFileModal(sharedFile);
        } else {
            showToast('Shared file not found', 'error');
        }
    } catch (error) {
        console.error('Error loading shared file:', error);
        showToast('Failed to load shared file', 'error');
    }
}

// Show shared file modal
function showSharedFileModal(file) {
    const modal = document.getElementById('sharedFileModal');
    const fileName = document.getElementById('sharedFileName');
    const fileSize = document.getElementById('sharedFileSize');
    const fileType = document.getElementById('sharedFileType');
    const downloadBtn = document.getElementById('sharedFileDownload');
    const archiveBtn = document.getElementById('sharedFileArchive');
    
    fileName.textContent = file.original_name;
    fileSize.textContent = fileUtils.formatFileSize(file.size);
    fileType.textContent = file.type;
    
    // Set up download button
    downloadBtn.onclick = () => downloadSharedFile(file);
    
    // Show/hide archive button based on file type
    if (fileUtils.isArchive({ name: file.original_name, type: file.type })) {
        archiveBtn.style.display = 'block';
        archiveBtn.onclick = () => openArchiveContents(file.id);
    } else {
        archiveBtn.style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

// Download shared file
async function downloadSharedFile(file) {
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

// Initialize the application
async function initializeApp() {
    try {
        console.log('Supabase initialized:', window.supabase);
        
        // Check for email verification in URL (when user clicks verification link)
        const urlParams = new URLSearchParams(window.location.search);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
            // User clicked verification link, set the session
            const { data, error } = await window.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });
            
            if (!error && data.user) {
                // Email verification successful
                console.log('Email verification successful:', data.user);
                
                // Try auto-login with stored registration data
                await auth.autoLoginAfterVerification();
                
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }
        }
        
        // Check authentication status
        const user = await auth.getCurrentUser();
        if (user) {
            currentUser = user;
            if (user.email_confirmed_at) {
                uiUtils.updateUIForUser();
            } else {
                // User is logged in but email not verified
                showVerificationPending(user.email);
            }
        } else {
            uiUtils.updateUIForGuest();
        }
        
        // Check for shared file access
        await handleSharedFile();
        
        // Set up event listeners
        setupEventListeners();
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // File input change
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Search input
    const searchInput = document.getElementById('fileSearch');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', handleSort);
    }

    // Drag and drop
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('click', handleUploadAreaClick);
    }

    // Clipboard paste
    document.addEventListener('paste', handlePaste);

    // Form submissions
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const signupForm = document.getElementById('signupFormElement');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });
}

// Event handlers
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    uploadFiles(files);
}

function handleSearch(event) {
    const searchTerm = event.target.value;
    const filteredFiles = searchUtils.filterFiles(currentFiles, searchTerm);
    renderFiles(filteredFiles);
}

function handleSort(event) {
    const sortBy = event.target.value;
    const sortedFiles = searchUtils.sortFiles(currentFiles, sortBy);
    renderFiles(sortedFiles);
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(event.dataTransfer.files);
    
    if (files.length === 0) {
        showToast('No files were dropped', 'warning');
        return;
    }
    
    // Validate files before uploading
    const validFiles = files.filter(file => {
        const validation = fileUtils.validateFile(file);
        if (!validation.valid) {
            showToast(`Skipping ${file.name}: ${validation.error}`, 'warning');
            return false;
        }
        return true;
    });
    
    if (validFiles.length > 0) {
        uploadFiles(validFiles);
    }
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

// Handle click on upload area
function handleUploadAreaClick(event) {
    // Trigger file input click
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.click();
    }
}

// Upload Progress Functions
function showUploadProgress() {
    const uploadProgress = document.getElementById('uploadProgress');
    if (uploadProgress) {
        uploadProgress.style.display = 'block';
        updateUploadProgress(null, 0, 1);
    }
}

function hideUploadProgress() {
    const uploadProgress = document.getElementById('uploadProgress');
    if (uploadProgress) {
        uploadProgress.style.display = 'none';
    }
}

function updateUploadProgress(file, currentIndex, totalFiles) {
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    const uploadFileName = document.getElementById('uploadFileName');
    const uploadFileSize = document.getElementById('uploadFileSize');
    const uploadSpeed = document.getElementById('uploadSpeed');
    
    if (file) {
        // Update file info
        uploadFileName.textContent = file.name;
        uploadFileSize.textContent = fileUtils.formatFileSize(file.size);
        
        // Calculate progress percentage
        const progress = ((currentIndex + 1) / totalFiles) * 100;
        progressText.textContent = `${Math.round(progress)}%`;
        progressFill.style.width = `${progress}%`;
        
        // Simulate upload speed (in real implementation, you'd track actual speed)
        const speed = Math.floor(Math.random() * 500) + 100; // Random speed between 100-600 KB/s
        uploadSpeed.textContent = `${speed} KB/s`;
    } else {
        // Reset progress
        progressText.textContent = '0%';
        progressFill.style.width = '0%';
        uploadFileName.textContent = 'filename.ext';
        uploadFileSize.textContent = '0 KB';
        uploadSpeed.textContent = '0 KB/s';
    }
}

function cancelUpload() {
    // This would need to be implemented with actual upload cancellation
    // For now, just hide the progress
    hideUploadProgress();
    showToast('Upload cancelled', 'info');
}

function handlePaste(event) {
    const items = Array.from(event.clipboardData.items);
    const files = items
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(file => file);
    
    if (files.length > 0) {
        uploadFiles(files);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signIn(email, password);
    } catch (error) {
        console.error('Login error:', error);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    try {
        await auth.signUp(email, password, name);
    } catch (error) {
        console.error('Signup error:', error);
    }
}

// Search and filter utilities
const searchUtils = {
    filterFiles: (files, searchTerm) => {
        if (!searchTerm) return files;
        
        const term = searchTerm.toLowerCase();
        return files.filter(file => 
            file.original_name.toLowerCase().includes(term) ||
            file.type.toLowerCase().includes(term)
        );
    },

    sortFiles: (files, sortBy) => {
        const sorted = [...files];
        
        switch (sortBy) {
            case 'date-desc':
                return sorted.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
            case 'date-asc':
                return sorted.sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
            case 'name-asc':
                return sorted.sort((a, b) => a.original_name.localeCompare(b.original_name));
            case 'name-desc':
                return sorted.sort((a, b) => b.original_name.localeCompare(a.original_name));
            case 'size-desc':
                return sorted.sort((a, b) => b.size - a.size);
            case 'size-asc':
                return sorted.sort((a, b) => a.size - b.size);
            default:
                return sorted;
        }
    }
};

// Bulk selection utilities
const bulkUtils = {
    toggleBulkSelect: () => {
        isBulkSelectMode = !isBulkSelectMode;
        selectedFiles.clear();
        
        const btn = document.getElementById('bulkSelectBtn');
        const bulkActions = document.getElementById('bulkActions');
        
        if (isBulkSelectMode) {
            btn.innerHTML = '<i class="fas fa-times"></i> Cancel Selection';
            btn.classList.add('active');
            bulkActions.style.display = 'flex';
        } else {
            btn.innerHTML = '<i class="fas fa-check-square"></i> Select Multiple';
            btn.classList.remove('active');
            bulkActions.style.display = 'none';
        }
        
        renderFiles();
    },

    selectAllFiles: () => {
        selectedFiles = new Set(currentFiles.map(f => f.id));
        updateSelectedCount();
        renderFiles();
    },

    deselectAllFiles: () => {
        selectedFiles.clear();
        updateSelectedCount();
        renderFiles();
    },

    toggleFileSelection: (fileId) => {
        if (selectedFiles.has(fileId)) {
            selectedFiles.delete(fileId);
        } else {
            selectedFiles.add(fileId);
        }
        updateSelectedCount();
        renderFiles();
    },

    updateSelectedCount: () => {
        const count = selectedFiles.size;
        document.getElementById('selectedCount').textContent = count;
    },

    deleteSelectedFiles: async () => {
        if (selectedFiles.size === 0) {
            showToast('No files selected', 'error');
            return;
        }

        const confirmed = confirm(`Are you sure you want to delete ${selectedFiles.size} files?`);
        if (!confirmed) return;

        try {
            const promises = Array.from(selectedFiles).map(fileId => deleteFile(fileId));
            await Promise.all(promises);
            
            selectedFiles.clear();
            isBulkSelectMode = false;
            bulkUtils.toggleBulkSelect();
            
            showToast(`${selectedFiles.size} files deleted successfully!`, 'success');
        } catch (error) {
            showToast('Error deleting files', 'error');
        }
    }
};

// Upload files
async function uploadFiles(files) {
    if (!currentUser) {
        showToast('Please sign in to upload files', 'error');
        return;
    }

    if (files.length === 0) return;

    // Show upload progress
    showUploadProgress();
    
    let uploadedCount = 0;
    for (const file of files) {
        await uploadFile(file, uploadedCount, files.length);
        uploadedCount++;
    }
    
    // Hide upload progress when done
    hideUploadProgress();
    
    // Show success message
    if (files.length === 1) {
        showToast('File uploaded successfully!', 'success');
    } else {
        showToast(`${files.length} files uploaded successfully!`, 'success');
    }
    
    // Refresh files list
    loadFiles();
}

// Upload single file
async function uploadFile(file, currentIndex = 0, totalFiles = 1) {
    const validation = fileUtils.validateFile(file);
    if (!validation.valid) {
        showToast(validation.error, 'error');
        return null;
    }

    try {
        // Update progress display
        updateUploadProgress(file, currentIndex, totalFiles);
        
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 12);
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        
        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await window.supabase.storage
            .from('uploads')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = window.supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        // Insert file data into database
        const fileData = {
            name: fileName,
            original_name: file.name,
            size: file.size,
            type: file.type,
            upload_date: new Date().toISOString(),
            download_url: urlData.publicUrl,
            storage_ref: fileName,
            share_id: fileUtils.generateShareId(),
            user_id: currentUser.id
        };

        const { data: insertData, error: insertError } = await window.supabase
            .from('files')
            .insert([fileData])
            .select();

        if (insertError) throw insertError;

        return insertData[0];
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
        return null;
    }
}

// Render files in the UI
function renderFiles(filesToRender = currentFiles) {
    const filesContainer = document.getElementById('filesContainer');
    if (!filesContainer) return;

    if (filesToRender.length === 0) {
        filesContainer.innerHTML = '<p class="no-files">No files uploaded yet.</p>';
        return;
    }

    const filesHTML = filesToRender.map(file => `
        <div class="file-card ${isBulkSelectMode && selectedFiles.has(file.id) ? 'selected' : ''}" data-file-id="${file.id}">
            ${isBulkSelectMode ? `
                <div class="file-checkbox">
                    <input type="checkbox" ${selectedFiles.has(file.id) ? 'checked' : ''} 
                           onchange="bulkUtils.toggleFileSelection(${file.id})">
                </div>
            ` : ''}
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
}

// Update statistics
function updateStats() {
    const totalFiles = currentFiles.length;
    const totalStorage = currentFiles.reduce((sum, file) => sum + file.size, 0);
    
    // Update storage display
    document.getElementById('storageUsed').textContent = fileUtils.formatFileSize(totalStorage);
    const storagePercent = Math.min((totalStorage / (100 * 1024 * 1024)) * 100, 100);
    document.getElementById('storageFill').style.width = `${storagePercent}%`;
    
    // Update stats cards
    document.getElementById('totalFiles').textContent = totalFiles;
    document.getElementById('totalStorage').textContent = fileUtils.formatFileSize(totalStorage);
    
    // Update recent files
    const recentFiles = currentFiles.slice(0, 5);
    renderRecentFiles(recentFiles);
}

// Render recent files
function renderRecentFiles(files) {
    const container = document.getElementById('recentFilesList');
    if (!container) return;
    
    if (files.length === 0) {
        container.innerHTML = '<p class="no-files">No files uploaded yet.</p>';
        return;
    }

    const filesHTML = files.map(file => `
        <div class="recent-file-item">
            <div class="recent-file-icon">
                <i class="${fileUtils.getFileIcon(file.type)}"></i>
            </div>
            <div class="recent-file-info">
                <span class="recent-file-name">${file.original_name}</span>
                <span class="recent-file-date">${new Date(file.upload_date).toLocaleDateString()}</span>
            </div>
            <button class="recent-file-action" onclick="downloadFileFromCard(${file.id})">
                <i class="fas fa-download"></i>
            </button>
        </div>
    `).join('');

    container.innerHTML = filesHTML;
}

// File operations
async function downloadFileFromCard(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

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

async function copyShareLinkFromCard(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    const shareUrl = generateShareUrl(file.share_id);
    
    try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Share link copied to clipboard!', 'success');
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Share link copied to clipboard!', 'success');
    }
}

function deleteFileFromCard(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    showDeleteConfirmation(file);
}

async function deleteFile(fileId) {
    try {
        const file = currentFiles.find(f => f.id === parseInt(fileId));
        if (!file) throw new Error('File not found');

        // Delete from storage
        const { error: storageError } = await window.supabase.storage
            .from('uploads')
            .remove([file.storage_ref]);

        if (storageError) throw storageError;

        // Delete from database
        const { error: dbError } = await window.supabase
            .from('files')
            .delete()
            .eq('id', fileId);

        if (dbError) throw dbError;

        // Remove from current files
        currentFiles = currentFiles.filter(f => f.id !== parseInt(fileId));
        renderFiles();
        updateStats();

        return true;
    } catch (error) {
        console.error('Delete error:', error);
        throw error;
    }
}

// Modal functions
function showDeleteConfirmation(file) {
    const modal = document.getElementById('deleteConfirmationModal');
    const fileName = document.getElementById('deleteFileName');
    
    fileName.textContent = file.original_name;
    modal.style.display = 'flex';
    modal.dataset.fileToDelete = JSON.stringify(file);
}

async function confirmDelete() {
    const modal = document.getElementById('deleteConfirmationModal');
    const fileData = JSON.parse(modal.dataset.fileToDelete);
    
    try {
        await deleteFile(fileData.id);
        modal.style.display = 'none';
        showToast('File deleted successfully!', 'success');
    } catch (error) {
        showToast('Failed to delete file', 'error');
    }
}

function cancelDelete() {
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}

function showClearAllConfirmation() {
    const modal = document.getElementById('clearAllConfirmationModal');
    const fileCount = document.getElementById('clearAllFileCount');
    
    fileCount.textContent = currentFiles.length;
    modal.style.display = 'flex';
}

async function confirmClearAll() {
    try {
        const promises = currentFiles.map(file => deleteFile(file.id));
        await Promise.all(promises);
        
        document.getElementById('clearAllConfirmationModal').style.display = 'none';
        showToast('All files deleted successfully!', 'success');
    } catch (error) {
        showToast('Failed to delete all files', 'error');
    }
}

function cancelClearAll() {
    document.getElementById('clearAllConfirmationModal').style.display = 'none';
}

// Archive functions
async function openArchiveContents(fileId) {
    const file = currentFiles.find(f => f.id === parseInt(fileId));
    if (!file) {
        showToast('File not found', 'error');
        return;
    }

    try {
        showToast('Loading archive contents...', 'info');
        
        const contents = await fileUtils.getArchiveContents(file);
        
        const modal = document.getElementById('archiveContentsModal');
        const contentsList = document.getElementById('archiveContentsList');
        
        const totalSize = contents.reduce((sum, item) => sum + (item.size || 0), 0);
        const fileCount = contents.filter(item => item.type !== 'folder').length;
        const folderCount = contents.filter(item => item.type === 'folder').length;
        
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
        
        document.getElementById('archiveFileName').textContent = file.original_name;
        document.getElementById('archiveFileSize').textContent = fileUtils.formatFileSize(file.size);
        
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('Error opening archive:', error);
        showToast('Failed to open archive', 'error');
    }
}

// Utility functions
function generateShareUrl(shareId) {
    const baseUrl = window.location.protocol === 'file:' ? 
        'https://shroomuploads.online' : 
        window.location.origin;
    return `${baseUrl}?share=${shareId}`;
}

function manualLoadFiles() {
    loadFiles();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        </div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Redirect to login with pre-filled data
function redirectToLoginWithPrefilledData() {
    if (!pendingRegistration) return;
    
    // Switch to account section
    switchSection('account');
    
    // Show login form
    uiUtils.showLoginForm();
    
    // Pre-fill the form fields
    setTimeout(() => {
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        
        if (emailInput) emailInput.value = pendingRegistration.email;
        if (passwordInput) passwordInput.value = pendingRegistration.password;
        
        showToast('Email verified! Your login details are pre-filled. Click "Sign In" to continue.', 'success');
    }, 100);
}

// Password toggle function
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.parentElement.querySelector('.password-toggle');
    const icon = toggleBtn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
        toggleBtn.classList.add('active');
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
        toggleBtn.classList.remove('active');
    }
}

// Global function exports
window.switchSection = function(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionName + 'Section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[onclick="switchSection('${sectionName}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
};

window.toggleBulkSelect = bulkUtils.toggleBulkSelect;
window.selectAllFiles = bulkUtils.selectAllFiles;
window.deselectAllFiles = bulkUtils.deselectAllFiles;
window.deleteSelectedFiles = bulkUtils.deleteSelectedFiles;
window.downloadFileFromCard = downloadFileFromCard;
window.copyShareLinkFromCard = copyShareLinkFromCard;
window.deleteFileFromCard = deleteFileFromCard;
window.showDeleteConfirmation = showDeleteConfirmation;
window.confirmDelete = confirmDelete;
window.cancelDelete = cancelDelete;
window.showClearAllConfirmation = showClearAllConfirmation;
window.confirmClearAll = confirmClearAll;
window.cancelClearAll = cancelClearAll;
window.openArchiveContents = openArchiveContents;
window.manualLoadFiles = manualLoadFiles;
window.showToast = showToast;
window.showLoginForm = uiUtils.showLoginForm;
window.showSignupForm = uiUtils.showSignupForm;
window.signInWithGoogle = auth.signInWithGoogle;
window.signUpWithGoogle = auth.signInWithGoogle;
window.signOut = auth.signOut;
window.editProfile = () => showToast('Profile editing coming soon!', 'info');
window.togglePassword = togglePassword;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
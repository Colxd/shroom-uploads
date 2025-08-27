// Global variables
let currentFiles = [];
let selectedFiles = new Set();
let isBulkSelectMode = false;
let currentUser = null;
let pendingRegistration = null; // Store registration data for auto-login

// Global error handler to ensure all errors show as toasts in top right
window.addEventListener('error', function(event) {
    showToast('An error occurred: ' + (event.error?.message || event.message || 'Unknown error'), 'error');
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    showToast('An error occurred: ' + (event.reason?.message || 'Unknown error'), 'error');
});

// Intercept console errors and show them as toasts
const originalConsoleError = console.error;
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const errorMessage = args.map(arg => 
        typeof arg === 'string' ? arg : 
        arg?.message || arg?.toString() || 'Unknown error'
    ).join(' ');
    showToast('Error: ' + errorMessage, 'error');
};

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
            
            // Check if user is logged in
            const { data: { user } } = await window.supabase.auth.getUser();
            
            if (user) {
                // User is logged in, show modal
                showSharedFileModal(sharedFile);
            } else {
                // User is not logged in, show simple download page
                showSharedFileDownloadPage(sharedFile);
            }
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
    
    // Check if all elements exist before proceeding
    if (!modal || !fileName || !fileSize || !fileType || !downloadBtn || !archiveBtn) {
        console.error('Shared file modal elements not found');
        showToast('Error loading shared file modal', 'error');
        return;
    }
    
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

// Show shared file download page for non-logged-in users
function showSharedFileDownloadPage(file) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Create or update the shared file download section
    let sharedSection = document.getElementById('sharedFileSection');
    if (!sharedSection) {
        sharedSection = document.createElement('div');
        sharedSection.id = 'sharedFileSection';
        sharedSection.className = 'section active';
        document.querySelector('main').appendChild(sharedSection);
    }
    
    sharedSection.innerHTML = `
        <div class="shared-file-container">
            <div class="shared-file-card">
                <div class="shared-file-header">
                    <div class="shared-file-icon">
                        <i class="${fileUtils.getFileIcon(file.type)}"></i>
                    </div>
                    <div class="shared-file-info">
                        <h2>${file.original_name}</h2>
                        <p>${fileUtils.formatFileSize(file.size)} • ${file.type}</p>
                        <p class="shared-file-date">Uploaded: ${new Date(file.upload_date).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="shared-file-actions">
                    <button class="action-btn primary download-btn" onclick="downloadSharedFile(${JSON.stringify(file).replace(/"/g, '&quot;')})">
                        <i class="fas fa-download"></i>
                        Download File
                    </button>
                    ${fileUtils.isArchive({ name: file.original_name, type: file.type }) ? 
                        `<button class="action-btn secondary" onclick="openArchiveContents(${file.id})">
                            <i class="fas fa-archive"></i>
                            View Contents
                        </button>` : ''
                    }
                </div>
            </div>
        </div>
    `;
    
    sharedSection.classList.add('active');
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
        console.log('Initializing app...');
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
        console.log('Auth check - user:', user);
        
        if (user) {
            currentUser = user;
            console.log('User is logged in:', user.email);
            if (user.email_confirmed_at) {
                uiUtils.updateUIForUser();
            } else {
                // User is logged in but email not verified
                showVerificationPending(user.email);
            }
        } else {
            console.log('No user logged in - showing guest UI');
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
    console.log('Setting up event listeners...');
    
    // File input change
    const fileInput = document.getElementById('fileInput');
    console.log('File input found:', fileInput);
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
        console.log('File input event listener added');
        
        // Test if file input is accessible
        console.log('File input accept attribute:', fileInput.accept);
        console.log('File input multiple attribute:', fileInput.multiple);
    } else {
        console.error('File input not found!');
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
    console.log('Files selected:', files.length, files.map(f => f.name));
    
    if (files.length > 0) {
        console.log('First file details:', {
            name: files[0].name,
            size: files[0].size,
            type: files[0].type
        });
    }
    
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
    event.currentTarget.classList.add('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(event.dataTransfer.files);
    uploadFiles(files);
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
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
    console.log('uploadFiles called with:', files.length, 'files');
    console.log('Current user:', currentUser);
    
    if (!currentUser) {
        console.log('No user logged in - cannot upload files');
        showToast('Please sign in to upload files', 'error');
        // Switch to account section to prompt login
        switchSection('account');
        return;
    }
    
    console.log('User is authenticated, proceeding with upload...');

    if (files.length === 0) return;

    // Show progress bar
    showUploadProgress();
    
    let uploadedCount = 0;
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update progress before starting each file
        updateUploadProgress(file, i, totalFiles);
        
        await uploadFile(file, i, totalFiles);
    }

    // Hide progress bar when done
    hideUploadProgress();
    
    // Show success message
    if (files.length === 1) {
        showToast('File uploaded successfully! Redirecting to My Files...', 'success');
    } else {
        showToast(`${files.length} files uploaded successfully! Redirecting to My Files...`, 'success');
    }
    
    // Reload files to show the new uploads
    loadFiles();
    
    // Automatically navigate to My Files page
    setTimeout(() => {
        switchSection('files');
        // Update navigation button state
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const filesBtn = document.querySelector('[onclick="switchSection(\'files\')"]');
        if (filesBtn) {
            filesBtn.classList.add('active');
        }
    }, 1500); // Wait 1.5 seconds to show the success message
}

// Upload single file
async function uploadFile(file, currentIndex = 0, totalFiles = 1) {
    console.log('Uploading file:', file.name, 'Index:', currentIndex, 'Total:', totalFiles);
    
    const validation = fileUtils.validateFile(file);
    if (!validation.valid) {
        showToast(validation.error, 'error');
        return null;
    }

    try {
        // Update progress text to show current step
        updateUploadStep('Preparing file...');
        
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 12);
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        
        // Update progress to show uploading
        updateUploadStep('Uploading to cloud storage...');
        
        // Simulate upload progress (since Supabase doesn't provide progress callbacks)
        let uploadProgress = 0;
        const progressInterval = setInterval(() => {
            if (uploadProgress < 90) {
                uploadProgress += Math.random() * 10;
                updateUploadProgress(file, currentIndex, totalFiles, uploadProgress);
            }
        }, 200);
        
        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await window.supabase.storage
            .from('uploads')
            .upload(fileName, file);

        clearInterval(progressInterval);

        if (uploadError) throw uploadError;

        // Update progress to show processing
        updateUploadStep('Processing file...');
        updateUploadProgress(file, currentIndex, totalFiles, 95);
        
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

        // Update progress to show completion
        updateUploadStep('File uploaded successfully!');
        updateUploadProgress(file, currentIndex, totalFiles, 100);
        
        return insertData[0];
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
        return null;
    }
}

// Show upload progress bar
function showUploadProgress() {
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) {
        progressBar.style.display = 'block';
        // Reset progress
        updateUploadProgress(null, 0, 1);
        updateUploadStep('Starting upload...');
    }
}

// Hide upload progress bar
function hideUploadProgress() {
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) {
        progressBar.style.display = 'none';
        // Reset progress
        updateUploadProgress(null, 0, 1);
    }
}

// Update upload progress
function updateUploadProgress(file, currentIndex, totalFiles, uploadProgress = 0) {
    const progressBar = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('uploadFileName');
    const progressSize = document.getElementById('uploadFileSize');
    const progressPercent = document.querySelector('.progress-text');
    const progressHeader = document.querySelector('.progress-header h4');

    if (!progressBar || !progressFill || !progressText || !progressSize || !progressPercent || !progressHeader) return;

    if (file) {
        // Update file info
        progressText.textContent = file.name;
        progressSize.textContent = fileUtils.formatFileSize(file.size);

        // Update header to show current file progress
        if (totalFiles > 1) {
            progressHeader.textContent = `Uploading Files (${currentIndex + 1} of ${totalFiles})`;
        } else {
            progressHeader.textContent = 'Uploading File';
        }

        // Calculate progress percentage based on actual upload progress
        let progress = 0;
        if (uploadProgress > 0) {
            // If we have actual upload progress, use it (0-100%)
            progress = Math.min(100, uploadProgress);
        } else {
            // Otherwise, show file preparation progress (0-30%)
            progress = Math.min(30, (currentIndex / totalFiles) * 30);
        }

        // Start with 0% and animate to current progress
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';

        // Animate progress over time with delay
        setTimeout(() => {
            progressFill.style.width = `${progress}%`;
            progressPercent.textContent = `${Math.round(progress)}%`;

            // Add animation to progress bar
            progressFill.style.transition = 'width 1.5s ease-in-out';

            // Add shimmer effect to progress bar
            progressFill.style.background = 'linear-gradient(90deg, #ff6b35, #f7931e, #ff6b35)';
            progressFill.style.backgroundSize = '200% 100%';
            progressFill.style.animation = 'shimmer 2s infinite';
        }, 300);
    } else {
        // Reset progress
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressText.textContent = 'filename.ext';
        progressSize.textContent = '0 KB';
        progressHeader.textContent = 'Uploading Files';
        progressFill.style.animation = 'none';
    }
}

// Update upload step text
function updateUploadStep(stepText) {
    const progressText = document.getElementById('uploadFileName');
    if (progressText) {
        progressText.textContent = stepText;
    }
    
    // Also update the progress header if it exists
    const progressHeader = document.querySelector('.progress-header h4');
    if (progressHeader) {
        progressHeader.textContent = stepText;
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

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    filesToRender.forEach(file => {
        const fileCard = document.createElement('div');
        fileCard.className = `file-card ${isBulkSelectMode && selectedFiles.has(file.id) ? 'selected' : ''}`;
        fileCard.dataset.fileId = file.id;
        
        fileCard.innerHTML = `
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
                        <i class="fas fa-archive"></i>
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
        `;
        
        fragment.appendChild(fileCard);
    });

    filesContainer.innerHTML = '';
    filesContainer.appendChild(fragment);
}

// Update statistics
function updateStats() {
    const totalFiles = currentFiles.length;
    const totalStorage = currentFiles.reduce((sum, file) => sum + file.size, 0);
    const totalDownloads = currentFiles.reduce((sum, file) => sum + (file.download_count || 0), 0);
    const sharedFiles = currentFiles.filter(file => file.share_id).length;
    
    // Update storage display (if elements exist)
    const storageUsedElement = document.getElementById('storageUsed');
    const storageFillElement = document.getElementById('storageFill');
    
    if (storageUsedElement) {
        storageUsedElement.textContent = fileUtils.formatFileSize(totalStorage);
    }
    
    if (storageFillElement) {
        const storagePercent = Math.min((totalStorage / (100 * 1024 * 1024)) * 100, 100);
        storageFillElement.style.width = `${storagePercent}%`;
    }
    
    // Update stats storage usage elements
    const statsStorageUsedElement = document.getElementById('statsStorageUsed');
    const statsStorageFillElement = document.getElementById('statsStorageFill');
    
    if (statsStorageUsedElement) {
        statsStorageUsedElement.textContent = fileUtils.formatFileSize(totalStorage);
    }
    
    if (statsStorageFillElement) {
        const storagePercent = Math.min((totalStorage / (100 * 1024 * 1024)) * 100, 100);
        statsStorageFillElement.style.width = `${storagePercent}%`;
    }
    
    // Update stats cards (with null checks)
    const totalFilesElement = document.getElementById('totalFiles');
    const totalStorageElement = document.getElementById('totalStorage');
    const totalDownloadsElement = document.getElementById('totalDownloads');
    const totalSharesElement = document.getElementById('totalShares');
    
    if (totalFilesElement) {
        totalFilesElement.textContent = totalFiles;
    }
    
    if (totalStorageElement) {
        totalStorageElement.textContent = fileUtils.formatFileSize(totalStorage);
    }
    
    if (totalDownloadsElement) {
        totalDownloadsElement.textContent = totalDownloads;
    }
    
    if (totalSharesElement) {
        totalSharesElement.textContent = sharedFiles;
    }
    
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
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Share link copied to clipboard!', 'success');
        } else {
            // Fallback for older browsers or non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showToast('Share link copied to clipboard!', 'success');
                } else {
                    showToast('Share link: ' + shareUrl, 'info');
                }
            } catch (err) {
                console.error('execCommand failed:', err);
                showToast('Share link: ' + shareUrl, 'info');
            }
            
            document.body.removeChild(textArea);
        }
    } catch (error) {
        console.error('Copy failed:', error);
        showToast('Share link: ' + shareUrl, 'info');
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

function showToast(message, type = 'info', title = null, duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Get appropriate icon for each type
    const getIcon = (type) => {
        switch(type) {
            case 'success': return 'fas fa-check-circle';
            case 'error': return 'fas fa-exclamation-circle';
            case 'warning': return 'fas fa-exclamation-triangle';
            case 'info': 
            default: return 'fas fa-info-circle';
        }
    };
    
    // Get appropriate title if not provided
    const getTitle = (type) => {
        if (title) return title;
        switch(type) {
            case 'success': return 'Success!';
            case 'error': return 'Error!';
            case 'warning': return 'Warning!';
            case 'info': 
            default: return 'Info';
        }
    };
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${getIcon(type)}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${getTitle(type)}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
        <div class="toast-progress">
            <div class="toast-progress-fill" style="width: 100%"></div>
        </div>
    `;
    
    // Ensure toast is positioned in top right
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '999999';
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Animate progress bar
    const progressBar = toast.querySelector('.toast-progress-fill');
    if (progressBar) {
        setTimeout(() => {
            progressBar.style.transition = `width ${duration}ms linear`;
            progressBar.style.width = '0%';
        }, 100);
    }
    
    // Auto remove after duration
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 400);
        }
    }, duration);
    
    // Add click to dismiss functionality
    toast.addEventListener('click', (e) => {
        if (e.target.classList.contains('toast-close')) return;
        if (toast.parentElement) {
            toast.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 400);
        }
    });
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
    
    // Update statistics when switching to stats section
    if (sectionName === 'stats') {
        updateStats();
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

// Test function for debugging
window.testFileUpload = function() {
    console.log('Testing file upload...');
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        console.log('File input found, triggering click...');
        fileInput.click();
    } else {
        console.error('File input not found in test function');
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
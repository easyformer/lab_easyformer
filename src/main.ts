import { marked } from 'marked';
import { Octokit } from 'octokit';
import 'highlight.js/styles/github.css';
import './style.css';

// Initialize Octokit with environment variable token
const initOctokit = () => {
    const token = import.meta.env.VITE_GITHUB_TOKEN;
    if (!token) {
        console.error('GitHub token not found in environment variables');
        return null;
    }
    return new Octokit({ auth: token });
};

// Types
interface FileData {
    name: string;
    content: string;
    isDirectory: boolean;
    path: string;
}

interface UserSettings {
    theme: 'light' | 'dark';
    autoDetect: boolean;
}

// State Management
let files: Map<string, FileData> = new Map();
let currentFile: string | null = null;
let showRawMarkdown = false;
let contextMenuTarget: string | null = null;
let octokit: Octokit | null = null;
let previousSubmissions: LabSubmission[] = [];
let folderExpansionState: Map<string, boolean> = new Map(); // Added to store folder states

// Define a type for lab submissions
interface LabSubmission {
    id: string;
    labName: string;
    authorName: string;
    timestamp: number;
    files: Array<[string, FileData]>;
}

// Initialize Octokit instance
octokit = initOctokit();
if (!octokit) {
    console.error('Failed to initialize GitHub client. Please check your token configuration.');
}

// Add JSZip type declaration to fix TypeScript errors
declare global {
    interface Window {
        JSZip: any;
    }
}

// DOM Elements
const markdownInput = document.getElementById('markdownInput') as HTMLTextAreaElement;
const markdownPreview = document.getElementById('markdownPreview') as HTMLElement;
const fileList = document.getElementById('fileList') as HTMLElement;
const newFileBtn = document.getElementById('newFileBtn') as HTMLButtonElement;
const newFolderBtn = document.getElementById('newFolderBtn') as HTMLButtonElement;
const deployBtn = document.getElementById('deployBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const togglePreviewBtn = document.getElementById('togglePreviewBtn') as HTMLButtonElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const contextMenu = document.getElementById('editorContextMenu') as HTMLElement;
const fileContextMenu = document.getElementById('fileContextMenu') as HTMLElement;
const folderContextMenu = document.getElementById('folderContextMenu') as HTMLElement;
const settingsDialog = document.getElementById('settingsDialog') as HTMLElement;
const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
const autoDetectToggle = document.getElementById('autoDetectToggle') as HTMLInputElement;
const splitter = document.getElementById('splitter') as HTMLElement;
const editorSplitter = document.getElementById('editorSplitter') as HTMLElement;
const historyBtn = document.getElementById('historyBtn') as HTMLButtonElement;

// Settings Management
let settings: UserSettings = loadSettings();

function loadSettings(): UserSettings {
    const saved = localStorage.getItem('userSettings');
    return saved ? JSON.parse(saved) : {
        theme: 'light',
        autoDetect: true
    };
}

function saveSettings() {
    localStorage.setItem('userSettings', JSON.stringify(settings));
    applySettings();
}

function applySettings() {
    document.body.dataset.theme = settings.theme;
    autoDetectToggle.checked = settings.autoDetect;
    themeSelect.value = settings.theme;
}

// File Management
function loadFromStorage() {
    const savedFiles = localStorage.getItem('files');
    if (savedFiles) {
        files = new Map(JSON.parse(savedFiles));
    }
    const savedCurrentFile = localStorage.getItem('currentFile');
    if (savedCurrentFile) {
        currentFile = savedCurrentFile;
    }
}

function saveToStorage() {
    localStorage.setItem('files', JSON.stringify(Array.from(files.entries())));
    if (currentFile) {
        localStorage.setItem('currentFile', currentFile);
    }
}

function initializeFiles() {
    loadFromStorage();
    if (files.size === 0) {
        // Add default files
        const defaultFiles = [
            {
                name: 'intro.md',
                content: '# Introduction\n\nBienvenue dans ce lab!\n\nExemples de balises KillerCoda:\n\n`ls -la`{{exec}}\n\n`echo "Texte copiable"`{{copy}}',
                isDirectory: false,
                path: 'intro.md'
            },
            {
                name: 'step1',
                content: '',
                isDirectory: true,
                path: 'step1'
            },
            {
                name: 'text.md',
                content: '# Étape 1\n\nCréez un nouveau fichier vide appelé my-new-file dans votre répertoire personnel\n\nSolution:\n\nAssurez-vous d\'abord d\'être dans votre répertoire personnel avec\n\n`cd ~`{{exec}}\n\nVous pouvez lister le répertoire actuel avec\n\n`pwd`{{exec}}\n\nMaintenant créez le fichier\n\n`touch my-new-file`{{exec}}',
                isDirectory: false,
                path: 'step1/text.md'
            },
            {
                name: 'verify.sh',
                content: '#!/bin/bash\n\nstat /root/my-new-file',
                isDirectory: false,
                path: 'step1/verify.sh'
            },
            {
                name: 'index.json',
                content: '{\n  "title": "Introduction aux Fichiers Linux",\n  "description": "Apprenons quelques commandes de base pour travailler avec les fichiers sur un système Linux",\n  "details": {\n    "intro": {\n      "text": "intro.md",\n      "background": "setup.sh"\n    },\n    "steps": [\n      {\n        "title": "Créer un fichier vide",\n        "text": "step1/text.md",\n        "verify": "step1/verify.sh"\n      }\n    ],\n    "finish": {\n      "text": "finish.md"\n    }\n  },\n  "backend": {\n    "imageid": "ubuntu"\n  }\n}',
                isDirectory: false,
                path: 'index.json'
            }
        ];

        defaultFiles.forEach(file => {
            files.set(file.path, file);
        });
        saveToStorage();
    }
    updateFileList();
    if (currentFile) {
        loadFile(currentFile);
    } else {
        loadFile('intro.md');
    }
    
    // Initialize layout
    setupSplitters();
}

// TreeNode type definition
type TreeNode = {
    name: string;
    path: string;
    isDirectory: boolean;
    children: Map<string, TreeNode>;
    parent: TreeNode | null;
    isExpanded: boolean;
};

function updateFileList() {
    if (!fileList) return;
    fileList.innerHTML = '';
    
    // Root node of the tree
    const root: TreeNode = {
        name: '',
        path: '',
        isDirectory: true,
        children: new Map(),
        parent: null,
        isExpanded: true
    };
    
    // First pass: Create folder structure
    Array.from(files.entries()).forEach(([path, file]) => {
        const parts = path.split('/');
        let current = root;
        let currentPath = '';
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            if (!current.children.has(part)) {
                // Check stored state or default to false
                const isExpanded = folderExpansionState.get(currentPath) ?? false;
                current.children.set(part, {
                    name: part,
                    path: currentPath,
                    isDirectory: i < parts.length - 1 || file.isDirectory,
                    children: new Map(),
                    parent: current,
                    isExpanded: isExpanded // Use stored state
                });
            }
            current = current.children.get(part)!;
            // Ensure the isDirectory flag is correct even if the node already existed
            if (current && (i < parts.length - 1 || file.isDirectory)) {
                current.isDirectory = true;
            }
        }
    });

    // Render the tree
    function renderTree(node: TreeNode, container: HTMLElement, level: number = 0) {
        const sortedChildren = Array.from(node.children.values())
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
        
        for (const child of sortedChildren) {
            const itemDiv = document.createElement('div');
            itemDiv.className = `file-item${child.path === currentFile ? ' active' : ''}`;
            itemDiv.style.paddingLeft = `${level * 20}px`;
            itemDiv.draggable = true;
            itemDiv.setAttribute('data-path', child.path);
            itemDiv.setAttribute('data-is-directory', child.isDirectory.toString());
            
            const hasChildren = child.isDirectory && child.children.size > 0;
            
            itemDiv.innerHTML = `
                <div class="file-content">
                    ${hasChildren ? 
                        `<span class="folder-toggle">${child.isExpanded ? '▼' : '▶'}</span>` : 
                        '<span class="folder-toggle-placeholder"></span>'}
                    <span class="file-icon">${child.isDirectory ? '📁' : '📄'}</span>
                    <span class="file-name">${child.name}</span>
                </div>
            `;
            
            // Add toggle functionality for folders
            if (hasChildren) {
                const toggle = itemDiv.querySelector('.folder-toggle');
                if (toggle) {
                    toggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        child.isExpanded = !child.isExpanded;
                        folderExpansionState.set(child.path, child.isExpanded); // Save state
                        const childContainer = itemDiv.nextElementSibling as HTMLElement;
                        if (childContainer && childContainer.classList.contains('nested')) {
                            childContainer.style.display = child.isExpanded ? 'block' : 'none';
                            toggle.textContent = child.isExpanded ? '▼' : '▶';
                        }
                    });
                }
            }
            
            // Add context menu event
            itemDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                contextMenuTarget = child.path;
                
                hideAllContextMenus();
                
                if (child.isDirectory) {
                    folderContextMenu.style.left = `${e.pageX}px`;
                    folderContextMenu.style.top = `${e.pageY}px`;
                    folderContextMenu.style.display = 'block';
                } else {
                    fileContextMenu.style.left = `${e.pageX}px`;
                    fileContextMenu.style.top = `${e.pageY}px`;
                    fileContextMenu.style.display = 'block';
                }
            });
            
            // Add click handler for files
            if (!child.isDirectory) {
                itemDiv.addEventListener('click', () => {
                    loadFile(child.path);
                });
            }
            
            // Add drag and drop events
            itemDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer!.setData('text/plain', child.path);
                e.dataTransfer!.effectAllowed = 'move';
            });
            
            itemDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (child.isDirectory) {
                    e.dataTransfer!.dropEffect = 'move';
                    itemDiv.classList.add('drag-over');
                }
            });
            
            itemDiv.addEventListener('dragleave', () => {
                itemDiv.classList.remove('drag-over');
            });
            
            itemDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                itemDiv.classList.remove('drag-over');
                
                if (child.isDirectory) {
                    const sourcePath = e.dataTransfer!.getData('text/plain');
                    if (sourcePath !== child.path) {
                        moveFileOrFolder(sourcePath, child.path);
                    }
                }
            });
            
            container.appendChild(itemDiv);
            
            // Create and append container for children if it's a directory
            if (child.isDirectory && child.children.size > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'nested';
                childrenContainer.style.display = child.isExpanded ? 'block' : 'none';
                container.appendChild(childrenContainer);
                renderTree(child, childrenContainer, level + 1);
            }
        }
    }
    
    renderTree(root, fileList);
}

function moveFileOrFolder(sourcePath: string, targetPath: string) {
    const sourceFile = files.get(sourcePath);
    if (!sourceFile) return;
    
    const targetFile = files.get(targetPath);
    if (!targetFile) return;
    
    // Can only move into directories
    if (!targetFile.isDirectory) return;
    
    // Create new path for the source file
    const newPath = `${targetPath}/${sourceFile.name}`;
    
    // Check if destination already exists
    if (files.has(newPath)) {
        alert(`Un élément nommé "${sourceFile.name}" existe déjà à cet emplacement.`);
        return;
    }
    
    // Handle moving a directory - need to update all child paths
    if (sourceFile.isDirectory) {
        const childPaths = Array.from(files.keys())
            .filter(path => path.startsWith(`${sourcePath}/`));
            
        // Update all children paths
        for (const childPath of childPaths) {
            const child = files.get(childPath)!;
            const newChildPath = childPath.replace(sourcePath, newPath);
            
            files.set(newChildPath, {
                ...child,
                path: newChildPath
            });
            
            files.delete(childPath);
            
            // Update current file reference if needed
            if (currentFile === childPath) {
                currentFile = newChildPath;
            }
        }
    }
    
    // Move the source file/directory
    files.set(newPath, {
        ...sourceFile,
        path: newPath
    });
    
    files.delete(sourcePath);
    
    // Update current file reference if needed
    if (currentFile === sourcePath) {
        currentFile = newPath;
    }
    
    saveToStorage();
    updateFileList();
}

function loadFile(path: string) {
    const file = files.get(path);
    if (!file || file.isDirectory) return;

    currentFile = path;
    if (markdownInput) {
        markdownInput.value = file.content;
    }
    updatePreview();
    updateFileList();
    saveToStorage();
}

function createNewFile(parentPath: string = '') {
    const allowedExtensions = ['.md', '.json', '.sh', '.txt'];
    const fileName = prompt('Entrez le nom du fichier (avec extension .md, .json, .sh, ou .txt):');
    if (!fileName) return;
    
    const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
    if (ext && !allowedExtensions.includes(ext)) {
        alert('Extension de fichier non autorisée. Utilisez .md, .json, .sh, ou .txt');
        return;
    }

    const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;

    if (files.has(fullPath)) {
        alert('Ce fichier existe déjà');
        return;
    }

    files.set(fullPath, {
        name: fileName,
        content: '',
        isDirectory: false,
        path: fullPath
    });

    saveToStorage();
    updateFileList();
    loadFile(fullPath);
}

function createNewFolder(parentPath: string = '') {
    const folderName = prompt('Entrez le nom du dossier:');
    if (!folderName) return;

    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    
    if (files.has(fullPath)) {
        alert('Ce dossier existe déjà');
        return;
    }

    files.set(fullPath, {
        name: folderName,
        content: '',
        isDirectory: true,
        path: fullPath
    });

    saveToStorage();
    updateFileList();
}

function renameFile(path: string) {
    const file = files.get(path);
    if (!file) return;

    const newName = prompt('Nouveau nom:', file.name);
    if (!newName || newName === file.name) return;

    const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (files.has(newPath)) {
        alert('Un fichier avec ce nom existe déjà');
        return;
    }

    // If it's a directory, we need to update all child paths
    if (file.isDirectory) {
        const childPaths = Array.from(files.keys())
            .filter(p => p.startsWith(`${path}/`));
            
        // Update all children paths
        for (const childPath of childPaths) {
            const child = files.get(childPath)!;
            const newChildPath = childPath.replace(path, newPath);
            
            files.set(newChildPath, {
                ...child,
                path: newChildPath
            });
            
            files.delete(childPath);
            
            // Update current file reference if needed
            if (currentFile === childPath) {
                currentFile = newChildPath;
            }
        }
    }

    files.delete(path);
    files.set(newPath, {
        ...file,
        name: newName,
        path: newPath
    });

    if (currentFile === path) {
        currentFile = newPath;
    }

    saveToStorage();
    updateFileList();
}

function deleteFile(path: string) {
    const file = files.get(path);
    if (!file) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${file.isDirectory ? 'ce dossier' : 'ce fichier'} ?`)) return;

    // If it's a directory, delete all children
    if (file.isDirectory) {
        const childPaths = Array.from(files.keys())
            .filter(p => p.startsWith(`${path}/`));
            
        for (const childPath of childPaths) {
            files.delete(childPath);
            
            if (currentFile === childPath) {
                currentFile = null;
            }
        }
    }

    files.delete(path);
    if (currentFile === path) {
        currentFile = null;
        if (markdownInput) markdownInput.value = '';
        if (markdownPreview) markdownPreview.innerHTML = '';
    }

    saveToStorage();
    updateFileList();
}

// Markdown Processing Functions
function detectMarkdown(text: string): string {
    if (!settings.autoDetect) return text;

    // Check if current file has .md extension - always format as markdown
    if (currentFile && currentFile.toLowerCase().endsWith('.md')) {
        // Continue with formatting even if autoDetect is true
    } else {
        // For non-markdown files or when no file is open, don't modify content
        // unless there's clear markdown formatting to detect
        if (!text.includes('#') && !text.includes('```') && !text.includes('*') && 
            !text.match(/^\s*[-*+]\s/) && !text.includes('[') && !text.includes('|')) {
            return text; // Skip autodetection if content doesn't look like markdown
        }
    }

    // Don't try to detect markdown in code blocks
    const codeBlocks: string[] = [];
    let index = 0;
    
    // Extract code blocks so we don't modify them
    text = text.replace(/```[\s\S]*?```/g, match => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${index++}__`;
    });
    
    // Extract inline code
    text = text.replace(/`[^`]+`/g, match => {
        codeBlocks.push(match);
        return `__INLINE_CODE_${index++}__`;
    });

    // Detect headings (lines that look like headings)
    text = text.replace(/^([A-Z][^\n]{0,50})$/gm, '# $1');

    // Detect KillerCoda command blocks
    text = text.replace(/^([$>][^\n]+)$/gm, '`$1`{{exec}}');
    
    // Detect copyable content (indented blocks)
    text = text.replace(/^( {4}|\t)(.+)$/gm, '`$2`{{copy}}');

    // Restore code blocks
    text = text.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) => codeBlocks[Number(i)]);
    text = text.replace(/__INLINE_CODE_(\d+)__/g, (_, i) => codeBlocks[Number(i)]);

    return text;
}

function processMarkdown(markdown: string): string {
    // Process KillerCoda tags
    markdown = markdown.replace(/`([^`]+)`\s*{{exec}}/g, (_, code) => 
        `<div class="exec-block"><pre><code>${code}</code></pre></div>`);
        
    markdown = markdown.replace(/`([^`]+)`\s*{{copy}}/g, (_, code) => 
        `<div class="copy-block"><pre><code>${code}</code></pre></div>`);
        
    markdown = markdown.replace(/```([\s\S]*?)```\s*{{exec}}/g, (_, code) => 
        `<div class="exec-block"><pre><code>${code}</code></pre></div>`);
        
    markdown = markdown.replace(/```([\s\S]*?)```\s*{{copy}}/g, (_, code) => 
        `<div class="copy-block"><pre><code>${code}</code></pre></div>`);
    
    return markdown;
}

async function updatePreview() {
    if (!markdownPreview || !markdownInput) return;

    let content = markdownInput.value;
    
    if (showRawMarkdown) {
        markdownPreview.textContent = content;
    } else {
        content = settings.autoDetect ? detectMarkdown(content) : content;
        let htmlContent = await marked(content);
        
        // Process KillerCoda specific tags
        htmlContent = processMarkdown(htmlContent);
        
        markdownPreview.innerHTML = htmlContent;
    }

    // Save current file content
    if (currentFile) {
        const file = files.get(currentFile);
        if (file) {
            file.content = markdownInput.value;
            files.set(currentFile, file);
            saveToStorage();
        }
    }
}

// Context Menu Functions
function showEditorContextMenu(e: MouseEvent) {
    e.preventDefault();
    hideAllContextMenus();
    
    if (contextMenu) {
        contextMenu.style.display = 'block';
        
        // First position the menu to measure its size
        contextMenu.style.left = '0';
        contextMenu.style.top = '0';
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        
        // Calculate ideal position
        let left = e.pageX;
        let top = e.pageY;
        
        // Adjust for right edge
        if (left + menuWidth > window.innerWidth - 10) {
            left = e.pageX - menuWidth;
        }
        
        // Adjust for bottom edge
        if (top + menuHeight > window.innerHeight - 10) {
            // If menu is too tall for space above and below, center it vertically
            if (menuHeight > window.innerHeight - 20) {
                top = 10;
            } else {
                top = Math.min(window.innerHeight - menuHeight - 10, e.pageY);
            }
        }
        
        // Ensure menu doesn't go off the top
        top = Math.max(10, top);
        
        // Apply final position
        contextMenu.style.left = `${left}px`;
        contextMenu.style.top = `${top}px`;
    }
}

function hideAllContextMenus() {
    if (contextMenu) contextMenu.style.display = 'none';
    if (fileContextMenu) fileContextMenu.style.display = 'none';
    if (folderContextMenu) folderContextMenu.style.display = 'none';
}

function handleContextMenuAction(action: string) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selection = markdownInput.value.substring(start, end);
    let replacement = '';

    switch (action) {
        case 'h1': replacement = `# ${selection}`; break;
        case 'h2': replacement = `## ${selection}`; break;
        case 'h3': replacement = `### ${selection}`; break;
        case 'bold': replacement = `**${selection}**`; break;
        case 'italic': replacement = `*${selection}*`; break;
        case 'strike': replacement = `~~${selection}~~`; break;
        case 'code': replacement = `\`${selection}\``; break;
        case 'codeblock': replacement = `\`\`\`\n${selection}\n\`\`\``; break;
        case 'exec': replacement = `\`${selection}\`{{exec}}`; break;
        case 'copy': replacement = `\`${selection}\`{{copy}}`; break;
        case 'list': replacement = selection.split('\n').map(line => `* ${line}`).join('\n'); break;
        case 'ordered': replacement = selection.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n'); break;
        case 'task': replacement = selection.split('\n').map(line => `- [ ] ${line}`).join('\n'); break;
        case 'quote': replacement = selection.split('\n').map(line => `> ${line}`).join('\n'); break;
        case 'table': replacement = `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`; break;
        case 'link': replacement = selection ? `[${selection}](url)` : `[texte](url)`; break;
        case 'image': replacement = `![${selection || 'alt text'}](image-url)`; break;
    }

    markdownInput.value = markdownInput.value.substring(0, start) + replacement + markdownInput.value.substring(end);
    markdownInput.focus();
    updatePreview();
}

function handleFileAction(action: string) {
    if (!contextMenuTarget) return;
    
    switch(action) {
        case 'openFile':
            loadFile(contextMenuTarget);
            break;
        case 'newFile':
            createNewFile(contextMenuTarget);
            break;
        case 'newFileInFolder':
            createNewFile(contextMenuTarget);
            break;
        case 'newFolderInFolder':
            createNewFolder(contextMenuTarget);
            break;
        case 'renameFile':
        case 'renameFolder':
            renameFile(contextMenuTarget);
            break;
        case 'deleteFile':
        case 'deleteFolder':
            deleteFile(contextMenuTarget);
            break;
        case 'downloadFile':
            downloadFile(contextMenuTarget);
            break;
    }
    
    contextMenuTarget = null;
}

// Layout Management
function setupSplitters() {
    // File explorer splitter
    if (splitter) {
        let isResizing = false;
        splitter.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.addEventListener('mousemove', handleSplitterMove);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });
        
        function handleSplitterMove(e: MouseEvent) {
            if (!isResizing) return;
            
            const fileExplorer = document.querySelector('.file-explorer') as HTMLElement;
            const editorPane = document.querySelector('.editor-pane') as HTMLElement;
            const previewPane = document.querySelector('.preview-pane') as HTMLElement;
            
            // Limit min width to 150px and max to 50% of viewport
            const minWidth = 150;
            const maxWidth = window.innerWidth * 0.5;
            const newWidth = Math.min(Math.max(e.clientX, minWidth), maxWidth);
            
            fileExplorer.style.width = `${newWidth}px`;
            splitter.style.left = `${newWidth}px`;
            
            // Update other elements positioning
            const totalWidth = window.innerWidth - newWidth - 5; // 5 is splitter width
            const halfWidth = totalWidth / 2;
            editorPane.style.width = `${halfWidth}px`;
            editorSplitter.style.left = `${newWidth + halfWidth}px`;
            previewPane.style.width = `${halfWidth}px`;
        }
        
        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', handleSplitterMove);
        }
    }
    
    // Editor/Preview splitter
    if (editorSplitter) {
        // Position initial splitter
        const fileExplorer = document.querySelector('.file-explorer') as HTMLElement;
        const editorPane = document.querySelector('.editor-pane') as HTMLElement;
        const previewPane = document.querySelector('.preview-pane') as HTMLElement;
        
        const fileExplorerWidth = parseInt(window.getComputedStyle(fileExplorer).width);
        const totalWidth = window.innerWidth - fileExplorerWidth - 10; // 5+5 for both splitters
        const halfWidth = totalWidth / 2;
        
        editorPane.style.width = `${halfWidth}px`;
        editorSplitter.style.left = `${fileExplorerWidth + halfWidth}px`;
        previewPane.style.width = `${halfWidth}px`;
        
        // Set up resizing
        let isResizing = false;
        editorSplitter.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.addEventListener('mousemove', handleEditorSplitterMove);
            document.addEventListener('mouseup', stopEditorResize);
            e.preventDefault();
        });
        
        function handleEditorSplitterMove(e: MouseEvent) {
            if (!isResizing) return;
            
            const fileExplorerWidth = parseInt(window.getComputedStyle(fileExplorer).width);
            const totalWidth = window.innerWidth - fileExplorerWidth - 10;
            
            // Calculate width ensuring minimum size
            const minWidth = 200;
            const maxEditorWidth = totalWidth - minWidth;
            const editorWidth = Math.min(Math.max(e.clientX - fileExplorerWidth - 5, minWidth), maxEditorWidth);
            const previewWidth = totalWidth - editorWidth;
            
            // Apply the changes to the UI
            editorPane.style.width = `${editorWidth}px`;
            editorPane.style.flex = '0 0 auto';
            
            previewPane.style.width = `${previewWidth}px`;
            previewPane.style.flex = '0 0 auto';
            
            editorSplitter.style.left = `${fileExplorerWidth + editorWidth}px`;
        }
        
        function stopEditorResize() {
            isResizing = false;
            document.removeEventListener('mousemove', handleEditorSplitterMove);
        }
    }
}

// Window resize handling
window.addEventListener('resize', () => {
    setupSplitters();
});

// Download Function
function downloadFilesAsZip() {
    // Create a promise-based solution using script loading
    const loadJSZip = () => {
        return new Promise<void>((resolve, reject) => {
            // Check if JSZip is already loaded
            if (window.JSZip) {
                resolve();
                return;
            }
            
            // Create script element to load JSZip
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load JSZip'));
            document.head.appendChild(script);
        });
    };
    
    loadJSZip()
        .then(async () => {
            // Create new zip instance
            const zip = new window.JSZip();
            
            // Add all files to zip
            Array.from(files.entries()).forEach(([path, file]) => {
                if (!file.isDirectory) {
                    zip.file(path, file.content);
                } else {
                    // Create empty folder
                    zip.folder(path);
                }
            });
            
            try {
                // Generate zip
                const blob = await zip.generateAsync({ type: 'blob' });
                
                // Create download link
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'lab_files.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch (err) {
                console.error('Error creating zip file:', err);
                alert('Une erreur est survenue lors de la création du fichier ZIP.');
            }
        })
        .catch(err => {
            console.error('Error loading JSZip:', err);
            alert('Impossible de charger JSZip pour la création du fichier ZIP.');
        });
}

// Function to download a single file
async function downloadFile(path: string) {
    const file = files.get(path);
    if (!file) return;
    
    if (file.isDirectory) {
        // If it's a directory, create a zip with its contents
        const zip = new window.JSZip();
        
        // Add all files in this directory
        Array.from(files.entries())
            .filter(([filePath]) => filePath.startsWith(path + '/'))
            .forEach(([filePath, fileData]) => {
                if (!fileData.isDirectory) {
                    const relativePath = filePath.substring(path.length + 1);
                    zip.file(relativePath, fileData.content);
                }
            });
            
        try {
            const blob = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = file.name + '.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error creating zip file:', err);
            alert('Une erreur est survenue lors de la création du fichier ZIP.');
        }
    } else {
        // For single file, download directly
        const blob = new Blob([file.content], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Deployment
async function deployToPreprod() {
    // Ensure Octokit is initialized with valid token
    if (!octokit) {
        const token = import.meta.env.VITE_GITHUB_TOKEN;
        if (!token) {
            alert('GitHub token not found. Please check your .env file');
            return;
        }
        octokit = initOctokit();
        if (!octokit) {
            alert('Failed to initialize GitHub client. Please check your token configuration.');
            return;
        }
    }

    // Create and show a dialog for lab name and author
    const deployInfo = await promptLabInfo();
    if (!deployInfo) return; // User cancelled
    
    const { labName, authorName } = deployInfo;

    // Show file selection dialog
    const selectedFilePaths = await showDeploymentFileSelection(labName, authorName);
    if (!selectedFilePaths) return; // User cancelled

    try {
        deployBtn.disabled = true;
        deployBtn.textContent = 'Envoi en cours...';
        
        // Add author signature to files if author is provided
        if (authorName) {
            await addAuthorSignatureToFiles(authorName, selectedFilePaths);
        }
        
        // Get current pre-prod branch SHA
        const { data: ref } = await octokit!.rest.git.getRef({
            owner: 'easyformer',
            repo: 'lab_easyformer',
            ref: 'heads/pre-prod'
        });

        // Create new tree with documentation files
        const fileEntries = Array.from(files.entries())
            .filter(([path, file]) => !file.isDirectory && selectedFilePaths.includes(path));
            
        const treeItems = (await Promise.all(fileEntries.map(async ([path, file]) => {
            const { data: blob } = await octokit!.rest.git.createBlob({
                owner: 'easyformer',
                repo: 'lab_easyformer',
                content: file.content,
                encoding: 'utf-8'
            });

            // Replace spaces with underscores in lab and author names to avoid Killercoda errors
            const sanitizedLabName = labName.replace(/\s+/g, '_');
            const sanitizedAuthorName = authorName ? authorName.replace(/\s+/g, '_') : '';
            
            // Include author in path if provided but format it for Killercoda compatibility
            const filePath = authorName 
                ? `${sanitizedLabName}-${sanitizedAuthorName}/${path}`
                : `${sanitizedLabName}/${path}`;

            return {
                path: filePath,
                mode: '100644' as const,
                type: 'blob' as const,
                sha: blob.sha
            };
        }))).filter((item): item is NonNullable<typeof item> => item !== undefined);

        // Check if there are any files to commit
        if (treeItems.length === 0) {
            alert('Aucun fichier sélectionné ou modifié à déployer.');
            deployBtn.disabled = false;
            deployBtn.textContent = 'Envoyer';
            return; // Stop deployment if no files
        }

        const { data: tree } = await octokit!.rest.git.createTree({
            owner: 'easyformer',
            repo: 'lab_easyformer',
            base_tree: ref.object.sha,
            tree: treeItems
        });

        // Create commit
        const { data: commit } = await octokit!.rest.git.createCommit({
            owner: 'easyformer',
            repo: 'lab_easyformer',
            message: `Update lab: ${labName}`,
            tree: tree.sha,
            parents: [ref.object.sha]
        });

        // Update pre-prod branch reference
        await octokit!.rest.git.updateRef({
            owner: 'easyformer',
            repo: 'lab_easyformer',
            ref: 'heads/pre-prod',
            sha: commit.sha,
            force: true
        });

        alert('Documentation déployée avec succès en pré-production !');
        
        // Save this submission to the revision history
        saveAsSubmission(labName, authorName);
    } catch (error) {
        console.error('Échec du déploiement:', error);
        alert('Échec du déploiement. Vérifiez la console pour plus de détails.');
    } finally {
        deployBtn.disabled = false;
        deployBtn.textContent = 'Envoyer';
    }
}

/**
 * Prompts the user for lab name and author information using a dialog
 * @returns Promise with lab name and author name, or null if canceled
 */
function promptLabInfo(): Promise<{labName: string, authorName: string} | null> {
    return new Promise(resolve => {
        const dialog = document.createElement('div');
        dialog.className = 'lab-name-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h2>Déployer le Lab</h2>
                <p>Entrez les informations pour le déploiement</p>
                
                <label for="labNameInput">Nom du Lab (sans espaces, utilisez des tirets)</label>
                <input type="text" id="labNameInput" placeholder="mon-super-lab" value="mon-lab">
                
                <label for="authorNameInput">Nom de l'auteur (optionnel)</label>
                <input type="text" id="authorNameInput" placeholder="Votre nom">
                
                <div class="dialog-buttons">
                    <button id="cancelLabBtn">Annuler</button>
                    <button id="submitLabBtn">Déployer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        const labNameInput = dialog.querySelector('#labNameInput') as HTMLInputElement;
        const authorNameInput = dialog.querySelector('#authorNameInput') as HTMLInputElement;
        const submitBtn = dialog.querySelector('#submitLabBtn') as HTMLButtonElement;
        const cancelBtn = dialog.querySelector('#cancelLabBtn') as HTMLButtonElement;
        
        // Focus on the lab name input
        labNameInput.focus();
        
        submitBtn.addEventListener('click', () => {
            const labName = labNameInput.value.trim();
            const authorName = authorNameInput.value.trim();
            
            if (!labName) {
                alert('Veuillez entrer un nom de lab');
                return;
            }
            
            document.body.removeChild(dialog);
            resolve({labName, authorName});
        });
        
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(null);
        });
        
        // Handle Enter key
        dialog.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
    });
}

/**
 * Adds author signature to the bottom of each file
 * @param authorName The name of the author to add to files
 */
// Add author signature to markdown files
async function addAuthorSignatureToFiles(authorName: string, selectedPaths?: string[]): Promise<void> {
    const filesToProcess = selectedPaths ? 
        Array.from(files.entries()).filter(([path]) => selectedPaths.includes(path)) :
        Array.from(files.entries());
    
    // Loop through selected files and add signature
    for (const [path, file] of filesToProcess) {
        // Skip directories and non-markdown files
        if (file.isDirectory || !path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.txt')) {
            continue;
        }
        
        // First remove any existing signature
        file.content = file.content.replace(/\n\n<div style="text-align: right; font-style: italic; margin-top: 30px;">\n.*?\n<\/div>\s*$/, '');
        
        // Add signature at the bottom of the file
        const signature = `\n\n<div style="text-align: right; font-style: italic; margin-top: 30px;">
by ${authorName}
</div>`;
        
        // Update file content
        file.content = file.content + signature;
        
        // Save back to file collection
        files.set(path, file);
    }
    
    // Update current file in editor if it's a markdown file
    if (currentFile && currentFile.toLowerCase().endsWith('.md') && markdownInput) {
        markdownInput.value = files.get(currentFile)?.content || '';
        await updatePreview();
    }
}

// Load previous submissions from localStorage
function loadPreviousSubmissions() {
    const saved = localStorage.getItem('previousSubmissions');
    if (saved) {
        try {
            previousSubmissions = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load previous submissions:', e);
            previousSubmissions = [];
        }
    }
}

// Save previous submissions to localStorage
function savePreviousSubmissions() {
    localStorage.setItem('previousSubmissions', JSON.stringify(previousSubmissions));
}

// Save current project as a submission
function saveAsSubmission(labName: string, authorName: string) {
    const id = Date.now().toString();
    const submission: LabSubmission = {
        id,
        labName,
        authorName,
        timestamp: Date.now(),
        files: Array.from(files.entries())
    };
    
    // Add to the beginning of the array (most recent first)
    previousSubmissions.unshift(submission);
    
    // Limit to last 20 submissions to prevent localStorage from growing too large
    if (previousSubmissions.length > 20) {
        previousSubmissions = previousSubmissions.slice(0, 20);
    }
    
    savePreviousSubmissions();
    return submission;
}

// Load a previous submission
function loadSubmission(submissionId: string): boolean {
    const submission = previousSubmissions.find(s => s.id === submissionId);
    if (!submission) return false;
    
    // Load the files from the submission
    files = new Map(submission.files);
    saveToStorage();
    
    // Reload the file list and current file
    updateFileList();
    if (currentFile) {
        loadFile(currentFile);
    } else if (files.has('intro.md')) {
        loadFile('intro.md');
    }
    
    return true;
}

// Function to show the revision history dialog
function showRevisionHistory() {
    // Create the dialog
    const dialog = document.createElement('div');
    dialog.className = 'revision-history-dialog';
    
    // Generate content based on previous submissions
    let content = `
        <div class="dialog-content">
            <h2>Historique des révisions</h2>
            <div class="revision-list">
    `;
    
    if (previousSubmissions.length === 0) {
        content += `<div class="no-revisions">Aucune révision trouvée</div>`;
    } else {
        // Add each revision to the list
        for (const submission of previousSubmissions) {
            const date = new Date(submission.timestamp);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            content += `
                <div class="revision-item" data-id="${submission.id}">
                    <div class="revision-item-checkbox">
                        <input type="checkbox" class="revision-checkbox" data-id="${submission.id}">
                    </div>
                    <div class="revision-item-info">
                        <div class="revision-item-title">${submission.labName}</div>
                        <div class="revision-item-details">
                            Par: ${submission.authorName || 'Anonyme'} | ${formattedDate}
                        </div>
                    </div>
                    <div class="revision-item-actions">
                        <button class="load-btn" data-id="${submission.id}">Restaurer</button>
                        <button class="delete-btn" data-id="${submission.id}">Supprimer</button>
                    </div>
                </div>
            `;
        }
    }
    
    content += `
            </div>
            <div class="dialog-buttons">
                <div class="dialog-selection-buttons">
                    <button id="selectAllBtn">Tout sélectionner</button>
                    <button id="deleteSelectedBtn">Supprimer la sélection</button>
                </div>
                <button id="closeRevisionHistoryBtn">Fermer</button>
            </div>
        </div>
    `;
    
    dialog.innerHTML = content;
    document.body.appendChild(dialog);

    // Function to delete revisions
    function deleteRevisions(ids: string[]) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ces révisions ? Cette action est irréversible.')) {
            return;
        }

        previousSubmissions = previousSubmissions.filter(sub => !ids.includes(sub.id));
        savePreviousSubmissions();
        document.body.removeChild(dialog);
        showRevisionHistory(); // Refresh the dialog
    }
    
    // Add event listener for the close button
    const closeBtn = dialog.querySelector('#closeRevisionHistoryBtn');
    closeBtn?.addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    // Add event listeners for the load buttons
    const loadBtns = dialog.querySelectorAll('.load-btn');
    loadBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = (btn as HTMLElement).dataset.id;
            if (id) {
                if (confirm('Êtes-vous sûr de vouloir restaurer cette révision ? Les modifications non sauvegardées seront perdues.')) {
                    loadSubmission(id);
                    document.body.removeChild(dialog);
                }
            }
        });
    });

    // Add event listeners for individual delete buttons
    const deleteBtns = dialog.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const id = (btn as HTMLElement).dataset.id;
            if (id) {
                deleteRevisions([id]);
            }
        });
    });

    // Add event listener for select all button
    const selectAllBtn = dialog.querySelector('#selectAllBtn');
    selectAllBtn?.addEventListener('click', () => {
        const checkboxes = dialog.querySelectorAll('.revision-checkbox') as NodeListOf<HTMLInputElement>;
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
    });

    // Add event listener for delete selected button
    const deleteSelectedBtn = dialog.querySelector('#deleteSelectedBtn');
    deleteSelectedBtn?.addEventListener('click', () => {
        const checkedBoxes = dialog.querySelectorAll('.revision-checkbox:checked') as NodeListOf<HTMLInputElement>;
        const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id).filter((id): id is string => id !== undefined);
        if (selectedIds.length > 0) {
            deleteRevisions(selectedIds);
        }
    });
}

async function showDeploymentFileSelection(_labName: string, _authorName: string): Promise<string[]> {
    const dialog = document.createElement('div');
    dialog.className = 'deployment-dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h2>Sélection des fichiers</h2>
            <div class="file-selection">
                <div class="file-list">
                </div>
            </div>
            <div class="dialog-buttons">
                <button id="deployAllBtn">Déployer tous les fichiers</button>
                <button id="deploySelectedBtn">Déployer la sélection</button>
                <button id="cancelDeployBtn">Annuler</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    const fileList = dialog.querySelector('.file-list');
    if (fileList) {
        Array.from(files.entries())
            .filter(([path, file]) => !file.isDirectory)
            .forEach(([path, file]) => {
                const item = document.createElement('div');
                item.className = 'file-selection-item';
                item.innerHTML = `
                    <label>
                        <input type="checkbox" data-path="${path}">
                        <span>${path}</span>
                    </label>
                `;
                fileList.appendChild(item);
            });
    }

    return new Promise((resolve) => {
        const deployAll = dialog.querySelector('#deployAllBtn');
        const deploySelected = dialog.querySelector('#deploySelectedBtn');
        const cancel = dialog.querySelector('#cancelDeployBtn');

        deployAll?.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(Array.from(files.keys()));
        });

        deploySelected?.addEventListener('click', () => {
            const selectedPaths = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => (cb as HTMLInputElement).dataset.path!)
                .filter(Boolean);
            document.body.removeChild(dialog);
            resolve(selectedPaths);
        });

        cancel?.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve([]);
        });
    });
}

// Event listeners
markdownInput?.addEventListener('input', () => {
    void updatePreview();
});

markdownInput?.addEventListener('contextmenu', showEditorContextMenu);

document.addEventListener('click', hideAllContextMenus);

contextMenu?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const menuItem = target.closest('.context-menu-item') as HTMLElement;
    if (menuItem && menuItem.dataset.action) {
        handleContextMenuAction(menuItem.dataset.action);
        hideAllContextMenus();
    }
    e.stopPropagation();
});

fileContextMenu?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const menuItem = target.closest('.context-menu-item') as HTMLElement;
    if (menuItem && menuItem.dataset.action) {
        handleFileAction(menuItem.dataset.action);
        hideAllContextMenus();
    }
    e.stopPropagation();
});

folderContextMenu?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const menuItem = target.closest('.context-menu-item') as HTMLElement;
    if (menuItem && menuItem.dataset.action) {
        handleFileAction(menuItem.dataset.action);
        hideAllContextMenus();
    }
    e.stopPropagation();
});

newFileBtn?.addEventListener('click', () => createNewFile());
newFolderBtn?.addEventListener('click', () => createNewFolder());
deployBtn?.addEventListener('click', deployToPreprod);
downloadBtn?.addEventListener('click', downloadFilesAsZip);
historyBtn?.addEventListener('click', showRevisionHistory);

togglePreviewBtn?.addEventListener('click', () => {
    showRawMarkdown = !showRawMarkdown;
    updatePreview();
});

settingsBtn?.addEventListener('click', () => {
    if (settingsDialog) {
        settingsDialog.style.display = 'block';
    }
});

document.getElementById('closeSettings')?.addEventListener('click', () => {
    if (settingsDialog) {
        settingsDialog.style.display = 'none';
    }
});

themeSelect?.addEventListener('change', () => {
    settings.theme = themeSelect.value as 'light' | 'dark';
    saveSettings();
});

autoDetectToggle?.addEventListener('change', () => {
    settings.autoDetect = autoDetectToggle.checked;
    saveSettings();
    updatePreview();
});

historyBtn?.addEventListener('click', showRevisionHistory);

// Initialize
initializeFiles();
applySettings();
loadPreviousSubmissions(); // Load revision history on startup

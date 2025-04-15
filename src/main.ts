import { marked } from 'marked';
import { Octokit } from 'octokit';
import 'highlight.js/styles/github.css';
import './style.css';

// Types
interface FileData {
    name: string;
    content: string;
    isDirectory: boolean;
}

// State Management
let files: Map<string, FileData> = new Map();
let currentFile: string | null = null;

// DOM Elements
const markdownInput = document.getElementById('markdownInput') as HTMLTextAreaElement;
const markdownPreview = document.getElementById('markdownPreview') as HTMLElement;
const fileList = document.getElementById('fileList') as HTMLUListElement;
const newFileBtn = document.getElementById('newFileBtn') as HTMLButtonElement;
const deployBtn = document.getElementById('deployBtn') as HTMLButtonElement;

// Initialize marked with options
marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function(code, lang) {
        return code;
    }
});

// File Management Functions
function initializeFiles() {
    // Add README.md as default
    files.set('README.md', {
        name: 'README.md',
        content: '# Welcome\n\nThis is your documentation workspace.\n\nExample KillerCoda tags:\n\n```bash\necho "Hello World!"\n```{{exec}}\n\n```text\nThis is copyable text\n```{{copy}}',
        isDirectory: false
    });
    updateFileList();
    loadFile('README.md');
}

function updateFileList() {
    if (!fileList) return;
    
    fileList.innerHTML = '';
    Array.from(files.values())
        .sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name);
            }
            return a.isDirectory ? -1 : 1;
        })
        .forEach(file => {
            const li = document.createElement('li');
            li.textContent = `${file.isDirectory ? '📁' : '📄'} ${file.name}`;
            li.classList.add(file.isDirectory ? 'directory' : 'file');
            if (file.name === currentFile) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => loadFile(file.name));
            fileList.appendChild(li);
        });
}

function loadFile(fileName: string) {
    const file = files.get(fileName);
    if (!file || file.isDirectory) return;

    currentFile = fileName;
    if (markdownInput) {
        markdownInput.value = file.content;
    }
    updatePreview();
    updateFileList(); // Update active file highlighting
}

function createNewFile() {
    const fileName = prompt('Enter file name (with .md extension):');
    if (!fileName) return;
    
    if (!fileName.endsWith('.md')) {
        alert('File name must end with .md');
        return;
    }

    if (files.has(fileName)) {
        alert('File already exists');
        return;
    }

    files.set(fileName, {
        name: fileName,
        content: `# ${fileName}\n\nStart writing your documentation here...`,
        isDirectory: false
    });

    updateFileList();
    loadFile(fileName);
}

// Markdown Processing Functions
function processKillerCodaTags(markdown: string): string {
    // Handle {{exec}} blocks
    markdown = markdown.replace(/```(bash|shell)(.*?)```\s*{{exec}}/gs, (match, lang, code) => {
        return `\`\`\`\`${lang}\n${code.trim()}\n\`\`\`\`{{exec}}`;
    });

    // Handle {{copy}} blocks
    markdown = markdown.replace(/```(.*?)```\s*{{copy}}/gs, (match, code) => {
        return `\`\`\`\`text\n${code.trim()}\n\`\`\`\`{{copy}}`;
    });

    return markdown;
}

function updatePreview() {
    if (!markdownPreview || !markdownInput) return;

    const processedContent = processKillerCodaTags(markdownInput.value);
    const htmlContent = marked(processedContent);
    markdownPreview.innerHTML = htmlContent;

    // Save current file content
    if (currentFile) {
        const file = files.get(currentFile);
        if (file) {
            file.content = markdownInput.value;
            files.set(currentFile, file);
        }
    }
}

// Event Listeners
if (markdownInput) {
    markdownInput.addEventListener('input', () => {
        updatePreview();
    });
}

if (newFileBtn) {
    newFileBtn.addEventListener('click', createNewFile);
}

if (deployBtn) {
    deployBtn.addEventListener('click', async () => {
        alert('Deployment feature coming soon...');
        // TODO: Implement GitHub deployment
    });
}

// Initialize the application
initializeFiles();

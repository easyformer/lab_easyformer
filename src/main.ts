import './style.css';

// Get references to DOM elements
const inputText = document.getElementById('inputText') as HTMLTextAreaElement;
const outputMarkdown = document.getElementById('outputMarkdown')?.querySelector('code') as HTMLElement;
const insertTemplateBtn = document.getElementById('insertTemplateBtn') as HTMLButtonElement;

// Regular expression to detect URLs
const urlRegex = /(\\b(https?|ftp|file):\\/\\/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])/ig;
// Regular expression to detect tags like {{tag}} content
const tagRegex = /^{{(h1|h2|copy|exec|exec interrupt|img)}}\\s*(.*)/i;

// Function to escape HTML characters for safe display in <pre><code>
function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Function to process a single line and convert URLs
function processLineContent(content: string): string {
    return content.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    // Note: For the final Markdown output, we'll need a different replacement
    // that generates Markdown links, not HTML links. This function is more
    // for potential future use if we wanted to render HTML directly.
    // The main generation logic will handle Markdown link creation.
}

// Function to generate Markdown links from URLs
function generateMarkdownLinks(content: string): string {
    return content.replace(urlRegex, '[$1]($1)');
}

// Function to process input and generate Markdown
function generateMarkdown() {
    if (!inputText || !outputMarkdown) {
        console.error("Required DOM elements not found!");
        return;
    }

    const lines = inputText.value.split('\\n');
    let markdownOutput = '';
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const tagMatch = line.match(tagRegex);
        let currentTag = null;
        let content = line;

        if (tagMatch) {
            currentTag = tagMatch[1].toLowerCase();
            content = tagMatch[2].trim(); // Content on the same line as the tag
        } else {
            // If it's not a tag, treat the whole line as potential content,
            // but we'll handle URL conversion later based on context (tag or default bullet)
        }

        if (currentTag === 'h1') {
            markdownOutput += `# ${generateMarkdownLinks(content)}\\n\\n`;
            i++;
        } else if (currentTag === 'h2') {
            markdownOutput += `## ${generateMarkdownLinks(content)}\\n\\n`;
            i++;
        } else if (currentTag === 'copy' || currentTag === 'exec' || currentTag === 'exec interrupt') {
            const blockType = currentTag === 'copy' ? 'text' : 'bash';
            const killerCodaTag = currentTag === 'copy' ? '{{copy}}' : '{{exec}}';
            const interruptFlag = currentTag === 'exec interrupt' ? ' interrupt' : '';
            let blockContentLines = content ? [content] : []; // Start with content on the tag line, if any

            // Collect subsequent lines for the multi-line block
            let j = i + 1;
            // Collect lines until we hit an empty line, another tag, or the end
            while (j < lines.length && lines[j].trim() !== '' && !lines[j].match(tagRegex)) {
                 blockContentLines.push(lines[j]); // Keep original indentation/whitespace within the block
                 j++;
            }

             // Only create block if there's content
             if (blockContentLines.length > 0) {
                 markdownOutput += `\`\`\`\`${blockType}${interruptFlag}\\n${blockContentLines.join('\\n')}\\n\`\`\`\`${killerCodaTag}\\n\\n`;
             }
             // If content was only on the tag line and nothing followed, blockContentLines might be just [content]
             // The check above handles this. If content was empty and nothing followed, nothing is output.

            i = j; // Move the main loop index past the processed block lines
        } else if (currentTag === 'img') {
            // Image processing - use content from the tag line
            const parts = content.split('|').map(p => p.trim());
            const altText = parts[0] || 'image';
            const title = parts[1] || '';
            const path = parts[2] || content; // Use full content as path if no pipes
            const filename = path.substring(path.lastIndexOf('/') + 1);
            // IMPORTANT: This assumes images are manually placed or handled by a build process
            // in a directory accessible as '/assets' relative to the final Markdown file location.
            const assetPath = `/assets/${filename}`;
            const titleAttr = title ? ` "${title}"` : '';
            markdownOutput += `![${altText}](${assetPath}${titleAttr})\\n\\n`;
            i++;
        } else if (line.trim()) { // Default case: standard bullet point if not empty and not a tag handled above
            // Apply URL conversion to the whole line here for default bullets
            markdownOutput += `* ${generateMarkdownLinks(line.trim())}\\n`;
            i++;
        } else { // Handle empty lines (preserve them)
            markdownOutput += '\\n';
            i++;
        }
    }

    // Update the output display - display the raw Markdown
    outputMarkdown.textContent = markdownOutput.trim();
}

// --- Templates ---
const templates = {
    standardHeader: `{{h1}} Page Title\\n\\n{{img}} Logo | Company Logo | /assets/logo.png\\n\\n* Introduction line 1.\\n* Introduction line 2.\\n\\n{{h2}} Section 1\\n\\n* Point 1\\n* Point 2`,
    codeExample: `{{h2}} Code Example\\n\\n* Here is a command to run:\\n{{exec}}\\necho "Hello KillerCoda!"\\n\\n* Here is some configuration to copy:\\n{{copy}}\\n[settings]\\nuser = admin\\nmode = test`
};

// --- Event Listeners ---

if (inputText) {
    inputText.addEventListener('input', generateMarkdown);
} else {
    console.error("Input textarea not found!");
}

if (insertTemplateBtn) {
    insertTemplateBtn.addEventListener('click', () => {
        // For this example, let's just insert the 'standardHeader' template.
        // A more complex implementation could involve a dropdown or modal to choose a template.
        const templateToInsert = templates.standardHeader;
        const currentText = inputText.value;
        // Prepend the template, adding a couple of newlines for separation if needed
        inputText.value = templateToInsert + '\\n\\n' + currentText;
        generateMarkdown(); // Regenerate output after inserting template
    });
} else {
    console.error("Insert template button not found!");
}

// Initial generation on page load
generateMarkdown();

// Import Mozilla's PDF Library
import * as pdfjsLib from './pdf-libs/pdf.mjs';

// Configure the worker (required for performance)
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf-libs/pdf.worker.mjs';

// --- Global Variables ---
let currentPDF = null;       // The loaded PDF document
let currentSpread = 0;       // Which spread we are on (0 = pages 1&2, 1 = pages 3&4)
let totalSpreads = 0;
let currentBookTitle = "";

// DOM Elements
const modal = document.getElementById('reader-modal');
const closeBtn = document.querySelector('.close-button');
const prevBtn = document.getElementById('prev-button');
const nextBtn = document.getElementById('next-button');
const pageInfoSpan = document.getElementById('page-info');
const modalTitle = document.getElementById('book-title');
const leftCanvas = document.getElementById('left-page-canvas');
const rightCanvas = document.getElementById('right-page-canvas');

// --- Helper: Render a single page onto a canvas ---
async function renderPage(pdfDoc, pageNum, canvasElement) {
    try {
        // Get the page from the PDF
        const page = await pdfDoc.getPage(pageNum);
        
        // Calculate scale so the page fits nicely (viewport width around 400px)
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(400 / viewport.width, 700 / viewport.height);
        const scaledViewport = page.getViewport({ scale: scale });
        
        // Set canvas size
        canvasElement.width = scaledViewport.width;
        canvasElement.height = scaledViewport.height;
        
        // Render PDF page into canvas context
        const context = canvasElement.getContext('2d');
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        return true;
    } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error);
        // Draw an error message on canvas
        const ctx = canvasElement.getContext('2d');
        canvasElement.width = 400;
        canvasElement.height = 500;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        ctx.fillStyle = '#a00';
        ctx.font = '16px sans-serif';
        ctx.fillText('Could not load page', 20, 50);
        return false;
    }
}

// --- Render the current spread (two facing pages) ---
async function renderCurrentSpread() {
    if (!currentPDF) return;
    
    // Calculate actual page numbers for this spread
    // Spread 0: Left=Page 1, Right=Page 2
    // Spread 1: Left=Page 3, Right=Page 4
    const leftPageNum = (currentSpread * 2) + 1;
    const rightPageNum = leftPageNum + 1;
    
    // Get total pages in PDF
    const totalPages = currentPDF.numPages;
    
    // Update button states
    prevBtn.disabled = (currentSpread === 0);
    nextBtn.disabled = (rightPageNum > totalPages);
    
    // Update page info display
    if (rightPageNum <= totalPages) {
        pageInfoSpan.innerText = `Pages ${leftPageNum} - ${rightPageNum} of ${totalPages}`;
    } else if (leftPageNum <= totalPages) {
        pageInfoSpan.innerText = `Page ${leftPageNum} of ${totalPages} (single page)`;
    } else {
        pageInfoSpan.innerText = `End of book`;
    }
    
    // Render Left Page
    if (leftPageNum <= totalPages) {
        await renderPage(currentPDF, leftPageNum, leftCanvas);
    } else {
        // Blank canvas
        const ctx = leftCanvas.getContext('2d');
        leftCanvas.width = 400;
        leftCanvas.height = 500;
        ctx.fillStyle = '#eae6df';
        ctx.fillRect(0, 0, leftCanvas.width, leftCanvas.height);
        ctx.fillStyle = '#999';
        ctx.font = 'italic 18px serif';
        ctx.fillText('End', leftCanvas.width/2 - 20, leftCanvas.height/2);
    }
    
    // Render Right Page
    if (rightPageNum <= totalPages) {
        await renderPage(currentPDF, rightPageNum, rightCanvas);
    } else {
        const ctx = rightCanvas.getContext('2d');
        rightCanvas.width = 400;
        rightCanvas.height = 500;
        ctx.fillStyle = '#eae6df';
        ctx.fillRect(0, 0, rightCanvas.width, rightCanvas.height);
        ctx.fillStyle = '#999';
        ctx.font = 'italic 18px serif';
        ctx.fillText('The End', rightCanvas.width/2 - 40, rightCanvas.height/2);
    }
}

// --- Load a PDF when user clicks a book cover ---
// --- Load a PDF when user clicks a book cover (WITH DEBUGGING) ---
async function loadBook(pdfPath, title) {
    try {
        console.log(`Attempting to load: ${pdfPath}`);
        
        // Show loading state on canvas
        const ctxLeft = leftCanvas.getContext('2d');
        leftCanvas.width = 400;
        leftCanvas.height = 500;
        ctxLeft.fillStyle = '#dddddd';
        ctxLeft.fillRect(0, 0, leftCanvas.width, leftCanvas.height);
        ctxLeft.fillStyle = '#333';
        ctxLeft.font = '18px sans-serif';
        ctxLeft.fillText('Loading PDF...', 20, 100);
        ctxLeft.fillText(`Path: ${pdfPath}`, 20, 140);
        
        // Try to fetch the file first (debugging step)
        console.log("Testing if file exists...");
        const testResponse = await fetch(pdfPath);
        console.log("Fetch response status:", testResponse.status);
        
        if (!testResponse.ok) {
            throw new Error(`File not found (HTTP ${testResponse.status}). Path: ${pdfPath}`);
        }
        
        console.log("File exists! Now loading with PDF.js...");
        
        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument(pdfPath);
        currentPDF = await loadingTask.promise;
        currentBookTitle = title;
        currentSpread = 0;
        
        // Calculate total spreads
        const totalPages = currentPDF.numPages;
        totalSpreads = Math.ceil(totalPages / 2);
        
        // Update modal title
        modalTitle.innerText = title;
        
        // Render first spread
        await renderCurrentSpread();
        
        // Show the modal
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        console.log("PDF loaded successfully!");
        
    } catch (error) {
        console.error("Full error details:", error);
        
        // Show a more helpful error message
        let errorMsg = `Could not load "${title}".\n\n`;
        
        if (error.message.includes("File not found") || error.message.includes("404")) {
            errorMsg += `❌ PDF file missing at: ${pdfPath}\n\n`;
            errorMsg += `Solutions:\n`;
            errorMsg += `1. Make sure the file exists in your 'assets/pdfs/' folder\n`;
            errorMsg += `2. Check that the filename matches exactly (case-sensitive)\n`;
            errorMsg += `3. In VSCode, right-click the pdfs folder → Reveal in File Explorer\n`;
        } else if (error.message.includes("CORS")) {
            errorMsg += `❌ CORS error. Make sure you're using Live Server (not double-clicking the HTML file).\n`;
        } else {
            errorMsg += `❌ ${error.message}\n\n`;
            errorMsg += `Try using a different PDF file from: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`;
        }
        
        alert(errorMsg);
    }
}

// --- Navigation Functions ---
function nextSpread() {
    if (!currentPDF) return;
    const totalPages = currentPDF.numPages;
    const maxSpread = Math.ceil(totalPages / 2) - 1;
    
    if (currentSpread < maxSpread) {
        currentSpread++;
        renderCurrentSpread();
    }
}

function prevSpread() {
    if (currentSpread > 0) {
        currentSpread--;
        renderCurrentSpread();
    }
}

// --- Close Modal ---
function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPDF = null; // Clear memory
}

// --- Event Listeners ---
// Attach click handlers to all book cards
document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
        const pdfPath = card.getAttribute('data-pdf');
        const title = card.getAttribute('data-title');
        if (pdfPath) {
            loadBook(pdfPath, title);
        } else {
            alert("This book doesn't have a PDF file linked yet.");
        }
    });
});

// Modal controls
closeBtn.addEventListener('click', closeModal);
prevBtn.addEventListener('click', prevSpread);
nextBtn.addEventListener('click', nextSpread);

// Close modal when clicking outside the content
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// Keyboard controls (Arrow keys)
window.addEventListener('keydown', (event) => {
    if (modal.style.display === 'block') {
        if (event.key === 'ArrowLeft') {
            prevSpread();
            event.preventDefault();
        } else if (event.key === 'ArrowRight') {
            nextSpread();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            closeModal();
        }
    }
});

console.log("Website ready! Click on any book cover to read in two-page spreads.");
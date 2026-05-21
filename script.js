// MOBILE-COMPATIBLE PDF VIEWER
// This version works on phones, tablets, and desktops

let pdfjsLib = null;
let currentPDF = null;
let currentSpread = 0;
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

// Load PDF.js library dynamically (works better on mobile)
async function loadPDFLibrary() {
    if (pdfjsLib) return pdfjsLib;
    
    try {
        // Try local files first
        const module = await import('./pdf-libs/pdf.mjs');
        pdfjsLib = module;
        pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf-libs/pdf.worker.mjs';
        return pdfjsLib;
    } catch (localError) {
        console.log("Local PDF.js failed, trying CDN...");
        // Fallback to CDN for mobile
        const module = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.mjs');
        pdfjsLib = module;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.mjs';
        return pdfjsLib;
    }
}

// Helper: Render a single page
async function renderPage(pdfDoc, pageNum, canvasElement) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        
        // Get device pixel ratio for sharper rendering on mobile
        const pixelRatio = window.devicePixelRatio || 1;
        
        // Calculate scale based on container width
        const container = canvasElement.parentElement;
        const containerWidth = container.clientWidth - 20; // Subtract padding
        
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });
        
        // Set canvas dimensions
        canvasElement.width = scaledViewport.width * pixelRatio;
        canvasElement.height = scaledViewport.height * pixelRatio;
        canvasElement.style.width = `${scaledViewport.width}px`;
        canvasElement.style.height = `${scaledViewport.height}px`;
        
        const context = canvasElement.getContext('2d');
        context.scale(pixelRatio, pixelRatio);
        
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        return true;
    } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error);
        showErrorOnCanvas(canvasElement, `Page ${pageNum} failed to load`);
        return false;
    }
}

// Show error message on canvas
function showErrorOnCanvas(canvasElement, message) {
    const ctx = canvasElement.getContext('2d');
    canvasElement.width = 400;
    canvasElement.height = 500;
    canvasElement.style.width = '400px';
    canvasElement.style.height = '500px';
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.fillStyle = '#cc0000';
    ctx.font = '14px sans-serif';
    ctx.fillText(message, 20, canvasElement.height / 2);
}

// Render current spread
async function renderCurrentSpread() {
    if (!currentPDF) return;
    
    const leftPageNum = (currentSpread * 2) + 1;
    const rightPageNum = leftPageNum + 1;
    const totalPages = currentPDF.numPages;
    
    // Update buttons
    prevBtn.disabled = (currentSpread === 0);
    nextBtn.disabled = (rightPageNum > totalPages);
    
    // Update info text
    if (rightPageNum <= totalPages) {
        pageInfoSpan.innerText = `Pages ${leftPageNum}-${rightPageNum} of ${totalPages}`;
    } else if (leftPageNum <= totalPages) {
        pageInfoSpan.innerText = `Page ${leftPageNum} of ${totalPages}`;
    } else {
        pageInfoSpan.innerText = `End of book`;
    }
    
    // Render left page
    if (leftPageNum <= totalPages) {
        await renderPage(currentPDF, leftPageNum, leftCanvas);
    } else {
        showErrorOnCanvas(leftCanvas, "End");
    }
    
    // Render right page
    if (rightPageNum <= totalPages) {
        await renderPage(currentPDF, rightPageNum, rightCanvas);
    } else if (leftPageNum <= totalPages) {
        showErrorOnCanvas(rightCanvas, "The End");
    } else {
        showErrorOnCanvas(rightCanvas, "");
    }
}

// Load book (mobile-optimized)
async function loadBook(pdfPath, title) {
    try {
        console.log(`Loading book: ${title} from ${pdfPath}`);
        
        // Show loading state
        showErrorOnCanvas(leftCanvas, "Loading PDF...");
        showErrorOnCanvas(rightCanvas, "Please wait");
        
        // Load PDF.js library first
        const PDFLib = await loadPDFLibrary();
        
        // Fetch the PDF with proper options for mobile
        const loadingTask = PDFLib.getDocument({
            url: pdfPath,
            withCredentials: false,
            useSystemFonts: true,
            disableRange: true,  // Helps on mobile
            disableStream: true,  // Helps on mobile
            disableAutoFetch: false,
            cMapUrl: null
        });
        
        currentPDF = await loadingTask.promise;
        currentBookTitle = title;
        currentSpread = 0;
        totalSpreads = Math.ceil(currentPDF.numPages / 2);
        
        modalTitle.innerText = title;
        await renderCurrentSpread();
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        console.log("Book loaded successfully!");
    } catch (error) {
        console.error("Failed to load book:", error);
        
        let errorMsg = `Could not load "${title}".\n\n`;
        
        if (error.message.includes("Worker") || error.message.includes("worker")) {
            errorMsg += `⚠️ Mobile worker error.\n\nTry these fixes:\n`;
            errorMsg += `1. Refresh the page and try again\n`;
            errorMsg += `2. Clear your browser cache\n`;
            errorMsg += `3. Use Chrome or Safari browser\n`;
            errorMsg += `4. Check your internet connection`;
        } else if (error.message.includes("404")) {
            errorMsg += `❌ PDF file missing at: ${pdfPath}\n\n`;
            errorMsg += `Make sure the file exists on the server.`;
        } else {
            errorMsg += `❌ ${error.message}\n\n`;
            errorMsg += `Try using the test PDF from:\nhttps://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`;
        }
        
        alert(errorMsg);
    }
}

// Navigation functions
function nextSpread() {
    if (!currentPDF) return;
    const maxSpread = Math.ceil(currentPDF.numPages / 2) - 1;
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

function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPDF = null;
}

// Event listeners
document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        const pdfPath = card.getAttribute('data-pdf');
        const title = card.getAttribute('data-title');
        if (pdfPath) {
            loadBook(pdfPath, title);
        } else {
            alert("This book doesn't have a PDF file linked yet.");
        }
    });
});

closeBtn.addEventListener('click', closeModal);
prevBtn.addEventListener('click', prevSpread);
nextBtn.addEventListener('click', nextSpread);

window.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
});

// Touch-friendly keyboard support
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

console.log("Mobile-optimized reader ready!");
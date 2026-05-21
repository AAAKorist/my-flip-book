// Import Mozilla's PDF Library
import * as pdfjsLib from './pdf-libs/pdf.mjs';

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf-libs/pdf.worker.mjs';

// --- Global Variables ---
let currentPDF = null;
let currentSpread = 0;           // 双页模式：当前跨页
let currentPageIndex = 0;        // 单页模式：当前页码（0开始）
let totalPages = 0;
let currentBookTitle = "";
let currentBookMode = "pdf";     // "pdf" or "images"
let bookImageBasePath = "";
let isMobileDevice = false;
let singlePageMode = false;       // 手机端单页模式

// DOM Elements
const modal = document.getElementById('reader-modal');
const closeBtn = document.querySelector('.close-button');
const prevBtn = document.getElementById('prev-button');
const nextBtn = document.getElementById('next-button');
const pageInfoSpan = document.getElementById('page-info');
const modalTitle = document.getElementById('book-title');
const leftCanvas = document.getElementById('left-page-canvas');
const rightCanvas = document.getElementById('right-page-canvas');

// --- 检测设备并设置模式 ---
function checkDeviceAndSetMode() {
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileDevice) {
        singlePageMode = true;
        document.body.classList.add('mobile-single-page');
        console.log("📱 手机端模式：单页显示");
    } else {
        singlePageMode = false;
        document.body.classList.remove('mobile-single-page');
        console.log("💻 电脑端模式：双页显示");
    }
    
    return singlePageMode;
}

// --- 用图片渲染 ---
async function renderPageFromImages(pageNum, canvasElement) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            canvasElement.width = img.width;
            canvasElement.height = img.height;
            const ctx = canvasElement.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(true);
        };
        img.onerror = () => {
            console.error(`Failed to load image: ${bookImageBasePath}page${pageNum}.jpg`);
            const ctx = canvasElement.getContext('2d');
            canvasElement.width = 400;
            canvasElement.height = 500;
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            ctx.fillStyle = '#a00';
            ctx.font = '16px sans-serif';
            ctx.fillText('图片加载失败', 20, 50);
            ctx.fillText(`page${pageNum}.jpg`, 20, 80);
            resolve(false);
        };
        img.src = `${bookImageBasePath}page${pageNum}.jpg`;
    });
}

// --- 用PDF渲染 ---
async function renderPageFromPDF(pageNum, canvasElement) {
    try {
        const page = await currentPDF.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(400 / viewport.width, 700 / viewport.height);
        const scaledViewport = page.getViewport({ scale: scale });
        
        canvasElement.width = scaledViewport.width;
        canvasElement.height = scaledViewport.height;
        
        const context = canvasElement.getContext('2d');
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        return true;
    } catch (error) {
        console.error(`Error rendering PDF page ${pageNum}:`, error);
        const ctx = canvasElement.getContext('2d');
        canvasElement.width = 400;
        canvasElement.height = 500;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        ctx.fillStyle = '#a00';
        ctx.font = '16px sans-serif';
        ctx.fillText('PDF加载失败', 20, 50);
        return false;
    }
}

// --- 绘制空白页 ---
function drawBlankPage(canvas, text) {
    const ctx = canvas.getContext('2d');
    canvas.width = 400;
    canvas.height = 500;
    ctx.fillStyle = '#eae6df';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#999';
    ctx.font = 'italic 18px serif';
    ctx.fillText(text, canvas.width/2 - 30, canvas.height/2);
}

// --- 单页模式渲染 ---
async function renderSinglePage() {
    const pageNum = currentPageIndex + 1;
    
    if (currentBookMode === "images" && bookImageBasePath) {
        if (pageNum <= totalPages) {
            await renderPageFromImages(pageNum, rightCanvas);
            drawBlankPage(leftCanvas, "");
        } else {
            drawBlankPage(rightCanvas, "全书完");
        }
        
        prevBtn.disabled = (currentPageIndex === 0);
        nextBtn.disabled = (currentPageIndex + 1 >= totalPages);
        pageInfoSpan.innerText = `第 ${pageNum} 页 / 共 ${totalPages} 页`;
        
    } else if (currentPDF) {
        const pdfTotalPages = currentPDF.numPages;
        
        if (pageNum <= pdfTotalPages) {
            await renderPageFromPDF(pageNum, rightCanvas);
            drawBlankPage(leftCanvas, "");
        } else {
            drawBlankPage(rightCanvas, "全书完");
        }
        
        prevBtn.disabled = (currentPageIndex === 0);
        nextBtn.disabled = (currentPageIndex + 1 >= pdfTotalPages);
        pageInfoSpan.innerText = `第 ${pageNum} 页 / 共 ${pdfTotalPages} 页`;
    }
}

// --- 双页模式渲染（图片）---
async function renderCurrentSpreadImages() {
    const leftPageNum = (currentSpread * 2) + 1;
    const rightPageNum = leftPageNum + 1;
    
    prevBtn.disabled = (currentSpread === 0);
    nextBtn.disabled = (rightPageNum > totalPages);
    
    if (rightPageNum <= totalPages) {
        pageInfoSpan.innerText = `第 ${leftPageNum} - ${rightPageNum} 页 / 共 ${totalPages} 页`;
    } else if (leftPageNum <= totalPages) {
        pageInfoSpan.innerText = `第 ${leftPageNum} 页 / 共 ${totalPages} 页`;
    } else {
        pageInfoSpan.innerText = `全书完`;
    }
    
    if (leftPageNum <= totalPages) {
        await renderPageFromImages(leftPageNum, leftCanvas);
    } else {
        drawBlankPage(leftCanvas, "End");
    }
    
    if (rightPageNum <= totalPages) {
        await renderPageFromImages(rightPageNum, rightCanvas);
    } else {
        drawBlankPage(rightCanvas, "The End");
    }
}

// --- 双页模式渲染（PDF）---
async function renderCurrentSpreadPDF() {
    const leftPageNum = (currentSpread * 2) + 1;
    const rightPageNum = leftPageNum + 1;
    const pdfTotalPages = currentPDF.numPages;
    
    prevBtn.disabled = (currentSpread === 0);
    nextBtn.disabled = (rightPageNum > pdfTotalPages);
    
    if (rightPageNum <= pdfTotalPages) {
        pageInfoSpan.innerText = `第 ${leftPageNum} - ${rightPageNum} 页 / 共 ${pdfTotalPages} 页`;
    } else if (leftPageNum <= pdfTotalPages) {
        pageInfoSpan.innerText = `第 ${leftPageNum} 页 / 共 ${pdfTotalPages} 页`;
    } else {
        pageInfoSpan.innerText = `全书完`;
    }
    
    if (leftPageNum <= pdfTotalPages) {
        await renderPageFromPDF(leftPageNum, leftCanvas);
    } else {
        drawBlankPage(leftCanvas, "End");
    }
    
    if (rightPageNum <= pdfTotalPages) {
        await renderPageFromPDF(rightPageNum, rightCanvas);
    } else {
        drawBlankPage(rightCanvas, "The End");
    }
}

// --- 主渲染函数（自动选择模式）---
async function renderCurrentSpread() {
    if (singlePageMode) {
        await renderSinglePage();
    } else {
        if (currentBookMode === "images" && bookImageBasePath) {
            await renderCurrentSpreadImages();
        } else if (currentPDF) {
            await renderCurrentSpreadPDF();
        }
    }
}

// --- 导航：下一页（单页模式）---
function nextPage() {
    if (singlePageMode) {
        const maxPage = currentBookMode === "images" ? totalPages : (currentPDF ? currentPDF.numPages : 0);
        if (currentPageIndex + 1 < maxPage) {
            currentPageIndex++;
            renderCurrentSpread();
        }
    }
}

// --- 导航：上一页（单页模式）---
function prevPage() {
    if (singlePageMode) {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            renderCurrentSpread();
        }
    }
}

// --- 导航：下一跨页（双页模式）---
function nextSpread() {
    if (singlePageMode) return;
    
    if (currentBookMode === "images") {
        const maxSpread = Math.ceil(totalPages / 2) - 1;
        if (currentSpread < maxSpread) {
            currentSpread++;
            renderCurrentSpread();
        }
    } else if (currentPDF) {
        const maxSpread = Math.ceil(currentPDF.numPages / 2) - 1;
        if (currentSpread < maxSpread) {
            currentSpread++;
            renderCurrentSpread();
        }
    }
}

// --- 导航：上一跨页（双页模式）---
function prevSpread() {
    if (singlePageMode) return;
    
    if (currentSpread > 0) {
        currentSpread--;
        renderCurrentSpread();
    }
}

// --- 从图片加载书籍 ---
async function loadBookFromImages(title, imageBasePath) {
    try {
        console.log(`加载图片书籍: ${title}, 路径: ${imageBasePath}`);
        
        const ctxLeft = leftCanvas.getContext('2d');
        leftCanvas.width = 400;
        leftCanvas.height = 500;
        ctxLeft.fillStyle = '#dddddd';
        ctxLeft.fillRect(0, 0, leftCanvas.width, leftCanvas.height);
        ctxLeft.fillStyle = '#333';
        ctxLeft.font = '18px sans-serif';
        ctxLeft.fillText('加载图片中...', 20, 100);
        
        // 检测总页数
        let foundPages = 0;
        const maxPagesToCheck = 200;
        
        for (let i = 1; i <= maxPagesToCheck; i++) {
            const testImg = new Image();
            const imgExists = await new Promise((resolve) => {
                testImg.onload = () => resolve(true);
                testImg.onerror = () => resolve(false);
                testImg.src = `${imageBasePath}page${i}.jpg`;
            });
            if (imgExists) {
                foundPages++;
            } else {
                break;
            }
        }
        
        totalPages = foundPages;
        
        if (totalPages === 0) {
            throw new Error(`未找到任何图片！路径: ${imageBasePath}page1.jpg`);
        }
        
        currentBookMode = "images";
        bookImageBasePath = imageBasePath;
        currentBookTitle = title;
        
        if (singlePageMode) {
            currentPageIndex = 0;
        } else {
            currentSpread = 0;
        }
        
        modalTitle.innerText = title;
        await renderCurrentSpread();
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        console.log(`✅ 图片书籍加载成功！共 ${totalPages} 页，模式: ${singlePageMode ? "单页" : "双页"}`);
        
    } catch (error) {
        console.error("图片加载错误:", error);
        alert(`无法加载 "${title}" 的图片版本。\n\n请确保图片存在于: ${imageBasePath}\n文件名格式: page1.jpg, page2.jpg ...\n\n错误: ${error.message}`);
    }
}

// --- 从PDF加载书籍 ---
async function loadBookFromPDF(pdfPath, title) {
    try {
        console.log(`尝试加载PDF: ${pdfPath}`);
        
        const ctxLeft = leftCanvas.getContext('2d');
        leftCanvas.width = 400;
        leftCanvas.height = 500;
        ctxLeft.fillStyle = '#dddddd';
        ctxLeft.fillRect(0, 0, leftCanvas.width, leftCanvas.height);
        ctxLeft.fillStyle = '#333';
        ctxLeft.font = '18px sans-serif';
        ctxLeft.fillText('加载PDF中...', 20, 100);
        
        const testResponse = await fetch(pdfPath);
        if (!testResponse.ok) {
            throw new Error(`文件未找到 (HTTP ${testResponse.status})`);
        }
        
        const loadingTask = pdfjsLib.getDocument(pdfPath);
        currentPDF = await loadingTask.promise;
        currentBookMode = "pdf";
        currentBookTitle = title;
        
        if (singlePageMode) {
            currentPageIndex = 0;
        } else {
            currentSpread = 0;
        }
        
        modalTitle.innerText = title;
        await renderCurrentSpread();
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        console.log(`✅ PDF加载成功！共 ${currentPDF.numPages} 页，模式: ${singlePageMode ? "单页" : "双页"}`);
        
    } catch (error) {
        console.error("PDF加载错误:", error);
        let errorMsg = `无法加载 "${title}"。\n\n`;
        if (isMobileDevice) {
            errorMsg += `📱 手机端建议将PDF转为JPG图片。\n\n`;
        }
        errorMsg += `错误详情: ${error.message}`;
        alert(errorMsg);
    }
}

// --- 主加载函数 ---
async function loadBook(pdfPath, title, imageFolderBase = null) {
    if (imageFolderBase) {
        await loadBookFromImages(title, imageFolderBase);
    } else {
        await loadBookFromPDF(pdfPath, title);
    }
}

// --- 关闭模态框 ---
function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPDF = null;
    currentBookMode = "pdf";
}

// ============================================
// 事件绑定
// ============================================

// 绑定书籍点击事件
document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
        const pdfPath = card.getAttribute('data-pdf');
        const title = card.getAttribute('data-title');
        
        // 为每本书指定图片文件夹路径
        const imagePaths = {
            "先喝完这杯": "assets/images/book1/",
            "噩梦": "assets/images/book2/"
        };
        
        const imageBasePath = imagePaths[title];
        
        // 重新检测设备模式
        checkDeviceAndSetMode();
        
        if (pdfPath) {
            if (imageBasePath) {
                loadBook(pdfPath, title, imageBasePath);
            } else {
                loadBook(pdfPath, title, null);
            }
        } else {
            alert("这本书还没有链接文件。");
        }
    });
});

// 模态框控制
closeBtn.addEventListener('click', closeModal);

// 翻页按钮（根据模式调用不同函数）
prevBtn.addEventListener('click', () => {
    if (singlePageMode) {
        prevPage();
    } else {
        prevSpread();
    }
});

nextBtn.addEventListener('click', () => {
    if (singlePageMode) {
        nextPage();
    } else {
        nextSpread();
    }
});

// 点击模态框外部关闭
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// 键盘控制
window.addEventListener('keydown', (event) => {
    if (modal.style.display === 'block') {
        if (event.key === 'ArrowLeft') {
            if (singlePageMode) {
                prevPage();
            } else {
                prevSpread();
            }
            event.preventDefault();
        } else if (event.key === 'ArrowRight') {
            if (singlePageMode) {
                nextPage();
            } else {
                nextSpread();
            }
            event.preventDefault();
        } else if (event.key === 'Escape') {
            closeModal();
        }
    }
});

// 页面加载时检测设备
checkDeviceAndSetMode();

console.log("🚀 网站已启动！手机端单页显示，电脑端双页显示。");
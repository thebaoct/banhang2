// ============================================================
// 🚀 BẮT ĐẦU: NÂNG CẤP HỆ THỐNG LƯU TRỮ (IndexedDB WRAPPER)
// ============================================================




const APP_STORAGE_KEYS = [
    'thebao_store_config', 
    'thebao_catalog_v6', 
    'thebao_inventory',
    'thebao_customers', 
    'invoiceHistory', 
    'invoiceHistory_archive',
    'thebao_debt_list', 
    'thebao_customer_credit',
    'thebao_credit_logs'
];




const MEM_CACHE = {};




window.originalLocalStorage = {
    getItem: window.localStorage.getItem.bind(window.localStorage),
    setItem: window.localStorage.setItem.bind(window.localStorage),
    removeItem: window.localStorage.removeItem.bind(window.localStorage)
};




async function initStorageSystem() {
    console.log("🚀 Đang khởi động hệ thống lưu trữ dung lượng lớn (IndexedDB)...");
    localforage.config({ name: 'TheBaoTool_DB', storeName: 'app_data_store' });




    for (const key of APP_STORAGE_KEYS) {
        try {
            let val = await localforage.getItem(key);
            if (val === null) {
                const oldVal = window.originalLocalStorage.getItem(key);
                if (oldVal) {
                    console.log(`♻️ Đang di chuyển dữ liệu cũ [${key}] sang hệ thống mới...`);
                    val = oldVal;
                    await localforage.setItem(key, val); 
                }
            }
            MEM_CACHE[key] = val;
        } catch (err) {
            console.error(`Lỗi tải dữ liệu [${key}]:`, err);
        }
    }
    console.log("✅ Đã nạp xong dữ liệu vào bộ nhớ đệm.");
}




Storage.prototype.getItem = function(key) {
    if (APP_STORAGE_KEYS.includes(key)) {
        return MEM_CACHE[key] !== undefined ? MEM_CACHE[key] : null;
    }
    return window.originalLocalStorage.getItem(key);
};




Storage.prototype.setItem = function(key, value) {
    if (APP_STORAGE_KEYS.includes(key)) {
        MEM_CACHE[key] = String(value); 
        localforage.setItem(key, String(value)).catch(e => console.error("Lỗi lưu DB:", e)); 
        return;
    }
    window.originalLocalStorage.setItem(key, value);
};




Storage.prototype.removeItem = function(key) {
    if (APP_STORAGE_KEYS.includes(key)) {
        delete MEM_CACHE[key];
        localforage.removeItem(key);
        return;
    }
    window.originalLocalStorage.removeItem(key);
};




// ============================================================
// DATA & CONFIG
// ============================================================
const defaultCatalog = [
    { id: "cat_game", name: "Thẻ Game", products: [ { name: "Garena", prices: [{face: 20000, sell: 20000}, {face: 50000, sell: 50000}, {face: 100000, sell: 100000}] }, { name: "Zing", prices: [{face: 20000, sell: 20000}, {face: 50000, sell: 50000}, {face: 100000, sell: 100000}] } ] },
    { id: "cat_mobile", name: "Điện Thoại", products: [ { name: "Viettel", prices: [{face: 10000, sell: 10000}, {face: 20000, sell: 20000}, {face: 50000, sell: 50000}] }, { name: "Vina", prices: [{face: 10000, sell: 10000}, {face: 20000, sell: 20000}] } ] },
    { id: "cat_service", name: "Dịch vụ", products: [ { name: "Phí GD", prices: [] }, { name: "Phí Ship", prices: [] } ] }
];




const defaultStoreConfig = { 
    brandName: "THE BÁO", slogan: "Dịch vụ thẻ cào trực tuyến", hotline: "0354.830.400", 
    bankId: "MB", accNum: "0354830400", accName: "NGUYEN VAN A",
    bankId2: "", accNum2: "", accName2: "",
    bankId3: "", accNum3: "", accName3: ""
};




let currentBankIndex = 1;




let productCatalog = [], storeConfig = {}, customerList = [], cartItems = [];
let inventory = {}; 
let currentPaymentMethod = 'CASH', isPaid = false, isOrderSaved = false, isEditMode = false, isDebtViewMode = false, currentDebtTab = 'active', restoreMode = 'merge';
let selectedCatIndex = null, selectedProdIndex = null;




// --- CORE FUNCTIONS ---
let _renderCodesTimer = null;

function getAllInvoiceHistory() {
    let main = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    let arch = JSON.parse(localStorage.getItem('invoiceHistory_archive') || "[]");
    if (!Array.isArray(arch) || arch.length === 0) return Array.isArray(main) ? main : [];
    const seen = new Set();
    const combined = [];
    for (const item of [...(Array.isArray(main) ? main : []), ...arch]) {
        if (item && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            combined.push(item);
        }
    }
    return combined;
}
window.getAllInvoiceHistory = getAllInvoiceHistory;

function syncDebtStatusToHistory() {
    let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    let debts = getDebtList();
    let changed = false;

    h.forEach(order => {
        if (!order.isPaid) {
            // Chỉ tự động chuyển sang Đã TT nếu đơn này có trong sổ nợ và đã trả hết (remainingAmount <= 0)
            let debtRec = debts.find(d => d && d.orderId === order.id);
            if (debtRec && Number(debtRec.remainingAmount) <= 0) {
                order.isPaid = true;
                changed = true;
            }
        }
    });

    if(changed) {
        localStorage.setItem('invoiceHistory', JSON.stringify(h));
    }
}


function init() {
    loadStoreConfig(); loadCatalog(); loadCustomerList(); loadInventory();
    syncDebtStatusToHistory(); 
    const now = new Date();
    document.getElementById('inpTime').value = now.toTimeString().substring(0,5);
    const _y = now.getFullYear();
    const _m = String(now.getMonth() + 1).padStart(2, '0');
    const _d = String(now.getDate()).padStart(2, '0');
    document.getElementById('inpDate').value = `${_y}-${_m}-${_d}`;
    generateRandomInvoiceID(); renderCatalogSelects(); updateInvoiceHeader(); renderInputFields(); calculateTodayRevenue();
    document.addEventListener('keydown', function(event) { if (event.key === "Enter" && (document.activeElement.tagName === 'INPUT')) addToCart(); });
    document.addEventListener('click', function(e) { 
        if (!e.target.closest('.form-group')) document.querySelectorAll('.suggestion-list').forEach(e => e.style.display = 'none'); 
        if (!e.target.closest('#smartSearchBox')) document.getElementById('smartSearchResults').style.display='none';
    });
    updatePrintSize();
}




function updatePrintSize() {
    const size = document.getElementById('selPrintSize').value;
    const box = document.getElementById('invoiceArea');
    box.classList.remove('size-k80', 'size-k57');
    box.classList.add('size-' + size);
}




// --- HELPERS ---
const formatMoney = (val) => { if (!val) return "0"; if (!isNaN(val) && !isNaN(parseFloat(val))) return parseInt(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); return val; };
const formatReadableCode = (code) => code ? code.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() : "";




// --- SETTINGS UI ---
function openSettings() {
    if (!storeConfig || typeof storeConfig !== 'object') loadStoreConfig();
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('cfgBrandName').value = storeConfig.brandName || "";
    document.getElementById('cfgSlogan').value = storeConfig.slogan || "";
    document.getElementById('cfgHotline').value = storeConfig.hotline || "";
    document.getElementById('cfgBankId').value = storeConfig.bankId || "MB";
    document.getElementById('cfgAccNum').value = storeConfig.accNum || "";
    document.getElementById('cfgAccName').value = storeConfig.accName || "";
    if (document.getElementById('cfgBankId2')) {
        document.getElementById('cfgBankId2').value = storeConfig.bankId2 || "";
        document.getElementById('cfgAccNum2').value = storeConfig.accNum2 || "";
        document.getElementById('cfgAccName2').value = storeConfig.accName2 || "";
        document.getElementById('cfgBankId3').value = storeConfig.bankId3 || "";
        document.getElementById('cfgAccNum3').value = storeConfig.accNum3 || "";
        document.getElementById('cfgAccName3').value = storeConfig.accName3 || "";
    }
    selectedCatIndex = null;
    selectedProdIndex = null;
    try { renderCatalogSettings(); } catch (e) { console.error("Lỗi renderCatalogSettings:", e); }
    try { renderCustomerTable(); } catch (e) { console.error("Lỗi renderCustomerTable:", e); }
    try { renderInventoryTab(); } catch (e) { console.error("Lỗi renderInventoryTab:", e); }
}
window.openSettings = openSettings;




function switchSettingTab(tab, btn) {
    document.querySelectorAll('#settingsModal .tab-item').forEach(t => t.classList.remove('active'));
    if(btn) btn.classList.add('active');
    document.querySelectorAll('#settingsModal .tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`setTab_${tab}`).classList.add('active');
}




function loadStoreConfig() { storeConfig = JSON.parse(localStorage.getItem('thebao_store_config') || JSON.stringify(defaultStoreConfig)); }




function saveGlobalSettings() { storeConfig.brandName = document.getElementById('cfgBrandName').value; storeConfig.slogan = document.getElementById('cfgSlogan').value; storeConfig.hotline = document.getElementById('cfgHotline').value; storeConfig.bankId = document.getElementById('cfgBankId').value; storeConfig.accNum = document.getElementById('cfgAccNum').value; storeConfig.accName = document.getElementById('cfgAccName').value; storeConfig.bankId2 = document.getElementById('cfgBankId2').value; storeConfig.accNum2 = document.getElementById('cfgAccNum2').value; storeConfig.accName2 = document.getElementById('cfgAccName2').value; storeConfig.bankId3 = document.getElementById('cfgBankId3').value; storeConfig.accNum3 = document.getElementById('cfgAccNum3').value; storeConfig.accName3 = document.getElementById('cfgAccName3').value; localStorage.setItem('thebao_store_config', JSON.stringify(storeConfig)); updateInvoiceHeader(); alert("✅ Đã lưu cấu hình cửa hàng!"); }




// --- CATALOG LOGIC ---
function loadCatalog() {
    let raw = [];
    try {
        raw = JSON.parse(localStorage.getItem('thebao_catalog_v6') || JSON.stringify(defaultCatalog));
    } catch (e) {
        raw = JSON.parse(JSON.stringify(defaultCatalog));
    }
    if (!Array.isArray(raw)) raw = JSON.parse(JSON.stringify(defaultCatalog));
    let fixed = false;
    raw.forEach(c => {
        if (!c || typeof c !== 'object') return;
        if (!Array.isArray(c.products)) { c.products = []; fixed = true; }
        c.products.forEach(p => {
            if (!p || typeof p !== 'object') return;
            if (!Array.isArray(p.prices)) { p.prices = []; fixed = true; }
            if (p.products !== undefined) { delete p.products; fixed = true; }
        });
    });
    productCatalog = raw;
    if (fixed) localStorage.setItem('thebao_catalog_v6', JSON.stringify(productCatalog));
}
function saveCatalogSettings() { localStorage.setItem('thebao_catalog_v6', JSON.stringify(productCatalog)); renderCatalogSelects(); alert("✅ Đã lưu sản phẩm!"); }




function renderCatalogSettings() {
    const catList = document.getElementById('catList_categories');
    if (!catList) return;
    catList.innerHTML = (productCatalog || []).map((c, i) => `<div class="cat-item ${selectedCatIndex===i?'active':''}" onclick="selectCategory(${i})"><span>${c.name}</span> <button class="btn-mini btn-danger" onclick="deleteCategory(event, ${i})">x</button></div>`).join('');
    
    const prodList = document.getElementById('catList_products');
    if(selectedCatIndex!==null && productCatalog[selectedCatIndex]) {
        const prods = Array.isArray(productCatalog[selectedCatIndex].products) ? productCatalog[selectedCatIndex].products : [];
        prodList.innerHTML = prods.map((p,i) => `<div class="cat-item ${selectedProdIndex===i?'active':''}" onclick="selectProduct(${i})"><span>${p.name}</span> <button class="btn-mini btn-danger" onclick="deleteProduct(event, ${i})">x</button></div>`).join('');
    } else prodList.innerHTML = '<div style="text-align:center;color:#999;">Chọn danh mục</div>';
    
    const priceList = document.getElementById('catList_prices');
    if(selectedCatIndex!==null && selectedProdIndex!==null && productCatalog[selectedCatIndex]?.products?.[selectedProdIndex]) {
        const prices = Array.isArray(productCatalog[selectedCatIndex].products[selectedProdIndex].prices) ? productCatalog[selectedCatIndex].products[selectedProdIndex].prices : [];
        priceList.innerHTML = prices.map((p,i) => 
            `<div class="price-input-group" style="flex-wrap:wrap;"><label>Mệnh giá:</label><input type="text" value="${p.face}" onchange="updatePriceVal(${i},'face',this.value)" style="width:55px;"> <label>Bán:</label><input type="number" value="${p.sell}" onchange="updatePriceVal(${i},'sell',this.value)" style="width:55px;"> <label>Vốn:</label><input type="number" value="${p.cost||p.face||0}" onchange="updatePriceVal(${i},'cost',this.value)" style="width:55px;" title="Giá nhập/vốn để tính lãi ròng"> <label>Phí:</label><input type="number" value="${p.surcharge||0}" onchange="updatePriceVal(${i},'surcharge',this.value)" style="width:45px;"> <button class="btn-mini btn-danger" onclick="deletePrice(${i})">x</button></div>`
        ).join('');
    } else priceList.innerHTML = '<div style="text-align:center;color:#999;">Chọn sản phẩm</div>';
}




function selectCategory(i) { selectedCatIndex=i; selectedProdIndex=null; renderCatalogSettings(); }
function selectProduct(i) { selectedProdIndex=i; renderCatalogSettings(); }
function addCategory() { const n = prompt("Tên danh mục:"); if(n) { productCatalog.push({id:Date.now(), name:n, products:[]}); renderCatalogSettings(); } }
function deleteCategory(e, i) { e.stopPropagation(); if(confirm("Xóa?")) { productCatalog.splice(i,1); selectedCatIndex=null; renderCatalogSettings(); } }
function addProduct() { if(selectedCatIndex===null || !productCatalog[selectedCatIndex]) return; const n = prompt("Tên sản phẩm:"); if(n) { if(!Array.isArray(productCatalog[selectedCatIndex].products)) productCatalog[selectedCatIndex].products=[]; productCatalog[selectedCatIndex].products.push({name:n, prices:[]}); renderCatalogSettings(); } }
function deleteProduct(e, i) { e.stopPropagation(); if(confirm("Xóa?")) { productCatalog[selectedCatIndex].products.splice(i,1); selectedProdIndex=null; renderCatalogSettings(); } }
function addPrice() { if(selectedCatIndex===null || selectedProdIndex===null) return; const prod = productCatalog[selectedCatIndex]?.products?.[selectedProdIndex]; if(!prod) return; if(!Array.isArray(prod.prices)) prod.prices=[]; prod.prices.push({face:10000, sell:10000, cost:10000}); renderCatalogSettings(); }
function deletePrice(i) { productCatalog[selectedCatIndex].products[selectedProdIndex].prices.splice(i,1); renderCatalogSettings(); }
function updatePriceVal(idx, f, v) { 
    let final = v; if(f!=='face') final = parseInt(v)||0; 
    productCatalog[selectedCatIndex].products[selectedProdIndex].prices[idx][f] = final; 
}




function getStockCountFor(prodName, faceVal) {
    if (!inventory || typeof inventory !== 'object') return 0;
    const key = `${prodName}_${faceVal}`;
    return Array.isArray(inventory[key]) ? inventory[key].length : 0;
}




// --- CATALOG SELECTION UI ---
function renderCatalogSelects() { document.getElementById('inpCategory').innerHTML = (productCatalog||[]).map((c,i)=>`<option value="${i}">${c.name}</option>`).join(''); handleCategoryChange(); }
function handleCategoryChange() {
    const idx = document.getElementById('inpCategory').value;
    if(!productCatalog[idx]) return;
    const prods = Array.isArray(productCatalog[idx].products) ? productCatalog[idx].products : [];
    document.getElementById('inpCardType').innerHTML = prods.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('');
    handleProductChange();
}
function handleProductChange() {
    const cIdx = document.getElementById('inpCategory').value;
    const pIdx = document.getElementById('inpCardType').value;
    if(!productCatalog[cIdx] || !productCatalog[cIdx].products || !productCatalog[cIdx].products[pIdx]) return;
    const prod = productCatalog[cIdx].products[pIdx];
    const prices = Array.isArray(prod.prices) ? prod.prices : [];
    const sel = document.getElementById('inpPriceSelect');
    const cust = document.getElementById('inpPriceCustom');
    if(prices.length === 0) { sel.style.display="none"; cust.style.display="block"; cust.value=""; }
    else {
        sel.style.display="block"; cust.style.display="none";
        sel.innerHTML = prices.map((p,i) => {
            const stk = getStockCountFor(prod.name, p.face);
            const stkLabel = stk > 0 ? ` [Kho: ${stk}]` : ` [Hết kho]`;
            return `<option value="${i}">${formatMoney(p.face)} (Bán: ${formatMoney(p.sell)})${stkLabel}</option>`;
        }).join('');
    }
    calculateSellingPrice();
}




function calculateSellingPrice() {
    const cIdx = document.getElementById('inpCategory').value;
    const pIdx = document.getElementById('inpCardType').value;
    const prIdx = document.getElementById('inpPriceSelect').value;
    const prod = productCatalog[cIdx]?.products?.[pIdx];
    const prices = prod && Array.isArray(prod.prices) ? prod.prices : [];
    let face="", sell=0, cost=0, name=prod?prod.name:"Custom", sur=0;
    if(prod && prices.length > 0 && prices[prIdx]) {
        const p = prices[prIdx];
        face = p.face;
        sur = p.surcharge || 0;
        sell = p.sell + sur;
        cost = p.cost !== undefined ? Number(p.cost) : (Number(p.face) || 0);
    } else {
        face = parseInt(document.getElementById('inpPriceCustom').value) || 0;
        sell = face;
        cost = face;
    }
    document.getElementById('sellingPricePreview').innerText = formatMoney(sell) + " đ";
    const stockBadge = document.getElementById('stockStatusPreview');
    if (stockBadge) {
        const stk = getStockCountFor(name, face);
        if (stk > 0) {
            stockBadge.className = "stock-preview-badge";
            stockBadge.innerText = `📦 Kho sẵn: ${stk} thẻ`;
        } else {
            stockBadge.className = "stock-preview-badge out-of-stock";
            stockBadge.innerText = `⚠️ Kho: 0 (Nhập tay)`;
        }
    }
    return { faceValue: face, sellingPrice: sell, costPrice: cost, productName: name };
}
// --- SMART SEARCH (FEATURE 2) ---
function handleSmartSearch(e) {
    const val = e.target.value.toLowerCase().trim();
    const results = document.getElementById('smartSearchResults');
    if(val.length < 2) { results.style.display='none'; return; }




    const matches = [];
    const numMatch = val.match(/\d+/);
    const num = numMatch ? numMatch[0] : "";
    const kw = val.replace(/\d+/, "").trim();




    (productCatalog || []).forEach((cat, cIdx) => {
        (cat.products || []).forEach((prod, pIdx) => {
            if(prod && String(prod.name || "").toLowerCase().includes(kw)) {
                const prices = Array.isArray(prod.prices) ? prod.prices : [];
                if(num) {
                    prices.forEach((pr, prIdx) => {
                        if(pr.face.toString().includes(num) || (pr.face/1000).toString() === num) {
                            matches.push({c:cIdx, p:pIdx, pr:prIdx, name: prod.name, face: pr.face, sell: pr.sell, stock: getStockCountFor(prod.name, pr.face)});
                        }
                    });
                } else {
                    prices.forEach((pr, prIdx) => {
                        matches.push({c:cIdx, p:pIdx, pr:prIdx, name: prod.name, face: pr.face, sell: pr.sell, stock: getStockCountFor(prod.name, pr.face)});
                    });
                }
            }
        });
    });




    if(matches.length > 0) {
        results.innerHTML = matches.slice(0, 8).map(m => `
            <div class="smart-item" onclick="selectSmartItem(${m.c}, ${m.p}, ${m.pr})">
                <div>
                    <span class="smart-name">${m.name} ${formatMoney(m.face)}</span>
                    <span class="smart-stock-tag" style="color:${m.stock>0?'#27ae60':'#e67e22'}">Kho: ${m.stock}</span>
                </div>
                <span class="smart-price">${formatMoney(m.sell)} đ</span>
            </div>
        `).join('');
        results.style.display='block';
    } else {
        results.style.display='none';
    }
}




function selectSmartItem(cIdx, pIdx, prIdx) {
    document.getElementById('inpCategory').value = cIdx;
    handleCategoryChange(); 
    document.getElementById('inpCardType').value = pIdx;
    handleProductChange(); 
    document.getElementById('inpPriceSelect').value = prIdx;
    calculateSellingPrice(); 
    
    document.getElementById('smartSearchResults').style.display='none';
    document.getElementById('inpSmartSearch').value = "";
    document.getElementById('inpQty').focus();
}




// --- INVENTORY / AUTO STOCK (FEATURE 3) ---
function loadInventory() {
    inventory = JSON.parse(localStorage.getItem('thebao_inventory') || "{}");
}
function saveInventory() {
    localStorage.setItem('thebao_inventory', JSON.stringify(inventory));
    renderInventoryTab();
}
function getInventoryKey(prodName, faceValue) {
    return `${prodName}_${faceValue}`;
}




function renderInventoryTab() {
    const list = document.getElementById('inventoryTableBody');
    const invProd = document.getElementById('invProdSelect');
    if (!list || !invProd) return;
    
    let allProds = [];
    (productCatalog || []).forEach(c => {
        (c.products || []).forEach(p => {
            if(p && Array.isArray(p.prices) && p.prices.length > 0) allProds.push(p);
        });
    });
    
    const prevProd = invProd.value;
    invProd.innerHTML = allProds.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    if(prevProd && allProds.some(p => p.name === prevProd)) invProd.value = prevProd;
    updateInvPriceSelect();

    let rows = "";
    for (const [key, codes] of Object.entries(inventory || {})) {
        if(key !== 'last_updated' && Array.isArray(codes) && codes.length > 0) {
            const [name, face] = key.split('_');
            rows += `<tr>
                <td>${name}</td>
                <td>${formatMoney(face)}</td>
                <td class="stock-count">${codes.length}</td>
                <td><button class="btn-mini btn-danger" onclick="clearStock('${key}')">Xóa</button></td>
            </tr>`;
        }
    }
    if(rows === "") rows = "<tr><td colspan='4' style='text-align:center;color:#999'>Kho trống</td></tr>";
    list.innerHTML = rows;
    if (typeof handleProductChange === 'function') handleProductChange();
}




function updateInvPriceSelect() {
    const invProd = document.getElementById('invProdSelect');
    const invPrice = document.getElementById('invPriceSelect');
    if (!invProd || !invPrice) return;
    const prodName = invProd.value;
    let found = null;
    (productCatalog || []).forEach(c => (c.products || []).forEach(p => { if(p && p.name===prodName) found=p; }));
    
    if(found && Array.isArray(found.prices)) {
        invPrice.innerHTML = found.prices.map(pr => `<option value="${pr.face}">${formatMoney(pr.face)}</option>`).join('');
    } else {
        invPrice.innerHTML = "";
    }
}




function importToInventory() {
    const prodName = document.getElementById('invProdSelect').value;
    const face = document.getElementById('invPriceSelect').value;
    const raw = document.getElementById('invInputArea').value.trim();
    
    if(!prodName || !face) return alert("Vui lòng chọn sản phẩm!");
    if(!raw) return alert("Chưa nhập mã thẻ!");

    const key = getInventoryKey(prodName, face);
    if(!Array.isArray(inventory[key])) inventory[key] = [];

    const existingCodes = new Set(inventory[key].map(x => `${x.code || ''}|${x.serial || ''}`));
    const lines = raw.split(/\n/);
    let count = 0;
    let dupCount = 0;
    lines.forEach(line => {
        if(line.trim()) {
            let parts = line.split(/[\t|]/);
            let code = parts[0].trim();
            let seri = parts.length > 1 ? parts[1].trim() : "";
            let sig = `${code}|${seri}`;
            if (existingCodes.has(sig)) {
                dupCount++;
            } else {
                existingCodes.add(sig);
                inventory[key].push({code, serial: seri});
                count++;
            }
        }
    });

    saveInventory();
    document.getElementById('invInputArea').value = "";
    let msg = `✅ Đã thêm ${count} thẻ vào kho!`;
    if (dupCount > 0) msg += `\n⚠️ Đã tự động lọc bỏ ${dupCount} thẻ bị trùng lặp.`;
    alert(msg);
}




function clearStock(key) {
    if(confirm("Xóa toàn bộ mã của loại này?")) {
        delete inventory[key];
        saveInventory();
    }
}




function returnUncommittedCartStock(itemsToReturn) {
    if (!Array.isArray(itemsToReturn) || itemsToReturn.length === 0) return;
    let stockChanged = false;
    itemsToReturn.forEach(item => {
        if (!item || !Array.isArray(item.cardList)) return;
        const key = getInventoryKey(item.cardType, item.faceValue);
        if (!Array.isArray(inventory[key])) inventory[key] = [];
        for (let i = item.cardList.length - 1; i >= 0; i--) {
            const c = item.cardList[i];
            if (c && c.fromStock && (c.code || c.serial)) {
                inventory[key].unshift({ code: c.code, serial: c.serial });
                stockChanged = true;
            }
        }
    });
    if (stockChanged) saveInventory();
}




// --- CART & INVOICE ---
function toggleBulk() { const b = document.getElementById('bulkBox'); b.style.display = b.style.display==='none'?'block':'none'; }
function processBulkData() {
    const raw = document.getElementById('bulkArea').value;
    if(!raw.trim()) return alert("Chưa có dữ liệu!");
    const lines = raw.trim().split(/\n/).filter(l=>l.trim()!=='');
    document.getElementById('inpQty').value = lines.length;
    renderInputFields();
    const codes = document.querySelectorAll('.sub-code');
    const seris = document.querySelectorAll('.sub-serial');
    lines.forEach((line, i) => {
        if(i >= codes.length) return;
        let parts = line.trim().split(/[\t|]+/);
        if(parts.length===1) parts = line.trim().split(/\s+/);
        if(parts.length>=1) codes[i].value = parts[0].trim();
        if(parts.length>=2) seris[i].value = parts[1].trim();
    });
    document.getElementById('bulkArea').value="";
    document.getElementById('bulkBox').style.display='none';
}




function renderInputFields() {
    const qty = parseInt(document.getElementById('inpQty').value)||1;
    const con = document.getElementById('dynamicInputs');
    let old = []; document.querySelectorAll('.sub-code').forEach((e,i)=>old.push({c:e.value, s:document.querySelectorAll('.sub-serial')[i]?.value||''}));
    con.innerHTML="";
    for(let i=0; i<qty; i++) {
        let r = document.createElement('div'); r.className='code-entry-row';
        r.innerHTML = `<span>#${i+1}</span><input type="text" class="sub-code" value="${old[i]?old[i].c:''}" placeholder="Mã thẻ" style="flex:1"><input type="text" class="sub-serial" value="${old[i]?old[i].s:''}" placeholder="Seri" style="flex:1">`;
        con.appendChild(r);
    }
}




function startNewOrderClean(silent=false) {
    if (!silent && !isOrderSaved && cartItems.length > 0) {
        if (!confirm("Đơn hiện tại chưa lưu! Bạn có muốn làm mới để tạo đơn mới không? (Thẻ lấy từ kho sẽ được hoàn lại kho)")) return;
        returnUncommittedCartStock(cartItems);
    }
    isEditMode = false;
    isDebtViewMode = false;
    isOrderSaved = false;
    document.getElementById('groupStandardBtns').style.display = 'block';
    document.getElementById('groupEditBtns').style.display = 'none';
    document.getElementById('groupDebtBtns').style.display = 'none';
    document.getElementById('editModeNotice').style.display = 'none';
    document.getElementById('inpInvoiceID').disabled = false;
    document.getElementById('invHeaderBg').classList.remove('debt-header');
    document.getElementById('lblInvoiceTitle').innerText = "HÓA ĐƠN BÁN HÀNG";
    document.getElementById('lblInvoiceTitle').style.color = "#004e92";
    document.getElementById('lblTotalLabel').style.color = "#333";
    document.getElementById('lblTotalLabel').innerText = "TỔNG CỘNG:";
    document.getElementById('rowPaidAmount').style.display = 'none';
    cartItems = [];
    const now = new Date();
    document.getElementById('inpTime').value = now.toTimeString().substring(0,5);
    generateRandomInvoiceID();
    document.getElementById('inpName').value = "Khách lẻ";
    document.getElementById('inpPhone').value = "";
    document.getElementById('inpDiscount').value = "";
    document.getElementById('inpSurcharge').value = "";
    document.getElementById('inpPrepaid').value = "";
    document.getElementById('inpPublicNote').value = "";
    document.getElementById('inpInternalNote').value = "";
    document.getElementById('appliedCreditValue').value = 0;
    document.getElementById('toggleOldDebt').checked = false;
    document.getElementById('oldDebtToggleBox').style.display = 'none';
    setPayment('CASH');
    setPaymentStatus(false);
    renderAll();
    handleProductChange();
}




function addToCart() {
    if(isDebtViewMode) return alert("Thoát chế độ xem nợ trước!");
    if(isOrderSaved && !isEditMode) {
        // Nếu đơn trước đã lưu xong mà bấm thêm sản phẩm mới, tự động tạo đơn mới sạch sẽ
        startNewOrderClean(true);
    }
    const qty = parseInt(document.getElementById('inpQty').value);
    const { faceValue, sellingPrice, costPrice, productName } = calculateSellingPrice();
    if(qty<1) return;
    
    const domCodes = document.querySelectorAll('.sub-code');
    const domSeris = document.querySelectorAll('.sub-serial');
    
    const stockKey = getInventoryKey(productName, faceValue);
    let usedStockCount = 0;
    let list = [];

    for(let i=0; i<qty; i++) {
        let c = domCodes[i] ? domCodes[i].value.trim() : "";
        let s = domSeris[i] ? domSeris[i].value.trim() : "";
        let fromStock = false;

        if(c === "" && Array.isArray(inventory[stockKey]) && inventory[stockKey].length > 0) {
            let item = inventory[stockKey].shift(); 
            c = item.code;
            s = item.serial;
            fromStock = true;
            usedStockCount++;
        }

        list.push({code: c, serial: s, fromStock: fromStock});
    }

    if(usedStockCount > 0) {
        saveInventory();
    }

    cartItems.push({ cardType: productName, faceValue, price: sellingPrice, costPrice: costPrice, qty, cardList: list, total: sellingPrice*qty });
    isOrderSaved = false;
    renderAll();
    handleProductChange();
    document.getElementById('inpQty').value=1;
    renderInputFields();
}




function removeItem(i) {
    if(isDebtViewMode) return;
    const removed = cartItems.splice(i,1);
    if (!isOrderSaved && !isEditMode) {
        returnUncommittedCartStock(removed);
    }
    isOrderSaved = false;
    renderAll();
    handleProductChange();
}

function resetCart() {
    if(confirm("Làm mới toàn bộ giỏ hàng hiện tại?")) {
        if (!isOrderSaved && !isEditMode) {
            returnUncommittedCartStock(cartItems);
        }
        startNewOrderClean(true);
    }
}

function copyCartCodes() {
    if (!cartItems || cartItems.length === 0) return alert("Giỏ hàng đang trống!");
    const invId = document.getElementById('inpInvoiceID').value || "TB";
    let lines = [`📌 ĐƠN HÀNG: ${invId} (${document.getElementById('inpName').value || 'Khách lẻ'})`];
    let hasCode = false;
    cartItems.forEach((item, idx) => {
        let faceStr = item.faceValue ? ` ${formatMoney(item.faceValue)}` : "";
        lines.push(`${idx + 1}. ${item.cardType}${faceStr} (SL: ${item.qty}):`);
        if (Array.isArray(item.cardList)) {
            item.cardList.forEach((c, cIdx) => {
                if (c && (c.code || c.serial)) {
                    hasCode = true;
                    lines.push(`   #${cIdx + 1} Mã: ${c.code || 'Trống'}${c.serial ? ' | Seri: ' + c.serial : ''}`);
                }
            });
        }
    });
    if (!hasCode) lines.push("(Đơn hàng không kèm mã thẻ/seri chi tiết)");
    const text = lines.join("\n");
    navigator.clipboard.writeText(text)
        .then(() => alert("✅ Đã copy toàn bộ thông tin mã thẻ vào bộ nhớ tạm! Bạn có thể dán gửi ngay qua Zalo/Messenger."))
        .catch(() => prompt("Copy thủ công bên dưới:", text));
}

function copyHistoryDetailCodes() {
    const invId = document.getElementById('hist_outInvoiceID')?.innerText || "";
    const order = getAllInvoiceHistory().find(x => x && x.id === invId);
    if (!order || !Array.isArray(order.cart) || order.cart.length === 0) return alert("Không tìm thấy mã thẻ trong đơn này!");
    let lines = [`📌 ĐƠN HÀNG: ${order.id} (${order.name || 'Khách lẻ'})`];
    order.cart.forEach((item, idx) => {
        let faceStr = item.faceValue ? ` ${formatMoney(item.faceValue)}` : "";
        lines.push(`${idx + 1}. ${item.cardType}${faceStr} (SL: ${item.qty}):`);
        if (Array.isArray(item.cardList)) {
            item.cardList.forEach((c, cIdx) => {
                if (c && (c.code || c.serial)) {
                    lines.push(`   #${cIdx + 1} Mã: ${c.code || 'Trống'}${c.serial ? ' | Seri: ' + c.serial : ''}`);
                }
            });
        }
    });
    const text = lines.join("\n");
    navigator.clipboard.writeText(text)
        .then(() => alert("✅ Đã copy mã thẻ của đơn " + order.id + "!"))
        .catch(() => prompt("Copy thủ công bên dưới:", text));
}




function renderAll(skipCalc=false) {
    const listUI = document.getElementById('cartListUI');
    document.getElementById('itemCountBadge').innerText = cartItems.length;
    if(cartItems.length===0) listUI.innerHTML = '<p style="color:#999;font-style:italic;text-align:center;padding:10px;">Chưa có sản phẩm.</p>';
    else {
        listUI.innerHTML = cartItems.map((item, i) => {
            let faceDisplay = formatMoney(item.faceValue);
            let label = `${item.cardType}` + (item.faceValue && item.faceValue!=="0" ? (!isNaN(parseFloat(item.faceValue)) ? ` x${faceDisplay}` : ` (${faceDisplay})`) : "");
            return `<div class="temp-item"><div><strong>${i+1}. ${label}</strong> (${formatMoney(item.price)}) x${item.qty}</div><button class="btn-mini btn-danger" onclick="removeItem(${i})">X</button></div>`;
        }).join('');
    }




    updateInvoiceHeader();
    let total = cartItems.reduce((s,i)=>s+i.total,0);
    document.getElementById('invoiceTableBody').innerHTML = cartItems.map(item => {
        let faceDisplay = formatMoney(item.faceValue);
        let fullName = `${item.cardType}` + (item.faceValue && item.faceValue!=="0" ? (!isNaN(parseFloat(item.faceValue)) ? ` x${faceDisplay}` : ` (${faceDisplay})`) : "");
        let details = item.cardList.map(c => {
            if(!c.code && !c.serial) return '';
            return `<div class="card-box">${c.code?`<span class="card-line"><span class="card-label">MÃ:</span><span class="card-val">${formatReadableCode(c.code)}</span></span>`:''} ${c.serial?`<span class="card-line" style="margin-top:2px;border-top:1px dotted #ccc;padding-top:2px;"><span class="card-label" style="color:#7f8c8d;">SERI:</span><span class="card-seri">${c.serial}</span></span>`:''}</div>`;
        }).join('');
        return `<tr><td style="padding-top:10px;"><span class="item-name">${fullName}</span><div class="item-sub">${details}</div></td><td style="text-align:center;padding-top:10px;font-weight:bold;">${item.qty}</td><td style="text-align:right;padding-top:10px;font-weight:bold;">${formatMoney(item.total)}</td></tr>`;
    }).join('');




    if(!skipCalc) {
    const disc = parseInt(document.getElementById('inpDiscount').value, 10) || 0;
    const sur = parseInt(document.getElementById('inpSurcharge').value, 10) || 0;
    const surLbl = document.getElementById('inpSurchargeLabel').value || "Phụ thu";
    const cred = parseInt(document.getElementById('appliedCreditValue').value, 10) || 0;
    const pre = parseInt(document.getElementById('inpPrepaid').value, 10) || 0;
    let oldDebt = 0;




    if(document.getElementById('toggleOldDebt').checked) {
        oldDebt = parseInt(document.getElementById('oldDebtToggleBox').dataset.amount, 10) || 0;
    }




    // ÉP KIỂU SỐ HỌC VÀ TÍNH TOÁN THEO CÔNG THỨC CHUẨN
    const billTotal = parseInt(total, 10) || 0;
    const billCurrent = billTotal + sur - disc; // Chỉ tính riêng tiền hàng lần này
    const final = (billCurrent + oldDebt) - cred; // Tổng phải thu (Đã trừ tiền ví)
        document.getElementById('outSubTotal').innerText = formatMoney(total) + " đ";
        
        const rSur = document.getElementById('rowSurcharge'); rSur.style.display = sur>0?'flex':'none';
        document.getElementById('outSurchargeLabel').innerText = surLbl+":"; document.getElementById('outSurchargeVal').innerText = "+"+formatMoney(sur)+" đ";
        
        document.getElementById('rowDiscount').style.display = disc>0?'flex':'none'; document.getElementById('outDiscountVal').innerText = "-"+formatMoney(disc)+" đ";
        document.getElementById('rowCreditUsed').style.display = cred>0?'flex':'none'; document.getElementById('outCreditUsedVal').innerText = "-"+formatMoney(cred)+" đ";
        document.getElementById('rowOldDebtAdded').style.display = oldDebt>0?'flex':'none'; document.getElementById('outOldDebtAddedVal').innerText = "+"+formatMoney(oldDebt)+" đ";
        
               // 1. Giữ số gốc cho hệ thống đọc ngầm
        document.getElementById('outFinalTotal').innerText = formatMoney(final) + " đ";
        if(document.getElementById('displaySubTotalEnd')) document.getElementById('displaySubTotalEnd').innerText = formatMoney(final) + " đ";




        // 2. Kéo dòng "Khách đưa mặt" lên trên và chốt "TỔNG CỘNG" xuống dưới cùng
        const rCustGiven = document.getElementById('rowCustomerGiven');
        const lblTotal = document.getElementById('lblTotalLabel');
        const displayFinal = document.getElementById('displayFinalEnd');




        if(rCustGiven) {
            if(pre > 0) {
                rCustGiven.style.display = "flex";
                document.getElementById('outCustomerGiven').innerText = "- " + formatMoney(pre) + " đ";
            } else {
                rCustGiven.style.display = "none";
            }
        }




        if(lblTotal && displayFinal) {
            let remain = final - pre;
            if (remain > 0) {
                lblTotal.innerText = pre > 0 ? "CÒN NỢ LẠI:" : "TỔNG CỘNG:";
                lblTotal.style.color = "#c0392b"; // Đỏ
                displayFinal.innerText = formatMoney(remain) + " đ";
                displayFinal.style.color = "#c0392b";
            } else if (remain < 0) {
                lblTotal.innerText = "TIỀN THỪA KHÁCH:";
                lblTotal.style.color = "#27ae60"; // Xanh
                displayFinal.innerText = formatMoney(Math.abs(remain)) + " đ";
                displayFinal.style.color = "#27ae60";
            } else {
                lblTotal.innerText = "TỔNG CỘNG:";
                lblTotal.style.color = "#333"; 
                displayFinal.innerText = formatMoney(final) + " đ";
                displayFinal.style.color = "#c0392b";
            }
        }




if(pre>=final && final>0 && !isPaid) setPaymentStatus(true);
setPaymentStatus(isPaid);
    }
}




function updateInvoiceHeader() {
    document.getElementById('outBrandName').innerText = storeConfig.brandName;
    document.getElementById('outSlogan').innerText = storeConfig.slogan;
    document.getElementById('outHotline').innerText = `☎ Hotline: ${storeConfig.hotline}`;
    document.getElementById('outHotlineFooter').innerText = storeConfig.hotline;
    const name = document.getElementById('inpName').value;
    const phone = document.getElementById('inpPhone').value;
    const date = document.getElementById('inpDate').value;
    const dStr = date ? `${date.split('-')[2]}/${date.split('-')[1]}/${date.split('-')[0]}` : "...";
    let code = document.getElementById('inpInvoiceID').value.toUpperCase();
    if(!code.startsWith("TB")) code="TB"+code;
    document.getElementById('outDate').innerText = `${dStr} - ${document.getElementById('inpTime').value}`;
    document.getElementById('outName').innerText = name || "Khách lẻ";
    document.getElementById('outInvoiceID').innerText = code;
    document.getElementById('rowPhone').style.display = phone?"flex":"none";
    document.getElementById('outPhone').innerText = phone;
    
    const pubNote = document.getElementById('inpPublicNote').value;
    document.getElementById('outPublicNoteBox').style.display = pubNote.trim()?'block':'none';
    document.getElementById('outPublicNoteContent').innerText = pubNote;
 const bankRow = document.getElementById('outBankInfoRow');
    if (bankRow) {
        if (currentPaymentMethod === 'TRANSFER') {
            bankRow.style.display = 'flex';
            let activeBank = getSelectedBank();
            document.getElementById('outBankNameDetails').innerText = activeBank.id;
            document.getElementById('outBankAccName').innerText = activeBank.name;
        } else {
            bankRow.style.display = 'none';
        }
    }
    checkCreditDisplay();
    if (_renderCodesTimer) clearTimeout(_renderCodesTimer);
    _renderCodesTimer = setTimeout(() => {
        renderTrackingCodes(code);
        renderQR();
    }, 120);
}
// --- PAYMENT & ACTIONS ---
function getSelectedBank() {
    if (currentBankIndex === 2 && storeConfig.bankId2) return { id: storeConfig.bankId2, num: storeConfig.accNum2, name: storeConfig.accName2 };
    if (currentBankIndex === 3 && storeConfig.bankId3) return { id: storeConfig.bankId3, num: storeConfig.accNum3, name: storeConfig.accName3 };
    return { id: storeConfig.bankId, num: storeConfig.accNum, name: storeConfig.accName };
}




function selectBank(idx) {
    currentBankIndex = idx;
    document.querySelectorAll('.btn-bank').forEach(b => b.classList.remove('active'));
    document.getElementById('btnBank' + idx).classList.add('active');
    updateInvoiceHeader();
    renderQR();
}


function setPayment(m) { 
    currentPaymentMethod = m; 
    document.querySelectorAll('.pay-btn:not(.status-btn):not(.btn-bank)').forEach(b=>b.classList.remove('active'));
    document.getElementById(`btnPay${m}`).classList.add('active');
    document.getElementById('outPaymentMethod').innerText = m==='CASH'?'Tiền mặt':(m==='TRANSFER'?'Chuyển khoản':'Ghi nợ');

    document.getElementById('subBankOptions').style.display = m === 'TRANSFER' ? 'flex' : 'none';

    if(m==='DEBT') setPaymentStatus(false);
    renderQR();
}


function setPaymentStatus(status) {
    isPaid = status;
    
    const btnUnpaid = document.getElementById('btnStatusUnpaid');
    const btnPaid = document.getElementById('btnStatusPaid');
    
    if (btnUnpaid && btnPaid) {
        if (status) {
            btnPaid.classList.add('active-paid');
            btnUnpaid.classList.remove('active-unpaid');
        } else {
            btnUnpaid.classList.add('active-unpaid');
            btnPaid.classList.remove('active-paid');
        }
    }
    
    const statusHtml = document.getElementById('outPaymentStatusHTML');
    if (statusHtml) {
        if (status) {
            statusHtml.innerHTML = '<span class="paid-stamp">ĐÃ THANH TOÁN</span>';
            document.getElementById('qrSection').style.display = 'none'; 
        } else {
            if (currentPaymentMethod === 'DEBT') {
                statusHtml.innerHTML = '<span class="debt-stamp">GHI NỢ</span>';
            } else {
                statusHtml.innerHTML = '<span style="color:#e74c3c;font-weight:bold;">Chưa thanh toán</span>';
            }
            renderQR(); 
        }
    }
}




function buildVietQRPayload(bankId, accNum, amount, addInfo) {
    const bins = {
        MB: "970422", MBBANK: "970422",
        VCB: "970436", VIETCOMBANK: "970436",
        TCB: "970407", TECHCOMBANK: "970407",
        VPB: "970432", VPBANK: "970432",
        ACB: "970416",
        ICB: "970415", VIETINBANK: "970415",
        BIDV: "970418",
        TPB: "970423", TPBANK: "970423",
        MOMO: "971025"
    };
    const bKey = String(bankId || "MB").trim().toUpperCase();
    const bin = bins[bKey] || (/^\d{6}$/.test(bKey) ? bKey : "970422");
    const cleanAcc = String(accNum || "").replace(/[^a-zA-Z0-9]/g, "");
    const tlv = (id, val) => {
        const s = String(val);
        return id + String(s.length).padStart(2, "0") + s;
    };
    const cleanInfo = String(addInfo || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9 ]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, 50);

    const merchantInfo = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", cleanAcc)) + tlv("02", "QRIBFTTA");
    const numAmt = Math.round(Number(amount) || 0);
    let payload = tlv("00", "01") + tlv("01", numAmt > 0 ? "12" : "11") + tlv("38", merchantInfo) + tlv("53", "704");
    if (numAmt > 0) payload += tlv("54", String(numAmt));
    payload += tlv("58", "VN");
    if (cleanInfo) payload += tlv("62", tlv("08", cleanInfo));
    payload += "6304";

    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}

function generateLocalVietQRDataUrl(bankId, accNum, amount, addInfo) {
    try {
        if (typeof QRCode === "undefined") return "";
        const payload = buildVietQRPayload(bankId, accNum, amount, addInfo);
        const tempDiv = document.createElement("div");
        tempDiv.style.display = "none";
        document.body.appendChild(tempDiv);
        new QRCode(tempDiv, {
            text: payload,
            width: 200,
            height: 200,
            correctLevel: QRCode.CorrectLevel.M
        });
        const canvas = tempDiv.querySelector("canvas");
        const img = tempDiv.querySelector("img");
        const dataUrl = canvas ? canvas.toDataURL("image/png") : (img ? img.src : "");
        document.body.removeChild(tempDiv);
        return dataUrl;
    } catch (e) {
        console.error("Local QR fallback error:", e);
        return "";
    }
}

function setVietQRImage(imgEl, bankId, accNum, accName, amount, addInfo) {
    if (!imgEl) return;
    const cleanBank = String(bankId || storeConfig.bankId || "MB").trim() || "MB";
    const cleanAcc = String(accNum || storeConfig.accNum || defaultStoreConfig.accNum || "").replace(/[^a-zA-Z0-9]/g, "");
    const cleanName = String(accName || storeConfig.accName || "").trim();
    const numAmt = Math.max(0, Math.round(Number(amount) || 0));
    const cleanInfo = String(addInfo || "").trim();

    if (!cleanAcc) {
        imgEl.style.display = "none";
        return;
    }
    imgEl.style.display = "block";
    imgEl.removeAttribute("crossorigin");

    const qrKey = `${cleanBank}|${cleanAcc}|${cleanName}|${numAmt}|${cleanInfo}`;
    if (imgEl.dataset.qrKey === qrKey && imgEl.dataset.loadedOk === "1") {
        return;
    }
    imgEl.dataset.qrKey = qrKey;
    imgEl.dataset.loadedOk = "0";

    const localDataUrl = generateLocalVietQRDataUrl(cleanBank, cleanAcc, numAmt, cleanInfo);
    if (localDataUrl) {
        imgEl.dataset.localQr = localDataUrl;
        imgEl.src = localDataUrl;
        imgEl.dataset.loadedOk = "1";
    }

    const urls = [
        `https://img.vietqr.io/image/${encodeURIComponent(cleanBank)}-${encodeURIComponent(cleanAcc)}-compact.png?amount=${numAmt}&addInfo=${encodeURIComponent(cleanInfo)}&accountName=${encodeURIComponent(cleanName)}`,
        `https://img.vietqr.io/image/${encodeURIComponent(cleanBank)}-${encodeURIComponent(cleanAcc)}-compact.svg?amount=${numAmt}&addInfo=${encodeURIComponent(cleanInfo)}&accountName=${encodeURIComponent(cleanName)}`,
        `https://qr.sepay.vn/img?acc=${encodeURIComponent(cleanAcc)}&bank=${encodeURIComponent(cleanBank)}&amount=${numAmt}&des=${encodeURIComponent(cleanInfo)}&template=compact`
    ];

    let attempt = 0;
    const tryLoadRemote = () => {
        if (imgEl.dataset.qrKey !== qrKey) return;
        if (attempt >= urls.length) {
            if (localDataUrl) {
                imgEl.src = localDataUrl;
                imgEl.dataset.loadedOk = "1";
            }
            return;
        }
        const testUrl = urls[attempt++];
        const probe = new Image();
        probe.referrerPolicy = "no-referrer";
        probe.onload = () => {
            if (imgEl.dataset.qrKey === qrKey) {
                imgEl.src = testUrl;
                imgEl.dataset.loadedOk = "1";
            }
        };
        probe.onerror = () => {
            tryLoadRemote();
        };
        probe.src = testUrl;
    };
    tryLoadRemote();
}

function renderQR(amt=null) {
    const qr = document.getElementById('qrSection');
    if (!qr) return;
    if(isPaid && !isDebtViewMode) {
        qr.style.display = 'none';
        return;
    }

    let total = parseInt((document.getElementById('outFinalTotal')?.innerText || "0").replace(/\D/g,''))||0;
    let pre = parseInt(document.getElementById('inpPrepaid')?.value)||0;
    let final = amt!==null ? amt : (total - pre);
    
    if(final<=0 || (!isDebtViewMode && (currentPaymentMethod==='CASH' || isPaid) && pre>=total)) { qr.style.display='none'; return; }
    qr.style.display='block';
    
    let activeBank = getSelectedBank();
    let bankId = activeBank.id || storeConfig.bankId || "MB";
    let accNum = activeBank.num || storeConfig.accNum || defaultStoreConfig.accNum || "";
    let accName = activeBank.name || storeConfig.accName || "";
    
    const content = (isDebtViewMode?"Tra no ":"TT ") + (document.getElementById('inpInvoiceID')?.value || "");
    setVietQRImage(document.getElementById('qrImage'), bankId, accNum, accName, final, content);
    
    document.getElementById('qrBankName').innerText = bankId;
    document.getElementById('qrAccNum').innerText = `STK: ${accNum}`;
    if(document.getElementById('qrAccName')) {
        document.getElementById('qrAccName').innerText = `Chủ TK: ${accName}`;
    }
}




// --- DEBT & CUSTOMER LOGIC ---
function getDebtList() { return JSON.parse(localStorage.getItem('thebao_debt_list')||"[]"); }
function saveDebtList(l) { localStorage.setItem('thebao_debt_list', JSON.stringify(l)); }




function checkOldDebt(phone) {
    const list = getDebtList();
    const box = document.getElementById('oldDebtToggleBox');
    if(phone.length<8) { box.style.display='none'; return; }
    let total = list.filter(d => d.phone===phone && Number(d.remainingAmount) > 0)
                .reduce((s,d) => s + Number(d.remainingAmount), 0);
    if(total>0) {
        box.style.display='flex'; document.getElementById('lblOldDebtVal').innerText = formatMoney(total);
        box.dataset.amount = total;
    } else { box.style.display='none'; document.getElementById('toggleOldDebt').checked=false; box.dataset.amount=0; }
    renderAll();
}




function addDebtRecord(order, total, paid=0) {
    let list = getDebtList();
    if(list.some(d=>d.orderId===order.id)) return;
    list.unshift({ id:'DEBT_'+Date.now(), orderId:order.id, date:order.date, name:order.name, phone:order.phone, originalAmount:total, paidAmount:paid, remainingAmount:(Number(total) - Number(paid)), items:order.cart });
    saveDebtList(list);
}




function payOldDebtFully(phone) {
    let list = getDebtList(), changed=false;
    list.forEach(d => { if(d.phone===phone && d.remainingAmount>0) { d.paidAmount+=d.remainingAmount; d.remainingAmount=0; changed=true; updateHistoryPaidStatus(d.orderId); } });
    if(changed) saveDebtList(list);
}




function updateHistoryPaidStatus(id) {
    let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    let item = h.find(x=>x.id===id); if(item) { item.isPaid=true; localStorage.setItem('invoiceHistory', JSON.stringify(h)); }
}




function generateCustomerID() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "KH_" + result; 
}




function confirmOrder() {
    if(isDebtViewMode) return;
    if(cartItems.length===0) return alert("Giỏ hàng trống!");
    if(isOrderSaved) return alert("Đơn đã lưu!");
    
    let phoneInput = document.getElementById('inpPhone').value.trim();
    let nameInput = document.getElementById('inpName').value.trim();
    
    if (!phoneInput) {
        phoneInput = generateCustomerID();
        document.getElementById('inpPhone').value = phoneInput;
        if(!nameInput || nameInput === "Khách lẻ") {
            nameInput = "Khách " + phoneInput;
            document.getElementById('inpName').value = nameInput;
        }
    }




// outFinal chính là (Nợ cũ + Bill mới - Ví trả trước)
let outFinal = parseInt(document.getElementById('outFinalTotal').innerText.replace(/\D/g,''), 10) || 0;
let pre = parseInt(document.getElementById('inpPrepaid').value, 10) || 0;




// Công thức chuẩn: Nợ mới = Tổng phải thu (outFinal) - Khách đưa mặt (pre)
let remain = outFinal - pre; 




const oldDebtOk = document.getElementById('toggleOldDebt').checked;




    // Nếu khách gộp nợ cũ vào đơn này, phải gạch sạch các khoản nợ cũ TRƯỚC khi tạo bản ghi nợ gộp mới
    if(oldDebtOk) payOldDebtFully(phoneInput);

    // FIX LOGIC: Thêm điều kiện !isPaid để bỏ qua ghi nợ nếu đã tick trạng thái đã thanh toán
    if(!isPaid && (currentPaymentMethod==='DEBT' || remain > 0)) {
        const order = {
            id: document.getElementById('inpInvoiceID').value,
            date: document.getElementById('inpDate').value,
            name: nameInput,
            phone: phoneInput,
            cart: JSON.parse(JSON.stringify(cartItems))
        };
        addDebtRecord(order, outFinal, pre); 
        alert(`📖 Đã chốt sổ công nợ cho mã khách: ${phoneInput}!`);
    } else if (remain < 0) {
        let excessAmt = Math.abs(remain);
        if (confirm(`💰 Khách dư tiền thừa ${formatMoney(excessAmt)} đ. Lưu vào mục Tiền thừa của khách (${phoneInput})?`)) {
            let c = getCredits();
            c[phoneInput] = (Number(c[phoneInput]) || 0) + excessAmt;
            localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
            addCreditLog(phoneInput, excessAmt, "Lưu tiền thừa từ đơn " + document.getElementById('inpInvoiceID').value);
            if (typeof syncCreditToCloud === 'function') syncCreditToCloud();
        }
    }
    
    let cred = parseInt(document.getElementById('appliedCreditValue').value)||0;
    if(cred>0) {
        useCredit(phoneInput, cred);
        addCreditLog(phoneInput, -cred, "Trừ vào đơn " + document.getElementById('inpInvoiceID').value);
    }

    updateInvoiceHeader();
    saveHistory(true);
    
    if(!customerList.some(c=>c && c.phone===phoneInput)) { 
        const newCus = {name:nameInput, phone:phoneInput};
        customerList.push(newCus); 
        localStorage.setItem('thebao_customers', JSON.stringify(customerList)); 
        if(typeof saveToCloudCollection === 'function') saveToCloudCollection('Customers', phoneInput, newCus);
    }
    
    isOrderSaved = true;
    alert("✅ Đã lưu đơn hàng! Bạn có thể bấm In Hóa Đơn, Tải Ảnh hoặc Copy Mã ngay, hoặc bấm '➕ ĐƠN MỚI' để tạo bill tiếp theo.");
}




function saveHistory(isNew=true) {
    const id = document.getElementById('inpInvoiceID').value;
    const credUsed = parseInt(document.getElementById('appliedCreditValue').value, 10) || 0;
const preVal = parseInt(document.getElementById('inpPrepaid').value, 10) || 0;




const item = {
    id: id, date: document.getElementById('inpDate').value, time: document.getElementById('inpTime').value,
    name: document.getElementById('inpName').value, phone: document.getElementById('inpPhone').value,
    discount: document.getElementById('inpDiscount').value, surcharge: document.getElementById('inpSurcharge').value,
    surchargeLabel: document.getElementById('inpSurchargeLabel').value || "Phụ thu",
    publicNote: document.getElementById('inpPublicNote').value, internalNote: document.getElementById('inpInternalNote').value,
    payment: currentPaymentMethod, isPaid: isPaid, cart: JSON.parse(JSON.stringify(cartItems)),
    creditUsed: credUsed,
    prepaid: preVal,
    total: (parseInt(document.getElementById('outSubTotal').innerText.replace(/\D/g,''), 10) || 0) 
         + (parseInt(document.getElementById('inpSurcharge').value, 10) || 0) 
         - (parseInt(document.getElementById('inpDiscount').value, 10) || 0)
         - credUsed
};




let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");




if(isNew) { 
    // Cấm tuyệt đối việc ghi đè đơn cũ. Nếu vô tình trùng ID thì tự đẻ ra ID phụ.
    if(h.some(x=>x.id===id)) {
        item.id = id + "_" + Math.floor(Math.random() * 1000);
    }
    h.unshift(item); 
}
else { 
    let idx = h.findIndex(x=>x.id===id); 
    if(idx !== -1) h[idx] = item; 
}
    h.sort((a,b)=>new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time));


 // --- FIX LỖI 2: DỌN RÁC TỰ ĐỘNG ---
 if (h.length > 150) {
     // Cắt bỏ phần dư thừa (từ phần tử thứ 150 trở đi)
     let excess = h.splice(150);
     // Đẩy phần dư vào một mảng lưu trữ chìm (Archive) để bộ nhớ chính nhẹ tênh
     let archive = JSON.parse(localStorage.getItem('invoiceHistory_archive') || "[]");
     archive = archive.concat(excess);
     localStorage.setItem('invoiceHistory_archive', JSON.stringify(archive));
 }


 localStorage.setItem('invoiceHistory', JSON.stringify(h));
 calculateTodayRevenue();
}




// --- EDIT MODE ---
function restoreHistory(id) {
    let h = getAllInvoiceHistory().find(x=>x && x.id===id);
    if(!h) return;
    if(cartItems.length>0 && !isEditMode && !isOrderSaved) {
        if(!confirm("Đè đơn hiện tại?")) return;
        returnUncommittedCartStock(cartItems);
    }
    closeModal('historyModal');
    isEditMode=true;
    
    document.getElementById('groupStandardBtns').style.display='none';
    document.getElementById('groupEditBtns').style.display='block';
    document.getElementById('editModeNotice').style.display='flex';
    document.getElementById('lblEditID').innerText = h.id;
    document.getElementById('inpInvoiceID').disabled=true;
    
    document.getElementById('inpInvoiceID').value=h.id; document.getElementById('inpDate').value=h.date; document.getElementById('inpTime').value=h.time;
    document.getElementById('inpName').value=h.name; document.getElementById('inpPhone').value=h.phone;
    document.getElementById('inpDiscount').value=h.discount; document.getElementById('inpSurcharge').value=h.surcharge||"";
    document.getElementById('inpPublicNote').value=h.publicNote||""; document.getElementById('inpInternalNote').value=h.internalNote||"";
    cartItems=h.cart; setPayment(h.payment||'CASH'); setPaymentStatus(h.isPaid);
    renderAll();
}




function cancelEditMode() {
    isEditMode=false; isDebtViewMode=false;
    document.getElementById('groupStandardBtns').style.display='block';
    document.getElementById('groupEditBtns').style.display='none';
    document.getElementById('groupDebtBtns').style.display='none';
    document.getElementById('editModeNotice').style.display='none';
    document.getElementById('inpInvoiceID').disabled=false;
    document.getElementById('invHeaderBg').classList.remove('debt-header');
    document.getElementById('lblInvoiceTitle').innerText="HÓA ĐƠN BÁN HÀNG"; document.getElementById('lblInvoiceTitle').style.color="#004e92";
    document.getElementById('lblTotalLabel').style.color="#333"; document.getElementById('lblTotalLabel').innerText="TỔNG CỘNG:";
    document.getElementById('rowPaidAmount').style.display='none';
    cartItems=[]; generateRandomInvoiceID(); document.getElementById('inpSurcharge').value=""; document.getElementById('inpPrepaid').value="";
    renderAll();
}




function saveEditedOrder() {
    if(!isEditMode) return;
    saveHistory(false);
    
    let id = document.getElementById('inpInvoiceID').value;
    let list = getDebtList();
    let d = list.find(x=>x.orderId===id);
    if(d) {
        let tot = parseInt(document.getElementById('outFinalTotal').innerText.replace(/\D/g,''));
        let pre = parseInt(document.getElementById('inpPrepaid').value)||0;
        d.name = document.getElementById('inpName').value; d.phone = document.getElementById('inpPhone').value;
        d.originalAmount=tot; 
        if(isPaid) { d.paidAmount=tot; d.remainingAmount=0; } else { d.paidAmount=pre; d.remainingAmount=tot-pre; }
        saveDebtList(list);
    }
    alert("✅ Đã cập nhật!"); cancelEditMode();
}




// --- HISTORY DETAIL VIEW ---
function viewHistoryDetail(id) {
    let h = getAllInvoiceHistory().find(x=>x && x.id===id);
    if(!h) return;
    document.getElementById('hist_lblInvoiceTitle').innerText = "HÓA ĐƠN BÁN HÀNG";




    document.getElementById('hist_outBrandName').innerText = storeConfig.brandName;
    document.getElementById('hist_outSlogan').innerText = storeConfig.slogan;
    document.getElementById('hist_outHotline').innerText = `☎ Hotline: ${storeConfig.hotline}`;
    document.getElementById('hist_outHotlineFooter').innerText = storeConfig.hotline;
    document.getElementById('hist_outInvoiceID').innerText = h.id;
    document.getElementById('hist_outDate').innerText = `${h.date.split('-')[2]}/${h.date.split('-')[1]}/${h.date.split('-')[0]} - ${h.time}`;
    document.getElementById('hist_outName').innerText = h.name;
    document.getElementById('hist_outPhone').innerText = h.phone;
    document.getElementById('hist_rowPhone').style.display = h.phone ? 'flex' : 'none';
    document.getElementById('hist_outPaymentMethod').innerText = h.payment === 'CASH' ? 'Tiền mặt' : (h.payment === 'TRANSFER' ? 'Chuyển khoản' : 'Ghi nợ');
    
    if(h.isPaid) document.getElementById('hist_outPaymentStatusHTML').innerHTML = '<span class="paid-stamp">ĐÃ THANH TOÁN</span>';
    else document.getElementById('hist_outPaymentStatusHTML').innerHTML = h.payment === 'DEBT' ? '<span class="debt-stamp">GHI NỢ</span>' : '<span style="color:#e74c3c;font-weight:bold;">Chưa thanh toán</span>';




    document.getElementById('hist_invoiceTableBody').innerHTML = h.cart.map(item => {
        let faceDisplay = formatMoney(item.faceValue);
        let fullName = `${item.cardType}` + (item.faceValue && item.faceValue!=="0" ? (!isNaN(parseFloat(item.faceValue)) ? ` x${faceDisplay}` : ` (${faceDisplay})`) : "");
        let details = item.cardList ? item.cardList.map(c => {
            if(!c.code && !c.serial) return '';
            return `<div class="card-box">${c.code?`<span class="card-line"><span class="card-label">MÃ:</span><span class="card-val">${formatReadableCode(c.code)}</span></span>`:''} ${c.serial?`<span class="card-line" style="margin-top:2px;border-top:1px dotted #ccc;padding-top:2px;"><span class="card-label" style="color:#7f8c8d;">SERI:</span><span class="card-seri">${c.serial}</span></span>`:''}</div>`;
        }).join('') : '';
        return `<tr><td style="padding-top:10px;"><span class="item-name">${fullName}</span><div class="item-sub">${details}</div></td><td style="text-align:center;padding-top:10px;font-weight:bold;">${item.qty}</td><td style="text-align:right;padding-top:10px;font-weight:bold;">${formatMoney(item.total)}</td></tr>`;
    }).join('');




       let total = h.cart.reduce((s,i)=>s+i.total,0);
    let disc = parseInt(h.discount)||0;
    let sur = parseInt(h.surcharge)||0;
    let cred = parseInt(h.creditUsed)||0;
    let final = total + sur - disc - cred;
    
    document.getElementById('hist_outSubTotal').innerText = formatMoney(total) + " đ";
    let surLabel = h.surchargeLabel || "Phụ thu";
document.getElementById('hist_rowSurcharge').style.display = sur>0?'flex':'none';
document.getElementById('hist_outSurchargeLabel').innerText = surLabel + ":";
document.getElementById('hist_outSurchargeVal').innerText = "+"+formatMoney(sur)+" đ";
    document.getElementById('hist_rowDiscount').style.display = disc>0?'flex':'none';
    document.getElementById('hist_outDiscountVal').innerText = "-"+formatMoney(disc)+" đ";
    
    document.getElementById('hist_rowCreditUsed').style.display = cred>0?'flex':'none';
    if(document.getElementById('hist_outCreditUsedVal')) document.getElementById('hist_outCreditUsedVal').innerText = "-"+formatMoney(cred)+" đ";
    
    document.getElementById('hist_outFinalTotal').innerText = formatMoney(final) + " đ";
    
    let pre = parseInt(h.prepaid) || 0;
    const hist_rCustGiven = document.getElementById('hist_rowCustomerGiven');
    const hist_rChange = document.getElementById('hist_rowChange');
    const hist_rRemDebt = document.getElementById('hist_rowRemainingDebt');




    if(hist_rCustGiven && hist_rChange && hist_rRemDebt) {
        if(pre > 0) {
            hist_rCustGiven.style.display = "flex";
            document.getElementById('hist_outCustomerGiven').innerText = formatMoney(pre) + " đ";
            if(pre > final) {
                hist_rChange.style.display = "flex";
                document.getElementById('hist_outChange').innerText = formatMoney(pre - final) + " đ";
                hist_rRemDebt.style.display = "none";
            } else if (pre < final) {
                hist_rChange.style.display = "none";
                hist_rRemDebt.style.display = "flex";
                document.getElementById('hist_outRemainingDebt').innerText = formatMoney(final - pre) + " đ";
            } else {
                hist_rChange.style.display = "none";
                hist_rRemDebt.style.display = "none";
            }
        } else {
            hist_rCustGiven.style.display = "none";
            hist_rChange.style.display = "none";
            if (final > 0 && h.payment !== 'CASH' && !h.isPaid) {
                hist_rRemDebt.style.display = "flex";
                document.getElementById('hist_outRemainingDebt').innerText = formatMoney(final) + " đ";
            } else {
                hist_rRemDebt.style.display = "none";
            }
        }
    }




    document.getElementById('hist_outPublicNoteBox').style.display = h.publicNote && h.publicNote.trim() ? 'block' : 'none';
    document.getElementById('hist_outPublicNoteContent').innerText = h.publicNote || "";
    const boxIntNote = document.getElementById('hist_outInternalNoteBox');
    if(boxIntNote) {
        boxIntNote.style.display = h.internalNote && h.internalNote.trim() ? 'block' : 'none';
        document.getElementById('hist_outInternalNoteContent').innerText = h.internalNote || "";
    }




    const qr = document.getElementById('hist_qrSection');
    let remainToPay = final - pre;
    
    if(remainToPay > 0 && (!h.isPaid)) {
        qr.style.display='block';
        const content = (h.payment==='DEBT'?"Tra no ":"TT ") + h.id;
        setVietQRImage(document.getElementById('hist_qrImage'), storeConfig.bankId, storeConfig.accNum, storeConfig.accName, remainToPay, content);
        document.getElementById('hist_qrBankName').innerText = storeConfig.bankId;
        document.getElementById('hist_qrAccNum').innerText = `STK: ${storeConfig.accNum}`;
        if(document.getElementById('hist_qrAccName')) {
            document.getElementById('hist_qrAccName').innerText = `Chủ TK: ${storeConfig.accName}`;
        }
    } else {
        qr.style.display='none';
    }




    const qBox = document.getElementById('hist_trackingQrCode'); qBox.innerHTML=""; 
    new QRCode(qBox, {text:"https://gemini.google.com/gem/12mcKhrxsT76JdEKzA8dLaHZS94ZIHJFZ?usp=sharing", width:65, height:65});
    JsBarcode("#hist_trackingBarcode", h.id, {format:"CODE128", width:1.5, height:35, displayValue:true, fontSize:12, margin:0});




    document.getElementById('historyDetailModal').style.display = 'flex';
}




function printHistoryDetail() {
    document.body.classList.add('printing-history');
    window.print();
    setTimeout(() => { document.body.classList.remove('printing-history'); }, 1000);
}




function swapQrToLocalForCapture(container) {
    const restored = [];
    container.querySelectorAll('img').forEach(img => {
        if (img.dataset && img.dataset.localQr && img.src && img.src.startsWith('http')) {
            restored.push({ img, oldSrc: img.src });
            img.src = img.dataset.localQr;
        }
    });
    return () => restored.forEach(r => { r.img.src = r.oldSrc; });
}

function downloadHistoryDetail() {
    const element = document.getElementById('historyInvoiceArea');
    const originalMaxHeight = element.style.maxHeight;
    const originalOverflow = element.style.overflow;
    const restoreQr = swapQrToLocalForCapture(element);

    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';

    html2canvas(element, { scale: 2, useCORS: true, allowTaint: true }).then(c => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;

        const l = document.createElement('a');
        l.download = 'HD_LichSu.png';
        l.href = c.toDataURL();
        l.click();
    }).catch(err => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;
        alert("Lỗi tải ảnh: " + err);
    });
}




function shareHistoryDetail() {
    const element = document.getElementById('historyInvoiceArea');
    const originalMaxHeight = element.style.maxHeight;
    const originalOverflow = element.style.overflow;
    const restoreQr = swapQrToLocalForCapture(element);

    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';

    html2canvas(element, { scale: 2, useCORS: true, allowTaint: true }).then(c => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;

        c.toBlob(b => {
            const f = new File([b], "HD_LichSu.png", { type: "image/png" });
            if (navigator.share) {
                navigator.share({ files: [f] }).catch(err => console.log(err));
            } else {
                const l = document.createElement('a');
                l.download = 'HD_LichSu.png';
                l.href = c.toDataURL();
                l.click();
            }
        });
    }).catch(err => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;
        alert("Lỗi chia sẻ: " + err);
    });
}




// --- DEBT VIEW ---
function viewDebtInvoice(did) {
    let list = getDebtList(); let d = list.find(x=>x.id===did); if(!d) return;
    closeModal('debtModal'); isDebtViewMode=true;
    document.getElementById('groupStandardBtns').style.display='none';
    document.getElementById('groupEditBtns').style.display='none'; 
    document.getElementById('groupDebtBtns').style.display='block';
    document.getElementById('inpInvoiceID').value=d.orderId; document.getElementById('inpName').value=d.name; document.getElementById('inpPhone').value=d.phone; document.getElementById('inpDate').value=d.date;
    cartItems=d.items;
    document.getElementById('lblInvoiceTitle').innerText="THÔNG BÁO CÔNG NỢ"; document.getElementById('lblInvoiceTitle').style.color="#c0392b";
    document.getElementById('invHeaderBg').classList.add('debt-header');
    
    renderAll(true);
    document.getElementById('outSubTotal').innerText=formatMoney(d.originalAmount)+" đ";
    document.getElementById('rowDiscount').style.display='none';
    document.getElementById('rowCreditUsed').style.display='none';
    
    // ÉP ẨN MẤY HÀNG NÀY ĐỂ KHÔNG BỊ RÁC GIAO DIỆN
    if(document.getElementById('rowCustomerGiven')) document.getElementById('rowCustomerGiven').style.display='none';
    if(document.getElementById('rowRemainingDebt')) document.getElementById('rowRemainingDebt').style.display='none';
    if(document.getElementById('rowChange')) document.getElementById('rowChange').style.display='none';
    
    document.getElementById('rowPaidAmount').style.display='flex'; 
    document.getElementById('outPaidAmount').innerText=formatMoney(d.paidAmount)+" đ";
    document.getElementById('lblTotalLabel').innerText="CÒN NỢ:"; 
    document.getElementById('lblTotalLabel').style.color="#c0392b";
    
    // --- FIX LỖI 0đ HIỂN THỊ Ở ĐÂY ---
    document.getElementById('outFinalTotal').innerText=formatMoney(d.remainingAmount)+" đ";
    if(document.getElementById('displaySubTotalEnd')) {
        document.getElementById('displaySubTotalEnd').innerText = formatMoney(d.originalAmount)+" đ";
    }
    if(document.getElementById('displayFinalEnd')) {
        document.getElementById('displayFinalEnd').innerText = formatMoney(d.remainingAmount)+" đ";
        document.getElementById('displayFinalEnd').style.color = "#c0392b";
    }
    // ---------------------------------
    
    document.getElementById('outPaymentMethod').innerText="Ghi nợ"; 
    document.getElementById('outPaymentStatusHTML').innerHTML='<span class="debt-stamp">CHƯA THANH TOÁN</span>';
    renderQR(d.remainingAmount);
}




// --- NEW: BACKUP & RESTORE JSONL + PROGRESS ---




function updateProgress(percent, secondsRemaining) {
    const bar = document.getElementById('progressBar');
    const timeEl = document.getElementById('timeRemaining');
    bar.style.width = percent + '%';
    bar.innerText = Math.floor(percent) + '%';
    
    if (secondsRemaining !== null && secondsRemaining > 0) {
        const mins = Math.floor(secondsRemaining / 60);
        const secs = Math.floor(secondsRemaining % 60);
        timeEl.innerText = `Còn khoảng: ${mins} phút ${secs} giây...`;
    } else if (percent >= 100) {
        timeEl.innerText = "Hoàn tất! Đang xử lý cuối cùng...";
    } else {
        timeEl.innerText = "Đang tính toán thời gian...";
    }
}




function showProgressModal(title) {
    document.getElementById('progressModal').style.display = 'flex';
    document.getElementById('progressTitle').innerText = title;
    document.getElementById('btnCloseProgress').style.display = 'none';
    updateProgress(0, null);
}




function closeProgressModal() {
     document.getElementById('progressModal').style.display = 'none';
}




function formatTime(ms) {
    if (!ms || ms < 0) return "0s";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s%60}s` : `${s}s`;
}




// 1. BACKUP (JSONL)
async function backupDataJSONL() {
    showProgressModal("ĐANG ĐÓNG GÓI DỮ LIỆU...");
    const startStr = document.getElementById('backupStart').value;
    const endStr = document.getElementById('backupEnd').value;
    const start = startStr ? new Date(startStr) : null;
    const end = endStr ? new Date(endStr) : null;
    if(end) end.setHours(23,59,59);




    const inRange = (dStr) => { if(!dStr) return true; const d=new Date(dStr); return (!start || d>=start) && (!end || d<=end); };




    const meta = {
        type: 'meta',
        configs: localStorage.getItem('thebao_store_config'),
        catalog: localStorage.getItem('thebao_catalog_v6'),
        customers: localStorage.getItem('thebao_customers'),
        credits: localStorage.getItem('thebao_customer_credit'),
        inventory: localStorage.getItem('thebao_inventory') 
    };
    
    const chunks = [JSON.stringify(meta) + '\n'];
    const history = JSON.parse(localStorage.getItem('invoiceHistory')||"[]").filter(h=>inRange(h.date));
    const debts = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]").filter(d=>inRange(d.date));




    const totalItems = history.length + debts.length;
    let processed = 0;




    const processBatch = async () => {
        for (let item of history) {
            chunks.push(JSON.stringify({type: 'history', data: item}) + '\n');
            processed++;
            if(processed % 100 === 0) {
                 const pct = (processed / totalItems) * 100;
                 updateProgress(pct, null); 
                 await new Promise(r => setTimeout(r, 0)); 
            }
        }




        for (let item of debts) {
            chunks.push(JSON.stringify({type: 'debt', data: item}) + '\n');
            processed++;
             if(processed % 100 === 0) {
                 const pct = (processed / totalItems) * 100;
                 updateProgress(pct, null);
                 await new Promise(r => setTimeout(r, 0));
            }
        }




        updateProgress(100, 0);
        
        const blob = new Blob(chunks, {type: "application/x-jsonlines"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup_Full_${new Date().toISOString().slice(0,10)}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
        
        closeProgressModal();
    };




    setTimeout(processBatch, 100);
}




// 2. RESTORE (JSONL Chunked)
function triggerRestoreJSONL(mode) {
    restoreMode = mode;
    document.getElementById('fileRestoreJSONL').click();
}




function restoreDataJSONL(input) {
    const file = input.files[0];
    if (!file) return;




    showProgressModal("ĐANG KHÔI PHỤC DỮ LIỆU...");
    
    const chunkSize = 5 * 1024 * 1024; 
    let offset = 0;
    const fileSize = file.size;
    let startTime = Date.now();
    let partialLine = ""; 
    
    let newHistory = [];
    let newDebts = [];
    let newConfigs = null, newCatalog = null, newCustomers = null, newCredits = null, newInventory = null;
    let countH = 0, countD = 0;




    const currentHistory = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    const currentDebts = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]");
    const currentHistoryIds = new Set(currentHistory.map(x=>x.id));
    const currentDebtIds = new Set(currentDebts.map(x=>x.id));




    const reader = new FileReader();




    reader.onload = function(e) {
        const chunk = e.target.result;
        const lines = (partialLine + chunk).split('\n');
        
        partialLine = offset + chunkSize < fileSize ? lines.pop() : "";




        for (let line of lines) {
            if(!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                if (obj.type === 'meta') {
                    newConfigs = obj.configs;
                    newCatalog = obj.catalog;
                    newCustomers = obj.customers;
                    newCredits = obj.credits;
                    newInventory = obj.inventory;
                } else if (obj.type === 'history') {
                     if (!currentHistoryIds.has(obj.data.id)) {
                         newHistory.push(obj.data);
                         countH++;
                     }
                } else if (obj.type === 'debt') {
                     if (!currentDebtIds.has(obj.data.id)) {
                         newDebts.push(obj.data);
                         countD++;
                     }
                }
            } catch (err) {
                console.error("Lỗi dòng JSON:", err);
            }
        }




        offset += chunkSize;
        
        const progress = Math.min((offset / fileSize) * 100, 100);
        const elapsedTime = (Date.now() - startTime) / 1000; 
        const speed = offset / elapsedTime; 
        const remainingBytes = fileSize - offset;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;
        
        updateProgress(progress, remainingTime);




        if (offset < fileSize) {
            readNextChunk();
        } else {
            finishRestore();
        }
    };




    reader.onerror = function() {
        alert("Lỗi đọc file!");
        closeProgressModal();
    };




    function readNextChunk() {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsText(slice);
    }




    function finishRestore() {
        try {
            const finalHistory = [...newHistory, ...currentHistory];
            finalHistory.sort((a,b)=>new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time));
            
            const finalDebts = [...newDebts, ...currentDebts];
            finalDebts.sort((a,b)=>new Date(b.date) - new Date(a.date));




            localStorage.setItem('invoiceHistory', JSON.stringify(finalHistory));
            localStorage.setItem('thebao_debt_list', JSON.stringify(finalDebts));




            if (newConfigs && confirm("Bạn có muốn khôi phục cả Cấu hình Shop, Danh mục SP, Kho thẻ & Khách hàng không?")) {
                 if(newConfigs) localStorage.setItem('thebao_store_config', newConfigs);
                 if(newCatalog) localStorage.setItem('thebao_catalog_v6', newCatalog);
                 if(newCustomers) localStorage.setItem('thebao_customers', newCustomers);
                 if(newCredits) localStorage.setItem('thebao_customer_credit', newCredits);
                 if(newInventory) localStorage.setItem('thebao_inventory', newInventory);
            }




            document.getElementById('progressTitle').innerText = "HOÀN TẤT!";
            document.getElementById('progressAction').innerText = `Đã thêm ${countH} đơn hàng và ${countD} công nợ.`;
            document.getElementById('btnCloseProgress').style.display = 'inline-block';
            
            alert("✅ Khôi phục thành công!");
            location.reload();




        } catch (e) {
            alert("❌ Lỗi Quota: Trình duyệt không đủ bộ nhớ để lưu lượng dữ liệu này. Hãy xóa bớt đơn cũ hoặc dùng máy tính khác.");
            closeProgressModal();
        }
    }




    readNextChunk();
}




// Partial Backups (Old Functions kept)
function exportShopConfig() {
    const cfg = localStorage.getItem('thebao_store_config') || "{}";
    downloadJSON(JSON.parse(cfg), "Config_Shop.json");
}
function importShopConfig(inp) {
    const f = inp.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = function(e) {
        try {
            const d = JSON.parse(e.target.result);
            if(d.brandName) {
                localStorage.setItem('thebao_store_config', JSON.stringify(d));
                alert("✅ Đã cập nhật cấu hình shop!");
                location.reload();
            } else alert("File không hợp lệ!");
        } catch(err) { alert("Lỗi file JSON!"); }
    };
    r.readAsText(f);
}
function exportCatalog() {
    const cat = localStorage.getItem('thebao_catalog_v6') || "[]";
    downloadJSON(JSON.parse(cat), "Products_Catalog.json");
}
function importCatalog(inp) {
    const f = inp.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = function(e) {
        try {
            const d = JSON.parse(e.target.result);
            if(Array.isArray(d)) {
                localStorage.setItem('thebao_catalog_v6', JSON.stringify(d));
                alert("✅ Đã cập nhật danh sách sản phẩm!");
                location.reload();
            } else alert("File không hợp lệ!");
        } catch(err) { alert("Lỗi file JSON!"); }
    };
    r.readAsText(f);
}
function exportCustomersExcel() {
    if(customerList.length === 0) return alert("Danh sách trống!");
    const data = customerList.map(c => ({ "Ten_Khach": c.name, "SDT": c.phone }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KhachHang");
    XLSX.writeFile(wb, "DanhBa_KhachHang.xlsx");
}
function importCustomersExcel(inp) {
    const f = inp.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws);
            let count = 0;
            json.forEach(row => {
                const name = row["Ten_Khach"] || row["Tên"] || row["Name"];
                let phone = row["SDT"] || row["SĐT"] || row["Phone"];
                if(name && phone) {
                    phone = String(phone).replace(/'/g,"").trim(); 
                    if(!customerList.some(c => c.phone === phone)) {
                        customerList.push({name: name, phone: phone});
                        count++;
                    }
                }
            });
            if(count > 0) {
                localStorage.setItem('thebao_customers', JSON.stringify(customerList));
                renderCustomerTable();
                alert(`✅ Đã thêm ${count} khách hàng mới từ danh bạ!`);
            } else alert("Không tìm thấy khách mới hoặc file lỗi!");
        } catch(err) { alert("Lỗi đọc file Excel!"); }
    };
    r.readAsArrayBuffer(f);
}
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const l = document.createElement("a"); l.href=URL.createObjectURL(blob); l.download=filename; l.click();
}




// 5. HISTORY EXCEL
function exportHistoryToExcel() {
    let h = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    if(h.length === 0) return alert("Không có dữ liệu để xuất!");
    const data = h.map(item => {
        let prodSum = item.cart ? item.cart.map(c => `${c.cardType} x${c.qty}`).join(', ') : "";
        
        return {
            "Mã HĐ": item.id,
            "Ngày": item.date,
            "Giờ": item.time,
            "Tên Khách": item.name,
            "SĐT": item.phone,
            "Sản phẩm": prodSum,
            "Tổng tiền": item.total,
            "Thanh toán": item.payment,
            "Trạng thái": item.isPaid ? 'Đã TT' : 'Chưa TT',
            "Ghi chú": item.publicNote || "",
            "__CartData_JSON__": JSON.stringify(item.cart) 
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch Sử Đơn Hàng");
    XLSX.writeFile(wb, "Backup_HoaDon_Full.xlsx");
}




function exportCurrentCustomerHistory() {
    if (!currentCrmPhone) return alert("Chưa chọn khách hàng!");
    let h = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    let cusHistory = h.filter(x => x.phone === currentCrmPhone);
    if (cusHistory.length === 0) return alert("Khách này chưa có lịch sử mua hàng!");




    const data = cusHistory.map(item => {
        let prodSum = item.cart.map(c => `${c.cardType} x${c.qty}`).join(', ');
        return {
            "Mã HĐ": item.id,
            "Ngày": item.date,
            "Giờ": item.time,
            "Tên Khách": item.name,
            "SĐT": item.phone,
            "Sản phẩm": prodSum,
            "Tổng tiền": item.total,
            "Thanh toán": item.payment === 'CASH' ? 'Tiền mặt' : (item.payment === 'TRANSFER' ? 'Chuyển khoản' : 'Ghi nợ'),
            "Trạng thái": item.isPaid ? 'Đã TT' : 'Chưa TT',
            "Ghi chú": item.publicNote || ""
        };
    });




    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LichSu_" + currentCrmPhone);
    XLSX.writeFile(wb, `LichSu_Khach_${currentCrmPhone}.xlsx`);
}




function triggerImportExcel() { document.getElementById('fileImportExcel').click(); }




function importFromExcel(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            if(jsonData.length === 0) return alert("File rỗng!");
            let currentHist = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
            let count = 0;
            jsonData.forEach(row => {
                const id = row["Mã HĐ"];
                if (!currentHist.some(h => h.id === id)) {
                    let cart = [];
                    try {
                        if(row["__CartData_JSON__"]) cart = JSON.parse(row["__CartData_JSON__"]);
                        else {
                            let prodName = row["Sản phẩm"] || "Sản phẩm Excel"; 
                            cart = [{
                                cardType: prodName, 
                                faceValue: 0, 
                                price: row["Tổng tiền"] || 0, 
                                qty: 1, 
                                total: row["Tổng tiền"] || 0, 
                                cardList: [] 
                            }];
                        }
                    } catch(e) { console.log("Lỗi parse cart:", e); }
                    const newItem = {
                        id: id,
                        date: row["Ngày"],
                        time: row["Giờ"] || "00:00",
                        name: row["Tên Khách"] || "Khách lẻ",
                        phone: row["SĐT"] ? String(row["SĐT"]).replace(/'/g,"") : "",
                        discount: 0, 
                        surcharge: 0,
                        publicNote: row["Ghi chú"] || "",
                        internalNote: "",
                        payment: row["Thanh toán"] || "CASH",
                        isPaid: row["Trạng thái"] === 'Đã TT',
                        cart: cart,
                        total: row["Tổng tiền"] || 0
                    };
                    currentHist.push(newItem);
                    count++;
                    if(newItem.phone && newItem.phone.length >= 10 && !customerList.some(c => c.phone === newItem.phone)) {
                        customerList.push({name: newItem.name, phone: newItem.phone});
                    }
                }
            });
            if(count > 0) {
                currentHist.sort((a,b)=>new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time));
                localStorage.setItem('invoiceHistory', JSON.stringify(currentHist));
                localStorage.setItem('thebao_customers', JSON.stringify(customerList));
                alert(`✅ Đã khôi phục thành công ${count} đơn hàng từ Excel!`);
                location.reload();
            } else {
                alert("Không tìm thấy dữ liệu mới hoặc file không đúng định dạng!");
            }
        } catch(err) {
            alert("Lỗi đọc file Excel! Hãy đảm bảo file đúng định dạng .xlsx");
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}




function exportHistoryJSONL() {
    let h = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    if(h.length === 0) return alert("Không có dữ liệu để xuất!");
    
    let chunks = [];
    h.forEach(item => {
        chunks.push(JSON.stringify({type: 'history', data: item}) + '\n');
    });
    
    const blob = new Blob(chunks, {type: "application/x-jsonlines"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_LichSu_${new Date().toISOString().slice(0,10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
}




function triggerImportHistoryJSONL() {
    document.getElementById('fileImportHistoryJSONL').click();
}




function importHistoryJSONL(input) {
    const file = input.files[0];
    if (!file) return;




    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const lines = e.target.result.split('\n');
            let currentHist = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
            const currentIds = new Set(currentHist.map(x => x.id));
            let count = 0;




            for (let line of lines) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.type === 'history' && obj.data && !currentIds.has(obj.data.id)) {
                        currentHist.push(obj.data);
                        count++;
                    }
                } catch (err) {
                    console.error("Lỗi dòng JSON:", err);
                }
            }




            if (count > 0) {
                currentHist.sort((a,b)=>new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time));
                localStorage.setItem('invoiceHistory', JSON.stringify(currentHist));
                alert(`✅ Đã khôi phục thành công ${count} đơn hàng từ file JSONL!`);
                location.reload();
            } else {
                alert("Không tìm thấy đơn hàng mới nào (hoặc mã đơn đã tồn tại)!");
            }
        } catch(err) {
            alert("Lỗi đọc file JSONL!");
        }
    };
    reader.readAsText(file);
}
// --- COMMON UTILS ---
function generateRandomInvoiceID() { const c="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; let r=""; for(let i=0;i<5;i++) r+=c.charAt(Math.floor(Math.random()*c.length)); document.getElementById('inpInvoiceID').value="TB"+r; updateInvoiceHeader(); renderQR(); }
function renderTrackingCodes(code) { const q = document.getElementById('trackingQrCode'); q.innerHTML=""; new QRCode(q, {text:"https://gemini.google.com/gem/12mcKhrxsT76JdEKzA8dLaHZS94ZIHJFZ?usp=sharing", width:65, height:65}); JsBarcode("#trackingBarcode", code, {format:"CODE128", width:1.5, height:35, displayValue:true, fontSize:12, margin:0}); }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function openHistoryModal() { document.getElementById('historyModal').style.display='flex'; loadHistory(false); }
function openDebtModal() { document.getElementById('debtModal').style.display='flex'; renderDebtList(); }




function getCatalogCostPrice(prodName, faceVal) {
    let cost = Number(faceVal) || 0;
    (productCatalog || []).forEach(c => {
        (c.products || []).forEach(p => {
            if (p && p.name === prodName && Array.isArray(p.prices)) {
                const pr = p.prices.find(x => String(x.face) === String(faceVal));
                if (pr && pr.cost !== undefined) cost = Number(pr.cost) || 0;
            }
        });
    });
    return cost;
}

function calculateTodayRevenue() {
    const _n = new Date();
    const _todayStr = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, '0')}-${String(_n.getDate()).padStart(2, '0')}`;
    const t = document.getElementById('inpDate').value || _todayStr;

    const h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    let c = 0, tr = 0, d = 0, profit = 0;
    h.forEach(x => {
        if (x && x.date === t) {
            const total = Number(x.total) || 0;
            const pre = Number(x.prepaid) || 0;
            if (!x.isPaid) {
                const collected = Math.min(total, Math.max(0, pre));
                const unpaid = Math.max(0, total - collected);
                d += unpaid;
                if (collected > 0) {
                    if (x.payment === 'TRANSFER') tr += collected;
                    else c += collected;
                }
            } else {
                if (x.payment === 'TRANSFER') tr += total;
                else c += total;
            }
            let itemProfit = 0;
            if (Array.isArray(x.cart)) {
                x.cart.forEach(item => {
                    const cost = item.costPrice !== undefined ? Number(item.costPrice) : getCatalogCostPrice(item.cardType, item.faceValue);
                    itemProfit += ((Number(item.price) || 0) - cost) * (Number(item.qty) || 1);
                });
            }
            itemProfit += (Number(x.surcharge) || 0) - (Number(x.discount) || 0);
            profit += itemProfit;
        }
    });
    document.getElementById('dailyTotalDisplay').innerText = formatMoney(c + tr + d) + " đ";
    document.getElementById('revCash').innerText = formatMoney(c);
    document.getElementById('revTransfer').innerText = formatMoney(tr);
    document.getElementById('revDebt').innerText = formatMoney(d);
    if (document.getElementById('revProfit')) {
        document.getElementById('revProfit').innerText = formatMoney(profit) + " đ";
    }
}




// --- CUSTOMER & DEBT UI LOGIC ---
function loadCustomerList() { customerList = JSON.parse(localStorage.getItem('thebao_customers')||"[]"); }




function addNewCustomer() {
    let n = document.getElementById('newCusName').value.trim();
    let p = document.getElementById('newCusPhone').value.trim();

    if (!p) {
        p = generateCustomerID();
        alert("⚠️ Không có SĐT, hệ thống tự tạo ID: " + p);
    }

    if (customerList.some(c => c && c.phone === p)) return alert("Mã khách hàng/SĐT này đã tồn tại!");
    if (!n) n = "Khách " + p;

    const newCus = {name: n, phone: p};
    customerList.push(newCus);
    localStorage.setItem('thebao_customers', JSON.stringify(customerList));
    
    if(typeof saveToCloudCollection === 'function') saveToCloudCollection('Customers', p, newCus);
    
    renderCustomerTable();
    document.getElementById('newCusName').value = "";
    document.getElementById('newCusPhone').value = "";
}




function renderCustomerTable() { 
    const searchBox = document.getElementById('inpSearchCustomer');
    const keyword = searchBox ? searchBox.value.toLowerCase().trim() : "";

    const filteredList = (customerList || []).filter(c => 
        c && (String(c.name || "").toLowerCase().includes(keyword) || String(c.phone || "").toLowerCase().includes(keyword))
    );

    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;
    
    if (filteredList.length > 0) {
        tbody.innerHTML = filteredList.map(c =>
            `<tr onclick="openCRM('${c.phone}')"><td>${c.name || ""}</td><td>${c.phone || ""}</td></tr>`
        ).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#999; padding:10px; font-style:italic;">Không tìm thấy khách hàng nào</td></tr>';
    }
}




function syncCustomersFromHistory() {
    let h = getAllInvoiceHistory(), c=0;
    h.forEach(x=>{ if(x && x.name && x.name!=='Khách lẻ' && String(x.phone||"").length===10 && !customerList.some(cu=>cu && cu.phone===x.phone)) { customerList.push({name:x.name, phone:x.phone}); c++; } });
    localStorage.setItem('thebao_customers', JSON.stringify(customerList)); alert(`Đã thêm ${c} khách.`); renderCustomerTable();
}




function suggestCustomer(inp, type) {
    const v = inp.value.toLowerCase().trim(); const list = document.getElementById(type==='name'?'suggestList_name':'suggestList_phone');
    document.querySelectorAll('.suggestion-list').forEach(e=>e.style.display='none');
    if(!v) return;
    const matches = (customerList || []).filter(c => c && (type==='name' ? String(c.name||"").toLowerCase().includes(v) : String(c.phone||"").includes(v))).slice(0,5);
    if(matches.length===0) return;
    list.innerHTML = matches.map(c=>`<div class="suggestion-item" onclick="fillCustomer('${c.name}','${c.phone}')"><strong>${c.name}</strong> - ${c.phone}</div>`).join('');
    list.style.display='block';
}




function fillCustomer(n,p) { document.getElementById('inpName').value=n; document.getElementById('inpPhone').value=p; document.querySelectorAll('.suggestion-list').forEach(e=>e.style.display='none'); updateInvoiceHeader(); checkOldDebt(p); }
function getCredits() { return JSON.parse(localStorage.getItem('thebao_customer_credit')||"{}"); }
function getCreditLogs() { return JSON.parse(localStorage.getItem('thebao_credit_logs')||"{}"); }
function addCreditLog(phone, deltaAmt, note) {
    if (!phone) return;
    let logs = getCreditLogs();
    if (!Array.isArray(logs[phone])) logs[phone] = [];
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${now.toTimeString().substring(0,5)}`;
    logs[phone].unshift({ time: timeStr, amount: deltaAmt, note: note || "" });
    if (logs[phone].length > 20) logs[phone] = logs[phone].slice(0, 20);
    localStorage.setItem('thebao_credit_logs', JSON.stringify(logs));
}




function checkCreditDisplay() { 
    const p = document.getElementById('inpPhone').value; const c = Number(getCredits()[p])||0; 
    const b = document.getElementById('creditNotificationBox');
    if(c>0) { b.style.display='flex'; document.getElementById('creditAmountDisplay').innerText=formatMoney(c); document.getElementById('lblCreditHint').style.display='inline'; } 
    else { b.style.display='none'; document.getElementById('lblCreditHint').style.display='none'; }
}




function applyCreditToOrder() { 
    const c = Number(getCredits()[document.getElementById('inpPhone').value])||0; 
    if(c>0) { document.getElementById('appliedCreditValue').value = Math.min(c, parseInt(document.getElementById('outSubTotal').innerText.replace(/\D/g,''))||c); renderAll(); } 
}




function clearCreditManual() {
    const p = document.getElementById('inpPhone').value;
    if(confirm("Xóa tiền thừa của khách này?")) {
        let c = getCredits();
        c[p] = 0;
        localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
        addCreditLog(p, 0, "Xóa số dư tiền thừa");
        if (typeof syncCreditToCloud === 'function') syncCreditToCloud();
        checkCreditDisplay();
        renderDebtList();
    }
}
function useCredit(p, amt) { let c=getCredits(); if(Number(c[p])>=amt) { c[p]=Number(c[p])-amt; localStorage.setItem('thebao_customer_credit', JSON.stringify(c)); } }
function switchDebtTab(t) {
    currentDebtTab = t;
    document.querySelectorAll('#debtModal .tab-item').forEach(e => e.classList.remove('active'));
    const tabMap = { active: 'tabDebtActive', history: 'tabDebtHistory', credit: 'tabDebtCredit' };
    const tabEl = document.getElementById(tabMap[t] || 'tabDebtActive');
    if (tabEl) tabEl.classList.add('active');
    renderDebtList();
}




function getCustomerDisplayName(phone) {
    const cus = (customerList || []).find(c => c && String(c.phone) === String(phone));
    if (cus && cus.name) return cus.name;
    const debt = getDebtList().find(d => d && String(d.phone) === String(phone));
    if (debt && debt.name) return debt.name;
    const hist = getAllInvoiceHistory().find(h => h && String(h.phone) === String(phone));
    if (hist && hist.name) return hist.name;
    return "Khách " + phone;
}




function renderDebtList() {
    const list=getDebtList(), s=(document.getElementById('inpSearchDebt')?.value || "").toLowerCase().trim();
    let tot=list.filter(d=>d.remainingAmount>0).reduce((a,b)=>a+Number(b.remainingAmount||0),0);
    let credObj = getCredits();
    let cred = 0;
    let creditItems = [];
    for (let key in credObj) {
        if (key !== 'last_updated' && !isNaN(credObj[key]) && Number(credObj[key]) > 0) {
            let amt = Number(credObj[key]);
            cred += amt;
            let cName = getCustomerDisplayName(key);
            if (!s || cName.toLowerCase().includes(s) || String(key).toLowerCase().includes(s)) {
                creditItems.push({ phone: key, name: cName, amount: amt });
            }
        }
    }

    document.getElementById('lblGlobalDebt').innerText = formatMoney(tot)+" đ";
    document.getElementById('lblGlobalCredit').innerText = formatMoney(cred)+" đ";

    if (currentDebtTab === 'credit') {
        document.getElementById('debtListContainer').innerHTML = creditItems.length === 0
            ? '<p style="text-align:center;color:#999;">Không có khách nào còn tiền thừa</p>'
            : creditItems.map(item => `<div style="background:#fff; border:1px solid #eee; border-left:4px solid #e67e22; padding:10px; margin-bottom:5px; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>${item.name}</span>
                    <span style="color:#e67e22">+${formatMoney(item.amount)} đ</span>
                </div>
                <div style="font-size:12px; color:#666;">SĐT / Mã KH: ${item.phone}</div>
                <div style="text-align:right; margin-top:5px;">
                    <button class="btn-mini btn-info pos-mini-btn" onclick="viewCreditCustomer('${item.phone}')">👁 Xem</button>
                    <button class="btn-mini btn-success pos-mini-btn" onclick="refundCreditCustomer('${item.phone}')">💸 Hoàn lại khách</button>
                    <button class="btn-mini btn-danger pos-mini-btn" onclick="deleteCreditCustomer('${item.phone}')">🗑 Xóa</button>
                </div>
            </div>`).join('');
        return;
    }

    const filtered = list.filter(d => (currentDebtTab==='active'?d.remainingAmount>0:d.remainingAmount<=0) && (String(d.name||"").toLowerCase().includes(s)||String(d.phone||"").toLowerCase().includes(s)));
    document.getElementById('debtListContainer').innerHTML = filtered.length===0 ? '<p style="text-align:center;color:#999;">Trống</p>' : 
        filtered.map(d=>`<div style="background:#fff; border:1px solid #eee; border-left:4px solid ${d.remainingAmount>0?'#c0392b':'#27ae60'}; padding:10px; margin-bottom:5px; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>${d.name}</span> <span style="color:${d.remainingAmount>0?'#c0392b':'#27ae60'}">${formatMoney(d.remainingAmount)} đ</span></div>
            <div style="font-size:12px; color:#666;">${d.date} | Mã: ${d.orderId} | Đã trả: ${formatMoney(d.paidAmount||0)} đ</div>
            <div style="text-align:right; margin-top:5px;">
                <button class="btn-mini btn-info pos-mini-btn" onclick="viewDebtInvoice('${d.id}')">👁 Xem</button>
                ${d.remainingAmount>0?`<button class="btn-mini btn-success pos-mini-btn" onclick="payDebt('${d.id}')">💰 Trả nợ</button>`:''}
                <button class="btn-mini btn-danger pos-mini-btn" onclick="deleteDebt('${d.id}')">🗑 Xóa</button>
            </div>
        </div>`).join('');
}




function viewCreditCustomer(phone) {
    let credObj = getCredits();
    let amount = Number(credObj[phone]) || 0;
    if (amount <= 0) return alert("Khách hàng này hiện không có tiền thừa!");
    let cusName = getCustomerDisplayName(phone);
    let history = getAllInvoiceHistory();
    let lastOrder = history.find(x => x && String(x.phone) === String(phone));
    let now = new Date();
    let dateStr = lastOrder && lastOrder.date
        ? `${lastOrder.date.split('-')[2]}/${lastOrder.date.split('-')[1]}/${lastOrder.date.split('-')[0]} - ${lastOrder.time || ''}`
        : `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} - ${now.toTimeString().substring(0,5)}`;
    let refId = lastOrder ? lastOrder.id : ("TT_" + phone);

    document.getElementById('hist_outBrandName').innerText = storeConfig.brandName || "THE BÁO";
    document.getElementById('hist_outSlogan').innerText = storeConfig.slogan || "";
    document.getElementById('hist_outHotline').innerText = `☎ Hotline: ${storeConfig.hotline || ""}`;
    document.getElementById('hist_outHotlineFooter').innerText = storeConfig.hotline || "";
    document.getElementById('hist_lblInvoiceTitle').innerText = "PHIẾU TIỀN THỪA KHÁCH HÀNG";
    document.getElementById('hist_outInvoiceID').innerText = refId;
    document.getElementById('hist_outDate').innerText = dateStr;
    document.getElementById('hist_outName').innerText = cusName;
    document.getElementById('hist_outPhone').innerText = phone;
    document.getElementById('hist_rowPhone').style.display = phone ? 'flex' : 'none';
    document.getElementById('hist_outPaymentMethod').innerText = "Lưu tiền thừa / Ví khách";
    document.getElementById('hist_outPaymentStatusHTML').innerHTML = '<span class="paid-stamp" style="color:#e67e22; border-color:#e67e22;">CÒN TIỀN THỪA</span>';

    let logs = getCreditLogs()[phone] || [];
    let logHtml = logs.length > 0
        ? `<div class="card-box" style="margin-top:6px;"><span class="card-label">LỊCH SỬ BIẾN ĐỘNG:</span>` +
          logs.slice(0, 5).map(l => `<span class="card-line" style="font-size:11px;">• ${l.time}: ${l.amount >= 0 ? '+' : ''}${formatMoney(l.amount)}đ (${l.note})</span>`).join('') +
          `</div>`
        : '';

    let recentHtml = lastOrder
        ? `<div class="item-sub">Đơn gần nhất: <b>${lastOrder.id}</b> (${lastOrder.date})</div>${logHtml}`
        : `<div class="item-sub">Số dư tiền thừa lưu tại cửa hàng</div>${logHtml}`;
    document.getElementById('hist_invoiceTableBody').innerHTML = `
        <tr>
            <td style="padding-top:10px;">
                <span class="item-name">Tiền thừa của khách</span>
                ${recentHtml}
            </td>
            <td style="text-align:center;padding-top:10px;font-weight:bold;">1</td>
            <td style="text-align:right;padding-top:10px;font-weight:bold;">${formatMoney(amount)}</td>
        </tr>
    `;

    document.getElementById('hist_outSubTotal').innerText = formatMoney(amount) + " đ";
    document.getElementById('hist_rowSurcharge').style.display = 'none';
    document.getElementById('hist_rowDiscount').style.display = 'none';
    document.getElementById('hist_rowCreditUsed').style.display = 'none';
    document.getElementById('hist_outFinalTotal').innerText = formatMoney(amount) + " đ";

    if (document.getElementById('hist_rowCustomerGiven')) document.getElementById('hist_rowCustomerGiven').style.display = 'none';
    if (document.getElementById('hist_rowRemainingDebt')) document.getElementById('hist_rowRemainingDebt').style.display = 'none';
    if (document.getElementById('hist_rowChange')) {
        document.getElementById('hist_rowChange').style.display = 'flex';
        document.getElementById('hist_outChange').innerText = formatMoney(amount) + " đ";
    }

    document.getElementById('hist_outPublicNoteBox').style.display = 'none';
    if (document.getElementById('hist_outInternalNoteBox')) document.getElementById('hist_outInternalNoteBox').style.display = 'none';
    document.getElementById('hist_qrSection').style.display = 'none';

    const qBox = document.getElementById('hist_trackingQrCode');
    if (qBox) {
        qBox.innerHTML = "";
        new QRCode(qBox, {text:"https://gemini.google.com/gem/12mcKhrxsT76JdEKzA8dLaHZS94ZIHJFZ?usp=sharing", width:65, height:65});
    }
    try {
        JsBarcode("#hist_trackingBarcode", refId, {format:"CODE128", width:1.5, height:35, displayValue:true, fontSize:12, margin:0});
    } catch (e) {}

    document.getElementById('historyDetailModal').style.display = 'flex';
}




function refundCreditCustomer(phone) {
    let c = getCredits();
    let currentAmt = Number(c[phone]) || 0;
    if (currentAmt <= 0) return alert("Khách hàng này không còn tiền thừa!");
    let cusName = getCustomerDisplayName(phone);
    let m = prompt(`Nhập số tiền hoàn lại cho khách ${cusName} (${phone}):`, currentAmt);
    if (m === null) return;
    let refundAmt = parseInt(String(m).replace(/\D/g, ''), 10);
    if (isNaN(refundAmt) || refundAmt <= 0) return alert("Vui lòng nhập số tiền hợp lệ!");
    if (refundAmt > currentAmt) return alert(`Số tiền hoàn (${formatMoney(refundAmt)} đ) vượt quá số tiền thừa hiện có (${formatMoney(currentAmt)} đ)!`);

    c[phone] = currentAmt - refundAmt;
    localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
    addCreditLog(phone, -refundAmt, "Hoàn tiền mặt/CK cho khách");
    if (typeof syncCreditToCloud === 'function') syncCreditToCloud();
    renderDebtList();
    checkCreditDisplay();
    alert(`✅ Đã hoàn lại ${formatMoney(refundAmt)} đ cho khách ${cusName}!\nSố dư tiền thừa còn lại: ${formatMoney(c[phone])} đ.`);
}




function deleteCreditCustomer(phone) {
    let c = getCredits();
    let currentAmt = Number(c[phone]) || 0;
    let cusName = getCustomerDisplayName(phone);
    if (!confirm(`⚠️ Bạn có chắc chắn muốn xóa khoản tiền thừa (${formatMoney(currentAmt)} đ) của khách ${cusName} (${phone}) không?`)) return;
    c[phone] = 0;
    localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
    addCreditLog(phone, -currentAmt, "Xóa khoản tiền thừa");
    if (typeof syncCreditToCloud === 'function') syncCreditToCloud();
    renderDebtList();
    checkCreditDisplay();
}




function payDebt(id) {
    let l=getDebtList(), d=l.find(x=>x.id===id); if(!d) return;
    let m = prompt("Nhập số tiền trả:", d.remainingAmount); if(!m) return;
    let pay = parseInt(String(m).replace(/\D/g, ''), 10); if(isNaN(pay) || pay <= 0) return;
    let excess = pay - d.remainingAmount;
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')} ${now.toTimeString().substring(0,5)}`;
    if (!Array.isArray(d.payLogs)) d.payLogs = [];
    if(excess>0) {
        if(confirm(`Thừa ${formatMoney(excess)} đ. Lưu vào Tiền thừa của khách?`)) {
            let c=getCredits();
            c[d.phone]=(Number(c[d.phone])||0)+excess;
            localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
            addCreditLog(d.phone, excess, "Tiền thừa khi trả nợ đơn " + d.orderId);
            if(typeof syncCreditToCloud === 'function') syncCreditToCloud();
        }
        d.payLogs.push({ time: timeStr, amount: d.remainingAmount });
        d.paidAmount+=d.remainingAmount;
        d.remainingAmount=0;
    } else {
        d.payLogs.push({ time: timeStr, amount: pay });
        d.paidAmount+=pay;
        d.remainingAmount-=pay;
    }
    if(d.remainingAmount<=0) updateHistoryPaidStatus(d.orderId);
    saveDebtList(l); renderDebtList(); calculateTodayRevenue();
}




function deleteDebt(id) { if(confirm("Xóa?")) { saveDebtList(getDebtList().filter(x=>x.id!==id)); renderDebtList(); } }




function loadHistory(all) {
    let h = all ? getAllInvoiceHistory() : JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    let s = (document.getElementById('inpSearchHistory')?.value || "").toLowerCase().trim();
    if (s) h = getAllInvoiceHistory();
    
    h.sort((a, b) => {
        let dateA = new Date((a.date || '') + 'T' + (a.time || '00:00:00'));
        let dateB = new Date((b.date || '') + 'T' + (b.time || '00:00:00'));
        return dateB - dateA;
    });

    const d1 = document.getElementById('histFilterStart').value;
    const d2 = document.getElementById('histFilterEnd').value;
    
    if(d1 && d2) { 
        h = getAllInvoiceHistory();
        const start=new Date(d1), end=new Date(d2); end.setHours(23,59,59); 
        h = h.filter(x=>{const d=new Date(x.date); return d>=start && d<=end;}); 
    }
    if(s) h=h.filter(x=>String(x.name||"").toLowerCase().includes(s)||String(x.id||"").toLowerCase().includes(s)||String(x.phone||"").includes(s));

    const totalCount = h.length;
    const isLimited = !all && !s && !(d1 && d2) && totalCount > 30;
    const displayList = isLimited ? h.slice(0, 30) : h;

    let html = `<div style="padding:10px; background:#f1f1f1; border-bottom:1px solid #ddd; font-weight:bold; display:flex;">
        <div style="width:30px;"><input type="checkbox" onchange="toggleAllHist(this)"></div>
        <div style="flex:1;">Thông tin đơn (${displayList.length}/${totalCount})</div>
        <div style="text-align:right;">Thao tác</div>
    </div>`;

    if(displayList.length === 0) html += '<p style="text-align:center;color:#999;padding:10px;">Không có đơn hàng.</p>';
    else {
        html += displayList.map(x => `
            <div class="hist-row" style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div style="width:30px;">
                    <input type="checkbox" class="hist-check" value="${x.id}">
                </div>
                <div style="flex:1;">
                    <strong>${x.id}</strong> - ${x.name} <span style="color:#666; font-size:11px;">(${x.date} ${x.time})</span><br>
                    <span style="font-size:12px;">${x.payment === 'DEBT' ? '<span style="color:#c0392b">Ghi nợ</span>' : (x.payment === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt')} - </span>
                    <strong style="color:${x.isPaid?'#27ae60':'#c0392b'}">${formatMoney(x.total)} đ</strong>
                </div>
                <div style="text-align:right; display:flex; gap:4px;">
                    <button class="btn-mini btn-info pos-mini-btn" onclick="viewHistoryDetail('${x.id}')">👁 Xem</button>
                    <button class="btn-mini btn-warning pos-mini-btn" onclick="restoreHistory('${x.id}')">✏️ Sửa</button>
                    <button class="btn-mini btn-danger pos-mini-btn" onclick="deleteHistoryItem('${x.id}')">🗑 Xóa</button>
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('historyListUI').innerHTML = html;
    document.getElementById('histLoadMoreBtn').style.display = isLimited ? 'block' : 'none';
}




function toggleAllHist(source) {
    document.querySelectorAll('.hist-check').forEach(c => c.checked = source.checked);
}




function deleteHistoryItem(id) {
    if(!confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa đơn ${id}?\n\n- Mã thẻ (nếu có) sẽ được trả về kho.\n- Công nợ (nếu có) sẽ bị xóa.\n- Doanh thu sẽ bị trừ.`)) return;
    
    let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    let order = h.find(x => x.id === id);
    
    if(order) {
        if(typeof returnStock === 'function' && order.cart) {
            order.cart.forEach(item => returnStock(item));
        }




        h = h.filter(x => x.id !== id);
        localStorage.setItem('invoiceHistory', JSON.stringify(h));
        
        if(typeof deleteFromCloudCollection === 'function') {
            deleteFromCloudCollection('Invoices', id);
        }
        if(typeof deleteFromTreeStructure === 'function') {
            deleteFromTreeStructure(order);
        }




        let debts = getDebtList();
        let relatedDebt = debts.find(d => d.orderId === id);
        if(relatedDebt) {
            debts = debts.filter(d => d.orderId !== id);
            saveDebtList(debts);
            if(typeof deleteFromCloudCollection === 'function') deleteFromCloudCollection('Debts', relatedDebt.id);
        }
        
        loadHistory(false);
        calculateTodayRevenue();
        alert("✅ Đã xóa đơn hàng thành công!");
    }
}




function deleteSelectedHistory() {
    const checks = document.querySelectorAll('.hist-check:checked');
    if(checks.length === 0) return alert("Chưa chọn đơn hàng nào!");
    
    if(!confirm(`⚠️ NGUY HIỂM: Bạn sắp xóa vĩnh viễn ${checks.length} đơn hàng.\n\nDữ liệu không thể khôi phục. Tiếp tục?`)) return;
    
    let count = 0;
    checks.forEach(c => {
        let id = c.value;
        let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
        let order = h.find(x => x.id === id);
        if(order) {
            if(typeof returnStock === 'function' && order.cart) order.cart.forEach(item => returnStock(item));
            if(typeof deleteFromCloudCollection === 'function') deleteFromCloudCollection('Invoices', id);
            if(typeof deleteFromTreeStructure === 'function') deleteFromTreeStructure(order);
            
            let debts = getDebtList();
            let dIdx = debts.findIndex(d => d.orderId === id);
            if(dIdx !== -1) {
                if(typeof deleteFromCloudCollection === 'function') deleteFromCloudCollection('Debts', debts[dIdx].id);
                debts.splice(dIdx, 1);
                saveDebtList(debts);
            }
        }
        count++;
    });




    let h = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    const idsToRemove = Array.from(checks).map(c => c.value);
    h = h.filter(x => !idsToRemove.includes(x.id));
    localStorage.setItem('invoiceHistory', JSON.stringify(h));




    loadHistory(false);
    calculateTodayRevenue();
    alert(`✅ Đã xóa ${count} đơn hàng!`);
}




function exportDebtToExcel() {
    let l=getDebtList(); if(l.length===0) return alert("Trống!");
    let csv="\uFEFFMã,Ngày,Khách,SĐT,Gốc,Đã Trả,Còn Nợ\n"+l.map(d=>`"${d.orderId}","${d.date}","${d.name}","'${d.phone}",${d.originalAmount},${d.paidAmount},${d.remainingAmount}`).join('\n');
    const link=document.createElement("a"); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); link.download="CongNo.csv"; link.click();
}




// --- CRM ---
let currentCrmPhone = '';
function openDebtFromCRM() {
    if (!currentCrmPhone) return;
    closeModal('customerDetailModal'); 
    document.getElementById('inpSearchDebt').value = currentCrmPhone;
    switchDebtTab('active');
    openDebtModal();
    renderDebtList(); 
}




function payDebtFromCRM() {
    const amt = parseInt(document.getElementById('crmPayAmountInput').value);
    if (!amt || amt <= 0) return alert("Vui lòng nhập số tiền hợp lệ!");
    openDebtFromCRM();
    alert("Hệ thống đã chuyển sang Sổ Nợ.\nHãy bấm nút 'Trả' màu xanh tương ứng với đơn hàng cần thanh toán.");
}




function openCRM(phone) {
    const cus = customerList.find(c => c.phone === phone);
    if (!cus) return;
    currentCrmPhone = phone;
    document.getElementById('crmNameInput').value = cus.name;
    document.getElementById('crmPhoneInput').value = cus.phone;
    document.getElementById('crmOriginalPhone').value = cus.phone;
    document.getElementById('crmFilterStart').value = "";
    document.getElementById('crmFilterEnd').value = "";
    document.getElementById('crmSearchInput').value = "";
document.getElementById('crmDebtQRContainer').style.display = 'none';     renderCRMHistory();
    document.getElementById('customerDetailModal').style.display = 'flex';
}




function renderCRMHistory() {
    let h = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    h = h.filter(x => x.phone === currentCrmPhone);
    const totalSpend = h.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('crmTotalSpend').innerText = formatMoney(totalSpend) + " đ";
    const debtList = getDebtList();
    const currentDebt = debtList
        .filter(d => d.phone === currentCrmPhone && d.remainingAmount > 0)
        .reduce((acc, d) => acc + d.remainingAmount, 0);
    document.getElementById('crmCurrentDebt').innerText = formatMoney(currentDebt) + " đ";
let credits = getCredits();
let walletEl = document.getElementById('crmWalletBalance');
if(walletEl) walletEl.innerText = formatMoney(credits[currentCrmPhone] || 0) + " đ";
    const startStr = document.getElementById('crmFilterStart').value;
    const endStr = document.getElementById('crmFilterEnd').value;
    const searchStr = document.getElementById('crmSearchInput').value.toLowerCase().trim();
    if (startStr && endStr) {
        const s = new Date(startStr);
        const e = new Date(endStr); e.setHours(23,59,59);
        h = h.filter(x => { const d = new Date(x.date); return d >= s && d <= e; });
    }
    if (searchStr) {
        h = h.filter(x => x.id.toLowerCase().includes(searchStr));
    }
    const tbody = document.getElementById('crmHistoryBody');
    if (h.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Không có đơn hàng nào</td></tr>';
    else {
        tbody.innerHTML = h.map(item => {
            let prodSum = item.cart.map(c => `${c.cardType} x${c.qty}`).join(', ');
            if(prodSum.length > 30) prodSum = prodSum.substring(0,30) + '...';
            let rowStyle = item.internalNote ? 'background-color: #fff3cd;' : '';
let noteHtml = item.internalNote ? `<div style="font-size:11px; color:#856404; margin-top:3px;">🔒 ${item.internalNote}</div>` : '';
return `<tr style="${rowStyle}"><td><a href="#" onclick="viewHistoryDetail('${item.id}')" style="color:#007bff; text-decoration:none;">${item.id}</a></td><td>${item.date}</td><td>${prodSum}${noteHtml}</td><td style="text-align:right;">${formatMoney(item.total)}</td></tr>`;
        }).join('');
    }
}




function saveCRMDetails() {
    const newName = document.getElementById('crmNameInput').value.trim();
    const newPhone = document.getElementById('crmPhoneInput').value.trim(); 
    const oldId = document.getElementById('crmOriginalPhone').value; 




    if (!newName || !newPhone) return alert("Vui lòng nhập đủ thông tin!");




    if (newPhone !== oldId) {
        if (customerList.some(c => c.phone === newPhone)) {
            return alert("❌ Số điện thoại này đã thuộc về một khách hàng khác! Vui lòng gộp khách thủ công hoặc chọn số khác.");
        }
        if(!confirm(`⚠️ BẠN ĐANG THAY ĐỔI ĐỊNH DANH KHÁCH HÀNG\n\nTừ: ${oldId}\nSang: ${newPhone}\n\nHệ thống sẽ chuyển toàn bộ Lịch sử mua, Công nợ và Tiền thừa sang mã mới này. Tiếp tục?`)) return;
    }




    const idx = customerList.findIndex(c => c.phone === oldId);
    if (idx !== -1) {
        customerList[idx].name = newName;
        customerList[idx].phone = newPhone;
        localStorage.setItem('thebao_customers', JSON.stringify(customerList));
        
        if(typeof deleteFromCloudCollection === 'function' && oldId !== newPhone) {
            deleteFromCloudCollection('Customers', oldId);
            saveToCloudCollection('Customers', newPhone, customerList[idx]);
        } else if (typeof saveToCloudCollection === 'function') {
            saveToCloudCollection('Customers', newPhone, customerList[idx]);
        }
    }




    if (newPhone !== oldId) {
        let history = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
        let histChanged = false;
        history.forEach(h => {
            if (h.phone === oldId) {
                h.phone = newPhone;
                h.name = newName; 
                histChanged = true;
                if(typeof saveToCloudCollection === 'function') {
                    saveToCloudCollection('Invoices', h.id, h);
                    if(typeof saveToTreeStructure === 'function') saveToTreeStructure(h);
                }
            }
        });
        if (histChanged) localStorage.setItem('invoiceHistory', JSON.stringify(history));




        let debts = getDebtList();
        let debtChanged = false;
        debts.forEach(d => {
            if (d.phone === oldId) {
                d.phone = newPhone;
                d.name = newName;
                debtChanged = true;
                if(typeof saveToCloudCollection === 'function') saveToCloudCollection('Debts', d.id, d);
            }
        });
        if (debtChanged) saveDebtList(debts);




        let credits = getCredits();
        if (credits[oldId]) {
            credits[newPhone] = credits[oldId]; 
            delete credits[oldId]; 
            localStorage.setItem('thebao_customer_credit', JSON.stringify(credits));
        }
    } else {
        let debts = getDebtList();
        let debtChanged = false;
        debts.forEach(d => {
            if (d.phone === oldId && d.name !== newName) {
                d.name = newName;
                debtChanged = true;
                 if(typeof saveToCloudCollection === 'function') saveToCloudCollection('Debts', d.id, d);
            }
        });
        if (debtChanged) saveDebtList(debts);
    }




    renderCustomerTable();
    currentCrmPhone = newPhone;
    document.getElementById('crmOriginalPhone').value = newPhone;
    
    alert("✅ Đã cập nhật thông tin và đồng bộ dữ liệu!");
    renderCRMHistory(); 
}




function printProvisional() { document.getElementById('invoiceArea').classList.add('provisional-hidden'); document.getElementById('lblInvoiceTitle').innerText="HÓA ĐƠN TẠM TÍNH"; setTimeout(()=>{window.print();document.getElementById('invoiceArea').classList.remove('provisional-hidden');document.getElementById('lblInvoiceTitle').innerText="HÓA ĐƠN BÁN HÀNG";},500); }
function printOfficial() { if(isDebtViewMode) return alert("Đang xem nợ, không in!"); window.print(); }




function downloadInvoiceImage() { 
    const element = document.getElementById('invoiceArea');
    const originalMaxHeight = element.style.maxHeight;
    const originalOverflow = element.style.overflow;
    const restoreQr = swapQrToLocalForCapture(element);

    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';

    html2canvas(element, { scale: 2, useCORS: true, allowTaint: true }).then(c => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;

        const l = document.createElement('a'); 
        l.download = (document.getElementById('inpInvoiceID')?.value || 'HD') + '.png'; 
        l.href = c.toDataURL(); 
        l.click();
    }).catch(err => {
        restoreQr();
        element.style.maxHeight = originalMaxHeight;
        element.style.overflow = originalOverflow;
        console.error("Lỗi tải ảnh:", err);
    }); 
}


function shareProvisionalImage() { 
    const n = document.getElementById('invoiceArea'); 
    n.classList.add('provisional-hidden'); 
    document.getElementById('lblInvoiceTitle').innerText = "HÓA ĐƠN TẠM TÍNH";
    
    html2canvas(n, { scale: 2, useCORS: true, allowTaint: true }).then(c => {
        c.toBlob(b => {
            const f = new File([b], "Tam.png", { type: "image/png" }); 
            if (navigator.share) navigator.share({ files: [f] }); 
            else {
                const l = document.createElement('a'); 
                l.download = 'Tam.png'; 
                l.href = c.toDataURL(); 
                l.click();
            } 
            n.classList.remove('provisional-hidden'); 
            document.getElementById('lblInvoiceTitle').innerText = "HÓA ĐƠN BÁN HÀNG"; 
        });
    }); 
}




function shareInvoiceImage() { 
    const element = document.getElementById('invoiceArea');
    const restoreQr = swapQrToLocalForCapture(element);
    html2canvas(element, { scale: 2, useCORS: true, allowTaint: true }).then(c => {
        restoreQr();
        c.toBlob(b => {
            const f = new File([b], "HD.png", { type: "image/png" }); 
            if (navigator.share) navigator.share({ files: [f] }); 
            else {
                const l = document.createElement('a'); 
                l.download = 'HD.png'; 
                l.href = c.toDataURL(); 
                l.click();
            } 
        });
    }).catch(() => restoreQr()); 
}




function deleteCurrentCustomer() {
    const phone = document.getElementById('crmOriginalPhone').value;
    const name = document.getElementById('crmNameInput').value;
    
    if (!phone) return alert("Không xác định được khách hàng!");




    const inputName = prompt(`⚠️ CẢNH BÁO NGUY HIỂM:\n\nBạn đang yêu cầu xóa khách hàng: ${name}\n- Hành động này sẽ xóa VĨNH VIỄN thông tin khách.\n- Xóa TOÀN BỘ lịch sử đơn hàng đã mua.\n- Xóa toàn bộ công nợ và tiền thừa.\n\nĐể xác nhận, vui lòng nhập chính xác tên khách hàng vào ô dưới đây:`);




    if (inputName !== name) {
        alert("❌ Tên nhập không khớp! Hủy bỏ lệnh xóa.");
        return;
    }




    customerList = customerList.filter(c => c.phone !== phone);
    localStorage.setItem('thebao_customers', JSON.stringify(customerList));




    let history = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    const invoicesToDelete = history.filter(x => x.phone === phone);
    history = history.filter(x => x.phone !== phone);
    localStorage.setItem('invoiceHistory', JSON.stringify(history));




    let debts = getDebtList();
    const debtsToDelete = debts.filter(x => x.phone === phone);
    debts = debts.filter(x => x.phone !== phone);
    saveDebtList(debts);




    let credits = getCredits();
    if(credits[phone]) {
        delete credits[phone];
        localStorage.setItem('thebao_customer_credit', JSON.stringify(credits));
    }




    if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined') {
     // --- FIX LỖI 4: GOM GÓI LỆNH XÓA (BATCH) ---
     let batch = db.batch();
     const userRef = db.collection('UserData').doc(currentUser.uid);


     // 1. Lệnh xóa thông tin Khách hàng
     batch.delete(userRef.collection('Customers').doc(phone));


     // 2. Các lệnh xóa Hóa đơn cũ
     invoicesToDelete.forEach(inv => {
         batch.delete(userRef.collection('Invoices').doc(inv.id));
     });


     // 3. Các lệnh xóa Công nợ
     debtsToDelete.forEach(d => {
         batch.delete(userRef.collection('Debts').doc(d.id));
     });


     // 4. Gửi đúng 1 request lên máy chủ
     batch.commit().then(() => {
         console.log("✅ Đã xóa hàng loạt dữ liệu khách hàng trên Cloud an toàn.");
     }).catch(err => console.error("Lỗi xóa gói Cloud:", err));
 }




    alert(`✅ Đã xóa hoàn toàn khách hàng ${name} và dữ liệu liên quan!`);
    closeModal('customerDetailModal'); 
    renderCustomerTable(); 
    loadHistory(false); 
    calculateTodayRevenue(); 
}




// KHỞI ĐỘNG HỆ THỐNG
function topUpWalletCRM() {
    if(!currentCrmPhone) return;
    let amt = prompt("Nhập số tiền khách muốn nạp trước vào ví (VNĐ):");
    if(!amt) return;
    let parsedAmt = parseInt(amt.replace(/\D/g, ''));
    if(isNaN(parsedAmt) || parsedAmt <= 0) return alert("Số tiền không hợp lệ!");
    let c = getCredits();
    c[currentCrmPhone] = (c[currentCrmPhone] || 0) + parsedAmt;
    localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
    if(document.getElementById('crmWalletBalance')) document.getElementById('crmWalletBalance').innerText = formatMoney(c[currentCrmPhone]) + " đ";
    alert(`✅ Đã nạp ${formatMoney(parsedAmt)} đ vào ví điện tử của khách!`);
}




function clearWalletCRM() {
    if(!currentCrmPhone) return;
    if(!confirm("⚠️ Mày có chắc chắn muốn XÓA SẠCH toàn bộ số dư ví của khách này không?")) return;
    let c = getCredits();
    c[currentCrmPhone] = 0;
    localStorage.setItem('thebao_customer_credit', JSON.stringify(c));
    if(document.getElementById('crmWalletBalance')) document.getElementById('crmWalletBalance').innerText = "0 đ";
    alert("✅ Đã xóa trắng ví thành công!");
}
function generateCRMDebtQR() {
    if (!currentCrmPhone) return;
    const debtList = getDebtList();
    const currentDebt = debtList
        .filter(d => d.phone === currentCrmPhone && d.remainingAmount > 0)
        .reduce((acc, d) => acc + d.remainingAmount, 0);
    
    if (currentDebt <= 0) return alert("Khách hàng này hiện không có công nợ!");




    // Luôn ưu tiên dùng tài khoản chính (Ngân hàng 1) cho việc thu nợ CRM
    let bankId = storeConfig.bankId || "MB";
    let accNum = storeConfig.accNum || "";
    let accName = storeConfig.accName || "";
    setVietQRImage(document.getElementById('crmDebtQRImg'), bankId, accNum, accName, currentDebt, `Thanh toan no cho ${currentCrmPhone}`);
    document.getElementById('crmDebtQRContainer').style.display = 'block';
}
window.storageReadyPromise = initStorageSystem().then(() => {
    init(); 
    console.log("✅ App đã khởi động với hệ thống lưu trữ không giới hạn!");
});
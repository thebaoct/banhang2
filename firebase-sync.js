// 1. CẤU HÌNH & INIT
const firebaseConfig = {
  apiKey: "AIzaSyCDbmOhw66k7udzJHq5TgAmTqj37eBMsC4",
  authDomain: "thebaovn-1ce9d.firebaseapp.com",
  projectId: "thebaovn-1ce9d",
  storageBucket: "thebaovn-1ce9d.firebasestorage.app",
  messagingSenderId: "429214977285",
  appId: "1:429214977285:web:ecfa877da90a68b2bf3b6c"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();








// Bật cache offline
db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log("Persistence warning:", err.code));
let currentUser = null;








// 2. AUTHENTICATION & AUTO-SYNC
auth.onAuthStateChanged(async (user) => {
    const modal = document.getElementById('authModal');
    const display = document.getElementById('userEmailDisplay');
    
    if (user) {
        currentUser = user;
        if(modal) modal.style.display = 'none';
        if(display) display.innerHTML = `👤 ${user.email} <span style="font-size:9px; color:#4caf50;">● Online</span>`;
        
        if (window.storageReadyPromise) {
            try { await window.storageReadyPromise; } catch (e) { console.error(e); }
        }

        // TỰ ĐỘNG: Tải cấu hình & Sản phẩm & Kho khi đăng nhập
        await loadConfigsFromCloud(); 
        
        // Nếu máy chưa có dữ liệu hoá đơn nào, tự động tải về
        if(JSON.parse(localStorage.getItem('invoiceHistory')||"[]").length === 0) {
            loadAllDataFromCloud(15);
        }








    } else {
        currentUser = null;
        if(modal) modal.style.display = 'flex';
        if(display) display.innerText = "Chưa đăng nhập";
    }
});








// --- CÁC HÀM ĐĂNG NHẬP / ĐĂNG KÝ ---
function handleLogin() {
    const e = document.getElementById('txtEmail').value;
    const p = document.getElementById('txtPassword').value;
    const errBox = document.getElementById('authError');
    if(!e || !p) return alert("Thiếu thông tin!");


    let attempts = parseInt(localStorage.getItem('login_attempts') || '0');
    let lockout = parseInt(localStorage.getItem('login_lockout_time') || '0');
    let penalty = parseInt(localStorage.getItem('login_penalty') || '120'); 


    if (Date.now() < lockout) {
        let remain = Math.ceil((lockout - Date.now()) / 1000);
        errBox.innerText = `⛔ Tạm khóa do nhập sai nhiều lần. Vui lòng đợi ${remain} giây!`;
        return;
    }


    errBox.innerText = "Đang xác thực...";


    auth.signInWithEmailAndPassword(e, p).then(() => {
        localStorage.removeItem('login_attempts');
        localStorage.removeItem('login_lockout_time');
        localStorage.removeItem('login_penalty');
        errBox.innerText = "";
    }).catch(err => {
        attempts++;
        if (attempts >= 5) {
            lockout = Date.now() + (penalty * 1000);
            localStorage.setItem('login_lockout_time', lockout.toString());
            localStorage.setItem('login_penalty', (penalty + 60).toString()); 
            localStorage.setItem('login_attempts', '0'); 
            errBox.innerText = `⛔ Sai mật khẩu 5 lần! Khóa chức năng đăng nhập ${penalty} giây.`;
        } else {
            localStorage.setItem('login_attempts', attempts.toString());
            errBox.innerText = `❌ Sai mật khẩu (Lần ${attempts}/5). ${err.message}`;
        }
    });
}








function handleSignUp() {
    const e = document.getElementById('txtEmail').value;
    const p = document.getElementById('txtPassword').value;
    if(!e || !p) return alert("Thiếu thông tin!");
    auth.createUserWithEmailAndPassword(e, p)
        .then(() => alert("Đăng ký thành công!"))
        .catch(err => document.getElementById('authError').innerText = err.message);
}








function handleLogout() {
    if(confirm("Đăng xuất?")) { auth.signOut(); location.reload(); }
}








// 3. CORE SYNC FUNCTIONS (Hàm cốt lõi)
async function saveToCloudCollection(collectionName, docId, data) {
    if (!currentUser) return;
    const dataWithTime = { ...data, last_updated: new Date().toISOString() };
    try {
        await db.collection('UserData').doc(currentUser.uid)
                .collection(collectionName).doc(docId)
                .set(dataWithTime, { merge: true });
    } catch (e) { console.error("Save Error:", e); }
}








// [QUAN TRỌNG] HÀM LƯU PHÂN CẤP CÂY (NĂM/THÁNG/NGÀY)
async function saveToTreeStructure(order) {
    if (!currentUser || !order.date) return;
    try {
        // Tách ngày tháng: 2026-01-23 -> Năm 2026, Tháng 01, Ngày 23
        const parts = order.date.split('-');
        const nam = parts[0]; 
        const thang = parts[1]; 
        const ngay = parts[2];
        
        // Đường dẫn: UserData -> UID -> Invoices_Tree -> 2026 -> Months -> 01 -> Days -> 23 -> DailyInvoices
        await db.collection('UserData').doc(currentUser.uid)
            .collection('Invoices_Tree').doc(nam)
            .collection('Months').doc(thang)
            .collection('Days').doc(ngay)
            .collection('DailyInvoices').doc(order.id)
            .set(order, { merge: true });
            
        console.log(`[CLOUD TREE] Saved to ${nam}/${thang}/${ngay}`);
    } catch (e) { console.error("Tree Save Error:", e); }
}








async function deleteFromCloudCollection(collectionName, docId) {
    if (!currentUser) return;
    try {
        await db.collection('UserData').doc(currentUser.uid)
                .collection(collectionName).doc(docId).delete();
    } catch (e) { console.error("Delete Error:", e); }
}

async function deleteFromTreeStructure(order) {
    if (!currentUser || !order || !order.date || !order.id) return;
    try {
        const parts = order.date.split('-');
        if (parts.length < 3) return;
        await db.collection('UserData').doc(currentUser.uid)
            .collection('Invoices_Tree').doc(parts[0])
            .collection('Months').doc(parts[1])
            .collection('Days').doc(parts[2])
            .collection('DailyInvoices').doc(order.id).delete();
    } catch (e) { console.error("Tree Delete Error:", e); }
}
window.deleteFromTreeStructure = deleteFromTreeStructure;








// 4. HOOKS (GHI ĐÈ HÀM CŨ ĐỂ CHÈN LOGIC MỚI)








// A. Invoices (Đã thêm logic lưu phân cấp)
const old_saveHistory = window.saveHistory || saveHistory;
window.saveHistory = function(isNew) {
    old_saveHistory(isNew);
    const id = document.getElementById('inpInvoiceID').value;
    const history = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    const order = history.find(x => x.id === id);
    if(order) {
        // 1. Lưu dạng phẳng (để App load nhanh)
        saveToCloudCollection('Invoices', id, order);
        // 2. Lưu dạng cây (để quản lý theo ngày tháng)
        saveToTreeStructure(order);
    }
};








// B. Debts (Công nợ)
const old_addDebtRecord = window.addDebtRecord || addDebtRecord;
window.addDebtRecord = function(order, total, paid) {
    old_addDebtRecord(order, total, paid);
    const list = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]");
    if(list.length > 0) saveToCloudCollection('Debts', list[0].id, list[0]);
};








const old_payDebt = window.payDebt || payDebt;
window.payDebt = function(id) {
    old_payDebt(id);
    const list = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]");
    const d = list.find(x => x.id === id);
    if(d) saveToCloudCollection('Debts', d.id, d);
};








const old_deleteDebt = window.deleteDebt || deleteDebt;
window.deleteDebt = function(id) {
    old_deleteDebt(id);
    deleteFromCloudCollection('Debts', id);
};








const old_saveEditedOrder = window.saveEditedOrder || saveEditedOrder;
window.saveEditedOrder = function() {
    old_saveEditedOrder();
    const id = document.getElementById('inpInvoiceID').value;
    const history = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    const order = history.find(x => x.id === id);
    if(order) {
        saveToCloudCollection('Invoices', id, order);
        saveToTreeStructure(order);
    }
};








// C. Customers
const old_addNewCustomer = window.addNewCustomer || addNewCustomer;
window.addNewCustomer = function() {
    old_addNewCustomer();
    const list = JSON.parse(localStorage.getItem('thebao_customers')||"[]");
    const newCus = list[list.length - 1]; 
    if(newCus && newCus.phone) {
        saveToCloudCollection('Customers', newCus.phone, newCus);
    }
};








// --- [FIX LỖI 3] ĐỒNG BỘ KHÁCH HÀNG HÀNG LOẠT LÊN CLOUD ---
async function syncAllCustomersToCloud() {
    if(!currentUser) return;
    const customers = JSON.parse(localStorage.getItem('thebao_customers')||"[]");
    let batch = db.batch();
    let count = 0;
    for(let cus of customers) {
        if(cus.phone) {
            const ref = db.collection('UserData').doc(currentUser.uid).collection('Customers').doc(cus.phone);
            batch.set(ref, cus, {merge:true});
            count++;
            if(count >= 300) { await batch.commit(); batch = db.batch(); count = 0; }
        }
    }
    if(count > 0) await batch.commit();
    console.log("✅ Đã đồng bộ hàng loạt Khách hàng lên Cloud!");
}








const old_syncCustomersFromHistory = window.syncCustomersFromHistory || syncCustomersFromHistory;
window.syncCustomersFromHistory = function() {
    old_syncCustomersFromHistory();
    syncAllCustomersToCloud();
};








const old_importCustomersExcel = window.importCustomersExcel || importCustomersExcel;
window.importCustomersExcel = function(inp) {
    old_importCustomersExcel(inp);
    // Excel xử lý bất đồng bộ, nên set độ trễ 3s rồi tự đẩy lên Cloud
    setTimeout(syncAllCustomersToCloud, 3000);
};








// --- [FIX LỖI 1] HOOK VÍ ĐIỆN TỬ (CREDIT) ĐỂ ĐỒNG BỘ LÊN CLOUD ---
function syncCreditToCloud() {
    if(!currentUser) return;
    const credits = JSON.parse(localStorage.getItem('thebao_customer_credit') || "{}");
    saveToCloudCollection('Configs', 'CustomerCredits', credits);
}








const old_clearCreditManual = window.clearCreditManual || clearCreditManual;
window.clearCreditManual = function() { old_clearCreditManual(); syncCreditToCloud(); };








const old_useCredit = window.useCredit || useCredit;
window.useCredit = function(p, amt) { old_useCredit(p, amt); syncCreditToCloud(); };








const old_topUpWalletCRM = window.topUpWalletCRM || topUpWalletCRM;
window.topUpWalletCRM = function() { old_topUpWalletCRM(); syncCreditToCloud(); };








const old_clearWalletCRM = window.clearWalletCRM || clearWalletCRM;
window.clearWalletCRM = function() { old_clearWalletCRM(); syncCreditToCloud(); };
















// D. Configs & Catalog & Inventory
const old_saveGlobalSettings = window.saveGlobalSettings || saveGlobalSettings;
window.saveGlobalSettings = function() {
    old_saveGlobalSettings();
    saveToCloudCollection('Configs', 'StoreConfig', JSON.parse(localStorage.getItem('thebao_store_config')||"{}"));
};








const old_saveCatalogSettings = window.saveCatalogSettings || saveCatalogSettings;
window.saveCatalogSettings = function() {
    old_saveCatalogSettings();
    const catData = JSON.parse(localStorage.getItem('thebao_catalog_v6')||"[]");
    saveToCloudCollection('Configs', 'ProductCatalog', { list: catData });
};








const old_saveInventory = window.saveInventory || saveInventory;
window.saveInventory = function() {
    old_saveInventory();
    saveToCloudCollection('Configs', 'Inventory', JSON.parse(localStorage.getItem('thebao_inventory')||"{}"));
};








window.returnStock = function(cartItem) {
    if(!cartItem.cardList || cartItem.cardList.length === 0) return;
    let inv = JSON.parse(localStorage.getItem('thebao_inventory') || "{}");
    const key = `${cartItem.cardType}_${cartItem.faceValue}`;
    if(!inv[key]) inv[key] = [];
    cartItem.cardList.forEach(card => {
        if(card.code || card.serial) {
            inv[key].push({code: card.code, serial: card.serial});
        }
    });
    localStorage.setItem('thebao_inventory', JSON.stringify(inv));
    saveToCloudCollection('Configs', 'Inventory', inv);
};








// 5. CLOUD LOAD LOGIC (Tải dữ liệu từ Cloud về máy)
async function loadConfigsFromCloud() {
    if (!currentUser) return;
    try {
        const userRef = db.collection('UserData').doc(currentUser.uid);
        
        // Thay thế đoạn xử lý StoreConfig trong hàm loadConfigsFromCloud của tệp firebase-sync.js




        // 1. Tải Cấu hình Shop
        const doc = await userRef.collection('Configs').doc('StoreConfig').get();
        if(doc.exists) {
            localStorage.setItem('thebao_store_config', JSON.stringify(doc.data()));
            if(typeof loadStoreConfig === 'function') loadStoreConfig();
            const d = doc.data();
            if(document.getElementById('cfgBrandName')) {
                document.getElementById('cfgBrandName').value = d.brandName || "";
                document.getElementById('cfgSlogan').value = d.slogan || "";
                document.getElementById('cfgHotline').value = d.hotline || "";
                
                document.getElementById('cfgBankId').value = d.bankId || "MB";
                document.getElementById('cfgAccNum').value = d.accNum || "";
                document.getElementById('cfgAccName').value = d.accName || "";
                
                if(document.getElementById('cfgBankId2')) {
                    document.getElementById('cfgBankId2').value = d.bankId2 || "";
                    document.getElementById('cfgAccNum2').value = d.accNum2 || "";
                    document.getElementById('cfgAccName2').value = d.accName2 || "";
                    document.getElementById('cfgBankId3').value = d.bankId3 || "";
                    document.getElementById('cfgAccNum3').value = d.accNum3 || "";
                    document.getElementById('cfgAccName3').value = d.accName3 || "";
                }
            }
        }
        
        // 2. Tải Danh mục Sản phẩm (Catalog)
        const docCat = await userRef.collection('Configs').doc('ProductCatalog').get();
        if(docCat.exists && docCat.data().list) {
            localStorage.setItem('thebao_catalog_v6', JSON.stringify(docCat.data().list));
            if(typeof loadCatalog === 'function') loadCatalog();
            if(typeof renderCatalogSelects === 'function') renderCatalogSelects();
            if(typeof renderCatalogSettings === 'function') renderCatalogSettings();
        }








        // 3. Tải Kho thẻ
        const docInv = await userRef.collection('Configs').doc('Inventory').get();
        if(docInv.exists) {
            localStorage.setItem('thebao_inventory', JSON.stringify(docInv.data()));
            if(typeof loadInventory === 'function') loadInventory();
            if(typeof renderInventoryTab === 'function') renderInventoryTab();
        }








        // 4. [FIX LỖI 1] Tải Ví Điện Tử (CustomerCredits) về Local
        const docCred = await userRef.collection('Configs').doc('CustomerCredits').get();
        if(docCred.exists) {
            localStorage.setItem('thebao_customer_credit', JSON.stringify(docCred.data()));
        }
        
        updateInvoiceHeader();
        console.log("✅ Đã đồng bộ xong dữ liệu Cấu hình & Sản phẩm từ Cloud!");
    } catch(e) { console.error("Load Config Err:", e); }
}








async function loadAllDataFromCloud(limitCount = 15) {
    if (!currentUser) return;
    if(typeof showProgressModal === 'function') showProgressModal("ĐANG ĐỒNG BỘ DỮ LIỆU...");


    try {
        const userRef = db.collection('UserData').doc(currentUser.uid);


        const cusSnap = await userRef.collection('Customers').get();
        let localCus = JSON.parse(localStorage.getItem('thebao_customers')||"[]");
        let cusMap = new Map(localCus.map(x => [x.phone, x])); 
        cusSnap.forEach(d => cusMap.set(d.id, d.data())); 
        localStorage.setItem('thebao_customers', JSON.stringify(Array.from(cusMap.values())));


        const debtSnap = await userRef.collection('Debts').get();
        let localDebts = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]");
        let debtMap = new Map(localDebts.map(x => [x.id, x]));
        debtSnap.forEach(d => debtMap.set(d.id, d.data()));
        let mergedDebts = Array.from(debtMap.values());
        mergedDebts.sort((a,b) => new Date(b.date) - new Date(a.date));
        localStorage.setItem('thebao_debt_list', JSON.stringify(mergedDebts));


        const invSnap = await userRef.collection('Invoices').orderBy('date', 'desc').limit(limitCount).get();
        let localInvoices = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
        let invMap = new Map(localInvoices.map(x => [x.id, x]));
        invSnap.forEach(d => invMap.set(d.id, d.data())); 
        let mergedInvoices = Array.from(invMap.values());
        mergedInvoices.sort((a,b) => new Date(b.date+' '+b.time) - new Date(a.date+' '+a.time));
        localStorage.setItem('invoiceHistory', JSON.stringify(mergedInvoices));


        loadConfigsFromCloud();
        if(typeof loadCustomerList === 'function') loadCustomerList();
        if(typeof renderCustomerTable === 'function') renderCustomerTable();
        if(typeof renderInventoryTab === 'function') renderInventoryTab();
        if(typeof calculateTodayRevenue === 'function') calculateTodayRevenue();
        if(typeof renderAll === 'function') renderAll();
        if(typeof loadHistory === 'function') loadHistory(false);


        if(typeof closeProgressModal === 'function') closeProgressModal();
    } catch (e) {
        console.error(e);
        if(typeof closeProgressModal === 'function') closeProgressModal();
        if(e.message.includes("index")) alert("⚠️ Hãy mở Console (F12) và click vào link tạo Index của Firebase!");
    }
}




// 6. MIGRATE OLD DATA (Nút chuyển dữ liệu cũ lên Cloud)
async function migrateOldDataToCloud() {
    if(!currentUser) return alert("Chưa đăng nhập!");
    if(!confirm("Đẩy toàn bộ dữ liệu máy lên Cloud? (Dữ liệu sẽ tự động chia vào các thư mục Năm/Tháng/Ngày)")) return;
    if(typeof showProgressModal === 'function') showProgressModal("ĐANG UPLOAD...");
    
    const invoices = JSON.parse(localStorage.getItem('invoiceHistory')||"[]");
    const customers = JSON.parse(localStorage.getItem('thebao_customers')||"[]");
    const debts = JSON.parse(localStorage.getItem('thebao_debt_list')||"[]");
    
    let batch = db.batch();
    let count = 0;
    const BATCH_LIMIT = 300; // Giảm giới hạn để tránh lỗi quá tải








    const commitBatch = async () => {
        if (count > 0) {
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    };








    // Upload Invoices 
    for(let inv of invoices) {
        const ref = db.collection('UserData').doc(currentUser.uid).collection('Invoices').doc(inv.id);
        batch.set(ref, inv, {merge:true});
        
        if(inv.date) {
            const p = inv.date.split('-');
            const treeRef = db.collection('UserData').doc(currentUser.uid)
                .collection('Invoices_Tree').doc(p[0])
                .collection('Months').doc(p[1])
                .collection('Days').doc(p[2])
                .collection('DailyInvoices').doc(inv.id);
            batch.set(treeRef, inv, {merge:true});
        }
        count++;
        if(count >= BATCH_LIMIT) await commitBatch();
    }








    // Upload Customers
    for(let cus of customers) {
        const ref = db.collection('UserData').doc(currentUser.uid).collection('Customers').doc(cus.phone);
        batch.set(ref, cus, {merge:true});
        count++;
        if(count >= BATCH_LIMIT) await commitBatch();
    }
    
    // Upload Debts
    for(let d of debts) {
        const ref = db.collection('UserData').doc(currentUser.uid).collection('Debts').doc(d.id);
        batch.set(ref, d, {merge:true});
        count++;
        if(count >= BATCH_LIMIT) await commitBatch();
    }








    // Upload Configs & Catalog
    const cfgRef = db.collection('UserData').doc(currentUser.uid).collection('Configs').doc('StoreConfig');
    batch.set(cfgRef, JSON.parse(localStorage.getItem('thebao_store_config')||"{}"));
    
    const catRef = db.collection('UserData').doc(currentUser.uid).collection('Configs').doc('ProductCatalog');
    batch.set(catRef, { list: JSON.parse(localStorage.getItem('thebao_catalog_v6')||"[]") });








    const invRef = db.collection('UserData').doc(currentUser.uid).collection('Configs').doc('Inventory');
    batch.set(invRef, JSON.parse(localStorage.getItem('thebao_inventory')||"{}"));








    // [FIX LỖI 1] Đẩy cả Ví điện tử (CustomerCredits) lên
    const credRef = db.collection('UserData').doc(currentUser.uid).collection('Configs').doc('CustomerCredits');
    batch.set(credRef, JSON.parse(localStorage.getItem('thebao_customer_credit')||"{}"));








    await commitBatch();
    if(typeof closeProgressModal === 'function') closeProgressModal();
    alert("✅ Upload thành công! Đã phân chia dữ liệu theo ngày tháng.");
}








window.manualSyncToCloud = migrateOldDataToCloud;
window.manualSyncFromCloud = loadAllDataFromCloud;








// --- HÀM TẢI TOÀN BỘ DỮ LIỆU TỪ CLOUD (.JSONL) ---
window.downloadAllFromCloud = async function() {
    if (!currentUser) return alert("⚠️ Vui lòng đăng nhập để tải dữ liệu!");
    if(typeof showProgressModal === 'function') showProgressModal("ĐANG KẾT NỐI CLOUD...");
    
    const uid = currentUser.uid;
    const chunks = []; 








    try {
        if(typeof updateProgress === 'function') updateProgress(10, null);
        
        const getDocData = async (col, doc) => {
            try {
                const s = await db.collection('UserData').doc(uid).collection(col).doc(doc).get();
                return s.exists ? s.data() : null;
            } catch(e) { return null; }
        };
        
        const storeConfig = await getDocData('Configs', 'StoreConfig');
        const productCatalogWrapper = await getDocData('Configs', 'ProductCatalog');
        const inventory = await getDocData('Configs', 'Inventory');
        // [FIX LỖI 1] Lấy Ví điện tử để cho vào Backup
        const customerCredits = await getDocData('Configs', 'CustomerCredits');
        
        const cusSnap = await db.collection('UserData').doc(uid).collection('Customers').get();
        const customers = [];
        cusSnap.forEach(doc => customers.push(doc.data()));








        const meta = {
            type: 'meta',
            configs: storeConfig ? JSON.stringify(storeConfig) : "{}",
            catalog: productCatalogWrapper ? JSON.stringify(productCatalogWrapper.list || []) : "[]",
            customers: JSON.stringify(customers),
            credits: customerCredits ? JSON.stringify(customerCredits) : "{}", 
            inventory: inventory ? JSON.stringify(inventory) : "{}"
        };
        chunks.push(JSON.stringify(meta) + '\n');
        
        if(typeof updateProgress === 'function') updateProgress(30, null);
        const debtSnap = await db.collection('UserData').doc(uid).collection('Debts').get();
        debtSnap.forEach(doc => {
            chunks.push(JSON.stringify({type: 'debt', data: doc.data()}) + '\n');
        });
        
        if(typeof updateProgress === 'function') updateProgress(50, null);
        const invSnap = await db.collection('UserData').doc(uid).collection('Invoices').get();
        let count = 0;
        
        invSnap.forEach(doc => {
            chunks.push(JSON.stringify({type: 'history', data: doc.data()}) + '\n');
            count++;
        });
        
        if(typeof updateProgress === 'function') updateProgress(100, 0);








        const blob = new Blob(chunks, {type: "application/x-jsonlines"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cloud_FullBackup_${new Date().toISOString().slice(0,10)}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
        
        if(typeof closeProgressModal === 'function') closeProgressModal();
        console.log(`✅ Đã tải xong: ${count} đơn hàng, ${customers.length} khách, ${debtSnap.size} nợ.`);
    } catch (e) {
        console.error(e);
        alert("❌ Lỗi tải dữ liệu: " + e.message);
        if(typeof closeProgressModal === 'function') closeProgressModal();
    }
};


// --- HÀM NẠP FILE BACKUP (.JSONL) LÊN CLOUD ---
window.restoreBackupToCloud = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (!currentUser) return alert("⚠️ Vui lòng đăng nhập trước khi nạp dữ liệu lên Cloud!");
    if (!confirm("Bạn có muốn khôi phục dữ liệu từ file JSONL này vào máy và đồng bộ thẳng lên Cloud không?")) return;

    if (typeof showProgressModal === 'function') showProgressModal("ĐANG NẠP BACKUP & ĐỒNG BỘ CLOUD...");

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const lines = e.target.result.split('\n');
            let newHistory = [];
            let newDebts = [];
            let newConfigs = null, newCatalog = null, newCustomers = null, newCredits = null, newInventory = null;

            for (let line of lines) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.type === 'meta') {
                        newConfigs = obj.configs;
                        newCatalog = obj.catalog;
                        newCustomers = obj.customers;
                        newCredits = obj.credits;
                        newInventory = obj.inventory;
                    } else if (obj.type === 'history' && obj.data) {
                        newHistory.push(obj.data);
                    } else if (obj.type === 'debt' && obj.data) {
                        newDebts.push(obj.data);
                    }
                } catch (err) { console.error(err); }
            }

            if (newConfigs) localStorage.setItem('thebao_store_config', newConfigs);
            if (newCatalog) localStorage.setItem('thebao_catalog_v6', newCatalog);
            if (newCustomers) localStorage.setItem('thebao_customers', newCustomers);
            if (newCredits) localStorage.setItem('thebao_customer_credit', newCredits);
            if (newInventory) localStorage.setItem('thebao_inventory', newInventory);

            if (newHistory.length > 0) {
                const curH = JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
                const ids = new Set(curH.map(x => x.id));
                newHistory.forEach(item => { if (!ids.has(item.id)) curH.push(item); });
                curH.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
                localStorage.setItem('invoiceHistory', JSON.stringify(curH));
            }

            if (newDebts.length > 0) {
                const curD = JSON.parse(localStorage.getItem('thebao_debt_list') || "[]");
                const ids = new Set(curD.map(x => x.id));
                newDebts.forEach(item => { if (!ids.has(item.id)) curD.push(item); });
                localStorage.setItem('thebao_debt_list', JSON.stringify(curD));
            }

            await migrateOldDataToCloud();
            if (typeof closeProgressModal === 'function') closeProgressModal();
            location.reload();
        } catch (err) {
            if (typeof closeProgressModal === 'function') closeProgressModal();
            alert("❌ Lỗi nạp file Backup: " + err.message);
        }
    };
    reader.readAsText(file);
};

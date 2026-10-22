/* --- PHẦN 1: LOGIC CHATBOT CƠ BẢN & XỬ LÝ LỆNH THÔNG MINH --- */
let chatState = 'MENU';




function toggleChatWindow() {
    const win = document.getElementById('chat-window');
    if (win.style.display === 'none' || !win.style.display) {
        win.style.display = 'flex';
        if(document.getElementById('chatBody').innerHTML.trim() === "") {
            showMainMenu();
        }
        setTimeout(() => document.getElementById('chatInput').focus(), 100);
    } else {
        win.style.display = 'none';
    }
}




function addMessage(text, type) {
    const body = document.getElementById('chatBody');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerHTML = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}




function showMainMenu() {
    chatState = 'MENU';
    const menuHTML = `
        Chào sếp! Sếp cần em giúp gì? Gõ tự do hoặc chọn nhanh:
        <div class="chat-options">
            <button class="chip-btn" onclick="askOrder()">🔍 Tra đơn (gõ TB...)</button>
            <button class="chip-btn" onclick="askCustomer()">👤 Tìm Khách (gõ SĐT/Tên)</button>
            <button class="chip-btn" onclick="askHistory()">🕒 Lịch sử mua</button>
            <button class="chip-btn" onclick="askDebt()">📒 Tổng quan nợ</button>
            <button class="chip-btn" onclick="askCustomerDebt()">💸 Soi nợ khách</button>
            <button class="chip-btn" onclick="showDailyStats()">💰 Doanh thu nay</button>
            <button class="chip-btn" onclick="showProductList()">📦 Các loại thẻ</button>
        </div>
        <i>💡 Mẹo: Gõ "kho [tên]" để check tồn, hoặc "bán [tên] [giá] sl [số lượng]" để lên đơn nhanh.</i>
    `;
    addMessage(menuHTML, 'bot');
}




function handleChatKey(e) {
    if(e.key === 'Enter') sendUserMessage();
}




function sendUserMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return;




    addMessage(text, 'user');
    input.value = '';
    setTimeout(() => processBotLogic(text), 300);
}




function processBotLogic(text) {
    const lowerText = text.toLowerCase().trim();




    // 1. Lệnh thoát về menu luôn được ưu tiên
    if (lowerText === 'menu' || lowerText === 'thoát' || lowerText === 'huy') {
        showMainMenu(); 
        return;
    }




    // --- FIX LỖI Ở ĐÂY: ƯU TIÊN XỬ LÝ THEO TRẠNG THÁI ĐANG CHỜ TRƯỚC ---
    if (chatState !== 'MENU') {
        switch (chatState) {
            case 'WAIT_ORDER': return lookupOrder(text);
            case 'WAIT_CUSTOMER': 
                // Ở mục tìm khách, nếu gõ số thì chạy hàm tra theo SĐT, gõ chữ thì tìm tên
                if (/^(0[3|5|7|8|9])+([0-9]{8})$/.test(lowerText)) return lookupCustomerInfo(lowerText);
                else return searchCustomerByName(text);
            case 'WAIT_HISTORY': return lookupCustomerHistory(lowerText);
            case 'WAIT_DEBT_LOOKUP': return lookupCustomerDebt(lowerText);
            case 'WAIT_PRODUCT': return lookupProductDetail(text);
        }
        return; // Nếu đã xử lý state thì dừng, không chạy xuống regex tự do
    }




    // --- NẾU ĐANG Ở MENU THÌ MỚI CHO REGEX CHẠY TỰ DO ---




    // 2. Nhận diện Mã Đơn (Bắt đầu bằng TB + số/chữ)
    if (/^tb[a-z0-9]{3,}$/.test(lowerText)) {
        return lookupOrder(lowerText.toUpperCase());
    }




    // 3. Nhận diện Số Điện Thoại (10 số, bắt đầu bằng 0)
    if (/^(0[3|5|7|8|9])+([0-9]{8})$/.test(lowerText)) {
        return lookupCustomerInfo(lowerText);
    }




    // 4. Bán hàng siêu tốc: "bán garena 50 sl 2" hoặc "ban viettel 100k sl 1"
    let posMatch = lowerText.match(/^b[aá]n\s+(.+?)\s+(\d+)k?\s+sl\s+(\d+)$/i);
    if (posMatch) {
        return quickPOSCommand(posMatch[1], posMatch[2], posMatch[3]);
    }




    // 5. Kiểm tra tồn kho nhanh: "kho garena" hoặc "tồn zing"
    if (lowerText.startsWith('kho ') || lowerText.startsWith('tồn ')) {
        let kw = lowerText.replace(/^kho |^tồn /, '').trim();
        return checkInventoryCommand(kw);
    }




    // 6. Các lệnh tắt cơ bản
    if(lowerText === 'đơn') return askOrder();
    if(lowerText === 'khách') return askCustomer();
    if(lowerText === 'nợ khách' || lowerText === 'nợ') return askCustomerDebt();
    if(lowerText === 'doanh thu') return showDailyStats();
    if(lowerText === 'thẻ') return showProductList();




    // 7. Tự động tìm khách hàng theo TÊN nếu gõ chữ bình thường
    if (text.length >= 2 && !posMatch) {
        return searchCustomerByName(text);
    }
    
    // Không hiểu gì thì hiện lại menu
    showMainMenu();
}




/* --- PHẦN 2: CÁC HÀM XỬ LÝ CHỨC NĂNG CỤ THỂ --- */




// 1. TRA ĐƠN HÀNG
function askOrder() {
    chatState = 'WAIT_ORDER';
    addMessage("Gõ trực tiếp <b>Mã đơn hàng</b> (VD: TB123...) vào đây:", 'bot');
}




function lookupOrder(id) {
    let history = typeof getAllInvoiceHistory === 'function' ? getAllInvoiceHistory() : JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    let order = history.find(x => x && String(x.id || "").toLowerCase() === id.toLowerCase());
    if (order) {
        let html = `✅ <b>Đơn ${order.id.toUpperCase()}:</b><br>
        - Khách: ${order.name}<br>
        - Tổng: ${formatMoney(order.total)} đ<br>
        - TT: ${order.isPaid ? 'Đã TT' : 'Chưa TT'}<br>
        <span class="chat-link" onclick="viewHistoryDetail('${order.id}'); window.scrollTo({top:0});">👉 Xem bill</span>`;
        addMessage(html, 'bot');
        chatState = 'MENU';
    } else {
        addMessage(`❌ Không tìm thấy đơn "${id}".`, 'bot');
    }
}




// 2. KHÁCH HÀNG (SĐT & TÊN + VÍ ĐIỆN TỬ)
function askCustomer() {
    chatState = 'WAIT_CUSTOMER';
    addMessage("Gõ <b>Tên</b> hoặc <b>SĐT</b> để tìm khách:", 'bot');
}




function lookupCustomerInfo(phone) {
    let customers = JSON.parse(localStorage.getItem('thebao_customers') || "[]");
    let cus = customers.find(c => c.phone === phone);
    if (cus) {
        let credits = JSON.parse(localStorage.getItem('thebao_customer_credit') || "{}");
        let wallet = credits[cus.phone] || 0;
        let html = `👤 <b>Hồ sơ:</b> ${cus.name}<br>
        - SĐT: ${cus.phone}<br>
        - 💰 Ví điện tử: <b style="color:#27ae60">${formatMoney(wallet)}đ</b><br>
        <button class="btn-mini btn-info" onclick="openCRM('${cus.phone}')" style="margin-top:5px;">Mở CRM</button>`;
        addMessage(html, 'bot');
        chatState = 'MENU';
    } else {
        addMessage(`❌ Không có ai SĐT "${phone}".`, 'bot');
    }
}




function searchCustomerByName(kw) {
    let customers = JSON.parse(localStorage.getItem('thebao_customers') || "[]");
    let matches = customers.filter(c => c.name.toLowerCase().includes(kw.toLowerCase()) || c.phone.includes(kw));
    
    if (matches.length > 0) {
        let html = `👥 <b>Tìm thấy ${matches.length} khách khớp "${kw}":</b><br>`;
        matches.slice(0, 5).forEach(c => {
            html += `<div style="margin-top:5px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                <b>${c.name}</b> (${c.phone})
                <button class="btn-mini btn-primary" style="float:right" onclick="openCRM('${c.phone}')">CRM</button>
            </div>`;
        });
        if(matches.length > 5) html += `<i>...và ${matches.length - 5} người khác. Gõ tên chuẩn hơn để lọc.</i>`;
        addMessage(html, 'bot');
        chatState = 'MENU';
    } else {
        addMessage(`❌ Không tìm thấy khách nào có Tên/SĐT chứa "${kw}".`, 'bot');
        chatState = 'MENU';
    }
}




// 3. LỊCH SỬ MUA
function askHistory() {
    chatState = 'WAIT_HISTORY'; addMessage("Gõ <b>SĐT</b> xem lịch sử mua:", 'bot');
}
function lookupCustomerHistory(phone) {
    let history = typeof getAllInvoiceHistory === 'function' ? getAllInvoiceHistory() : JSON.parse(localStorage.getItem('invoiceHistory') || "[]");
    let userOrders = history.filter(x => x && x.phone === phone).slice(0, 5);
    if (userOrders.length > 0) {
        let listHtml = userOrders.map(o => `<li><a href="#" onclick="viewHistoryDetail('${o.id}')">${o.id}</a> - ${formatMoney(o.total)}đ</li>`).join('');
        addMessage(`🕒 <b>5 đơn gần nhất của ${phone}:</b><ul>${listHtml}</ul>`, 'bot');
        chatState = 'MENU';
    } else {
        addMessage(`❌ SĐT ${phone} chưa mua gì.`, 'bot');
    }
}




// 4. CÔNG NỢ & NHẮC NỢ
function askDebt() {
    let debts = JSON.parse(localStorage.getItem('thebao_debt_list') || "[]");
    let activeDebts = debts.filter(d => d.remainingAmount > 0);
    let totalDebt = activeDebts.reduce((s, d) => s + d.remainingAmount, 0);
    if (activeDebts.length === 0) return addMessage("🎉 Không ai nợ nần gì cả!", 'bot');
    
    let html = `📒 <b>Tổng nợ: <span style="color:red">${formatMoney(totalDebt)} đ</span></b> (${activeDebts.length} khách)<br>
    <span class="chat-link" onclick="openDebtModal(); switchDebtTab('active');">👉 Mở Sổ Nợ</span>`;
    addMessage(html, 'bot');
    chatState = 'MENU';
}




function askCustomerDebt() {
    chatState = 'WAIT_DEBT_LOOKUP'; addMessage("Gõ <b>SĐT</b> để soi nợ chi tiết:", 'bot');
}


// Thay thế hàm lookupCustomerDebt trong tệp chatbot.js


function lookupCustomerDebt(phone) {
    let debts = JSON.parse(localStorage.getItem('thebao_debt_list') || "[]");
    let cDebts = debts.filter(d => d.phone.includes(phone) && d.remainingAmount > 0);
    if (cDebts.length > 0) {
        let total = cDebts.reduce((s, d) => s + d.remainingAmount, 0);
        let listHtml = cDebts.map(d => `<li>Đơn ${d.orderId}: <span style="color:red">${formatMoney(d.remainingAmount)}đ</span></li>`).join('');
        
        // Tạo mã QR thanh toán tổng công nợ
        let cfg = JSON.parse(localStorage.getItem('thebao_store_config') || "{}");
        let bankId = cfg.bankId || "MB";
        let accNum = cfg.accNum || "";
        let accName = cfg.accName || "";
        let qrUrl = `https://img.vietqr.io/image/${bankId}-${accNum}-compact.png?amount=${total}&addInfo=Thanh toan no cho ${phone}&accountName=${encodeURIComponent(accName)}`;


        let html = `💸 <b>Nợ của ${cDebts[0].name}: <span style="color:red; font-size:15px;">${formatMoney(total)} đ</span></b>
        <ul style="padding-left:15px; margin:5px 0;">${listHtml}</ul>
        <div style="text-align:center; margin: 10px 0;">
            <span style="font-size:11px; color:#555;">MÃ QR THANH TOÁN TỔNG NỢ</span>
            <img src="${qrUrl}" style="width:150px; height:150px; display:block; margin: 5px auto; border-radius: 8px; border: 1px solid #ccc;">
        </div>
        <button class="btn-mini btn-warning" onclick="copyDebtReminder('${phone}')">📋 Copy tin nhắc nợ</button>
        <button class="btn-mini btn-success" onclick="openDebtModal(); switchDebtTab('active'); document.getElementById('inpSearchDebt').value='${phone}'; renderDebtList();">Thanh toán</button>`;
        addMessage(html, 'bot');
    } else {
        addMessage(`✅ SĐT ${phone} đang sạch nợ!`, 'bot');
    }
    chatState = 'MENU';
}


window.copyDebtReminder = function(phone) {
    let debts = JSON.parse(localStorage.getItem('thebao_debt_list') || "[]");
    let cDebts = debts.filter(d => d.phone.includes(phone) && d.remainingAmount > 0);
    if(cDebts.length === 0) return;
    let total = cDebts.reduce((s, d) => s + d.remainingAmount, 0);
    let msg = `Dạ em chào anh/chị ${cDebts[0].name}. Hiện tại anh/chị đang còn dư nợ bên THE BÁO tổng cộng là ${formatMoney(total)}đ. Anh/chị rảnh kiểm tra và chuyển khoản thanh toán giúp em nhé. Em cảm ơn ạ!`;
    navigator.clipboard.writeText(msg).then(() => alert("✅ Đã copy tin nhắn nhắc nợ vào bộ nhớ tạm! Chuyển qua Zalo dán thôi.")).catch(() => prompt("Lỗi auto copy, bạn hãy copy thủ công bên dưới:", msg));
}




// 5. DOANH THU NAY
function showDailyStats() {
    calculateTodayRevenue();
    let total = document.getElementById('dailyTotalDisplay').innerText;
    let cash = document.getElementById('revCash').innerText;
    let transfer = document.getElementById('revTransfer').innerText;
    let html = `📊 <b>Hôm nay:</b> <b style="color:blue; font-size:15px;">${total}</b><br>
    - TM: ${cash} | CK: ${transfer}`;
    addMessage(html, 'bot'); chatState = 'MENU';
}




// 6. KHO THẺ & HÀNG
function showProductList() {
    addMessage(`👉 Gõ tên thẻ (VD: zing) để xem giá. Hoặc gõ <b>"kho [tên]"</b> để xem tồn kho.`, 'bot');
    chatState = 'WAIT_PRODUCT';
}
function lookupProductDetail(input) {
    let catalog = JSON.parse(localStorage.getItem('thebao_catalog_v6') || "[]");
    let found = [];
    catalog.forEach(c => c.products.forEach(p => { if (p.name.toLowerCase().includes(input.toLowerCase())) found.push(p); }));
    if (found.length > 0) {
        let html = found.map(p => `- <b>${p.name}</b>: ` + p.prices.map(pr => `[${pr.face/1000}k ➔ ${pr.sell/1000}k]`).join(', ')).join('<br>');
        addMessage(`📦 <b>Bảng giá:</b><br>${html}`, 'bot');
    } else addMessage(`❌ Không có thẻ tên "${input}".`, 'bot');
    chatState = 'MENU';
}




function checkInventoryCommand(kw) {
    let inv = JSON.parse(localStorage.getItem('thebao_inventory') || "{}");
    let matches = Object.keys(inv).filter(k => k.toLowerCase().includes(kw.toLowerCase()));
    if (matches.length > 0) {
        let html = `📦 <b>Tồn kho "${kw}":</b><br>` + matches.map(k => {
            let [n, f] = k.split('_'); return `- ${n} ${formatMoney(f)}: <b>${inv[k].length}</b> mã`;
        }).join('<br>');
        addMessage(html, 'bot');
    } else addMessage(`❌ Kho đang hết sạch thẻ chứa tên "${kw}".`, 'bot');
    chatState = 'MENU';
}




// 7. BÁN HÀNG SIÊU TỐC
function quickPOSCommand(nameKw, faceKw, qtyStr) {
    let catalog = JSON.parse(localStorage.getItem('thebao_catalog_v6') || "[]");
    let qty = parseInt(qtyStr) || 1;
    let faceNum = parseInt(faceKw);
    if(faceNum < 1000) faceNum *= 1000;




    let fProd = null, fPrice = null;
    for (let c of catalog) {
        for (let p of c.products) {
            if (p.name.toLowerCase().includes(nameKw.toLowerCase())) {
                let pr = p.prices.find(x => x.face === faceNum);
                if (pr) { fProd = p; fPrice = pr; break; }
            }
        }
        if(fProd) break;
    }




    if (fProd && fPrice && typeof cartItems !== 'undefined') {
        if (typeof isOrderSaved !== 'undefined' && isOrderSaved && typeof startNewOrderClean === 'function') {
            startNewOrderClean(true);
        }
        let sell = fPrice.sell + (fPrice.surcharge || 0);
        let cost = fPrice.cost !== undefined ? Number(fPrice.cost) : (Number(fPrice.face) || 0);
        let list = [];
        let stockKey = `${fProd.name}_${fPrice.face}`;
        let usedStock = 0;
        for (let i = 0; i < qty; i++) {
            if (typeof inventory !== 'undefined' && Array.isArray(inventory[stockKey]) && inventory[stockKey].length > 0) {
                let item = inventory[stockKey].shift();
                list.push({ code: item.code, serial: item.serial, fromStock: true });
                usedStock++;
            } else {
                list.push({ code: "", serial: "", fromStock: false });
            }
        }
        if (usedStock > 0 && typeof saveInventory === 'function') saveInventory();
        cartItems.push({ cardType: fProd.name, faceValue: fPrice.face, price: sell, costPrice: cost, qty: qty, cardList: list, total: sell * qty });
        if(typeof renderAll === 'function') renderAll();
        addMessage(`✅ Đã thêm <b>${qty} thẻ ${fProd.name} ${formatMoney(fPrice.face)}</b> vào giỏ hàng (Tự lấy kho: ${usedStock}/${qty} mã)!`, 'bot');
    } else {
        addMessage(`❌ Lỗi: Không tìm thấy thẻ <b>${nameKw} ${faceNum}</b> để thêm.`, 'bot');
    }
    chatState = 'MENU';
}




// 8. TẢI CLOUD (GIỮ NGUYÊN)
window.downloadCloudHistoryJSONL = async function() {
    if (!currentUser) return alert("⚠️ Vui lòng đăng nhập để tải dữ liệu Cloud!");
    if(typeof showProgressModal === 'function') showProgressModal("ĐANG TẢI LỊCH SỬ TỪ CLOUD...");
    try {
        const uid = currentUser.uid;
        const chunks = [];
        const invSnap = await db.collection('UserData').doc(uid).collection('Invoices').orderBy('date', 'desc').get();
        let count = 0;
        const totalDocs = invSnap.size;




        if (totalDocs === 0) {
            if(typeof closeProgressModal === 'function') closeProgressModal();
            return alert("☁️ Không tìm thấy đơn hàng nào trên Cloud!");
        }




        invSnap.forEach(doc => {
            const line = JSON.stringify({type: 'history', data: doc.data()});
            chunks.push(line + '\n');
            count++;
        });
        const blob = new Blob(chunks, {type: "application/x-jsonlines"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const timeStr = new Date().toISOString().slice(0,10);
        a.download = `Cloud_History_Backup_${timeStr}.jsonl`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if(typeof closeProgressModal === 'function') closeProgressModal();
        alert(`✅ Đã tải xong ${count} đơn hàng!\nFile này dùng để khôi phục trong: Cài đặt -> Dữ liệu -> Lịch sử đơn hàng.`);
    } catch (e) {
        console.error(e);
        if(typeof closeProgressModal === 'function') closeProgressModal();
        alert("❌ Lỗi: " + e.message);
    }
};